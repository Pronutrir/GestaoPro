CREATE TABLE public.change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  justification text,
  expected_benefits text,
  impact_scope text,
  impact_schedule text,
  impact_cost text,
  impact_quality text,
  status text NOT NULL DEFAULT 'pending',
  requested_by text,
  requested_by_id uuid,
  approver text,
  approver_id uuid,
  decision_date timestamp with time zone,
  decision_notes text,
  is_trashed boolean NOT NULL DEFAULT false,
  trashed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read change_requests"
  ON public.change_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Auth users can insert change_requests"
  ON public.change_requests FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update change_requests"
  ON public.change_requests FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete change_requests"
  ON public.change_requests FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_change_requests_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_change_requests_project_id ON public.change_requests(project_id);
CREATE INDEX idx_change_requests_status ON public.change_requests(status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.change_requests;