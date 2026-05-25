
-- ============================================================
-- 1) DROP de policies públicas (anon) — fechar porta sem login
-- ============================================================
DROP POLICY IF EXISTS "Permitir atualização pública de atividades" ON public.activities;
DROP POLICY IF EXISTS "Permitir exclusão pública de atividades" ON public.activities;
DROP POLICY IF EXISTS "Permitir inserção pública de atividades" ON public.activities;
DROP POLICY IF EXISTS "Permitir leitura pública de atividades" ON public.activities;

DROP POLICY IF EXISTS "Permitir atualização pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir exclusão pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir inserção pública de comentários" ON public.activity_comments;
DROP POLICY IF EXISTS "Permitir leitura pública de comentários" ON public.activity_comments;

DROP POLICY IF EXISTS "Permitir atualização pública de investimentos de atividades" ON public.activity_investments;
DROP POLICY IF EXISTS "Permitir exclusão pública de investimentos de atividades" ON public.activity_investments;
DROP POLICY IF EXISTS "Permitir inserção pública de investimentos de atividades" ON public.activity_investments;
DROP POLICY IF EXISTS "Permitir leitura pública de investimentos de atividades" ON public.activity_investments;

DROP POLICY IF EXISTS "Permitir atualização pública de lições" ON public.lessons_learned;
DROP POLICY IF EXISTS "Permitir exclusão pública de lições" ON public.lessons_learned;
DROP POLICY IF EXISTS "Permitir inserção pública de lições" ON public.lessons_learned;
DROP POLICY IF EXISTS "Permitir leitura pública de lições" ON public.lessons_learned;

DROP POLICY IF EXISTS "Permitir atualização pública de notificações" ON public.notifications;
DROP POLICY IF EXISTS "Permitir exclusão pública de notificações" ON public.notifications;
DROP POLICY IF EXISTS "Permitir inserção pública de notificações" ON public.notifications;
DROP POLICY IF EXISTS "Permitir leitura pública de notificações" ON public.notifications;

DROP POLICY IF EXISTS "Permitir atualização pública de fases" ON public.phases;
DROP POLICY IF EXISTS "Permitir exclusão pública de fases" ON public.phases;
DROP POLICY IF EXISTS "Permitir inserção pública de fases" ON public.phases;
DROP POLICY IF EXISTS "Permitir leitura pública de fases" ON public.phases;

DROP POLICY IF EXISTS "Permitir atualização pública de documentos" ON public.project_documents;
DROP POLICY IF EXISTS "Permitir exclusão pública de documentos" ON public.project_documents;
DROP POLICY IF EXISTS "Permitir inserção pública de documentos" ON public.project_documents;
DROP POLICY IF EXISTS "Permitir leitura pública de documentos" ON public.project_documents;

DROP POLICY IF EXISTS "Anon can delete project_members" ON public.project_members;
DROP POLICY IF EXISTS "Anon can insert project_members" ON public.project_members;
DROP POLICY IF EXISTS "Anon can read project_members" ON public.project_members;
DROP POLICY IF EXISTS "Anon can update project_members" ON public.project_members;

DROP POLICY IF EXISTS "Permitir atualização pública" ON public.projects;
DROP POLICY IF EXISTS "Permitir exclusão pública" ON public.projects;
DROP POLICY IF EXISTS "Permitir inserção pública" ON public.projects;
DROP POLICY IF EXISTS "Permitir leitura pública" ON public.projects;

-- Limpeza defensiva para reexecucao: remove policies antigas de membro/lider
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (policyname LIKE 'Members can %' OR policyname LIKE 'Leaders can %')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- 2) Funções de acesso (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = _project_id AND user_id = _user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.profiles pr ON pr.id = _user_id
        WHERE p.id = _project_id
          AND pr.full_name IS NOT NULL
          AND (
            lower(trim(p.owner)) = lower(trim(pr.full_name))
            OR EXISTS (
              SELECT 1 FROM unnest(COALESCE(p.assignees, '{}'::text[])) a
              WHERE lower(trim(a)) = lower(trim(pr.full_name))
            )
          )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.is_project_leader(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _user_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.profiles pr ON pr.id = _user_id
      WHERE p.id = _project_id
        AND pr.full_name IS NOT NULL
        AND lower(trim(p.owner)) = lower(trim(pr.full_name))
    )
$$;

CREATE OR REPLACE FUNCTION public.can_member_action(_project_id uuid, _user_id uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _user_id IS NOT NULL
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR public.is_project_leader(_project_id, _user_id)
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = _project_id AND user_id = _user_id
          AND CASE _action
            WHEN 'create' THEN COALESCE(can_create, false)
            WHEN 'edit'   THEN COALESCE(can_edit, false)
            WHEN 'delete' THEN COALESCE(can_delete, false)
            WHEN 'move'   THEN COALESCE(can_move, false)
            ELSE false
          END
      )
    )
