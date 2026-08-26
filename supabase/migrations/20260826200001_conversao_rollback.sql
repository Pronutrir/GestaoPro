-- ROLLBACK DA CONVERSAO nome -> identificador
--
-- A conversao nunca reescreveu o texto: `assigned_to`, `participants`, `owner`
-- e `manager` continuam exatamente como estavam. Entao reverter e derrubar as
-- colunas novas -- nao ha texto a restaurar.
--
-- MESMO ASSIM, a sombra e conferida ANTES de derrubar: se alguma linha tiver
-- texto diferente da sombra, alguem reescreveu nome depois da conversao, e ai
-- a sombra e a unica copia do original. Neste caso o rollback RESTAURA a
-- partir dela em vez de so apagar colunas.
--
-- ATENCAO: se alguma tela ja estiver LENDO `assigned_to_id`, ela para de
-- funcionar. Reverta o front junto, ou nao reverta.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) A sombra ainda bate com o texto? Se nao, restaura.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_div int;
BEGIN
  SELECT count(*) INTO v_div
    FROM public.activities
   WHERE assigned_to_nome_original IS NOT NULL
     AND assigned_to IS DISTINCT FROM assigned_to_nome_original;

  IF v_div > 0 THEN
    RAISE NOTICE '% linhas com texto diferente da sombra -- RESTAURANDO o original', v_div;
    UPDATE public.activities
       SET assigned_to = assigned_to_nome_original
     WHERE assigned_to_nome_original IS NOT NULL
       AND assigned_to IS DISTINCT FROM assigned_to_nome_original;
  ELSE
    RAISE NOTICE 'sombra e texto batem -- nada a restaurar em activities.assigned_to';
  END IF;

  SELECT count(*) INTO v_div
    FROM public.activities
   WHERE participants_nome_original IS NOT NULL
     AND participants IS DISTINCT FROM participants_nome_original;
  IF v_div > 0 THEN
    RAISE NOTICE '% linhas com participants diferente da sombra -- RESTAURANDO', v_div;
    UPDATE public.activities
       SET participants = participants_nome_original
     WHERE participants_nome_original IS NOT NULL
       AND participants IS DISTINCT FROM participants_nome_original;
  END IF;

  UPDATE public.projects
     SET owner = owner_nome_original
   WHERE owner_nome_original IS NOT NULL AND owner IS DISTINCT FROM owner_nome_original;
  UPDATE public.projects
     SET manager = manager_nome_original
   WHERE manager_nome_original IS NOT NULL AND manager IS DISTINCT FROM manager_nome_original;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Derruba as colunas novas
--
-- A SOMBRA CAI JUNTO: ela so existe por causa da conversao. Se a conversao
-- some, a copia dela nao tem mais dono -- e uma coluna orfa com nome de pessoa
-- e exatamente o tipo de coisa que ninguem sabe se pode apagar depois.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.activities
  DROP COLUMN IF EXISTS assigned_to_id,
  DROP COLUMN IF EXISTS assigned_to_nome_original,
  DROP COLUMN IF EXISTS participant_ids,
  DROP COLUMN IF EXISTS participants_nome_original;

ALTER TABLE public.projects
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS owner_nome_original,
  DROP COLUMN IF EXISTS manager_id,
  DROP COLUMN IF EXISTS manager_nome_original;

DROP FUNCTION IF EXISTS public.resolver_identificador_para_conversao(text);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'activities'
       AND column_name = 'assigned_to_id'
  ) THEN
    RAISE EXCEPTION 'as colunas novas ainda existem';
  END IF;
  RAISE NOTICE 'conversao revertida. O texto continua sendo a unica fonte.';
END $$;
