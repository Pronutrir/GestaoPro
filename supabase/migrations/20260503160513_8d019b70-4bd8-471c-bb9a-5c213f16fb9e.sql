-- Backfill: atividades sem workflow_stage_id vão para o Backlog do projeto
-- (stage cujo título começa com 'Backlog', ou display_order=0 como fallback)
WITH backlog_stages AS (
  SELECT DISTINCT ON (project_id) project_id, id
  FROM public.workflow_stages
  ORDER BY project_id,
           CASE WHEN title ILIKE 'backlog%' THEN 0 ELSE 1 END,
           display_order ASC
)
UPDATE public.activities a
SET workflow_stage_id = bs.id
FROM backlog_stages bs
WHERE a.workflow_stage_id IS NULL
  AND a.project_id = bs.project_id;