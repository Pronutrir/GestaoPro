ALTER TABLE public.workflow_stages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_stages;