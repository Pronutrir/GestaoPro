DROP POLICY IF EXISTS "Members can insert activities" ON public.activities;

CREATE POLICY "Members can insert activities"
ON public.activities
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_member(project_id, auth.uid()));
