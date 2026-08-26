-- FASE 05 -- A SINCRONIA QUE A FASE 02 PROMETEU E NAO ESCREVEU
--
-- ============================================================================
-- O QUE ESTA ERRADO HOJE
--
-- O cabecalho da migration 20260826120000 diz, sobre `activity_assignees`:
--
--   "A tabela nasce ao lado, SINCRONIZADA POR TRIGGER NOS DOIS SENTIDOS, e a
--    migracao do front e trabalho da fase 05."
--
-- A tabela nasceu, o backfill rodou -- e o trigger nao foi escrito. O unico
-- trigger que existe sobre ela e `trg_assignee_exige_equipe`, que valida
-- permissao. Nada liga `activities.assigned_to` a `activity_assignees`.
--
-- Resultado: a tabela e um RETRATO do momento do backfill, e envelhece.
--
-- MEDIDO EM 26/08/2026, antes desta migration:
--   - 667 atividades vivas com `assigned_to` preenchido
--   - 663 com linha `papel='responsavel'` em `activity_assignees`
--   - 4 ja divergiam -- atribuidas DEPOIS do backfill, sem linha nenhuma
--
-- Quatro parece pouco. O numero nao e o ponto: ele **so cresce**, uma linha
-- por atribuicao nova, e cada uma e um responsavel que a tela nova nao veria.
--
-- POR ISSO ESTA MIGRATION VEM ANTES DA FASE 05, e nao junto: migrar as 284
-- leituras para uma tabela que nao acompanha escrita faz a tela mostrar
-- responsavel vencido. O sintoma seria "sumiu o responsavel de algumas
-- tarefas" -- e ninguem ligaria isso a uma troca de fonte de leitura.
--
-- ============================================================================
-- POR QUE NOS DOIS SENTIDOS
--
-- Durante a fase 05 as duas fontes coexistem: telas ja migradas escrevem na
-- TABELA, telas ainda nao migradas escrevem na COLUNA. Sincronizar num sentido
-- so faria a fonte nao-sincronizada perder escrita silenciosamente.
--
-- O `pg_trigger_depth()` corta o ping-pong: quando o trigger de um lado dispara
-- o do outro, o segundo nao volta.
--
-- SAO TRES TRIGGERS, cobrindo as duas colunas de texto:
--   trg_assigned_to_para_tabela   -- assigned_to  -> papel='responsavel'
--   trg_participants_para_tabela  -- participants -> papel='participante'
--   trg_tabela_para_assigned_to   -- a tabela     -> as DUAS colunas de volta
--
-- ROLLBACK: 20260826160001_fase05_rollback.sql -- derruba os tres e deixa as
-- colunas como fonte unica, que e o estado de hoje.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Pre-requisito
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'activity_assignees'
  ) THEN
    RAISE EXCEPTION 'aplique a fase 02 (20260826120000) ANTES desta';
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Resolver o texto livre de `assigned_to` para um profile
--
-- `assigned_to` e TEXT e a base guarda de tudo: parte UUID, parte nome, parte
-- email. A mesma tolerancia que a RLS ja aplica -- por isso a ordem importa:
-- UUID primeiro (exato), depois email (unico), e so entao nome.
--
-- NOME E AMBIGUO E ISSO TEM CONSEQUENCIA: existem dois perfis ativos chamados
-- "Williame Correia de Lima", com ids diferentes. Quando o nome casa com mais
-- de um, a funcao devolve NULL em vez de escolher: gravar o profile errado e
-- pior que nao gravar, porque dai a permissao segue uma pessoa que nao e a
-- daquela atividade. O caso fica visivel na sonda do script de apply.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolver_profile_do_texto(_texto text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_quantos int;
BEGIN
  IF _texto IS NULL OR btrim(_texto) = '' THEN
    RETURN NULL;
  END IF;

  -- 1. UUID exato
  BEGIN
    v_id := _texto::uuid;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_id) THEN
      RETURN v_id;
    END IF;
    RETURN NULL;   -- parece uuid mas nao existe: nao tentar nome com isso
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;          -- nao era uuid, segue
  END;

  -- 2. Email (unico por definicao)
  SELECT id INTO v_id
    FROM public.profiles
   WHERE lower(email) = lower(btrim(_texto))
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- 3. Nome -- so quando NAO for ambiguo
  SELECT count(*) INTO v_quantos
    FROM public.profiles
   WHERE lower(btrim(full_name)) = lower(btrim(_texto));

  IF v_quantos = 1 THEN
    SELECT id INTO v_id
      FROM public.profiles
     WHERE lower(btrim(full_name)) = lower(btrim(_texto))
     LIMIT 1;
    RETURN v_id;
  END IF;

  -- Zero ou mais de um: sem resposta confiavel.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.resolver_profile_do_texto(text) IS
  'Resolve o texto livre de activities.assigned_to para um profile: uuid, depois email, depois nome NAO ambiguo. Nome repetido devolve NULL de proposito -- gravar o profile errado e pior que nao gravar.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) COLUNA -> TABELA
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_assigned_to_para_tabela()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  -- Veio do outro trigger: nao volta.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  v_user := public.resolver_profile_do_texto(NEW.assigned_to);

  -- ── NOME AMBIGUO NAO APAGA O QUE JA EXISTE ────────────────────────────
  --
  -- 450 atividades tem `assigned_to = 'Williame Correia de Lima'`, e existem
  -- DOIS perfis ativos com esse nome. `resolver_profile_do_texto` devolve NULL
  -- ali de proposito -- mas NULL nao pode virar "apague a linha": o backfill da
  -- fase 02 ja resolveu essas 450 (escolheu a conta corporativa via
  -- `DISTINCT ON`), e apagar seria trocar um palpite antigo por nada.
  --
  -- Entao: so mexe na linha quando o texto RESOLVE, ou quando o campo foi
  -- esvaziado de fato. Texto preenchido que nao resolve deixa como esta.
  IF v_user IS NULL AND NEW.assigned_to IS NOT NULL AND btrim(NEW.assigned_to) <> '' THEN
    RETURN NEW;
  END IF;

  -- O responsavel anterior sai: ou porque mudou, ou porque o campo foi limpo.
  DELETE FROM public.activity_assignees
   WHERE activity_id = NEW.id
     AND papel = 'responsavel'
     AND (v_user IS NULL OR user_id IS DISTINCT FROM v_user);

  IF v_user IS NULL THEN
    RETURN NEW;   -- campo esvaziado: a linha saiu acima, e e isso mesmo
  END IF;

  -- A MESMA PESSOA NAO PODE SER RESPONSAVEL E PARTICIPANTE: a constraint
  -- `activity_assignees_unico` e por (activity_id, user_id), entao promover
  -- quem ja era participante e UPDATE do papel, nao INSERT.
  -- `created_by` fica nulo: nao existe coluna em `activities` dizendo QUEM
  -- atribuiu (conferido em 26/08 -- `assigned_by_user_id` nao existe), e o
  -- backfill da fase 02 tambem nao preenchia. Inventar `auth.uid()` aqui seria
  -- pior: o trigger roda como DEFINER e em recalculo em lote o valor seria de
  -- quem rodou a migration, nao de quem atribuiu.
  INSERT INTO public.activity_assignees (activity_id, user_id, papel)
  VALUES (NEW.id, v_user, 'responsavel')
  ON CONFLICT (activity_id, user_id)
  DO UPDATE SET papel = 'responsavel';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assigned_to_para_tabela ON public.activities;
