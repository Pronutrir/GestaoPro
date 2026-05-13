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
      AND COALESCE(pm.invitation_status, 'accepted') = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.respond_project_invite_v2(
  _project_id uuid,
  _accept boolean,
  _decline_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL OR _project_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.project_members
  SET invitation_status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
      responded_at = now(),
      decline_reason = CASE WHEN _accept THEN NULL ELSE NULLIF(trim(COALESCE(_decline_reason, '')), '') END
  WHERE project_id = _project_id
    AND user_id = _user_id
    AND invitation_status = 'pending';

  RETURN FOUND;
END;
$$;