$$;

-- Backward-compat: liberar flags para membros existentes para não quebrar a operação
UPDATE public.project_members
   SET can_create = true, can_edit = true, can_delete = true, can_move = true
 WHERE can_create = false AND can_edit = false AND can_delete = false AND can_move = false;

-- ============================================================
-- 3) RLS por projeto + permissões granulares
-- ============================================================

-- PROJECTS
DROP POLICY IF EXISTS "Auth users can read projects" ON public.projects;
DROP POLICY IF EXISTS "Auth users can update projects" ON public.projects;
DROP POLICY IF EXISTS "Auth users can delete projects" ON public.projects;

CREATE POLICY "Members can read projects" ON public.projects FOR SELECT TO authenticated
USING (public.is_project_member(id, auth.uid()));

CREATE POLICY "Members can update projects" ON public.projects FOR UPDATE TO authenticated
USING (public.can_member_action(id, auth.uid(), 'edit'));

CREATE POLICY "Members can delete projects" ON public.projects FOR DELETE TO authenticated
USING (public.can_member_action(id, auth.uid(), 'delete'));

-- ACTIVITIES
DROP POLICY IF EXISTS "Auth users can read activities" ON public.activities;
DROP POLICY IF EXISTS "Auth users can insert activities" ON public.activities;
DROP POLICY IF EXISTS "Auth users can update activities" ON public.activities;
DROP POLICY IF EXISTS "Auth users can delete activities" ON public.activities;

CREATE POLICY "Members can read activities" ON public.activities FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Members can insert activities" ON public.activities FOR INSERT TO authenticated
WITH CHECK (public.can_member_action(project_id, auth.uid(), 'create'));

CREATE POLICY "Members can update activities" ON public.activities FOR UPDATE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'edit'));

CREATE POLICY "Members can delete activities" ON public.activities FOR DELETE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'delete'));

-- PHASES
DROP POLICY IF EXISTS "Auth users can read phases" ON public.phases;
DROP POLICY IF EXISTS "Auth users can insert phases" ON public.phases;
DROP POLICY IF EXISTS "Auth users can update phases" ON public.phases;
DROP POLICY IF EXISTS "Auth users can delete phases" ON public.phases;

CREATE POLICY "Members can read phases" ON public.phases FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members can insert phases" ON public.phases FOR INSERT TO authenticated
WITH CHECK (public.can_member_action(project_id, auth.uid(), 'create'));
CREATE POLICY "Members can update phases" ON public.phases FOR UPDATE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'edit'));
CREATE POLICY "Members can delete phases" ON public.phases FOR DELETE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'delete'));

-- PROJECT_DOCUMENTS
DROP POLICY IF EXISTS "Auth users can read project_documents" ON public.project_documents;
DROP POLICY IF EXISTS "Auth users can insert project_documents" ON public.project_documents;
DROP POLICY IF EXISTS "Auth users can update project_documents" ON public.project_documents;
DROP POLICY IF EXISTS "Auth users can delete project_documents" ON public.project_documents;

CREATE POLICY "Members can read project_documents" ON public.project_documents FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members can insert project_documents" ON public.project_documents FOR INSERT TO authenticated
WITH CHECK (public.can_member_action(project_id, auth.uid(), 'create'));
CREATE POLICY "Members can update project_documents" ON public.project_documents FOR UPDATE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'edit'));
CREATE POLICY "Members can delete project_documents" ON public.project_documents FOR DELETE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'delete'));

-- MEETINGS
DROP POLICY IF EXISTS "Auth users can read meetings" ON public.meetings;
DROP POLICY IF EXISTS "Auth users can insert meetings" ON public.meetings;
DROP POLICY IF EXISTS "Auth users can update meetings" ON public.meetings;
DROP POLICY IF EXISTS "Auth users can delete meetings" ON public.meetings;

CREATE POLICY "Members can read meetings" ON public.meetings FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members can insert meetings" ON public.meetings FOR INSERT TO authenticated
WITH CHECK (public.can_member_action(project_id, auth.uid(), 'create'));
CREATE POLICY "Members can update meetings" ON public.meetings FOR UPDATE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'edit'));
CREATE POLICY "Members can delete meetings" ON public.meetings FOR DELETE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'delete'));