CREATE TRIGGER trg_assigned_to_para_tabela
  AFTER INSERT OR UPDATE OF assigned_to ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_assigned_to_para_tabela();

-- ───────────────────────────────────────────────────────────────────────────
-- 2b) PARTICIPANTS -> TABELA
--
-- `activities.participants` e text[] com NOMES, e a tabela guarda user_id com
-- papel='participante'. Mesma logica do responsavel, com duas diferencas:
--
--   - sao N por atividade, entao o espelho e "some quem saiu, entra quem
--     chegou", nao "troca o unico";
--   - o RESPONSAVEL nao pode ser derrubado por engano: a constraint
--     `activity_assignees_unico` e por (activity_id, user_id), entao a mesma
--     pessoa tem UMA linha so. Se alguem esta nas duas listas, responsavel
--     vence -- e o papel mais forte, e rebaixa-lo tiraria a permissao dele.
--
-- Nome ambiguo tambem nao apaga aqui: 6 atividades citam o nome duplicado em
-- participants (medido em 26/08), e resolver para NULL nao pode significar
-- "tire essa pessoa".
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_participants_para_tabela()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids       uuid[];
  v_ambiguos  int := 0;
  v_nome      text;
  v_user      uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.participants IS NOT DISTINCT FROM OLD.participants THEN
    RETURN NEW;
  END IF;

  -- Resolve cada nome; conta quantos ficaram sem resposta.
  v_ids := '{}';
  FOREACH v_nome IN ARRAY COALESCE(NEW.participants, '{}'::text[])
  LOOP
    v_user := public.resolver_profile_do_texto(v_nome);
    IF v_user IS NULL THEN
      IF btrim(COALESCE(v_nome, '')) <> '' THEN
        v_ambiguos := v_ambiguos + 1;
      END IF;
    ELSE
      v_ids := array_append(v_ids, v_user);
    END IF;
  END LOOP;

  -- Sai quem nao esta mais na lista. Com nome nao resolvido no meio, NAO
  -- remove ninguem: nao da para saber quem daquela lista corresponde a qual
  -- linha, e apagar seria tirar permissao por ambiguidade.
  IF v_ambiguos = 0 THEN
    DELETE FROM public.activity_assignees
     WHERE activity_id = NEW.id
       AND papel = 'participante'
       AND NOT (user_id = ANY (v_ids));
  END IF;

  -- Entra quem chegou. `DO NOTHING` protege o responsavel: se a pessoa ja tem
  -- linha (como responsavel), ela nao e rebaixada a participante.
  INSERT INTO public.activity_assignees (activity_id, user_id, papel)
  SELECT NEW.id, u, 'participante'
    FROM unnest(v_ids) AS u
  ON CONFLICT (activity_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participants_para_tabela ON public.activities;
CREATE TRIGGER trg_participants_para_tabela
  AFTER INSERT OR UPDATE OF participants ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_participants_para_tabela();

-- ───────────────────────────────────────────────────────────────────────────
-- 3) TABELA -> COLUNA
--
-- Grava o `full_name`, nao o uuid: e o que as 284 leituras do front esperam
-- hoje, e o que a comparacao da RLS aceita. Trocar o formato aqui quebraria a
-- tela ANTES de a fase 05 migrar a leitura -- exatamente o que esta migration
-- existe para evitar.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_tabela_para_assigned_to()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activity uuid;
  v_nome     text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_activity := COALESCE(NEW.activity_id, OLD.activity_id);

  -- ── RESPONSAVEL -> assigned_to ─────────────────────────────────────────
  SELECT p.full_name INTO v_nome
    FROM public.activity_assignees a
    JOIN public.profiles p ON p.id = a.user_id
   WHERE a.activity_id = v_activity
     AND a.papel = 'responsavel'
   LIMIT 1;

  UPDATE public.activities
     SET assigned_to = v_nome
   WHERE id = v_activity
     AND assigned_to IS DISTINCT FROM v_nome;

  -- ── PARTICIPANTES -> participants ──────────────────────────────────────
  --
  -- O array e reescrito inteiro a partir da tabela, em ordem de nome para o
  -- resultado ser estavel (senao o array muda de ordem a cada escrita e a
  -- comparacao `IS DISTINCT FROM` dispara UPDATE sem mudanca real).
  --
  -- Grava `full_name`, como o responsavel: e o formato que as 284 leituras do
  -- front esperam hoje.
  UPDATE public.activities a
     SET participants = COALESCE((
           SELECT array_agg(p.full_name ORDER BY p.full_name)
             FROM public.activity_assignees aa
             JOIN public.profiles p ON p.id = aa.user_id
            WHERE aa.activity_id = v_activity
              AND aa.papel = 'participante'
         ), '{}'::text[])
   WHERE a.id = v_activity
     AND a.participants IS DISTINCT FROM COALESCE((
           SELECT array_agg(p.full_name ORDER BY p.full_name)
             FROM public.activity_assignees aa
             JOIN public.profiles p ON p.id = aa.user_id
            WHERE aa.activity_id = v_activity
              AND aa.papel = 'participante'
         ), '{}'::text[]);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_tabela_para_assigned_to ON public.activity_assignees;
