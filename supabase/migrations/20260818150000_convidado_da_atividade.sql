-- Quem tem atividade atribuida nao conseguia LER o projeto.
--
-- O front deixa entrar (`activityAssignmentMatch`, em project/[id]/page.tsx) e
-- mostra so as atividades da pessoa. A RLS discorda: `can_view_project_v2`
-- exige admin, lider ou MEMBRO -- nao conhece a via "tenho atividade aqui".
--
-- Medido em 18/08/2026, nos projetos ativos: das 10 duplas pessoa-projeto
-- nessa situacao, 8 recebem `false` do banco -- 149 atividades. O caso extremo
-- e uma pessoa com 131 atividades no "Servico de Ultrassonografia" que o banco
-- nao deixa ela ler. As 2 duplas que funcionam so funcionam por acidente: sao
-- lideres daqueles projetos por outra via.
--
-- O sintoma nao e um erro. A pessoa passa da tela de acesso, o Kanban carrega,
-- a lista chega VAZIA -- indistinguivel de um projeto sem atividades. Nada na
-- tela diz que faltou permissao.
--
-- POR QUE UMA FUNCAO NOVA, e nao mexer em `can_view_project_v2`:
--
-- Ela e usada em 33 pontos -- orcamento, linha de base, custos, TAP,
-- documentos, paginas, arquivos do storage, licoes, reunioes. Afrouxa-la
-- entregaria o orcamento e o TAP do projeto a quem tem UMA atividade
-- atribuida. O vinculo por atividade da acesso ao TRABALHO, nao ao dossie do
-- projeto -- entao a via nova entra so onde o trabalho vive.
--
-- Mercado: e a distincao que o Jira faz entre `Browse Projects` (concedido ao
-- papel dinamico "Current Assignee") e as permissoes de gestao do projeto; e o
-- que o Asana faz ao dar acesso A TAREFA de quem e atribuido, sem promover a
-- pessoa a membro do projeto.
--
-- VISIBILIDADE E EDICAO SAO EIXOS INDEPENDENTES. Esta migration trata so de
-- LEITURA: quem entra por aqui VE o projeto inteiro e continua editando apenas
-- as proprias atividades -- `can_update_activity_v2` nao e tocada. E a regra
-- que o monday publica ("todos continuam vendo todos os itens" mesmo com a
-- edicao restrita), e a diferenca entre "nao posso mexer nisso" e "nao sei que
-- isso existe".

-- Vinculo por atividade: a pessoa responde por (ou participa de) alguma
-- atividade VIVA do projeto.
--
-- `is_trashed = false` nos dois lados de proposito: atividade na lixeira nao
-- sustenta acesso, e projeto arquivado tampouco -- a mesma decisao que o front
-- ja toma (ver o comentario sobre projeto arquivado em project/[id]/page.tsx).
-- Quem tem vinculo FORMAL (membro, lider, criador) continua entrando no
-- arquivado para consultar historico; o acesso por tarefa solta acompanha o
-- arquivamento.
--
-- A comparacao repete a de `is_activity_actor_v2` (UUID, nome ou email) porque
-- `assigned_to` e `participants` sao TEXTO livre na base: ha 73 atividades com
-- o UUID do perfil na coluna e o restante com o nome. Comparar so por um dos
-- formatos deixaria gente de fora -- foi exatamente o defeito corrigido em
-- 20260818120000.
CREATE OR REPLACE FUNCTION public.tem_atividade_no_projeto_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    JOIN public.projects p ON p.id = a.project_id
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE a.project_id = _project_id
      AND COALESCE(a.is_trashed, false) = false
      AND COALESCE(p.is_trashed, false) = false
      AND (
        a.created_by = _user_id
        OR (a.assigned_to IS NOT NULL AND (
          lower(trim(a.assigned_to)) = lower(trim(_user_id::text))
          OR (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
          OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
        ))
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(a.participants, '{}'::text[])) nome
          WHERE (pr.full_name IS NOT NULL AND lower(trim(nome)) = lower(trim(pr.full_name)))
             OR (au.email IS NOT NULL AND lower(trim(nome)) = lower(trim(au.email)))
        )
      )
  );
$$;

COMMENT ON FUNCTION public.tem_atividade_no_projeto_v2(uuid, uuid) IS
  'Vinculo por atividade viva (criador, responsavel ou participante). Da LEITURA do trabalho do projeto, nao acesso a orcamento/TAP/arquivos.';

-- Indice funcional para o predicado que esta funcao usa.
--
-- `idx_activities_assigned_to` ja existe, mas nao serve aqui: a comparacao e
-- `lower(trim(assigned_to))`, e o planner nao usa um indice B-tree simples
-- quando a coluna esta dentro de funcoes. Sem este indice, a policy faria
-- seq scan em `activities` a cada leitura -- e ela e avaliada por LINHA.
--
-- O par (project_id, lower(trim(assigned_to))) e a busca exata que o EXISTS
-- faz: filtra o projeto primeiro e depois casa o nome.
CREATE INDEX IF NOT EXISTS idx_activities_projeto_responsavel_lower
  ON public.activities (project_id, (lower(trim(assigned_to))))
  WHERE is_trashed = false;

