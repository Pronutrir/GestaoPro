-- ============================================================================
-- ROLLBACK — as 8 voltam a 'fase' e a trava sai
--
-- Só faz sentido se a conversão ou a trava causarem problema — não como faxina.
-- Reverter devolve as 8 ao estado de NÃO gerar cartão.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _volta(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _volta(id) VALUES
  ('c3cff2a9-5a78-4e79-a536-3ef35975ba06'),
  ('d7405664-8bcd-4bfd-9655-a483c680de0c'),
  ('b40cbdaa-ca43-43b9-808b-5b08ae29269c'),
  ('f4f62077-3836-4b8d-aa02-ea0316a22a86'),
  ('f6353b5a-b287-49bf-a2f7-92cc18e143fd'),
  ('487bdbad-e394-4237-9243-f1740d665d0b'),
  ('d0305fa5-e7c7-4254-b83a-d51a07e14f5c'),
  ('d971b024-966f-48a8-9204-3b85fc850d34')
;

-- A trava sai PRIMEIRO — senão ela barra a volta para 'fase' (agrupador) das
-- que estão numa coluna do quadro.
DROP TRIGGER IF EXISTS trg_nao_promove_agrupador_sem_filha ON public.activities;
DROP FUNCTION IF EXISTS public.tg_nao_promove_agrupador_sem_filha();

SET LOCAL session_replication_role = replica;
UPDATE public.activities a SET item_type='fase'
  FROM _volta v WHERE v.id=a.id AND a.item_type IS DISTINCT FROM 'fase';
SET LOCAL session_replication_role = origin;

DO $conf$
DECLARE v_fora int;
BEGIN
  SELECT count(*) INTO v_fora FROM public.activities a JOIN _volta v ON v.id=a.id
   WHERE a.item_type <> 'fase';
  IF v_fora > 0 THEN RAISE EXCEPTION '% dos 8 não voltaram a fase', v_fora; END IF;
  RAISE NOTICE 'as 8 voltaram a fase; a trava foi removida';
END $conf$;

NOTIFY pgrst, 'reload schema';
-- CONFIRA E ENTÃO:  COMMIT;  ou  ROLLBACK;
