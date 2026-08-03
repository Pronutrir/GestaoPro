-- DATAS NA FASE
--
-- `phases` só tinha título e ordem. Quando a EAP vem de planilha, a linha da
-- fase costuma trazer o intervalo planejado — e esse dado se perdia, porque não
-- havia onde guardar: a fase mostrava apenas o intervalo somado dos filhos.
--
-- São coisas diferentes e as duas importam. A soma dos filhos é o que está
-- acontecendo; a data da linha é o que foi PLANEJADO para a fase. Quando
-- divergem, a diferença é a informação.
--
-- Aditiva e idempotente: colunas nulas, nada muda para quem não usa.
-- Rodar NA VM: junto do apply-leva-tap.sh.

ALTER TABLE public.phases
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  -- Datas REAIS: a fase começou/terminou de fato quando? Espelha o que
  -- activities já tem, para as duas leituras serem comparáveis.
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date date;

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'phases'
     AND column_name IN ('start_date', 'end_date', 'actual_start_date', 'actual_end_date');

  RAISE NOTICE 'phases: % de 4 colunas de data presentes', n;
  IF n <> 4 THEN
    RAISE EXCEPTION 'Colunas de data não foram criadas em phases';
  END IF;
END $$;
