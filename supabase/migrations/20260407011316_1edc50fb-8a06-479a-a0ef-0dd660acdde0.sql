
CREATE TABLE public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  allowed_modules text[] NOT NULL DEFAULT ARRAY['overview', 'projects', 'team', 'timeline', 'blocked']::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage module permissions"
  ON public.user_module_permissions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own module permissions"
  ON public.user_module_permissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
