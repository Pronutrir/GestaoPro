ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS charter_data jsonb;

-- Migrar dados existentes: mover JSON do TAP de description para charter_data e limpar description
UPDATE public.projects
SET charter_data = description::jsonb,
    description = NULL
WHERE description IS NOT NULL
  AND description LIKE '{%'
  AND description::jsonb ? '__charter';