-- Adicionar campos de arquivamento em phases (já existem em activities e projects)
ALTER TABLE public.phases 
  ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_phases_is_trashed ON public.phases(is_trashed);