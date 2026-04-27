ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_projects_is_trashed ON public.projects(is_trashed) WHERE is_trashed = true;