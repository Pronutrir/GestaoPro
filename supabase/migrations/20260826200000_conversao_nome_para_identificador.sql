-- CONVERSAO nome -> identificador  ·  PARTE (a)
--
-- ============================================================================
-- O QUE ESTA MIGRATION FAZ, E O QUE ELA NAO FAZ
--
-- FAZ:
--   - cria as colunas de IDENTIFICADOR ao lado das de texto;
--   - cria as colunas SOMBRA, guardando o nome original intacto;
--   - converte SO os registros cujo texto resolve para UM perfil ATIVO.
--
-- NAO FAZ:
--   - nao apaga nome nenhum (as colunas de texto continuam ali, e a sombra
--     guarda uma segunda copia);
--   - nao chuta ambiguo -- fica pendente, listado em
--     docs/medicoes/ambiguos-26-08-2026.md;
--   - nao funde nem desativa perfil (decisao do Raphael: apenas marcar).
--
-- ============================================================================
-- A SONDA, MEDIDA EM 26/08/2026 (scripts/medicoes/sondar-conversao-identificador.cjs)
--
--   assigned_to     1877 preenchidos
--                    344 convertem  (271 por nome unico, 73 ja eram uuid)
--                   1533 PENDENTES  -- 450 vivas + 1083 na lixeira
--                      0 sem perfil correspondente
--
--   participants     155 entradas
--                    149 convertem
--                      6 PENDENTES
--
--   owner/manager     60 preenchidos
--                     50 convertem
--                     10 PENDENTES
--
-- TODOS os pendentes vem de UM unico texto: "Williame Correia de Lima", que
-- tem dois perfis ATIVOS. Nenhum outro nome da base e ambiguo.
--
-- ============================================================================
-- POR QUE "UM PERFIL ATIVO" E NAO "UM PERFIL"
--
-- Homonimo DESATIVADO nao disputa: ele nao recebe atribuicao nova, entao usar
-- o estado ativo para desempatar e seguro e converte mais. Se o Raphael
-- desativar um dos Williames depois, basta rodar a parte (b) -- o script de
-- desempate ja resolve os 1533 de uma vez.
--
-- ROLLBACK: 20260826200001_conversao_rollback.sql -- devolve o texto a partir
-- da sombra e derruba as colunas novas.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) As colunas novas
--
-- `..._id` e o identificador. `..._nome_original` e a SOMBRA: existe para
-- reverter e para auditar, e nunca e escrita depois desta migration.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS assigned_to_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_nome_original text,
  ADD COLUMN IF NOT EXISTS participant_ids       uuid[],
  ADD COLUMN IF NOT EXISTS participants_nome_original text[];

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_nome_original text,
  ADD COLUMN IF NOT EXISTS manager_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_nome_original text;

CREATE INDEX IF NOT EXISTS activities_assigned_to_id_idx ON public.activities (assigned_to_id);
CREATE INDEX IF NOT EXISTS projects_owner_id_idx         ON public.projects (owner_id);
CREATE INDEX IF NOT EXISTS projects_manager_id_idx       ON public.projects (manager_id);

COMMENT ON COLUMN public.activities.assigned_to_id IS
  'O responsavel, por identificador. NULL quando o texto e ambiguo -- ver docs/medicoes/ambiguos-*.md. A coluna assigned_to (texto) continua sendo a fonte das telas ate a fase 05 migrar as leituras.';
COMMENT ON COLUMN public.activities.assigned_to_nome_original IS
  'SOMBRA: o nome como estava antes da conversao. Nunca reescrita. Existe para reverter e para auditar.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A regra de resolucao -- UM perfil ATIVO
