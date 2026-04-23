CREATE TABLE public.task_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  target_activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('related','blocking','waiting_on')),
  note TEXT,
  created_by UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_relations_no_self CHECK (source_activity_id <> target_activity_id),
  CONSTRAINT task_relations_unique UNIQUE (source_activity_id, target_activity_id, relation_type)
);

CREATE INDEX idx_task_relations_source ON public.task_relations(source_activity_id);
CREATE INDEX idx_task_relations_target ON public.task_relations(target_activity_id);
CREATE INDEX idx_task_relations_type ON public.task_relations(relation_type);

ALTER TABLE public.task_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read task_relations"
  ON public.task_relations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert task_relations"
  ON public.task_relations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can delete task_relations"
  ON public.task_relations FOR DELETE TO authenticated USING (true);

CREATE POLICY "Auth users can update task_relations"
  ON public.task_relations FOR UPDATE TO authenticated USING (true);

-- Set created_by automatically
CREATE OR REPLACE FUNCTION public.set_task_relation_created_by()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; v_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL AND NEW.created_by IS NULL THEN
    NEW.created_by := v_uid;
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
    NEW.created_by_email := v_email;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_relations_created_by
  BEFORE INSERT ON public.task_relations
  FOR EACH ROW EXECUTE FUNCTION public.set_task_relation_created_by();

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_relations;