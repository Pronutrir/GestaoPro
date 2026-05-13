DROP POLICY IF EXISTS "Members can read activities" ON public.activities;

CREATE POLICY "Members can read activities"
ON public.activities
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_project_leader(project_id, auth.uid())
  OR is_activity_member(id, auth.uid())
);
