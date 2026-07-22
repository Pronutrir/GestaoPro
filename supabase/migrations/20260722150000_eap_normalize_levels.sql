-- EAP: normaliza a base para os papéis (folha vs agrupador), antes de ativar a
-- regra de aninhamento por papel (fase/pacote agrupam; atividade/marco são folha).
--
-- Classificação por posição na árvore (a árvore é definida por parent_id):
--   - tem filhos E não tem pai  -> 'fase'      (agrupador de topo)
--   - tem filhos E tem pai      -> 'pacote'    (agrupador; pode aninhar pacotes)
--   - não tem filhos (folha)    -> 'atividade'
-- Marcos (is_milestone) são sempre folhas -> 'atividade'.
-- historia_usuario é preservado (fora da EAP).
--
-- Idempotente: pode rodar de novo sem efeito colateral.
--
-- Rodar NA VM (20.65.208.119), container supabase-db-1:
--   PGPASSWORD=... ./scripts/apply-eap-normalize-levels-migration.sh

-- Pré-requisito: a coluna item_type e o CHECK já existem (migration ...130000).
-- Garante que 'pacote' é aceito pelo CHECK (recria por segurança/idempotência).
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_item_type_check;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_item_type_check
  CHECK (item_type IN ('fase', 'pacote', 'atividade', 'historia_usuario'));

-- Reclassifica em uma única passada usando um CTE que sabe quem tem filhos.
WITH parents AS (
  SELECT DISTINCT parent_id AS id
  FROM public.activities
  WHERE parent_id IS NOT NULL
)
UPDATE public.activities a
SET item_type = CASE
  -- historia_usuario fica intocada
  WHEN a.item_type = 'historia_usuario' THEN a.item_type
  -- marco é sempre folha
  WHEN a.is_milestone THEN 'atividade'
  -- tem filhos?
  WHEN a.id IN (SELECT id FROM parents) THEN
    CASE WHEN a.parent_id IS NULL THEN 'fase' ELSE 'pacote' END
  -- folha
  ELSE 'atividade'
END
WHERE a.item_type <> 'historia_usuario';
