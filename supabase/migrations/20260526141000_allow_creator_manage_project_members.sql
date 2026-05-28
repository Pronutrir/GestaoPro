-- Permite que o criador do projeto também gerencie equipe,
-- mesmo quando o campo owner/líder estiver vazio ou divergente.
CREATE OR REPLACE FUNCTION public.can_manage_project_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.is_admin_user_v2(_user_id)
      OR public.is_project_leader_v2(_project_id, _user_id)
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = _project_id
          AND p.created_by = _user_id
      )
    );
$$;
