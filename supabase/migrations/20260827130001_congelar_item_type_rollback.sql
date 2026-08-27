-- ROLLBACK DO CONGELAMENTO DE item_type
--
-- Devolve cada linha ao item_type que tinha antes de 20260827130000, lendo a
-- coluna sombra `item_type_antes_congelar`.
--
-- A SOMBRA CAI JUNTO, pelo mesmo motivo do rollback do marco: coluna orfa com
-- valor antigo dentro e o tipo de coisa que ninguem sabe se pode apagar seis
-- meses depois. Se ela sumir, o congelamento e um caminho so — e e por isso que
-- a verificacao abaixo recusa reverter quando a sombra esta incompleta.
--
-- As DUAS FUNCOES ficam. Elas nao mudam dado nenhum, e `eap_tipo_exibido` e a
-- unica copia em SQL da regra de tipo — derrubar so porque o backfill foi
-- revertido apagaria a traducao junto com a aplicacao dela.

DO $guarda$
DECLARE v_falta int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'activities'
       AND column_name = 'item_type_antes_congelar'
  ) THEN
    RAISE EXCEPTION 'a sombra item_type_antes_congelar nao existe — nada a reverter';
  END IF;

  SELECT count(*) INTO v_falta
    FROM public.activities WHERE item_type_antes_congelar IS NULL;
  IF v_falta > 0 THEN
    RAISE EXCEPTION 'a sombra esta vazia em % linhas — reverter deixaria a tabela misturada', v_falta;
  END IF;
END $guarda$;

UPDATE public.activities
   SET item_type = item_type_antes_congelar
 WHERE item_type IS DISTINCT FROM item_type_antes_congelar;

DO $conf$
DECLARE r record; v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM public.activities;
  RAISE NOTICE '--- APOS REVERTER (% linhas) ---', v_total;
  FOR r IN SELECT item_type, count(*) AS n FROM public.activities
            GROUP BY item_type ORDER BY n DESC LOOP
    RAISE NOTICE '  % : %', rpad(COALESCE(r.item_type, '(null)'), 12), r.n;
  END LOOP;
END $conf$;

ALTER TABLE public.activities DROP COLUMN IF EXISTS item_type_antes_congelar;

DO $fim$
BEGIN
  RAISE NOTICE 'congelamento revertido. resolveEapKind precisa voltar a DEDUZIR — reverter o banco sem reverter o codigo deixa a tela lendo um campo que voltou a ser lixo de importacao.';
END $fim$;
