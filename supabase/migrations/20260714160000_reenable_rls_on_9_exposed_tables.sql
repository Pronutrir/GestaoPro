-- ============================================================================
-- Correção de segurança: reabilitar RLS nas 9 tabelas expostas + reaplicar
-- policies faltantes. As policies são cópias fiéis das migrations do projeto.
-- Idempotente (DROP POLICY IF EXISTS antes de CREATE). Roda numa transação.
-- ============================================================================
BEGIN;

-- ---- Policies faltantes (4 tabelas com 0 policies no banco) ----------------

-- user_roles (migration 20260311001846)
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- sprints (migration 20260312223327)
DROP POLICY IF EXISTS "Auth users can read sprints" ON public.sprints;
CREATE POLICY "Auth users can read sprints" ON public.sprints FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth users can insert sprints" ON public.sprints;
CREATE POLICY "Auth users can insert sprints" ON public.sprints FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users can update sprints" ON public.sprints;
CREATE POLICY "Auth users can update sprints" ON public.sprints FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth users can delete sprints" ON public.sprints;
CREATE POLICY "Auth users can delete sprints" ON public.sprints FOR DELETE TO authenticated USING (true);

-- workflow_stages (migration 20260311014518)
DROP POLICY IF EXISTS "Auth users can read workflow_stages" ON public.workflow_stages;
CREATE POLICY "Auth users can read workflow_stages" ON public.workflow_stages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth users can insert workflow_stages" ON public.workflow_stages;
CREATE POLICY "Auth users can insert workflow_stages" ON public.workflow_stages FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Auth users can update workflow_stages" ON public.workflow_stages;
CREATE POLICY "Auth users can update workflow_stages" ON public.workflow_stages FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth users can delete workflow_stages" ON public.workflow_stages;
CREATE POLICY "Auth users can delete workflow_stages" ON public.workflow_stages FOR DELETE TO authenticated USING (true);

-- user_module_permissions (migration 20260407011316)
DROP POLICY IF EXISTS "Admins can manage module permissions" ON public.user_module_permissions;
CREATE POLICY "Admins can manage module permissions" ON public.user_module_permissions
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users can read own module permissions" ON public.user_module_permissions;
CREATE POLICY "Users can read own module permissions" ON public.user_module_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---- Reabilitar RLS nas 9 tabelas ------------------------------------------
-- (activities, phases, profiles, project_members, projects já têm policies;
--  as 4 acima acabaram de receber. Habilitar RLS ativa todas.)
ALTER TABLE public.activities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_stages         ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ---- Verificação ------------------------------------------------------------
SELECT tablename, rowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.tablename) AS policies
FROM pg_tables t
WHERE schemaname='public'
  AND tablename IN ('activities','phases','profiles','project_members','projects','sprints','user_module_permissions','user_roles','workflow_stages')
ORDER BY tablename;
