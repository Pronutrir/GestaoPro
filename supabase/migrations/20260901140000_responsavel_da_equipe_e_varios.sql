-- RESPONSÁVEL SÓ DA EQUIPE, E VÁRIOS POR ATIVIDADE (01/09/2026, tarde)
--
-- ============================================================================
-- A DECISÃO (do dono do produto)
--
-- A tela da atividade passa a ter SÓ "Responsáveis" (o campo "Participantes"
-- sai), e o responsável é escolhido EXCLUSIVAMENTE entre os membros da equipe do
-- projeto. Pode haver VÁRIOS responsáveis por atividade. A edição da subárvore
-- pelo responsável (migration 20260901120000) FICA — o responsável do pai
-- gerencia as filhas.
--
-- Isto AJUSTA a 20260901120000 de hoje mais cedo, que tinha removido o gatilho
-- para permitir incluir gente de FORA da equipe (escopado). A regra nova é o
-- oposto: responsável é sempre da equipe. Então:
--   1) o gatilho trg_assignee_exige_equipe VOLTA (assignee tem de ser da equipe);
--   2) o índice de UM-só-responsável SAI (agora são vários).
-- O resto da 120000 (funções da subárvore, via em can_update_activity_v2,
-- policy de UPDATE) permanece INTACTO.
--
-- ROLLBACK: 20260901140001_responsavel_da_equipe_e_varios_rollback.sql
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Pré-condição: a subárvore da 120000 tem de estar no ar (não regredir).
-- ───────────────────────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regprocedure('public.eh_descendente_de_atividade_do_responsavel(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'eh_descendente_de_atividade_do_responsavel ausente -- aplique a 20260901120000 antes.';
  END IF;
END $pre$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) O gatilho da equipe VOLTA -- responsável (e qualquer assignee) tem de ser
--    membro da equipe do projeto (ou líder/gestor/criador/admin). É a regra
--    "responsável só da equipe" no banco. Corpo idêntico ao da fase 02.
-- ───────────────────────────────────────────────────────────────────────────
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
    'usuario % nao esta na equipe do projeto % -- so a equipe pode ser responsavel',
    NEW.user_id, v_project_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignee_exige_equipe ON public.activity_assignees;
CREATE TRIGGER trg_assignee_exige_equipe
  BEFORE INSERT OR UPDATE OF user_id, activity_id ON public.activity_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tg_assignee_exige_equipe();

-- ───────────────────────────────────────────────────────────────────────────
-- 2) VÁRIOS responsáveis por atividade -- o índice parcial de um-só SAI.
--    A UNIQUE (activity_id, user_id) da tabela permanece (não repete a MESMA
--    pessoa como responsável duas vezes) — some só o teto de 1 responsável.
-- ───────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.activity_assignees_um_responsavel;

-- ───────────────────────────────────────────────────────────────────────────
-- Verificação
-- ───────────────────────────────────────────────────────────────────────────
DO $verif$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_assignee_exige_equipe') THEN
    RAISE EXCEPTION 'trg_assignee_exige_equipe nao voltou';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='activity_assignees_um_responsavel') THEN
    RAISE EXCEPTION 'o indice de um-so-responsavel ainda existe';
  END IF;
  -- a subárvore da 120000 NÃO pode ter sumido
  IF to_regprocedure('public.eh_descendente_de_atividade_do_responsavel(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'a via da subarvore (120000) sumiu -- nao era para tocar nela';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activities'
     AND policyname='Activities access v2 update' AND with_check LIKE '%eh_descendente_de_atividade_do_responsavel%'
  ) THEN RAISE EXCEPTION 'a policy de UPDATE perdeu a via da subarvore'; END IF;
  RAISE NOTICE 'responsavel so da equipe + varios: no ar (a subarvore da 120000 permanece).';
END $verif$;

NOTIFY pgrst, 'reload schema';
