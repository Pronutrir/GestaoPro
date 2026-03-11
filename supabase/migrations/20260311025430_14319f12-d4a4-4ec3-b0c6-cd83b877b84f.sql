ALTER TABLE public.meetings ADD COLUMN start_time time without time zone DEFAULT NULL;
ALTER TABLE public.meetings ADD COLUMN end_time time without time zone DEFAULT NULL;