--
-- Difere de `resolver_profile_do_texto` (migration 20260826160000) num ponto:
-- ali qualquer duplicidade de nome devolve NULL; aqui, homonimo desativado nao
-- conta. Sao perguntas diferentes -- aquela decide PERMISSAO em tempo real,
-- esta decide CONVERSAO de dado histórico -- e por isso sao funcoes separadas.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolver_identificador_para_conversao(_texto text)
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

  -- 1. uuid exato
  BEGIN
    v_id := btrim(_texto)::uuid;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_id) THEN
      RETURN v_id;
    END IF;
    RETURN NULL;
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;

  -- 2. e-mail
  SELECT id INTO v_id FROM public.profiles
   WHERE lower(btrim(email)) = lower(btrim(_texto)) LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- 3. nome que casa com UM SO perfil
  SELECT count(*) INTO v_quantos FROM public.profiles
   WHERE lower(btrim(full_name)) = lower(btrim(_texto));
  IF v_quantos = 1 THEN
    SELECT id INTO v_id FROM public.profiles
     WHERE lower(btrim(full_name)) = lower(btrim(_texto)) LIMIT 1;
    RETURN v_id;
  END IF;

  -- 3b. varios perfis, mas UM SO ATIVO -- o desativado nao disputa
  IF v_quantos > 1 THEN
    SELECT count(*) INTO v_quantos FROM public.profiles
     WHERE lower(btrim(full_name)) = lower(btrim(_texto)) AND is_active = true;
    IF v_quantos = 1 THEN
      SELECT id INTO v_id FROM public.profiles
       WHERE lower(btrim(full_name)) = lower(btrim(_texto)) AND is_active = true LIMIT 1;
      RETURN v_id;
    END IF;
  END IF;

  RETURN NULL;   -- ambiguo, ou sem perfil
END;
$$;

COMMENT ON FUNCTION public.resolver_identificador_para_conversao(text) IS
  'Resolve texto -> profile para CONVERSAO de dado historico: uuid, e-mail, nome unico, ou nome com um unico perfil ATIVO. NULL = ambiguo ou inexistente, e nesse caso a linha fica pendente.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) ANTES -- o numero, para comparar com o depois
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tot int; v_res int; v_amb int;
BEGIN
  SELECT count(*) INTO v_tot FROM public.activities
   WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> '';
  SELECT count(*) INTO v_res FROM public.activities
   WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> ''
     AND public.resolver_identificador_para_conversao(assigned_to) IS NOT NULL;
  v_amb := v_tot - v_res;
  RAISE NOTICE 'ANTES  assigned_to: % preenchidos, % resolvem, % pendentes', v_tot, v_res, v_amb;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) A sombra -- SEMPRE, inclusive para quem nao converte
--
-- Vem antes da conversao de proposito: se algo falhar no meio, o original ja
-- esta guardado. E preenche tambem os ambiguos, que e o que permite ao script
-- da parte (b) trabalhar depois.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.activities
   SET assigned_to_nome_original = assigned_to
 WHERE assigned_to IS NOT NULL
   AND btrim(assigned_to) <> ''
   AND assigned_to_nome_original IS DISTINCT FROM assigned_to;

UPDATE public.activities
   SET participants_nome_original = participants
 WHERE participants IS NOT NULL
   AND cardinality(participants) > 0
   AND participants_nome_original IS DISTINCT FROM participants;

UPDATE public.projects
   SET owner_nome_original   = COALESCE(owner_nome_original, owner),
       manager_nome_original = COALESCE(manager_nome_original, manager)
 WHERE (owner IS NOT NULL AND btrim(owner) <> '')
    OR (manager IS NOT NULL AND btrim(manager) <> '');

-- ───────────────────────────────────────────────────────────────────────────
-- 5) A conversao -- so o que resolve
-- ───────────────────────────────────────────────────────────────────────────
UPDATE public.activities
   SET assigned_to_id = public.resolver_identificador_para_conversao(assigned_to)
 WHERE assigned_to IS NOT NULL
   AND btrim(assigned_to) <> ''
   AND assigned_to_id IS NULL
   AND public.resolver_identificador_para_conversao(assigned_to) IS NOT NULL;

