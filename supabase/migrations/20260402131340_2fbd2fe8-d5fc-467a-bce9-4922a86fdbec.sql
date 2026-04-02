ALTER TABLE public.project_members REPLICA IDENTITY FULL;
ALTER TABLE public.user_tab_permissions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_tab_permissions;

WITH target_user AS (
  SELECT id
  FROM public.profiles
  WHERE lower(email) = 'guilherme.gomes@pronutrir.com.br'
), target_projects AS (
  SELECT id, title
  FROM public.projects
  WHERE title IN (
    'Agente de IA - Tasy / Pops',
    'Conferência Eletrônica a Beira do Leito',
    'Guia Jornada do Paciente - Pronutrir Onboard'
  )
)
INSERT INTO public.project_members (project_id, user_id, sector, can_create, can_edit, can_delete, can_move)
SELECT tp.id, tu.id, null, true, true, false, true
FROM target_user tu
CROSS JOIN target_projects tp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_members pm
  WHERE pm.project_id = tp.id
    AND pm.user_id = tu.id
);

WITH target_user AS (
  SELECT id
  FROM public.profiles
  WHERE lower(email) = 'guilherme.gomes@pronutrir.com.br'
)
INSERT INTO public.user_tab_permissions (user_id, allowed_tabs)
SELECT tu.id, ARRAY['dashboard','kanban','backlog','timeline','deliveries','documents','stories','tap','meetings','assumptions','risks','lessons','workflow']::text[]
FROM target_user tu
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_tab_permissions utp
  WHERE utp.user_id = tu.id
);

UPDATE public.user_tab_permissions utp
SET allowed_tabs = ARRAY['dashboard','kanban','backlog','timeline','deliveries','documents','stories','tap','meetings','assumptions','risks','lessons','workflow']::text[],
    updated_at = now()
WHERE utp.user_id IN (
  SELECT id
  FROM public.profiles
  WHERE lower(email) = 'guilherme.gomes@pronutrir.com.br'
);