
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS blocked_since timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_days_total numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.track_activity_blocked_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_blocked boolean := false;
  new_blocked boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.workflow_stage_id IS NOT NULL THEN
      SELECT is_blocked INTO new_blocked FROM public.workflow_stages WHERE id = NEW.workflow_stage_id;
      IF COALESCE(new_blocked, false) THEN
        NEW.blocked_since := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.workflow_stage_id IS DISTINCT FROM OLD.workflow_stage_id THEN
    IF OLD.workflow_stage_id IS NOT NULL THEN
      SELECT is_blocked INTO old_blocked FROM public.workflow_stages WHERE id = OLD.workflow_stage_id;
    END IF;
    IF NEW.workflow_stage_id IS NOT NULL THEN
      SELECT is_blocked INTO new_blocked FROM public.workflow_stages WHERE id = NEW.workflow_stage_id;
    END IF;

    IF COALESCE(old_blocked, false) AND NOT COALESCE(new_blocked, false) THEN
      -- saiu do bloqueio: acumula
      IF OLD.blocked_since IS NOT NULL THEN
        NEW.blocked_days_total := COALESCE(OLD.blocked_days_total, 0)
          + EXTRACT(EPOCH FROM (now() - OLD.blocked_since)) / 86400.0;
      END IF;
      NEW.blocked_since := NULL;
    ELSIF NOT COALESCE(old_blocked, false) AND COALESCE(new_blocked, false) THEN
      -- entrou no bloqueio
      NEW.blocked_since := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_blocked_time ON public.activities;
CREATE TRIGGER trg_activities_blocked_time
BEFORE INSERT OR UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.track_activity_blocked_time();

-- Backfill: atividades que estão hoje em colunas bloqueadas recebem blocked_since
UPDATE public.activities a
SET blocked_since = COALESCE(a.updated_at, now())
FROM public.workflow_stages ws
WHERE ws.id = a.workflow_stage_id
  AND ws.is_blocked = true
  AND a.blocked_since IS NULL;