CREATE TRIGGER trg_tabela_para_assigned_to
  AFTER INSERT OR DELETE OR UPDATE OF user_id, papel ON public.activity_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tg_tabela_para_assigned_to();

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Reparar o que ja divergiu
--
-- Sem isto, as linhas que envelheceram desde o backfill continuam erradas: o
-- trigger so pega escrita NOVA.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.activity_assignees (activity_id, user_id, papel)
SELECT a.id, public.resolver_profile_do_texto(a.assigned_to), 'responsavel'
  FROM public.activities a
 WHERE a.assigned_to IS NOT NULL
   AND btrim(a.assigned_to) <> ''
   AND public.resolver_profile_do_texto(a.assigned_to) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.activity_assignees x
      WHERE x.activity_id = a.id AND x.papel = 'responsavel'
   )
ON CONFLICT (activity_id, user_id) DO UPDATE SET papel = 'responsavel';

-- E os PARTICIPANTES que ficaram para tras. `DO NOTHING` protege quem ja e
-- responsavel: a mesma pessoa nao vira participante por causa deste backfill.
INSERT INTO public.activity_assignees (activity_id, user_id, papel)
SELECT DISTINCT a.id, public.resolver_profile_do_texto(nome), 'participante'
  FROM public.activities a
  CROSS JOIN LATERAL unnest(COALESCE(a.participants, '{}'::text[])) AS t(nome)
 WHERE btrim(COALESCE(nome, '')) <> ''
   AND public.resolver_profile_do_texto(nome) IS NOT NULL
