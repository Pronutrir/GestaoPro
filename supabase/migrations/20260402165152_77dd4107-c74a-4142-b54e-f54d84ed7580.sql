ALTER TABLE public.activities ADD COLUMN is_trashed boolean NOT NULL DEFAULT false;
ALTER TABLE public.activities ADD COLUMN trashed_at timestamp with time zone;