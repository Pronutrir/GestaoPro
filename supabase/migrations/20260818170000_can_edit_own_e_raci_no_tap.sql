-- Duas mudancas que andam juntas: o nivel "so as minhas" ganha coluna, e o
-- RACI passa a ser editado no TAP.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) `can_edit_own`: o nivel do meio deixa de ser inferido.
--
-- A escada de permissao do projeto tem quatro niveis, mas as quatro colunas
-- `can_*` so distinguiam tres: "Editar apenas as minhas" e "Visualizar e
-- comentar" gravavam os MESMOS quatro `false`. A diferenca entre os dois
-- nascia em tempo de execucao, do vinculo com a atividade.
--
-- O efeito na tela: o gestor escolhia "Visualizar e comentar", salvava,
-- reabria -- e lia "Editar apenas as minhas". A escolha dele era
-- indistinguivel da outra e se perdia no caminho. Uma tela que oferece quatro
-- opcoes e so consegue guardar tres mente na quarta.
--
-- A coluna guarda a INTENCAO de quem escolheu, que e o que faltava. Ela nao
-- concede acesso novo: quem e responsavel por uma atividade continua editando
-- aquela atividade por `is_activity_actor_v2`, independente desta coluna --
-- essa e a arquitetura do Jira (permissao concedida ao destinatario dinamico
-- "Current Assignee") e nao muda aqui.
--
-- O que a coluna passa a permitir e o CONTRARIO: dizer "esta pessoa NAO edita
-- nem as dela", que hoje e impossivel de expressar.
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS can_edit_own boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.project_members.can_edit_own IS
  'Edita as atividades em que atua (responsavel/participante/criador). `false` = so leitura e comentario. Nao afeta quem tem can_edit, que edita tudo.';

-- DEFAULT true, e nao false, de proposito: e o comportamento que o sistema JA
-- tem hoje para todo mundo. Entrar com `false` tiraria acesso de 72 pessoas
-- numa migration que se propoe a nao mexer em permissao de ninguem.
--
-- Os 5 membros hoje com as quatro colunas em `false` ficam com
-- `can_edit_own = true`: eles editam as proprias atividades hoje, pela via do
-- vinculo, e continuam editando. Quem quiser rebaixa na tela, agora que da.

-- ───────────────────────────────────────────────────────────────────────────
-- 2) O RACI passa a ser editado no TAP.
--
-- A coluna NAO muda de lugar -- continua em `project_members`. Muda so ONDE se
-- edita, e por isso esta parte da migration e so documentacao.
--
-- Motivo, medido em 18/08/2026: a unica consequencia do RACI no sistema
-- inteiro e sugerir o aprovador na secao 8 do TAP (ProjectCharter). E NENHUM
-- dos 43 projetos tem um "A" definido -- a funcao nunca disparou uma vez.
-- Das 50 marcacoes "I" que existem, 44 vieram do antigo DEFAULT do banco; so
-- 5 "R" foram escolha de alguem.
--
-- O campo era preenchido na ficha da equipe, longe de onde e usado, e por isso
-- nao era preenchido de verdade. No TAP a pergunta tem consequencia visivel na
-- secao seguinte, e a matriz aparece como TABELA -- comparavel de relance, que
-- e como toda matriz RACI de mercado e publicada.
COMMENT ON COLUMN public.project_members.raci IS
  'Papel na governanca (R/A/C/I) -- rotulo, NAO permissao. Editado no TAP (secao Matriz de Responsabilidades), nao na ficha da equipe. Quem decide acesso e can_create/can_edit/can_delete/can_move/can_edit_own.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) `activities.raci_role` sai.
--
-- Segundo RACI, por atividade, criado em 15/03 (20260315131620). Nunca teve
-- tela: nenhum componente le ou escreve a coluna. Ficaram 48 atividades
-- marcadas "A" por alguma importacao ou teste, invisiveis para todo mundo --
-- e 3.495 nulas.
--
-- RACI por atividade e granularidade que nao se sustenta: a matriz existe para
-- dizer quem aprova o PROJETO, e quem responde por uma atividade ja e o
-- `assigned_to`. Manter a coluna e manter um campo que so pode confundir quem
-- for ler a tabela.
ALTER TABLE public.activities DROP COLUMN IF EXISTS raci_role;

-- Verificacao.
DO $$
DECLARE
  n_sem_edit_own int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'project_members'
       AND column_name = 'can_edit_own'
  ) THEN
    RAISE EXCEPTION 'can_edit_own nao foi criada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'activities'
       AND column_name = 'raci_role'
  ) THEN
    RAISE EXCEPTION 'activities.raci_role ainda existe';
  END IF;

  SELECT count(*) INTO n_sem_edit_own
    FROM public.project_members WHERE can_edit_own = false;

  -- Deve ser 0: ninguem nasce rebaixado nesta migration.
  IF n_sem_edit_own > 0 THEN
    RAISE EXCEPTION 'a migration rebaixou % membro(s) -- nao deveria', n_sem_edit_own;
  END IF;

  RAISE NOTICE 'can_edit_own criada (todos true) · raci_role removida de activities';
END $$;

-- Reversao:
--   ALTER TABLE public.project_members DROP COLUMN can_edit_own;
--   ALTER TABLE public.activities ADD COLUMN raci_role text DEFAULT NULL;
--   (os 48 "A" de activities.raci_role NAO voltam -- nao havia tela lendo)
