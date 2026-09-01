-- ROLLBACK de 20260901120000_responsavel_edita_a_subarvore.sql
--
-- Volta ao estado anterior: can_update_activity_v2 sem a via da subárvore, a
-- policy de UPDATE sem a nova via, o gatilho trg_assignee_exige_equipe de volta,
-- e as duas funções novas removidas. NÃO é registrado em schema_migrations.

-- 1) can_update_activity_v2 -- corpo do 20260825150000 (sem a subárvore).
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
        OR public.can_member_action(a.project_id, _user_id, 'edit')
        OR public.can_member_action(a.project_id, _user_id, 'move')
        OR (
          public.is_activity_actor_v2(a.id, _user_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.project_members pm
            WHERE pm.project_id = a.project_id
              AND pm.user_id = _user_id
              AND pm.can_edit_own = false
          )
        )
      )
  );
$$;

-- 2) A policy de UPDATE -- sem a via do responsável do ancestral.
DROP POLICY IF EXISTS "Activities access v2 update" ON public.activities;
CREATE POLICY "Activities access v2 update" ON public.activities
FOR UPDATE TO authenticated
USING (public.can_update_activity_v2(id, auth.uid()))
WITH CHECK (
  public.is_admin_user_v2(auth.uid())
  OR public.is_project_leader_v2(project_id, auth.uid())
  OR public.can_member_action(project_id, auth.uid(), 'edit')
  OR public.can_member_action(project_id, auth.uid(), 'move')
  OR public.is_activity_actor_v2(id, auth.uid())
);

-- 3) O gatilho volta -- corpo do 20260826120000.
CREATE OR REPLACE FUNCTION public.tg_assignee_exige_equipe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM public.activities WHERE id = NEW.activity_id;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'atividade % nao existe', NEW.activity_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_members pm
     WHERE pm.project_id = v_project_id
       AND pm.user_id = NEW.user_id
       AND COALESCE(pm.invitation_status, 'accepted') <> 'declined'
  ) OR public.is_project_leader_v2(v_project_id, NEW.user_id)
    OR public.is_admin_user_v2(NEW.user_id)
    OR EXISTS (
    SELECT 1 FROM public.projects p
     WHERE p.id = v_project_id AND p.created_by = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'usuario % nao esta na equipe do projeto % -- adicione a equipe antes de atribuir',
    NEW.user_id, v_project_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignee_exige_equipe ON public.activity_assignees;
CREATE TRIGGER trg_assignee_exige_equipe
  BEFORE INSERT OR UPDATE OF user_id, activity_id ON public.activity_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tg_assignee_exige_equipe();

-- 4) As funções novas saem.
DROP FUNCTION IF EXISTS public.eh_descendente_de_atividade_do_responsavel(uuid, uuid);
DROP FUNCTION IF EXISTS public.eh_responsavel_da_atividade_v2(uuid, uuid);

-- Guarda: can_edit_own sobreviveu.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN RAISE EXCEPTION 'rollback quebrou can_edit_own em can_update_activity_v2'; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
