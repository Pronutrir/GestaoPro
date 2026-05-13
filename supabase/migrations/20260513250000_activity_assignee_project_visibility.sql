-- Permite que usuários atribuídos a atividades (assigned_to ou participants)
-- vejam o projeto mesmo sem estar em project_members.

CREATE OR REPLACE FUNCTION public.can_view_project_v2(_project_id uuid, _user_id uuid)
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
      OR public.is_project_member_v2(_project_id, _user_id)
      OR EXISTS (
        SELECT 1
        FROM public.activities a
        LEFT JOIN public.profiles pr ON pr.id = _user_id
        LEFT JOIN auth.users au ON au.id = _user_id
        WHERE a.project_id = _project_id
          AND a.is_trashed = false
          AND (
            a.created_by = _user_id
            OR (
              a.assigned_to IS NOT NULL
              AND (
                (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
                OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
              )
            )
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(a.participants, '{}'::text[])) AS participant_name
              WHERE
                (pr.full_name IS NOT NULL AND lower(trim(participant_name)) = lower(trim(pr.full_name)))
                OR (au.email IS NOT NULL AND lower(trim(participant_name)) = lower(trim(au.email)))
            )
          )
      )
    );
$$;