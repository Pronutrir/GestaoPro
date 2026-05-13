CREATE OR REPLACE FUNCTION public.can_create_activity_v2(_project_id uuid, _user_id uuid)
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
        FROM public.project_members pm
        WHERE pm.project_id = _project_id
          AND pm.user_id = _user_id
          AND COALESCE(pm.access_level, 'contributor') = 'contributor'
          AND COALESCE(pm.can_create, false) = true
      )
    );
$$;

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
        OR public.is_activity_actor_v2(a.id, _user_id)
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = a.project_id
            AND pm.user_id = _user_id
            AND COALESCE(pm.access_level, 'contributor') = 'contributor'
            AND COALESCE(pm.can_edit, false) = true
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_comment_activity_v2(_activity_id uuid, _user_id uuid)
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
        OR public.is_activity_actor_v2(a.id, _user_id)
        OR EXISTS (
          SELECT 1
          FROM public.project_members pm
          WHERE pm.project_id = a.project_id
            AND pm.user_id = _user_id
            AND COALESCE(pm.access_level, 'viewer') IN ('commenter', 'contributor')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_activity_comment_author_v2(_comment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activity_comments c
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE c.id = _comment_id
      AND (
        c.created_by = _user_id
        OR (
          c.author IS NOT NULL
          AND (
            (pr.full_name IS NOT NULL AND lower(trim(c.author)) = lower(trim(pr.full_name)))
            OR (au.email IS NOT NULL AND lower(trim(c.author)) = lower(trim(au.email)))
          )
        )
      )
  );
$$;