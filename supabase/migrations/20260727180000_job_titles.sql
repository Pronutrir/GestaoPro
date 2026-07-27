-- Tabela de CARGOS / NÍVEIS (job_titles), espelhando `sectors`.
-- Antes, o cargo (profiles.role_title) era texto livre com uma lista fixa de 5
-- níveis no front. Agora vira uma tabela editável: os 5 níveis vêm como seed e
-- o admin pode criar novos cargos, que ficam disponíveis para todas as pessoas
-- (mesmo padrão dos setores).
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-job-titles.sh

CREATE TABLE IF NOT EXISTS public.job_titles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  -- ordem hierárquica (0 = topo); nulo para cargos livres criados depois.
  rank INT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

-- Mesma política dos setores: leitura pública, gestão por autenticados.
DROP POLICY IF EXISTS "job_titles_select" ON public.job_titles;
CREATE POLICY "job_titles_select" ON public.job_titles FOR SELECT USING (true);
DROP POLICY IF EXISTS "job_titles_insert" ON public.job_titles;
CREATE POLICY "job_titles_insert" ON public.job_titles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "job_titles_update" ON public.job_titles;
CREATE POLICY "job_titles_update" ON public.job_titles FOR UPDATE USING (true);
DROP POLICY IF EXISTS "job_titles_delete" ON public.job_titles;
CREATE POLICY "job_titles_delete" ON public.job_titles FOR DELETE USING (true);

-- Seed dos 5 níveis padrão (Direção → Externo). Idempotente.
INSERT INTO public.job_titles (name, rank) VALUES
  ('Direção', 0),
  ('Gestor', 1),
  ('Coordenador', 2),
  ('Colaborador', 3),
  ('Externo', 4)
ON CONFLICT (name) DO NOTHING;

-- Também importa quaisquer cargos livres já existentes em profiles.role_title,
-- para não perder os que foram digitados antes (ex.: "Analista de Marketing").
INSERT INTO public.job_titles (name)
SELECT DISTINCT btrim(role_title)
FROM public.profiles
WHERE role_title IS NOT NULL AND btrim(role_title) <> ''
ON CONFLICT (name) DO NOTHING;
