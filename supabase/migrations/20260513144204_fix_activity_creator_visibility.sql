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
      LEFT JOIN public.profiles pr ON pr.id = _user_id
      WHERE a.id = _activity_id
        AND (
          a.created_by = _user_id
          OR (
            pr.full_name IS NOT NULL
            AND (
              lower(trim(COALESCE(a.assigned_to, ''))) = lower(trim(pr.full_name))
              OR EXISTS (
                SELECT 1 FROM unnest(COALESCE(a.participants, '{}'::text[])) p
                WHERE lower(trim(p)) = lower(trim(pr.full_name))
              )
            )
          )
        )
    )
$$;
