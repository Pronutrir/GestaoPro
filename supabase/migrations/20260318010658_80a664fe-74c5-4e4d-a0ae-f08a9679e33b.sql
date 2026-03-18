
CREATE TABLE public.user_tab_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  allowed_tabs text[] NOT NULL DEFAULT ARRAY['kanban','backlog','timeline','deliveries','documents','tap','meetings','assumptions','risks','financials','lessons','workflow']::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_tab_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tab permissions"
  ON public.user_tab_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own tab permissions"
  ON public.user_tab_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
