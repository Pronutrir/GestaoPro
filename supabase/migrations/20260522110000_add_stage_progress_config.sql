-- Adds configurable progress metadata per workflow stage.
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS progress_percent integer,
  ADD COLUMN IF NOT EXISTS contributes_to_progress boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflow_stages_progress_percent_check'
      AND conrelid = 'public.workflow_stages'::regclass
  ) THEN
    ALTER TABLE public.workflow_stages
      ADD CONSTRAINT workflow_stages_progress_percent_check
      CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));
  END IF;
END $$;

-- Backlog should not advance progress by default.
UPDATE public.workflow_stages
SET contributes_to_progress = false
WHERE display_order = 0;

-- Keeps trigger default stages aligned with new progress model.
CREATE OR REPLACE FUNCTION public.create_default_workflow_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.workflow_stages (
    project_id,
    title,
    color,
    display_order,
    is_final,
    contributes_to_progress,
    progress_percent
  ) VALUES
    (NEW.id, 'Backlog',       'hsl(220, 15%, 50%)', 0, false, false, null),
    (NEW.id, 'A Fazer',       'hsl(38, 92%, 50%)',  1, false, true, null),
    (NEW.id, 'Em Andamento',  'hsl(220, 90%, 56%)', 2, false, true, null),
    (NEW.id, 'Em Teste',      'hsl(199, 89%, 48%)', 3, false, true, null),
    (NEW.id, 'Aprovada',      'hsl(270, 70%, 55%)', 4, false, true, null),
    (NEW.id, 'Concluída',     'hsl(142, 76%, 36%)', 5, true,  true, 100);
  RETURN NEW;
END;
$$;
