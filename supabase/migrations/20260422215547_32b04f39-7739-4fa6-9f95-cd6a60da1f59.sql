DROP POLICY IF EXISTS "Admins manage holidays" ON public.holidays;
CREATE POLICY "Admins and gestores manage holidays"
ON public.holidays FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));

ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own schedule" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Admins manage all schedules" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Read all schedules" ON public.user_work_schedules;

CREATE POLICY "Read all schedules"
ON public.user_work_schedules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users manage own schedule"
ON public.user_work_schedules FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage all schedules"
ON public.user_work_schedules FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));