CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_leader(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.projects p
      LEFT JOIN public.profiles pr ON pr.id = _user_id
      WHERE p.id = _project_id
        AND pr.full_name IS NOT NULL
        AND lower(trim(COALESCE(p.owner, ''))) = lower(trim(pr.full_name))
    );
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = _project_id
          AND pm.user_id = _user_id
          AND COALESCE(pm.invitation_status, 'accepted') = 'accepted'
      )
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        LEFT JOIN public.profiles pr ON pr.id = _user_id
        WHERE p.id = _project_id
          AND pr.full_name IS NOT NULL
          AND (
            lower(trim(COALESCE(p.owner, ''))) = lower(trim(pr.full_name))
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(p.assignees, '{}'::text[])) a
              WHERE lower(trim(a)) = lower(trim(pr.full_name))
            )
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_member_action(_project_id uuid, _user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR public.is_project_leader(_project_id, _user_id)
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = _project_id
          AND pm.user_id = _user_id
          AND COALESCE(pm.invitation_status, 'accepted') = 'accepted'
          AND COALESCE(pm.access_level, 'contributor') = 'contributor'
          AND CASE _action
            WHEN 'create' THEN COALESCE(pm.can_create, false)
            WHEN 'edit' THEN COALESCE(pm.can_edit, false)
            WHEN 'delete' THEN COALESCE(pm.can_delete, false)
            WHEN 'move' THEN COALESCE(pm.can_move, false)
            ELSE false
          END
      )
    );
$$;
