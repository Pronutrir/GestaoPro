CREATE TABLE public.change_request_approvers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  change_request_id uuid NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (change_request_id, user_id)
);

CREATE INDEX idx_cr_approvers_request ON public.change_request_approvers(change_request_id);
CREATE INDEX idx_cr_approvers_user ON public.change_request_approvers(user_id);

ALTER TABLE public.change_request_approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read change_request_approvers"
  ON public.change_request_approvers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Auth users can insert change_request_approvers"
  ON public.change_request_approvers FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users can update change_request_approvers"
  ON public.change_request_approvers FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Auth users can delete change_request_approvers"
  ON public.change_request_approvers FOR DELETE
  TO authenticated USING (true);