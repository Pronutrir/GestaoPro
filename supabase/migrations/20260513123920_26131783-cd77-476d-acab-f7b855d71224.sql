-- 1) Add access_level column with safe default
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'contributor';

ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_access_level_check;

ALTER TABLE public.project_members
  ADD CONSTRAINT project_members_access_level_check
  CHECK (access_level IN ('viewer','commenter','contributor'));

-- 2) Update can_member_action to deny writes for viewer/commenter
CREATE OR REPLACE FUNCTION public.can_member_action(_project_id uuid, _user_id uuid, _action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR public.is_project_leader(_project_id, _user_id)
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = _project_id
          AND user_id = _user_id
          AND COALESCE(access_level, 'contributor') = 'contributor'
          AND CASE _action
            WHEN 'create' THEN COALESCE(can_create, false)
            WHEN 'edit'   THEN COALESCE(can_edit, false)
            WHEN 'delete' THEN COALESCE(can_delete, false)
            WHEN 'move'   THEN COALESCE(can_move, false)
            ELSE false
          END
      )
    )
$function$;
