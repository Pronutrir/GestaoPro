ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS participant_roles jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.activities.participant_roles IS
  'Mapa de papel RACI por participante. Chave = nome do participante (corresponde a entradas em participants[]). Valor = R | A | C | I.';