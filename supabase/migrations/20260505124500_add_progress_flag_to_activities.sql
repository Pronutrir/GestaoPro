-- Ensure progress_flag exists for Kanban progress edits.
-- Some self-hosted environments were missing this column.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS progress_flag integer NOT NULL DEFAULT 0;

-- Keep values within expected 0..100 range.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_progress_flag_range'
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_progress_flag_range
      CHECK (progress_flag >= 0 AND progress_flag <= 100);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