ON CONFLICT (activity_id, user_id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Verificacao -- falha alto se a sincronia nao ficou de pe
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_orfas int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assigned_to_para_tabela'
  ) THEN
    RAISE EXCEPTION 'o trigger coluna->tabela nao foi criado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tabela_para_assigned_to'
  ) THEN
    RAISE EXCEPTION 'o trigger tabela->coluna nao foi criado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_participants_para_tabela'
  ) THEN
    RAISE EXCEPTION 'o trigger de participants nao foi criado';
  END IF;

  -- Quantas atividades com responsavel RESOLVIVEL ainda ficaram sem linha.
  -- Nome ambiguo resolve para NULL de proposito e nao entra nesta conta.
  SELECT count(*) INTO v_orfas
    FROM public.activities a
   WHERE a.assigned_to IS NOT NULL
     AND btrim(a.assigned_to) <> ''
     AND public.resolver_profile_do_texto(a.assigned_to) IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.activity_assignees x
        WHERE x.activity_id = a.id AND x.papel = 'responsavel'
     );

  IF v_orfas > 0 THEN
    RAISE EXCEPTION 'ainda ha % atividades com responsavel resolvivel e sem linha na tabela', v_orfas;
  END IF;
END $$;

COMMENT ON FUNCTION public.tg_assigned_to_para_tabela() IS
  'Espelha activities.assigned_to em activity_assignees(papel=responsavel). Corta ping-pong por pg_trigger_depth.';
COMMENT ON FUNCTION public.tg_tabela_para_assigned_to() IS
  'Espelha activity_assignees(papel=responsavel) de volta em activities.assigned_to, como full_name -- que e o formato que as 284 leituras do front esperam.';
