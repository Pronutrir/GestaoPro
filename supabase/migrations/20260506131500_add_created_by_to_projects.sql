-- Garante identificação estável do criador do projeto (user_id)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by);

-- Para novos projetos autenticados, preenche automaticamente o criador
ALTER TABLE public.projects
  ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Backfill 1: usar membros com permissão de criação/edição como melhor aproximação
WITH candidate_members AS (
  SELECT DISTINCT ON (pm.project_id)
    pm.project_id,
    pm.user_id
  FROM public.project_members pm
  WHERE pm.can_create = true OR pm.can_edit = true
  ORDER BY pm.project_id, pm.created_at ASC
)
UPDATE public.projects p
SET created_by = cm.user_id
FROM candidate_members cm
WHERE p.id = cm.project_id
  AND p.created_by IS NULL;

-- Backfill 2: fallback por owner -> profiles.full_name
UPDATE public.projects p
SET created_by = pr.id
FROM public.profiles pr
WHERE p.created_by IS NULL
  AND p.owner IS NOT NULL
  AND lower(trim(pr.full_name)) = lower(trim(p.owner));

-- Backfill 3: fallback por manager -> profiles.full_name
UPDATE public.projects p
SET created_by = pr.id
FROM public.profiles pr
WHERE p.created_by IS NULL
  AND p.manager IS NOT NULL
  AND lower(trim(pr.full_name)) = lower(trim(p.manager));

-- Backfill 4: fallback por assignee (primeiro match em profiles.full_name)
WITH assignee_matches AS (
  SELECT DISTINCT ON (p.id)
    p.id AS project_id,
    pr.id AS user_id
  FROM public.projects p
  JOIN LATERAL unnest(coalesce(p.assignees, '{}'::text[])) a(name) ON true
  JOIN public.profiles pr
    ON lower(trim(pr.full_name)) = lower(trim(a.name))
  WHERE p.created_by IS NULL
  ORDER BY p.id, pr.created_at ASC
)
UPDATE public.projects p
SET created_by = am.user_id
FROM assignee_matches am
WHERE p.id = am.project_id
  AND p.created_by IS NULL;
