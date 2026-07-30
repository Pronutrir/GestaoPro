-- Histórico de transições de coluna (Item 6 da rodada final): pré-requisito
-- de cycle time e CFD. `stage_entered_at` guarda só a entrada ATUAL (é
-- sobrescrito a cada movimento) — sem um log, o passado se perde. O histórico
-- passa a contar A PARTIR desta migration; não há como reconstruir o anterior.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-activity-stage-transitions.sh

CREATE TABLE IF NOT EXISTS public.activity_stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  from_stage_id uuid,
  to_stage_id uuid,
  moved_at timestamptz NOT NULL DEFAULT now(),
  moved_by uuid DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS ast_project_moved_idx ON public.activity_stage_transitions(project_id, moved_at);
CREATE INDEX IF NOT EXISTS ast_activity_idx ON public.activity_stage_transitions(activity_id);

ALTER TABLE public.activity_stage_transitions ENABLE ROW LEVEL SECURITY;

-- Leitura para membros do projeto; escrita SÓ pelo trigger (SECURITY DEFINER),
-- por isso não há policy de INSERT para usuários.
DROP POLICY IF EXISTS "Project members can read stage transitions" ON public.activity_stage_transitions;
CREATE POLICY "Project members can read stage transitions" ON public.activity_stage_transitions
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.log_activity_stage_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.workflow_stage_id IS NOT NULL THEN
      INSERT INTO public.activity_stage_transitions(activity_id, project_id, from_stage_id, to_stage_id)
      VALUES (NEW.id, NEW.project_id, NULL, NEW.workflow_stage_id);
    END IF;
    RETURN NEW;
  END IF;
  -- Só grava quando a coluna REALMENTE muda — editar título/prazo não conta.
  IF NEW.workflow_stage_id IS DISTINCT FROM OLD.workflow_stage_id THEN
    INSERT INTO public.activity_stage_transitions(activity_id, project_id, from_stage_id, to_stage_id)
    VALUES (NEW.id, NEW.project_id, OLD.workflow_stage_id, NEW.workflow_stage_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_activity_stage_transition ON public.activities;
CREATE TRIGGER trg_log_activity_stage_transition
  AFTER INSERT OR UPDATE OF workflow_stage_id ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_stage_transition();

NOTIFY pgrst, 'reload schema';
