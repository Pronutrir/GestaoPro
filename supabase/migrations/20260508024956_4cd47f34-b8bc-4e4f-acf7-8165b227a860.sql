
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS is_exception boolean NOT NULL DEFAULT false;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS last_progress_stage_id uuid REFERENCES public.workflow_stages(id) ON DELETE SET NULL;

-- Backfill: para atividades que já estão em coluna de fluxo (não bloqueio/exceção/final), use a própria como base
UPDATE public.activities a
SET last_progress_stage_id = a.workflow_stage_id
FROM public.workflow_stages ws
WHERE a.workflow_stage_id = ws.id
  AND COALESCE(ws.is_blocked, false) = false
  AND COALESCE(ws.is_exception, false) = false
  AND a.last_progress_stage_id IS NULL;

CREATE OR REPLACE FUNCTION public.track_last_progress_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_exception boolean := false;
  v_is_blocked boolean := false;
BEGIN
  IF NEW.workflow_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.workflow_stage_id IS NOT DISTINCT FROM OLD.workflow_stage_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(is_exception, false), COALESCE(is_blocked, false)
    INTO v_is_exception, v_is_blocked
    FROM public.workflow_stages
   WHERE id = NEW.workflow_stage_id;

  IF NOT v_is_exception AND NOT v_is_blocked THEN
    NEW.last_progress_stage_id := NEW.workflow_stage_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_last_progress_stage ON public.activities;
CREATE TRIGGER trg_track_last_progress_stage
  BEFORE INSERT OR UPDATE OF workflow_stage_id ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.track_last_progress_stage();