-- LESSONS_LEARNED
DROP POLICY IF EXISTS "Auth users can read lessons_learned" ON public.lessons_learned;
DROP POLICY IF EXISTS "Auth users can insert lessons_learned" ON public.lessons_learned;
DROP POLICY IF EXISTS "Auth users can update lessons_learned" ON public.lessons_learned;
DROP POLICY IF EXISTS "Auth users can delete lessons_learned" ON public.lessons_learned;

CREATE POLICY "Members can read lessons_learned" ON public.lessons_learned FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members can insert lessons_learned" ON public.lessons_learned FOR INSERT TO authenticated
WITH CHECK (public.can_member_action(project_id, auth.uid(), 'create'));
CREATE POLICY "Members can update lessons_learned" ON public.lessons_learned FOR UPDATE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'edit'));
CREATE POLICY "Members can delete lessons_learned" ON public.lessons_learned FOR DELETE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'delete'));

-- ASSUMPTIONS
DROP POLICY IF EXISTS "Auth users can read assumptions" ON public.assumptions;
DROP POLICY IF EXISTS "Auth users can insert assumptions" ON public.assumptions;
DROP POLICY IF EXISTS "Auth users can update assumptions" ON public.assumptions;
DROP POLICY IF EXISTS "Auth users can delete assumptions" ON public.assumptions;

CREATE POLICY "Members can read assumptions" ON public.assumptions FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members can insert assumptions" ON public.assumptions FOR INSERT TO authenticated
WITH CHECK (public.can_member_action(project_id, auth.uid(), 'create'));
CREATE POLICY "Members can update assumptions" ON public.assumptions FOR UPDATE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'edit'));
CREATE POLICY "Members can delete assumptions" ON public.assumptions FOR DELETE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'delete'));

-- DELIVERY_PACKAGES
DROP POLICY IF EXISTS "Auth users can read delivery_packages" ON public.delivery_packages;
DROP POLICY IF EXISTS "Auth users can insert delivery_packages" ON public.delivery_packages;
DROP POLICY IF EXISTS "Auth users can update delivery_packages" ON public.delivery_packages;
DROP POLICY IF EXISTS "Auth users can delete delivery_packages" ON public.delivery_packages;

CREATE POLICY "Members can read delivery_packages" ON public.delivery_packages FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));
CREATE POLICY "Members can insert delivery_packages" ON public.delivery_packages FOR INSERT TO authenticated
WITH CHECK (public.can_member_action(project_id, auth.uid(), 'create'));
CREATE POLICY "Members can update delivery_packages" ON public.delivery_packages FOR UPDATE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'edit'));
CREATE POLICY "Members can delete delivery_packages" ON public.delivery_packages FOR DELETE TO authenticated
USING (public.can_member_action(project_id, auth.uid(), 'delete'));

-- PROJECT_MEMBERS — só admin/líder gerencia; membros leem
DROP POLICY IF EXISTS "Auth users can read project_members" ON public.project_members;
CREATE POLICY "Members can read project_members" ON public.project_members FOR SELECT TO authenticated
USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Leaders can insert project_members" ON public.project_members FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_project_leader(project_id, auth.uid()));
CREATE POLICY "Leaders can update project_members" ON public.project_members FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_project_leader(project_id, auth.uid()));
CREATE POLICY "Leaders can delete project_members" ON public.project_members FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_project_leader(project_id, auth.uid()));

-- ============================================================
-- 4) Papel do membro no projeto (project_role)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.project_role AS ENUM ('leader', 'manager', 'contributor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS project_role public.project_role NOT NULL DEFAULT 'contributor';

-- ============================================================
-- 5) RACI: garantir um único Accountable por atividade
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_single_accountable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  accountable_count int := 0;
BEGIN
  IF NEW.participant_roles IS NULL OR jsonb_typeof(NEW.participant_roles) <> 'object' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO accountable_count
  FROM jsonb_each_text(NEW.participant_roles)
  WHERE upper(trim(value)) = 'A';

  IF accountable_count > 1 THEN
    RAISE EXCEPTION 'RACI inválido: cada atividade pode ter apenas um Accountable (A). Encontrados: %', accountable_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_accountable ON public.activities;
CREATE TRIGGER trg_enforce_single_accountable
BEFORE INSERT OR UPDATE OF participant_roles ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_accountable();
