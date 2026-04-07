ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS deadline_flag text DEFAULT NULL;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS last_update_date date DEFAULT NULL;