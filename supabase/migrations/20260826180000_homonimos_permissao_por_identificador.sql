-- HOMONIMOS -- A PERMISSAO PARA DE COMPARAR POR NOME
--
-- ============================================================================
-- O FURO, MEDIDO E REPRODUZIDO EM 26/08/2026
--
-- A RLS compara pessoas por `full_name`. Existem DOIS perfis ativos chamados
-- "Williame Correia de Lima", com ids diferentes, os dois ativos e os dois
-- editando (o audit_log tem escrita das duas contas).
--
-- Consequencia, conferida chamando as proprias funcoes:
--
--   is_activity_actor_v2(<atividade do Williame>, b0b64edb...) = true
--   is_activity_actor_v2(<atividade do Williame>, 149e6c4a...) = true
--
-- ...enquanto `activity_assignees` diz que o responsavel e UM so (149e6c4a).
-- Ou seja: o outro perfil recebe acesso que ninguem lhe deu.
--
-- E no nivel de PROJETO e pior, porque a concessao e maior:
--
--   is_project_leader_v2(<Guia Jornada do Paciente>, b0b64edb...) = true
--   is_project_leader_v2(<Guia Jornada do Paciente>, 149e6c4a...) = true
--
-- `projects.owner` guarda o NOME. Os dois viram dono do projeto -- e dono
-- manda em tudo dentro dele.
--
-- Alcance: 450 atividades com `assigned_to` = o nome ambiguo, 6 com ele em
-- `participants`, e 2 projetos com ele em `owner`.
--
-- ============================================================================
-- A DECISAO: AMBIGUIDADE NAO CONCEDE
--
-- Quando um nome resolve para MAIS DE UM perfil, a via do nome nao concede a
-- ninguem. Nao e uma escolha conservadora por gosto: o contrario -- deixar os
-- dois entrarem -- transforma homonimia em escalacao de privilegio, e nao ha
-- como saber qual dos dois era o pretendido. Errar para o lado de "ninguem"
-- e visivel (a pessoa reclama que perdeu acesso); errar para o lado de "os
-- dois" e invisivel.
--
-- NINGUEM FICA SEM ACESSO POR ISSO, e e importante: a via do nome e a TERCEIRA
-- da lista. Antes dela vem `created_by = _user_id` (identificador) e
-- `activity_assignees` (identificador, com FK de verdade). O responsavel real
-- das 450 atividades ja tem linha na tabela -- foi conferido: o backfill da
-- fase 02 as criou. Entao para ele nada muda; muda so para o homonimo que
-- entrava de carona.
--
-- O QUE ESTA MIGRATION NAO FAZ: nao funde perfis, nao desativa ninguem, nao
-- reescreve `assigned_to`. Qual dos dois Williame e o certo e decisao de
-- pessoa, e o levantamento esta em docs/medicoes/homonimos-26-08-2026.md.
--
-- ROLLBACK: 20260826180001_homonimos_rollback.sql
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) O nome e ambiguo?
--
-- STABLE e SECURITY DEFINER: precisa ver `profiles` inteira para contar, e
-- quem consulta pode nao enxergar todos os perfis.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nome_e_ambiguo(_texto text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT count(*) > 1
      FROM public.profiles p
     WHERE p.full_name IS NOT NULL
       AND lower(trim(p.full_name)) = lower(trim(_texto))
  ), false);
$$;

COMMENT ON FUNCTION public.nome_e_ambiguo(text) IS
  'true quando o texto casa com mais de um profile por full_name. A via do nome nao concede quando isto e true -- homonimia nao pode virar escalacao de privilegio.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) is_activity_actor_v2 -- a via do nome deixa de valer para homonimo
