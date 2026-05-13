DROP POLICY IF EXISTS "Auth users can read permission_schemes" ON public.permission_schemes;
DROP POLICY IF EXISTS "Admins can insert permission_schemes" ON public.permission_schemes;
DROP POLICY IF EXISTS "Admins can update non-system permission_schemes" ON public.permission_schemes;
DROP POLICY IF EXISTS "Admins can delete non-system permission_schemes" ON public.permission_schemes;

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

DROP TRIGGER IF EXISTS trg_permission_schemes_updated ON public.permission_schemes;
CREATE TRIGGER trg_permission_schemes_updated
  BEFORE UPDATE ON public.permission_schemes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.permission_schemes (name, description, access_level, can_create, can_edit, can_delete, can_move, is_system) VALUES
  ('Gerente de Projeto', 'Acesso completo a tarefas: criar, editar, excluir e mover.', 'contributor', true, true, true, true, true),
  ('Desenvolvedor', 'Cria, edita e move tarefas. Nao exclui.', 'contributor', true, true, false, true, true),
  ('Revisor', 'Apenas visualiza e comenta.', 'commenter', false, false, false, false, true),
  ('Stakeholder', 'Apenas visualiza o projeto.', 'viewer', false, false, false, false, true)
ON CONFLICT (name) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can insert own activity_comments" ON public.activity_comments;
DROP POLICY IF EXISTS "Authors can update own activity_comments" ON public.activity_comments;
DROP POLICY IF EXISTS "Authors can delete own activity_comments" ON public.activity_comments;

CREATE POLICY "Authenticated users can insert own activity_comments"
ON public.activity_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND COALESCE(created_by, auth.uid()) = auth.uid()
);

CREATE POLICY "Authors can update own activity_comments"
ON public.activity_comments
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Authors can delete own activity_comments"
ON public.activity_comments
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);