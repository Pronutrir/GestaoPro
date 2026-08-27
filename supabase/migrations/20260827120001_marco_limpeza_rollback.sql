-- ROLLBACK DA LIMPEZA DO MARCO
--
-- Devolve responsavel e GUT a partir da sombra `marco_limpeza_backup`, e
-- derruba as duas travas.
--
-- A ORDEM IMPORTA: as constraints saem PRIMEIRO. Restaurar com elas de pe
-- falharia em cada linha — que e exatamente o que elas existem para fazer.
--
-- A coluna sombra CAI JUNTO: ela so existe por causa da limpeza. Coluna orfa
-- com dado de pessoa dentro e o tipo de coisa que ninguem sabe se pode apagar
-- seis meses depois.

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS marco_sem_responsavel;
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS marco_sem_gut;

UPDATE public.activities
   SET assigned_to    = COALESCE(marco_limpeza_backup->>'assigned_to', assigned_to),
       gravity        = COALESCE((marco_limpeza_backup->>'gravity')::int, gravity),
       urgency        = COALESCE((marco_limpeza_backup->>'urgency')::int, urgency),
       tendency       = COALESCE((marco_limpeza_backup->>'tendency')::int, tendency),
       priority_score = COALESCE((marco_limpeza_backup->>'priority_score')::int, priority_score),
       priority       = COALESCE(marco_limpeza_backup->>'priority', priority)
 WHERE marco_limpeza_backup IS NOT NULL;

DO $$
DECLARE v_rest int;
BEGIN
  SELECT count(*) INTO v_rest
    FROM public.activities
   WHERE is_milestone = true AND COALESCE(btrim(assigned_to), '') <> '';
  RAISE NOTICE 'restaurados: % marcos voltaram a ter responsavel', v_rest;
END $$;

ALTER TABLE public.activities DROP COLUMN IF EXISTS marco_limpeza_backup;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname IN ('marco_sem_responsavel','marco_sem_gut')) THEN
    RAISE EXCEPTION 'as travas ainda existem';
  END IF;
  RAISE NOTICE 'limpeza revertida. Marco volta a aceitar responsavel e GUT.';
END $$;