--
-- A ordem das vias importa e esta preservada:
--   1. created_by            -> IDENTIFICADOR
--   2. activity_assignees    -> IDENTIFICADOR (FK)
--   3. assigned_to/participants -> TEXTO, e e esta que ganha a trava
--
-- `can_edit_own` continua FORA daqui, de proposito: este helper serve tambem
-- visibilidade e comentario, e gatear aqui tiraria a leitura de quem e
-- "Visualizar e comentar" (CLAUDE.md, "Nunca").
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_activity_actor_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE a.id = _activity_id
      AND (
        -- VIA 1 -- identificador
        a.created_by = _user_id
        -- VIA 2 -- identificador, com FK
        OR EXISTS (
          SELECT 1 FROM public.activity_assignees aa
           WHERE aa.activity_id = a.id AND aa.user_id = _user_id
        )
        -- VIA 3 -- texto livre. Sai na fase 05, quando as leituras migrarem.
        OR (
          (a.assigned_to IS NOT NULL AND (
            -- uuid em texto continua valendo: e identificador.
            lower(trim(a.assigned_to)) = lower(trim(_user_id::text))
            -- email e unico por definicao -- nao ha homonimia possivel.
            OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
            -- NOME: so quando NAO for ambiguo.
            OR (
              pr.full_name IS NOT NULL
              AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name))
              AND NOT public.nome_e_ambiguo(a.assigned_to)
            )
          ))
          OR EXISTS (
            SELECT 1
            FROM unnest(COALESCE(a.participants, '{}'::text[])) participant_name
            WHERE (au.email IS NOT NULL AND lower(trim(participant_name)) = lower(trim(au.email)))
               OR (
                 pr.full_name IS NOT NULL
                 AND lower(trim(participant_name)) = lower(trim(pr.full_name))
                 AND NOT public.nome_e_ambiguo(participant_name)
               )
          )
        )
      )
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) is_project_leader_v2 -- dono e gestor por nome, com a mesma trava
--
-- Aqui a concessao e MAIOR (dono manda em tudo no projeto), entao a trava
-- importa mais. `projects.owner`/`manager` sao TEXT e nao ha coluna de id --
-- criar uma e trabalho a parte (e mudaria a tela do projeto); a trava fecha o
-- furo sem esperar por isso.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_project_leader_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.profiles pr ON pr.id = _user_id
    WHERE p.id = _project_id
      AND pr.full_name IS NOT NULL
      AND (
        (p.owner IS NOT NULL
          AND lower(trim(p.owner)) = lower(trim(pr.full_name))
          AND NOT public.nome_e_ambiguo(p.owner))
        OR (p.manager IS NOT NULL
          AND lower(trim(p.manager)) = lower(trim(pr.full_name))
          AND NOT public.nome_e_ambiguo(p.manager))
      )
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) A REDE DE SEGURANCA -- quem era dono por nome ambiguo vira membro
--
-- Sem isto, apertar `is_project_leader_v2` tiraria o projeto de quem
-- legitimamente o conduz: o dono real das 2 linhas tambem perde a via do nome,
-- porque a funcao nao sabe qual dos dois homonimos e ele.
--
-- `project_members` e por `user_id` -- identificador. Entao: quem ja consta
-- como membro segue por ali; quem NAO consta e casa pelo nome ambiguo entra
-- como membro com as permissoes de gestor, para nao ficar de fora do proprio
-- projeto enquanto a duplicidade nao se resolve.
--
-- ISTO CONCEDE ACESSO AOS DOIS HOMONIMOS NO NIVEL DE MEMBRO, e e proposital:
-- e menos que "dono" (que era o que os dois tinham antes) e nao tira ninguem
-- do ar. A escolha de qual perfil fica e do Raphael.
--
-- CONFERIDO EM 26/08, ANTES DE ESCREVER: nos 2 projetos afetados os DOIS
-- Williames JA sao membros com can_edit e can_move. Entao este INSERT nao
-- insere nada -- e o melhor resultado possivel: a perda de "dono pelo nome"
-- nao tira trabalho de ninguem, porque a via de membro (por user_id) ja
-- cobria os dois. O INSERT fica como rede para bases onde isso nao valha.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.project_members (project_id, user_id, can_edit, can_move, can_delete, can_edit_own)
SELECT DISTINCT p.id, pr.id, true, true, false, true
  FROM public.projects p
  JOIN public.profiles pr
    ON pr.full_name IS NOT NULL
   AND (
     (p.owner   IS NOT NULL AND lower(trim(p.owner))   = lower(trim(pr.full_name)))
     OR (p.manager IS NOT NULL AND lower(trim(p.manager)) = lower(trim(pr.full_name)))
   )
 WHERE p.is_trashed = false
   AND (
     public.nome_e_ambiguo(p.owner) OR public.nome_e_ambiguo(p.manager)
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.project_members m
      WHERE m.project_id = p.id AND m.user_id = pr.id
   )
ON CONFLICT DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Verificacao -- o furo fechou, e ninguem ficou sem acesso
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nome      text;
  v_a         uuid;
  v_p         uuid;
  v_ids       uuid[];
  v_atores    int;
  v_lideres   int;
  v_membros   int;
BEGIN
  -- Pega um nome ambiguo real, se houver.
  SELECT lower(trim(full_name)) INTO v_nome
    FROM public.profiles
   WHERE full_name IS NOT NULL AND trim(full_name) <> ''
   GROUP BY lower(trim(full_name))
  HAVING count(*) > 1
   LIMIT 1;

  IF v_nome IS NULL THEN
    RAISE NOTICE 'nenhum nome duplicado na base -- a trava fica de prontidao';
    RETURN;
  END IF;

  SELECT array_agg(id) INTO v_ids
    FROM public.profiles WHERE lower(trim(full_name)) = v_nome;

  RAISE NOTICE 'nome ambiguo: "%" -> % perfis', v_nome, array_length(v_ids, 1);

  -- ATIVIDADE: quantos dos homonimos ainda sao atores da mesma atividade?
  SELECT a.id INTO v_a
    FROM public.activities a
   WHERE lower(trim(a.assigned_to)) = v_nome
     AND a.is_trashed = false
   LIMIT 1;

  IF v_a IS NOT NULL THEN
    SELECT count(*) INTO v_atores
      FROM unnest(v_ids) u
     WHERE public.is_activity_actor_v2(v_a, u);

    RAISE NOTICE '  atividade %: % de % homonimos sao atores', v_a, v_atores, array_length(v_ids, 1);

    IF v_atores > 1 THEN
      RAISE EXCEPTION 'a via do nome ainda concede a % homonimos na mesma atividade', v_atores;
    END IF;
  END IF;

  -- PROJETO: nenhum dos dois pode ser lider pela via do nome ambiguo...
  SELECT p.id INTO v_p
    FROM public.projects p
   WHERE (lower(trim(p.owner)) = v_nome OR lower(trim(p.manager)) = v_nome)
     AND p.is_trashed = false
   LIMIT 1;

  IF v_p IS NOT NULL THEN
    SELECT count(*) INTO v_lideres
      FROM unnest(v_ids) u WHERE public.is_project_leader_v2(v_p, u);

    IF v_lideres > 1 THEN
      RAISE EXCEPTION 'is_project_leader_v2 ainda concede a % homonimos no projeto %', v_lideres, v_p;
    END IF;

    -- ...mas alguem tem de continuar enxergando o projeto.
    SELECT count(*) INTO v_membros
      FROM unnest(v_ids) u WHERE public.is_project_member_v2(v_p, u);

    RAISE NOTICE '  projeto %: lideres=% membros=%', v_p, v_lideres, v_membros;

    IF v_membros = 0 THEN
      RAISE EXCEPTION 'ninguem ficou com acesso ao projeto % -- a rede de seguranca falhou', v_p;
    END IF;
  END IF;
END $$;