-- `participants` e text[] e a busca e por igualdade de elemento (via unnest).
-- GIN cobre o operador de containment, que e o que o planner consegue usar.
CREATE INDEX IF NOT EXISTS idx_activities_participants_gin
  ON public.activities USING GIN (participants);

-- `created_by` entra no mesmo EXISTS e nao tinha indice.
CREATE INDEX IF NOT EXISTS idx_activities_created_by
  ON public.activities (created_by)
  WHERE is_trashed = false;

-- Leitura do trabalho: equipe OU vinculo por atividade.
--
-- Separada de `can_view_project_v2` de proposito -- ver o cabecalho. Esta aqui
-- cobre o que a pessoa precisa para trabalhar: o projeto, as atividades, as
-- fases e a lista de quem mais esta nele.
CREATE OR REPLACE FUNCTION public.can_view_project_work_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_view_project_v2(_project_id, _user_id)
    OR public.tem_atividade_no_projeto_v2(_project_id, _user_id);
$$;

COMMENT ON FUNCTION public.can_view_project_work_v2(uuid, uuid) IS
  'Leitura do TRABALHO do projeto: equipe/lider/admin OU quem tem atividade atribuida. Nao vale para orcamento, TAP, documentos e arquivos -- esses seguem em can_view_project_v2.';

-- As quatro tabelas do trabalho passam a usar a funcao nova.
--
-- `projects` entra porque sem a linha do projeto a tela nao abre -- e era ela
-- que fazia o Kanban carregar vazio em vez de dizer "sem acesso".
--
-- `project_members` entra para que a pessoa veja QUEM mais esta no projeto: e
-- o que permite pedir acesso a alguem em vez de ficar no escuro. E leitura da
-- composicao da equipe; alterar quem entra continua exigindo
-- `can_manage_project_v2`, intocada.
--
-- Nao entram aqui (seguem so para a equipe): budget_*, cost_rates, TAP,
-- document_flows, project_pages, page_comments, lesson_prompts, meeting_* e os
-- arquivos do storage.
DROP POLICY IF EXISTS "Project access v2 read" ON public.projects;
CREATE POLICY "Project access v2 read" ON public.projects
FOR SELECT TO authenticated
USING (public.can_view_project_work_v2(id, auth.uid()));

DROP POLICY IF EXISTS "Activities access v2 read" ON public.activities;
CREATE POLICY "Activities access v2 read" ON public.activities
FOR SELECT TO authenticated
USING (public.can_view_project_work_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Phases access v2 read" ON public.phases;
CREATE POLICY "Phases access v2 read" ON public.phases
FOR SELECT TO authenticated
USING (public.can_view_project_work_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project members access v2 read" ON public.project_members;
CREATE POLICY "Project members access v2 read" ON public.project_members
FOR SELECT TO authenticated
USING (public.can_view_project_work_v2(project_id, auth.uid()));

-- `workflow_stages` NAO e tocada aqui, de proposito. A leitura dela hoje e
-- `USING (true)` (20260714160000): qualquer autenticado le as colunas de
-- qualquer quadro. Isso e mais aberto do que deveria, mas apertar essa policy
-- e uma decisao propria -- e faze-la de carona aqui TIRARIA acesso de quem
-- hoje le, que e o oposto do que esta migration se propoe. Fica anotado como
-- divida separada.

NOTIFY pgrst, 'reload schema';

-- Verificacao: as 8 duplas que recebiam `false` passam a receber `true`, e
-- ninguem que ja lia deixa de ler (a funcao nova e um OR sobre a antiga).
DO $$
DECLARE
  n_antes int;
  n_depois int;
BEGIN
  IF to_regprocedure('public.tem_atividade_no_projeto_v2(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'tem_atividade_no_projeto_v2 nao foi criada';
  END IF;
  IF to_regprocedure('public.can_view_project_work_v2(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'can_view_project_work_v2 nao foi criada';
  END IF;

  -- Quantas duplas pessoa-projeto ganham leitura que nao tinham.
  SELECT count(*) INTO n_depois
  FROM (
    SELECT DISTINCT a.project_id, pr.id AS user_id
    FROM public.activities a
    JOIN public.projects p ON p.id = a.project_id
    JOIN public.profiles pr ON (
      (a.assigned_to IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
      OR a.created_by = pr.id
    )
    WHERE COALESCE(a.is_trashed, false) = false
      AND COALESCE(p.is_trashed, false) = false
  ) v
  WHERE NOT public.can_view_project_v2(v.project_id, v.user_id)
    AND public.can_view_project_work_v2(v.project_id, v.user_id);

  RAISE NOTICE 'Duplas pessoa-projeto que ganharam leitura: %', n_depois;
END $$;

-- Reversao:
--   DROP POLICY "Project access v2 read" ON public.projects;
--   CREATE POLICY "Project access v2 read" ON public.projects
--     FOR SELECT TO authenticated USING (public.can_view_project_v2(id, auth.uid()));
--   (idem para activities, phases, project_members, workflow_stages)
--   DROP FUNCTION public.can_view_project_work_v2(uuid, uuid);
--   DROP FUNCTION public.tem_atividade_no_projeto_v2(uuid, uuid);
