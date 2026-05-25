-- Permite registrar horas consumidas manualmente, além do consumo automático por conclusão.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS consumed_hours_manual numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activities_consumed_hours_manual_non_negative'
      AND conrelid = 'public.activities'::regclass
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_consumed_hours_manual_non_negative
      CHECK (consumed_hours_manual >= 0);
  END IF;
END $$;
