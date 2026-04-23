-- Tabela de escopo da RFC: lista atividades e fases bloqueadas pela RFC
CREATE TABLE public.change_request_scope_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id uuid NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('activity', 'phase')),
  activity_id uuid NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  phase_id uuid NULL REFERENCES public.phases(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT scope_item_xor CHECK (
    (item_type = 'activity' AND activity_id IS NOT NULL AND phase_id IS NULL) OR
    (item_type = 'phase' AND phase_id IS NOT NULL AND activity_id IS NULL)
  )
);

CREATE INDEX idx_crsi_change_request ON public.change_request_scope_items(change_request_id);
CREATE INDEX idx_crsi_activity ON public.change_request_scope_items(activity_id) WHERE activity_id IS NOT NULL;
CREATE INDEX idx_crsi_phase ON public.change_request_scope_items(phase_id) WHERE phase_id IS NOT NULL;

ALTER TABLE public.change_request_scope_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read change_request_scope_items"
  ON public.change_request_scope_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert change_request_scope_items"
  ON public.change_request_scope_items FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update change_request_scope_items"
  ON public.change_request_scope_items FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth users can delete change_request_scope_items"
  ON public.change_request_scope_items FOR DELETE TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.change_request_scope_items;