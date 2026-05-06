-- Align notifications table with the app schema expected by the Next.js frontend.
-- Some self-hosted environments still have legacy columns: user_id, body, read.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- Backfill from legacy columns when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'body'
  ) THEN
    EXECUTE 'UPDATE public.notifications SET message = COALESCE(message, body)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'read'
  ) THEN
    EXECUTE 'UPDATE public.notifications SET is_read = COALESCE(is_read, "read")';
  END IF;
END
$$;

-- Ensure type is always set for existing and future rows.
UPDATE public.notifications
SET type = COALESCE(type, 'info');

ALTER TABLE public.notifications
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN type SET DEFAULT 'info';

COMMIT;

NOTIFY pgrst, 'reload schema';