-- participants: array de nomes -> array de ids. So converte quando TODOS os
-- nomes daquela linha resolvem; senao a lista sairia menor que a original e
-- alguem sumiria da atividade sem aviso.
UPDATE public.activities a
   SET participant_ids = sub.ids
  FROM (
    SELECT x.id,
           array_agg(public.resolver_identificador_para_conversao(n) ORDER BY n) AS ids,
           bool_and(public.resolver_identificador_para_conversao(n) IS NOT NULL) AS todos_ok
      FROM public.activities x
      CROSS JOIN LATERAL unnest(x.participants) AS t(n)
     WHERE x.participants IS NOT NULL AND cardinality(x.participants) > 0
       AND btrim(COALESCE(n, '')) <> ''
     GROUP BY x.id
  ) sub
 WHERE a.id = sub.id
   AND sub.todos_ok
   AND a.participant_ids IS NULL;

UPDATE public.projects
   SET owner_id = public.resolver_identificador_para_conversao(owner)
 WHERE owner IS NOT NULL AND btrim(owner) <> ''
   AND owner_id IS NULL
   AND public.resolver_identificador_para_conversao(owner) IS NOT NULL;

UPDATE public.projects
   SET manager_id = public.resolver_identificador_para_conversao(manager)
 WHERE manager IS NOT NULL AND btrim(manager) <> ''
   AND manager_id IS NULL
   AND public.resolver_identificador_para_conversao(manager) IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) DEPOIS -- e a verificacao que falha alto
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tot int; v_conv int; v_pend int; v_sombra int;
  v_pTot int; v_pConv int;
  v_oTot int; v_oConv int;
BEGIN
  SELECT count(*) INTO v_tot  FROM public.activities
   WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> '';
  SELECT count(*) INTO v_conv FROM public.activities WHERE assigned_to_id IS NOT NULL;
  v_pend := v_tot - v_conv;

  SELECT count(*) INTO v_sombra FROM public.activities
   WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> ''
     AND assigned_to_nome_original IS NULL;

  SELECT count(*) INTO v_pTot  FROM public.activities
   WHERE participants IS NOT NULL AND cardinality(participants) > 0;
  SELECT count(*) INTO v_pConv FROM public.activities WHERE participant_ids IS NOT NULL;

  SELECT count(*) INTO v_oTot  FROM public.projects
   WHERE owner IS NOT NULL AND btrim(owner) <> '';
  SELECT count(*) INTO v_oConv FROM public.projects WHERE owner_id IS NOT NULL;

  RAISE NOTICE 'DEPOIS assigned_to: % preenchidos, % convertidos, % PENDENTES', v_tot, v_conv, v_pend;
  RAISE NOTICE 'DEPOIS participants: % linhas, % convertidas', v_pTot, v_pConv;
  RAISE NOTICE 'DEPOIS projects.owner: % preenchidos, % convertidos', v_oTot, v_oConv;

  -- A SOMBRA E OBRIGATORIA. Sem ela nao ha como reverter, e o rollback vira
  -- perda de dado -- o oposto do que um rollback deve ser.
  IF v_sombra > 0 THEN
    RAISE EXCEPTION 'ha % linhas com assigned_to preenchido e SEM sombra -- a conversao nao pode seguir sem como reverter', v_sombra;
  END IF;

  -- O texto original nao pode ter sido tocado.
  IF EXISTS (
    SELECT 1 FROM public.activities
     WHERE assigned_to_nome_original IS NOT NULL
       AND assigned_to IS DISTINCT FROM assigned_to_nome_original
  ) THEN
    RAISE EXCEPTION 'o texto de assigned_to divergiu da sombra -- esta migration NAO pode reescrever nome';
  END IF;

  IF v_pend > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '>>> % registros ficaram PENDENTES, de proposito.', v_pend;
    RAISE NOTICE '>>> Sao os nomes que pertencem a mais de um perfil ativo.';
    RAISE NOTICE '>>> Lista: docs/medicoes/ambiguos-26-08-2026.md';
    RAISE NOTICE '>>> Para converter apos a decisao: scripts/desempatar-homonimo.sh';
  END IF;
END $$;
