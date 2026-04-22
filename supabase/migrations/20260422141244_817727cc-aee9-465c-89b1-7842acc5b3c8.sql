-- Bloco 2: campos novos no dicionário de dados
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS ui_color_tag TEXT;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS context_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Bloco 3 #8: Matriz GUT em Riscos
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS gravity INTEGER;
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS urgency INTEGER;
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS tendency INTEGER;
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS severity_score NUMERIC;

-- Bloco 3 #10: Caminho Crítico
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;

-- Validações suaves para GUT (1-5)
ALTER TABLE public.risks DROP CONSTRAINT IF EXISTS risks_gravity_range;
ALTER TABLE public.risks ADD CONSTRAINT risks_gravity_range CHECK (gravity IS NULL OR (gravity BETWEEN 1 AND 5));
ALTER TABLE public.risks DROP CONSTRAINT IF EXISTS risks_urgency_range;
ALTER TABLE public.risks ADD CONSTRAINT risks_urgency_range CHECK (urgency IS NULL OR (urgency BETWEEN 1 AND 5));
ALTER TABLE public.risks DROP CONSTRAINT IF EXISTS risks_tendency_range;
ALTER TABLE public.risks ADD CONSTRAINT risks_tendency_range CHECK (tendency IS NULL OR (tendency BETWEEN 1 AND 5));