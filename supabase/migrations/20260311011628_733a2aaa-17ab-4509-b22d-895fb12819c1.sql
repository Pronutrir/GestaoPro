
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS sector text DEFAULT null,
  ADD COLUMN IF NOT EXISTS can_create boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_move boolean NOT NULL DEFAULT false;

-- Remove old role column
ALTER TABLE public.project_members DROP COLUMN IF EXISTS role;
