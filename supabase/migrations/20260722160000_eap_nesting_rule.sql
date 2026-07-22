-- EAP: impõe a regra de aninhamento por PAPEL (folha vs agrupador), permitindo
-- profundidade arbitrária (Fase/Pacote aninham livremente), como no PMBOK.
-- Substitui validate_activity_hierarchy (de ...140000).
--
-- Papéis:
--   folha      = atividade OU marco  -> NÃO pode ter filhos, NÃO pode ser pai
--   agrupador  = fase OU pacote      -> pode ter filhos (inclusive outros
--                                        agrupadores) e ser pai
--
-- Regras impostas:
--   1) Um item folha (atividade/marco) não pode conter subitens.
--   2) Um item folha não pode ser pai de ninguém (equivale a 1, no lado do pai).
--   3) Sem ciclos em parent_id; sem auto-referência.
--   4) Pai e filho no mesmo projeto.
--
-- Fase vs Pacote é distinção semântica (não restringe aninhamento entre si):
-- Fase pode conter Pacote ou Atividade; Pacote pode conter Pacote ou Atividade.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-eap-nesting-rule-migration.sh

-- Um item é "agrupador" se pode ter filhos (fase ou pacote). Caso contrário,
-- é folha (atividade, marco, historia_usuario).
CREATE OR REPLACE FUNCTION public.eap_is_group(_item_type text, _is_milestone boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (NOT COALESCE(_is_milestone, false))
     AND _item_type IN ('fase', 'pacote');
$$;

CREATE OR REPLACE FUNCTION public.validate_activity_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_row public.activities%ROWTYPE;
  cursor_id uuid;
  hops int := 0;
BEGIN
  -- Regra 1: um item folha (não-agrupador) não pode ter filhos.
  IF NOT public.eap_is_group(NEW.item_type, NEW.is_milestone) AND EXISTS (
    SELECT 1 FROM public.activities WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Este item tem subitens; só Pacote ou Fase podem agrupar. Marque-o como Pacote ou Fase.'
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

  -- Regra 2: o pai precisa ser agrupador (Fase ou Pacote).
  IF NOT public.eap_is_group(parent_row.item_type, parent_row.is_milestone) THEN
    RAISE EXCEPTION 'Aninhamento EAP inválido: uma % não pode conter subitens. Só Pacote ou Fase agrupam.',
      CASE WHEN parent_row.is_milestone THEN 'marco (atividade)' ELSE COALESCE(parent_row.item_type, 'atividade') END
      USING ERRCODE = 'check_violation';
  END IF;

  -- Regra 4: mesmo projeto
  IF parent_row.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'A atividade pai pertence a outro projeto.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Regra 3: detecção de ciclo
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

-- Remove a função de nível da versão anterior, se existir (não é mais usada).
DROP FUNCTION IF EXISTS public.eap_level(text, boolean);

DROP TRIGGER IF EXISTS trg_validate_activity_hierarchy ON public.activities;

CREATE TRIGGER trg_validate_activity_hierarchy
  BEFORE INSERT OR UPDATE OF parent_id, is_milestone, project_id, item_type
  ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_activity_hierarchy();
