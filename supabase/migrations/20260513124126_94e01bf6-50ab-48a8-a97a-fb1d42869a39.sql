CREATE TABLE IF NOT EXISTS public.permission_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  access_level text NOT NULL DEFAULT 'contributor' CHECK (access_level IN ('viewer','commenter','contributor')),
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_move boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_schemes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read permission_schemes"
  ON public.permission_schemes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert permission_schemes"
  ON public.permission_schemes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update non-system permission_schemes"
  ON public.permission_schemes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND is_system = false);

CREATE POLICY "Admins can delete non-system permission_schemes"
  ON public.permission_schemes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND is_system = false);

CREATE TRIGGER trg_permission_schemes_updated
  BEFORE UPDATE ON public.permission_schemes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed system templates
INSERT INTO public.permission_schemes (name, description, access_level, can_create, can_edit, can_delete, can_move, is_system) VALUES
  ('Gerente de Projeto', 'Acesso completo a tarefas: criar, editar, excluir e mover.', 'contributor', true, true, true, true, true),
  ('Desenvolvedor', 'Cria, edita e move tarefas. Nao exclui.', 'contributor', true, true, false, true, true),
  ('Revisor', 'Apenas visualiza e comenta.', 'commenter', false, false, false, false, true),
  ('Stakeholder', 'Apenas visualiza o projeto.', 'viewer', false, false, false, false, true)
ON CONFLICT (name) DO NOTHING;
