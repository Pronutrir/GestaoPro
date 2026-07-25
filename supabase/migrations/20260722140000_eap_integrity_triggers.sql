-- Etapa 6 da hierarquia EAP: validações de integridade da árvore via trigger.
-- Garante as regras venha de onde vier a escrita (UI, API, SQL direto).
--
-- Regras:
--   1) Um marco (is_milestone) não pode ser pai de outra atividade.
--   2) parent_id não pode formar ciclo (A→B→…→A) nem auto-referência.
--   3) parent_id deve pertencer ao mesmo project_id.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-eap-integrity-migration.sh

CREATE OR REPLACE FUNCTION public.validate_activity_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_row public.activities%ROWTYPE;
  cursor_id uuid;
  hops int := 0;
BEGIN
  -- Regra 1 (lado do próprio nó): não pode virar marco se já tem filhos.
  IF NEW.is_milestone AND EXISTS (
    SELECT 1 FROM public.activities WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Esta atividade tem subitens e não pode ser marcada como marco.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Auto-referência
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Uma atividade não pode ser pai de si mesma.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO parent_row FROM public.activities WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atividade pai (%) não encontrada.', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Regra 1: pai não pode ser marco
  IF parent_row.is_milestone THEN
    RAISE EXCEPTION 'Um marco não pode conter subitens (parent %).', NEW.parent_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Regra 3: mesmo projeto
  IF parent_row.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'A atividade pai pertence a outro projeto.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Regra 2: detecção de ciclo — sobe a cadeia de ancestrais a partir do pai;
  -- se reencontrar NEW.id, há ciclo. Limite de hops como salvaguarda.
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
$$;

DROP TRIGGER IF EXISTS trg_validate_activity_hierarchy ON public.activities;

CREATE TRIGGER trg_validate_activity_hierarchy
  BEFORE INSERT OR UPDATE OF parent_id, is_milestone, project_id
  ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_activity_hierarchy();
