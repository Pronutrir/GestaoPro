
-- Adicionar campos de Início Real / Término Real
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date;

-- Backfill: para atividades concluídas, usar completed_at como término real
UPDATE public.activities
SET actual_end_date = (completed_at AT TIME ZONE 'America/Sao_Paulo')::date
WHERE actual_end_date IS NULL AND completed_at IS NOT NULL;

-- Backfill: início real = primeira data de atualização/criação registrada (last_update_date senão created_at)
UPDATE public.activities
SET actual_start_date = COALESCE(last_update_date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date)
WHERE actual_start_date IS NULL
  AND (status = 'completed' OR last_update_date IS NOT NULL);

-- Trigger: registrar Início Real na primeira mudança real (qualquer atualização) e Término Real ao concluir
CREATE OR REPLACE FUNCTION public.set_activity_actual_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Início real: na primeira vez que algo significativo muda (status, completed_at, last_update_date)
  IF NEW.actual_start_date IS NULL THEN
    IF (TG_OP = 'INSERT' AND NEW.status = 'completed')
       OR (TG_OP = 'UPDATE' AND (
            NEW.status IS DISTINCT FROM OLD.status
            OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
            OR NEW.last_update_date IS DISTINCT FROM OLD.last_update_date
          )) THEN
      NEW.actual_start_date := COALESCE(NEW.start_date, CURRENT_DATE);
    END IF;
  END IF;

  -- Término real: ao marcar como concluído
  IF NEW.status = 'completed' AND NEW.actual_end_date IS NULL THEN
    NEW.actual_end_date := COALESCE((NEW.completed_at AT TIME ZONE 'America/Sao_Paulo')::date, CURRENT_DATE);
  END IF;

  -- Limpar término real se reabrir
  IF NEW.status <> 'completed' AND OLD.status = 'completed' THEN
    NEW.actual_end_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_actual_dates ON public.activities;
CREATE TRIGGER trg_activities_actual_dates
BEFORE INSERT OR UPDATE ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.set_activity_actual_dates();

-- Trigger equivalente para projects
CREATE OR REPLACE FUNCTION public.set_project_actual_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actual_start_date IS NULL THEN
    IF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.completion_percentage IS DISTINCT FROM OLD.completion_percentage) THEN
      NEW.actual_start_date := COALESCE(NEW.start_date, CURRENT_DATE);
    END IF;
  END IF;

  IF NEW.status IN ('completed','concluido','concluído') AND NEW.actual_end_date IS NULL THEN
    NEW.actual_end_date := CURRENT_DATE;
  END IF;

  IF OLD.status IN ('completed','concluido','concluído') AND NEW.status NOT IN ('completed','concluido','concluído') THEN
    NEW.actual_end_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_actual_dates ON public.projects;
CREATE TRIGGER trg_projects_actual_dates
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.set_project_actual_dates();

-- Backfill projects baseado nas atividades
UPDATE public.projects p SET
  actual_start_date = sub.min_start,
  actual_end_date = CASE WHEN p.status IN ('completed','concluido','concluído') THEN sub.max_end ELSE p.actual_end_date END
FROM (
  SELECT project_id, MIN(actual_start_date) AS min_start, MAX(actual_end_date) AS max_end
  FROM public.activities
  WHERE actual_start_date IS NOT NULL OR actual_end_date IS NOT NULL
  GROUP BY project_id
) sub
WHERE sub.project_id = p.id AND p.actual_start_date IS NULL;
