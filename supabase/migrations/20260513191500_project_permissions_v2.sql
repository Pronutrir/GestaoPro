-- Project permissions v2
-- Fonte de verdade para o novo modelo de acesso.

CREATE OR REPLACE FUNCTION public.is_admin_user_v2(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_leader_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.profiles pr ON pr.id = _user_id
    WHERE p.id = _project_id
      AND pr.full_name IS NOT NULL
      AND p.owner IS NOT NULL
      AND lower(trim(p.owner)) = lower(trim(pr.full_name))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_member_v2(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = _project_id
      AND pm.user_id = _user_id
  );
$$;

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
    );
$$;

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
    );
$$;

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
      OR public.is_project_member_v2(_project_id, _user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_activity_actor_v2(_activity_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    LEFT JOIN auth.users au ON au.id = _user_id
    WHERE a.id = _activity_id
      AND (
        (a.assigned_to IS NOT NULL AND (
          (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
          OR (au.email IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(au.email)))
        ))
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(a.participants, '{}'::text[])) participant_name
          WHERE (pr.full_name IS NOT NULL AND lower(trim(participant_name)) = lower(trim(pr.full_name)))
             OR (au.email IS NOT NULL AND lower(trim(participant_name)) = lower(trim(au.email)))
        )
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
        public.can_view_project_v2(a.project_id, _user_id)
        OR public.is_activity_actor_v2(a.id, _user_id)
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
      AND c.author IS NOT NULL
      AND (
        (pr.full_name IS NOT NULL AND lower(trim(c.author)) = lower(trim(pr.full_name)))
        OR (au.email IS NOT NULL AND lower(trim(c.author)) = lower(trim(au.email)))
      )
  );
$$;

UPDATE public.project_members
SET
  raci = NULL,
  project_role = 'contributor',
  can_create = true,
  can_edit = false,
  can_delete = false,
  can_move = false;

DROP POLICY IF EXISTS "Members can read projects" ON public.projects;
DROP POLICY IF EXISTS "Members can update projects" ON public.projects;
DROP POLICY IF EXISTS "Members can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Project access v2 read" ON public.projects;
DROP POLICY IF EXISTS "Project access v2 update" ON public.projects;
DROP POLICY IF EXISTS "Project access v2 delete" ON public.projects;

CREATE POLICY "Project access v2 read" ON public.projects
FOR SELECT TO authenticated
USING (public.can_view_project_v2(id, auth.uid()));

CREATE POLICY "Project access v2 update" ON public.projects
FOR UPDATE TO authenticated
USING (public.can_manage_project_v2(id, auth.uid()));

CREATE POLICY "Project access v2 delete" ON public.projects
FOR DELETE TO authenticated
USING (public.is_admin_user_v2(auth.uid()));

DROP POLICY IF EXISTS "Members can read activities" ON public.activities;
DROP POLICY IF EXISTS "Members can insert activities" ON public.activities;
DROP POLICY IF EXISTS "Members can update activities" ON public.activities;
DROP POLICY IF EXISTS "Members can delete activities" ON public.activities;
DROP POLICY IF EXISTS "Activities access v2 read" ON public.activities;
DROP POLICY IF EXISTS "Activities access v2 insert" ON public.activities;
DROP POLICY IF EXISTS "Activities access v2 update" ON public.activities;
DROP POLICY IF EXISTS "Activities access v2 delete" ON public.activities;

CREATE POLICY "Activities access v2 read" ON public.activities
FOR SELECT TO authenticated
USING (public.can_view_project_v2(project_id, auth.uid()));

CREATE POLICY "Activities access v2 insert" ON public.activities
FOR INSERT TO authenticated
WITH CHECK (public.can_create_activity_v2(project_id, auth.uid()));

CREATE POLICY "Activities access v2 update" ON public.activities
FOR UPDATE TO authenticated
USING (public.can_update_activity_v2(id, auth.uid()));

