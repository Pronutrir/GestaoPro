-- Adds an optional WIP (work-in-progress) limit per workflow stage.
-- NULL = sem limite. Quando definido, o Kanban colore o contador da coluna
-- (verde dentro do limite, laranja no limite, vermelho quando excede).
ALTER TABLE public.workflow_stages
  ADD COLUMN IF NOT EXISTS wip_limit integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workflow_stages_wip_limit_check'
      AND conrelid = 'public.workflow_stages'::regclass
  ) THEN
    ALTER TABLE public.workflow_stages
      ADD CONSTRAINT workflow_stages_wip_limit_check
      CHECK (wip_limit IS NULL OR wip_limit >= 0);
  END IF;
END $$;

-- Garante que o PostgREST recarregue o schema exposto pela API.
NOTIFY pgrst, 'reload schema';
