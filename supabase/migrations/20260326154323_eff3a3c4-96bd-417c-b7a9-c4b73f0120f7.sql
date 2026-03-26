
-- Seed default user_story_stages for all existing projects that don't have any
INSERT INTO public.user_story_stages (project_id, title, color, display_order, is_final)
SELECT p.id, s.title, s.color, s.display_order, s.is_final
FROM public.projects p
CROSS JOIN (VALUES
  ('Rascunho', 'hsl(220, 15%, 50%)', 0, false),
  ('Em Análise', 'hsl(38, 92%, 50%)', 1, false),
  ('Validada', 'hsl(270, 70%, 55%)', 2, false),
  ('Implementando', 'hsl(220, 90%, 56%)', 3, false),
  ('Concluída', 'hsl(142, 76%, 36%)', 4, true)
) AS s(title, color, display_order, is_final)
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_story_stages uss WHERE uss.project_id = p.id
);

-- Migrate existing stories: map status text to stage_id
UPDATE public.user_stories us
SET stage_id = (
  SELECT uss.id FROM public.user_story_stages uss
  WHERE uss.project_id = us.project_id
  AND uss.title = CASE us.status
    WHEN 'draft' THEN 'Rascunho'
    WHEN 'analysis' THEN 'Em Análise'
    WHEN 'validated' THEN 'Validada'
    WHEN 'implementing' THEN 'Implementando'
    WHEN 'done' THEN 'Concluída'
    ELSE 'Rascunho'
  END
  LIMIT 1
)
WHERE us.stage_id IS NULL;
