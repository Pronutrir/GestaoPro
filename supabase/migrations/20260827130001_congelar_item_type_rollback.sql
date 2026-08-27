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

-- `eap_is_group` volta a lista antiga, na ORDEM CERTA: depois de os valores
-- terem sido revertidos. Derrubar 'entrega'/'projeto' da lista enquanto ainda
-- houvesse pai gravado assim deixaria 1.272 pais invalidos — exatamente o
-- estrago que o passo 4c da migration existe para evitar, so que ao contrario.
CREATE OR REPLACE FUNCTION public.eap_is_group(_item_type text, _is_milestone boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $grp$
  SELECT (NOT COALESCE(_is_milestone, false))
     AND _item_type IN ('fase', 'pacote', 'historia_usuario');
$grp$;

-- E as MENSAGENS do trigger voltam a descrever a regra antiga. Reverter a
-- funcao sem reverter o texto deixaria o usuario lendo "escolha uma fase,
-- entrega ou atividade" enquanto o banco recusa atividade.
CREATE OR REPLACE FUNCTION public.validate_activity_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $vah$
DECLARE
  parent_row public.activities%ROWTYPE;
  cursor_id uuid;
  hops int := 0;
BEGIN
  IF NOT public.eap_is_group(NEW.item_type, NEW.is_milestone) AND EXISTS (
    SELECT 1 FROM public.activities WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Este item tem subitens; so Pacote ou Fase podem agrupar. Marque-o como Pacote ou Fase.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Uma atividade nao pode ser pai de si mesma.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO parent_row FROM public.activities WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atividade pai (%) nao encontrada.', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT public.eap_is_group(parent_row.item_type, parent_row.is_milestone) THEN
    RAISE EXCEPTION 'Aninhamento EAP invalido: uma % nao pode conter subitens. So Pacote ou Fase agrupam.',
      CASE WHEN parent_row.is_milestone THEN 'marco (atividade)' ELSE COALESCE(parent_row.item_type, 'atividade') END
      USING ERRCODE = 'check_violation';
  END IF;

  IF parent_row.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'A atividade pai pertence a outro projeto.'
      USING ERRCODE = 'check_violation';
  END IF;

  cursor_id := NEW.parent_id;
  WHILE cursor_id IS NOT NULL AND hops < 1000 LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'parent_id criaria um ciclo na hierarquia.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO cursor_id FROM public.activities WHERE id = cursor_id;
    hops := hops + 1;
  END LOOP;

  RETURN NEW;
END;
$vah$;

-- ATENCAO: se ja existirem subatividades sob atividades (criadas depois desta
-- migration), a checagem abaixo VAI FALHAR — e deve. Reverter com elas no lugar
-- deixaria a arvore num estado que o trigger recusa manter.

DO $conf_grp$
DECLARE v_ruins int;
BEGIN
  SELECT count(*) INTO v_ruins
    FROM public.activities p
   WHERE EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = p.id)
     AND NOT public.eap_is_group(p.item_type, p.is_milestone);

  IF v_ruins > 0 THEN
    RAISE EXCEPTION 'apos reverter, % pais ficaram invalidos para o trigger — a reversao dos valores nao foi completa', v_ruins;
  END IF;
END $conf_grp$;

ALTER TABLE public.activities DROP COLUMN IF EXISTS item_type_antes_congelar;

DO $fim$
BEGIN
  RAISE NOTICE 'congelamento revertido. resolveEapKind precisa voltar a DEDUZIR — reverter o banco sem reverter o codigo deixa a tela lendo um campo que voltou a ser lixo de importacao.';
END $fim$;
