-- Minimal idempotent fix for schema drift (safe subset)
-- WARNING: this script intentionally avoids creating/overwriting RLS policies.
-- If tables are missing, prefer applying project migrations instead.

BEGIN;

-- 1) Core activities columns used by recent ports
ALTER TABLE IF EXISTS public.activities
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.activities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS workflow_stage_id uuid REFERENCES public.workflow_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'tarefa',
  ADD COLUMN IF NOT EXISTS blocked_since timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_days_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wbs_code text,
  ADD COLUMN IF NOT EXISTS last_progress_stage_id uuid;

-- 2) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_activities_parent_id
  ON public.activities(parent_id);

CREATE INDEX IF NOT EXISTS idx_activities_is_milestone
  ON public.activities(is_milestone)
  WHERE is_milestone = true;

CREATE INDEX IF NOT EXISTS idx_activities_wbs_code
  ON public.activities(project_id, wbs_code);

-- 3) Basic integrity guards
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activities'
      AND column_name = 'item_type'
  ) THEN
    BEGIN
      ALTER TABLE public.activities
        ADD CONSTRAINT activities_item_type_check
        CHECK (item_type IN ('fase', 'tarefa', 'subtarefa', 'atividade', 'subatividade', 'historia_usuario'));
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END $$;

COMMIT;
