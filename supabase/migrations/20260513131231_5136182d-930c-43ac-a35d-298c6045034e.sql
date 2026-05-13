-- 1) Funcao: usuario e participante ou responsavel da atividade?
CREATE OR REPLACE FUNCTION public.is_activity_member(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.activities a
      JOIN public.profiles pr ON pr.id = _user_id
      WHERE a.id = _activity_id
        AND pr.full_name IS NOT NULL
        AND (
          lower(trim(COALESCE(a.assigned_to, ''))) = lower(trim(pr.full_name))
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(a.participants, '{}'::text[])) p
            WHERE lower(trim(p)) = lower(trim(pr.full_name))
          )
        )
    )
$$;

-- 2) Activities: UPDATE permitido para membros do projeto com can_edit OU para
--    participante/responsavel da propria atividade.
DROP POLICY IF EXISTS "Members can update activities" ON public.activities;
CREATE POLICY "Members or activity actors can update activities"
ON public.activities
FOR UPDATE
TO authenticated
USING (
  public.can_member_action(project_id, auth.uid(), 'edit')
  OR public.is_activity_member(id, auth.uid())
);

-- 3) Projects: DELETE so Admin (lider nao exclui mais o projeto).
DROP POLICY IF EXISTS "Members can delete projects" ON public.projects;
CREATE POLICY "Only admins can delete projects"
ON public.projects
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