CREATE POLICY "Activities access v2 delete" ON public.activities
FOR DELETE TO authenticated
USING (
  public.is_admin_user_v2(auth.uid())
  OR public.is_project_leader_v2(project_id, auth.uid())
);

DROP POLICY IF EXISTS "Members can read phases" ON public.phases;
DROP POLICY IF EXISTS "Members can insert phases" ON public.phases;
DROP POLICY IF EXISTS "Members can update phases" ON public.phases;
DROP POLICY IF EXISTS "Members can delete phases" ON public.phases;
DROP POLICY IF EXISTS "Phases access v2 read" ON public.phases;
DROP POLICY IF EXISTS "Phases access v2 insert" ON public.phases;
DROP POLICY IF EXISTS "Phases access v2 update" ON public.phases;
DROP POLICY IF EXISTS "Phases access v2 delete" ON public.phases;

CREATE POLICY "Phases access v2 read" ON public.phases
FOR SELECT TO authenticated
USING (public.can_view_project_v2(project_id, auth.uid()));

CREATE POLICY "Phases access v2 insert" ON public.phases
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_project_v2(project_id, auth.uid()));

CREATE POLICY "Phases access v2 update" ON public.phases
FOR UPDATE TO authenticated
USING (public.can_manage_project_v2(project_id, auth.uid()));

CREATE POLICY "Phases access v2 delete" ON public.phases
FOR DELETE TO authenticated
USING (public.can_manage_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Members can read project_members" ON public.project_members;
DROP POLICY IF EXISTS "Leaders can insert project_members" ON public.project_members;
DROP POLICY IF EXISTS "Leaders can update project_members" ON public.project_members;
DROP POLICY IF EXISTS "Leaders can delete project_members" ON public.project_members;
DROP POLICY IF EXISTS "Project members access v2 read" ON public.project_members;
DROP POLICY IF EXISTS "Project members access v2 insert" ON public.project_members;
DROP POLICY IF EXISTS "Project members access v2 update" ON public.project_members;
DROP POLICY IF EXISTS "Project members access v2 delete" ON public.project_members;

CREATE POLICY "Project members access v2 read" ON public.project_members
FOR SELECT TO authenticated
USING (public.can_view_project_v2(project_id, auth.uid()));

CREATE POLICY "Project members access v2 insert" ON public.project_members
FOR INSERT TO authenticated
WITH CHECK (public.can_manage_project_v2(project_id, auth.uid()));

CREATE POLICY "Project members access v2 update" ON public.project_members
FOR UPDATE TO authenticated
USING (public.can_manage_project_v2(project_id, auth.uid()));

CREATE POLICY "Project members access v2 delete" ON public.project_members
FOR DELETE TO authenticated
USING (public.can_manage_project_v2(project_id, auth.uid()));

DROP POLICY IF EXISTS "Permitir leitura pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir inserção pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir atualização pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir exclusão pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Activity comments v2 read" ON public.activity_comments;
DROP POLICY IF EXISTS "Activity comments v2 insert" ON public.activity_comments;
DROP POLICY IF EXISTS "Activity comments v2 update" ON public.activity_comments;
DROP POLICY IF EXISTS "Activity comments v2 delete" ON public.activity_comments;

CREATE POLICY "Activity comments v2 read" ON public.activity_comments
FOR SELECT TO authenticated
USING (public.can_comment_activity_v2(activity_id, auth.uid()));

CREATE POLICY "Activity comments v2 insert" ON public.activity_comments
FOR INSERT TO authenticated
WITH CHECK (public.can_comment_activity_v2(activity_id, auth.uid()));

CREATE POLICY "Activity comments v2 update" ON public.activity_comments
FOR UPDATE TO authenticated
USING (
  public.is_admin_user_v2(auth.uid())
  OR public.is_activity_comment_author_v2(id, auth.uid())
);

CREATE POLICY "Activity comments v2 delete" ON public.activity_comments
FOR DELETE TO authenticated
USING (
  public.is_admin_user_v2(auth.uid())
  OR public.is_activity_comment_author_v2(id, auth.uid())
);