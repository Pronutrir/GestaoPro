-- Preferências de EXIBIÇÃO do Kanban por usuário e projeto.
--
-- Antes: campos do card, raias, ordenação, larguras e colunas recolhidas moravam
-- no localStorage. A escolha não seguia a pessoa — configurar o quadro no
-- trabalho e abrir em casa devolvia tudo ao padrão de fábrica. Limpar o cache
-- perdia. E, do lado do código, mudar um DEFAULT_* nunca alcançava quem já
-- tinha um valor salvo (foi por isso que kanban-card-fields precisou virar v2).
--
-- Escopo decidido em 12/08/2026: gosto de exibição vem para o banco; FILTRO
-- NÃO. Filtro é busca do momento — abrir o quadro filtrado de dias atrás faria
-- a pessoa ver poucos cartões e achar que sumiu tarefa. Linear e Jira separam
-- igual: a visão salva é explícita, o filtro do dia é efêmero.
--
-- NÃO confundir com kanban_views (20260730120000): aquela é a visão NOMEADA e
-- COMPARTILHADA com o time; esta é o gosto silencioso de cada um.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-kanban-user-prefs.sh

CREATE TABLE IF NOT EXISTS public.kanban_user_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Um blob só, não uma coluna por preferência: o conjunto ainda muda de forma
  -- (a Fase 1 mexeu nos campos do card, a Fase 2 acrescentou raias e ordenação)
  -- e cada mudança viraria migration. O formato é o mesmo que já ia para o
  -- localStorage: { cardFields, groupBy, boardSort, columnWidths,
  -- collapsedStages, columnSorts }.
  prefs jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

ALTER TABLE public.kanban_user_prefs ENABLE ROW LEVEL SECURITY;

-- Preferência é PESSOAL: cada um só enxerga e escreve a própria linha, em
-- projeto que já pode ver. Sem policy de outra pessoa — nem leitura: o quadro
-- de alguém não é assunto de terceiros, e a chave primária composta já impede
-- duas linhas para o mesmo par.
DROP POLICY IF EXISTS "Users read own kanban prefs" ON public.kanban_user_prefs;
CREATE POLICY "Users read own kanban prefs" ON public.kanban_user_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own kanban prefs" ON public.kanban_user_prefs;
CREATE POLICY "Users insert own kanban prefs" ON public.kanban_user_prefs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Users update own kanban prefs" ON public.kanban_user_prefs;
CREATE POLICY "Users update own kanban prefs" ON public.kanban_user_prefs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own kanban prefs" ON public.kanban_user_prefs;
CREATE POLICY "Users delete own kanban prefs" ON public.kanban_user_prefs
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
