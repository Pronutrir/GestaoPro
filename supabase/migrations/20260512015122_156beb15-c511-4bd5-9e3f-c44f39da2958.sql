ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS baseline_start_date date,
  ADD COLUMN IF NOT EXISTS baseline_end_date date;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS baseline_start_date date,
  ADD COLUMN IF NOT EXISTS baseline_end_date date,
  ADD COLUMN IF NOT EXISTS baseline_frozen_at timestamptz;

-- Backfill: para projetos já em execução / concluídos, copiar previsto -> baseline
UPDATE public.projects
   SET baseline_start_date = COALESCE(baseline_start_date, start_date),
       baseline_end_date   = COALESCE(baseline_end_date, due_date),
       baseline_frozen_at  = COALESCE(baseline_frozen_at,
         CASE WHEN actual_start_date IS NOT NULL OR status IN ('em_execucao','completed','concluido','concluído','mvp','poc') THEN now() ELSE NULL END)
 WHERE (start_date IS NOT NULL OR due_date IS NOT NULL)
   AND baseline_start_date IS NULL AND baseline_end_date IS NULL;

-- Backfill atividades: copiar previsto -> baseline quando já houver real registrado
UPDATE public.activities
   SET baseline_start_date = COALESCE(baseline_start_date, start_date),
       baseline_end_date   = COALESCE(baseline_end_date, end_date)
 WHERE actual_start_date IS NOT NULL
   AND baseline_start_date IS NULL AND baseline_end_date IS NULL;