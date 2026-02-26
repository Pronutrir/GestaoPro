
-- 1. Adicionar campos para sub-tarefas, prioridade e tags nas atividades
ALTER TABLE public.activities 
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.activities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Índice para sub-tarefas
CREATE INDEX IF NOT EXISTS idx_activities_parent_id ON public.activities(parent_id);

-- Índice para tags (GIN para buscas em arrays)
CREATE INDEX IF NOT EXISTS idx_activities_tags ON public.activities USING GIN(tags);

-- 2. Tabela de dependências entre tarefas (para Gantt)
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  successor_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'finish_to_start',
  lag_days integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(predecessor_id, successor_id)
);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de dependências" ON public.task_dependencies FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública de dependências" ON public.task_dependencies FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de dependências" ON public.task_dependencies FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública de dependências" ON public.task_dependencies FOR DELETE USING (true);

-- 3. Tabela de documentos do projeto
CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  version integer NOT NULL DEFAULT 1,
  uploaded_by text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de documentos" ON public.project_documents FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública de documentos" ON public.project_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de documentos" ON public.project_documents FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública de documentos" ON public.project_documents FOR DELETE USING (true);

CREATE TRIGGER update_project_documents_updated_at
  BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Tabela de lições aprendidas
CREATE TABLE IF NOT EXISTS public.lessons_learned (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.phases(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general',
  problem text NOT NULL,
  solution text,
  suggestion text,
  impact text,
  reported_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lessons_learned ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de lições" ON public.lessons_learned FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública de lições" ON public.lessons_learned FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de lições" ON public.lessons_learned FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública de lições" ON public.lessons_learned FOR DELETE USING (true);

CREATE TRIGGER update_lessons_learned_updated_at
  BEFORE UPDATE ON public.lessons_learned
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Tabela de time tracking
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_minutes integer,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de time entries" ON public.time_entries FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública de time entries" ON public.time_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de time entries" ON public.time_entries FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública de time entries" ON public.time_entries FOR DELETE USING (true);

-- 6. Tabela de notificações in-app
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura pública de notificações" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Permitir inserção pública de notificações" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização pública de notificações" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão pública de notificações" ON public.notifications FOR DELETE USING (true);

-- Habilitar realtime para notificações
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
