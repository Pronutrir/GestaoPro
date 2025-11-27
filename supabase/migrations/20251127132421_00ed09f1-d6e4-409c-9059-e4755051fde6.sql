-- Adicionar campos aos projetos
ALTER TABLE public.projects 
ADD COLUMN owner TEXT,
ADD COLUMN blockers TEXT;

-- Adicionar campos às atividades
ALTER TABLE public.activities 
ADD COLUMN assigned_to TEXT,
ADD COLUMN start_date DATE,
ADD COLUMN end_date DATE,
ADD COLUMN cost DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN hours DECIMAL(6, 2) DEFAULT 0;

-- Índice para buscar por responsável
CREATE INDEX idx_projects_owner ON public.projects(owner);
CREATE INDEX idx_activities_assigned_to ON public.activities(assigned_to);