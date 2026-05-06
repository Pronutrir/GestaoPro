-- Ensure story_points exists for activity updates.
-- Some self-hosted environments are missing this column.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS story_points integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_story_points_non_negative'
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_story_points_non_negative
      CHECK (story_points IS NULL OR story_points >= 0);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
