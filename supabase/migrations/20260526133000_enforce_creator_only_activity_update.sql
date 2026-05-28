CREATE OR REPLACE FUNCTION public.can_update_activity_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = _activity_id
      AND (
        public.is_admin_user_v2(_user_id)
        OR public.is_project_leader_v2(a.project_id, _user_id)
        OR (a.created_by IS NOT NULL AND a.created_by = _user_id)
      )
  );
$$;
