-- Supabase drift check for features ported from GestaoPro to main-next
-- Scope: parent linking, duplication, gantt phase/milestone, relations

-- 0) Naming sanity (legacy table names must NOT exist)
WITH legacy_names AS (
  SELECT * FROM (VALUES
    ('public', 'activity_dependencies'),
    ('public', 'activity_relations'),
    ('public', 'activity_stories')
  ) AS t(table_schema, table_name)
)
SELECT
  ln.table_schema,
  ln.table_name,
  CASE WHEN c.table_name IS NULL THEN 'OK (NOT PRESENT)' ELSE 'FOUND (REVIEW)' END AS status
FROM legacy_names ln
LEFT JOIN information_schema.tables c
  ON c.table_schema = ln.table_schema
 AND c.table_name = ln.table_name
ORDER BY ln.table_name;

-- 1) Required tables
WITH required_tables AS (
  SELECT * FROM (VALUES
    ('public','activities'),
    ('public','workflow_stages'),
    ('public','task_dependencies'),
    ('public','task_relations'),
    ('public','user_stories')
  ) AS t(table_schema, table_name)
)
SELECT
  rt.table_schema,
  rt.table_name,
  CASE WHEN c.table_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status
FROM required_tables rt
LEFT JOIN information_schema.tables c
  ON c.table_schema = rt.table_schema
 AND c.table_name = rt.table_name
ORDER BY rt.table_name;

-- 2) Required columns on activities
WITH required_columns AS (
  SELECT * FROM (VALUES
    ('id'),
    ('project_id'),
    ('parent_id'),
    ('workflow_stage_id'),
    ('item_type'),
    ('is_milestone'),
    ('blocked_since'),
    ('blocked_days_total'),
    ('wbs_code'),
    ('last_progress_stage_id')
  ) AS c(column_name)
)
SELECT
  rc.column_name,
  CASE WHEN ic.column_name IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  ic.data_type
FROM required_columns rc
LEFT JOIN information_schema.columns ic
  ON ic.table_schema = 'public'
 AND ic.table_name = 'activities'
 AND ic.column_name = rc.column_name
ORDER BY rc.column_name;

-- 3) Important indexes
WITH required_indexes AS (
  SELECT * FROM (VALUES
    ('idx_activities_parent_id'),
    ('idx_activities_is_milestone'),
    ('idx_activities_wbs_code')
  ) AS i(index_name)
)
SELECT
  ri.index_name,
  CASE WHEN idx.indexname IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  idx.indexdef
FROM required_indexes ri
LEFT JOIN pg_indexes idx
  ON idx.schemaname = 'public'
 AND idx.indexname = ri.index_name
ORDER BY ri.index_name;

-- 4) RLS status on key tables
-- Note:
-- - task_dependencies, task_relations, user_stories should stay enabled.
-- - activities, workflow_stages currently can be disabled in this environment
--   and should be evaluated in a dedicated hardening phase.
WITH required_rls AS (
  SELECT * FROM (VALUES
    ('activities', 'OPTIONAL'),
    ('workflow_stages', 'OPTIONAL'),
    ('task_dependencies', 'REQUIRED'),
    ('task_relations', 'REQUIRED'),
    ('user_stories', 'REQUIRED')
  ) AS r(table_name, expectation)
)
SELECT
  rr.table_name,
  rr.expectation,
  CASE
    WHEN pc.relname IS NULL THEN 'MISSING_TABLE'
    WHEN pc.relrowsecurity THEN 'ENABLED'
    ELSE 'DISABLED'
  END AS rls_status,
  CASE
    WHEN rr.expectation = 'REQUIRED' AND COALESCE(pc.relrowsecurity, false) = false THEN 'ALERT'
    ELSE 'OK'
  END AS status
FROM required_rls rr
LEFT JOIN pg_class pc ON pc.relname = rr.table_name
LEFT JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
ORDER BY rr.table_name;

-- 5) Policies present on key tables
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('task_dependencies', 'task_relations', 'user_stories')
ORDER BY tablename, policyname;

-- 6) Data sanity checks
-- 6.1 self-parent (must be 0)
SELECT COUNT(*) AS self_parent_rows
FROM public.activities
WHERE parent_id = id;

-- 6.2 null workflow stage (ideally 0 in active projects)
SELECT COUNT(*) AS activities_without_stage
FROM public.activities
WHERE workflow_stage_id IS NULL
  AND COALESCE(is_trashed, false) = false;

-- 6.3 milestones without start date (review manually)
SELECT COUNT(*) AS milestones_without_start_date
FROM public.activities
WHERE is_milestone = true
  AND start_date IS NULL
  AND COALESCE(is_trashed, false) = false;

-- 6.4 item_type distribution and compatibility status
WITH allowed_item_types AS (
  SELECT * FROM (VALUES
    ('fase'),
    ('tarefa'),
    ('subtarefa'),
    ('atividade'),
    ('subatividade'),
    ('historia_usuario')
  ) AS t(item_type)
)
SELECT
  a.item_type,
  COUNT(*) AS total,
  CASE WHEN lit.item_type IS NULL THEN 'UNEXPECTED' ELSE 'OK' END AS status
FROM public.activities a
LEFT JOIN allowed_item_types lit ON lit.item_type = a.item_type
GROUP BY a.item_type, lit.item_type
ORDER BY total DESC;
