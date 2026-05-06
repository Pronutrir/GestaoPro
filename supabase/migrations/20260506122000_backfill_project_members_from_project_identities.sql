-- Backfill de project_members para reduzir perda de visibilidade ao trocar perfil/role.
-- Cria vínculo por user_id com base em owner/manager/assignees já cadastrados no projeto.

WITH profile_identities AS (
  SELECT
    p.id AS user_id,
    lower(trim(p.full_name)) AS identity_value
  FROM public.profiles p
  WHERE p.full_name IS NOT NULL

  UNION ALL

  SELECT
    p.id AS user_id,
    lower(trim(p.email)) AS identity_value
  FROM public.profiles p
  WHERE p.email IS NOT NULL

  UNION ALL

  SELECT
    p.id AS user_id,
    split_part(lower(trim(p.email)), '@', 1) AS identity_value
  FROM public.profiles p
  WHERE p.email IS NOT NULL
),
project_identity_values AS (
  SELECT p.id AS project_id, lower(trim(p.owner)) AS identity_value
  FROM public.projects p
  WHERE p.owner IS NOT NULL

  UNION ALL

  SELECT p.id AS project_id, lower(trim(p.manager)) AS identity_value
  FROM public.projects p
  WHERE p.manager IS NOT NULL

  UNION ALL

  SELECT p.id AS project_id, lower(trim(a.assignee)) AS identity_value
  FROM public.projects p
  CROSS JOIN LATERAL unnest(coalesce(p.assignees, '{}'::text[])) AS a(assignee)
)
INSERT INTO public.project_members (project_id, user_id, sector, can_create, can_edit, can_delete, can_move)
SELECT DISTINCT
  piv.project_id,
  pi.user_id,
  NULL::text AS sector,
  true AS can_create,
  true AS can_edit,
  false AS can_delete,
  true AS can_move
FROM project_identity_values piv
JOIN profile_identities pi
  ON pi.identity_value = piv.identity_value
WHERE piv.identity_value IS NOT NULL
  AND piv.identity_value <> ''
ON CONFLICT (project_id, user_id) DO NOTHING;
