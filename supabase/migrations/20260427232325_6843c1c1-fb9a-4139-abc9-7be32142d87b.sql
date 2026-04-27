-- 1) Coluna item_type
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'atividade';

-- 2) Mapear cada fase para um novo activity (tipo='fase'), preservando id seria ideal
--    mas como activities.id é uuid independente, vamos criar 1:1 e guardar o map.
CREATE TEMP TABLE phase_activity_map (
  phase_id uuid PRIMARY KEY,
  activity_id uuid NOT NULL
);

-- Inserir 1 activity para cada phase (que ainda não foi migrada)
WITH inserted AS (
  INSERT INTO public.activities (
    project_id, title, description, status, priority,
    item_type, display_order, is_milestone
  )
  SELECT
    p.project_id,
    p.title,
    COALESCE(p.description, ''),
    'pending',
    'medium',
    'fase',
    COALESCE(p.display_order, 0),
    false
  FROM public.phases p
  WHERE p.is_trashed = false
    AND NOT EXISTS (
      -- evita duplicar caso a migração rode novamente
      SELECT 1 FROM public.activities a
      WHERE a.project_id = p.project_id
        AND a.item_type = 'fase'
        AND a.title = p.title
        AND a.context_metadata ? 'migrated_from_phase'
    )
  RETURNING id, project_id, title
)
INSERT INTO phase_activity_map (phase_id, activity_id)
SELECT p.id, i.id
FROM public.phases p
JOIN inserted i
  ON i.project_id = p.project_id AND i.title = p.title
WHERE p.is_trashed = false;

-- Marca os recém-criados com flag de origem (idempotência)
UPDATE public.activities a
SET context_metadata = a.context_metadata || jsonb_build_object('migrated_from_phase', m.phase_id)
FROM phase_activity_map m
WHERE a.id = m.activity_id;

-- 3) Reaponta as atividades que tinham phase_id para parent_id da nova "fase-tarefa"
UPDATE public.activities a
SET parent_id = m.activity_id
FROM phase_activity_map m
WHERE a.phase_id = m.phase_id
  AND a.parent_id IS NULL
  AND a.item_type <> 'fase';

-- 4) Marca atividades com pai como subatividade quando aplicável
UPDATE public.activities a
SET item_type = 'subatividade'
WHERE a.parent_id IS NOT NULL
  AND a.item_type = 'atividade'
  AND EXISTS (
    SELECT 1 FROM public.activities p
    WHERE p.id = a.parent_id AND p.item_type <> 'fase'
  );