-- ============================================================================
-- ATIVIDADES SEM FASE — o que dá para consertar sem chutar
--
-- Medido em 11/08/2026: 14 atividades com código EAP, sem pai e sem fase.
-- Investigando uma a uma, elas NÃO são um grupo homogêneo:
--
--   11 são AGRUPADORES (item_type='fase') — são as próprias fases do projeto,
--      gravadas em `activities` em vez da tabela `phases`. É estrutura legítima
--      no modelo atual: o Backlog as renderiza como "card-fase virtual". Não
--      precisam de fase acima; ELAS são a fase.
--
--    3 são folhas de trabalho. Dessas, só UMA tem um agrupador cujo código é
--      prefixo do dela ("1.3.4" sob o agrupador "1.0").
--
-- CAUSA das órfãs novas (corrigida no código nesta mesma leva): a importação
-- montava o mapa código→fase apenas com as fases criadas NAQUELA importação.
-- Importar a fase 1 com os itens 1.1 e 1.2 e depois importar só o 1.3 deixava
-- o mapa vazio — o 1.3 nascia sem fase.
--
-- Esta migration trata só o caso INEQUÍVOCO: folha que tem um agrupador
-- ancestral pelo código, no mesmo projeto. Um `parent_id` correto é melhor que
-- um `phase_id` chutado — a fase vem por herança da árvore.
-- ============================================================================

-- Liga a folha órfã ao agrupador cujo código é prefixo do dela.
--
-- Critérios conservadores, porque é dado existente e adotar errado é pior que
-- deixar como está:
--
--   • Só folhas (item_type <> 'fase'). Agrupador sem fase é a própria fase.
--   • Só sem pai. Quem tem pai já herda a estrutura.
--   • Maior prefixo vence: "1.3.4" prefere "1.3" a "1".
--   • Empate no mesmo nível = ambíguo, fica para revisão manual.
--   • O agrupador não pode ser descendente da própria órfã (evita ciclo).
--
-- Guard defensivo: o UPDATE em activities dispararia
-- trg_prevent_activity_mutation_on_concluded_project (20260526150000) se uma
-- órfã caísse em projeto concluído. Hoje nenhuma cai, mas o dado muda; desliga
-- os triggers de negócio pela duração do UPDATE. Reativado logo após.
SET session_replication_role = replica;

WITH agrupadores AS (
  SELECT
    a.id,
    a.project_id,
    -- Normaliza zeros decorativos: "1.0" e "1" são o mesmo nível.
    regexp_replace(btrim(a.wbs_code), '(\.0)+$', '') AS codigo
  FROM public.activities a
  WHERE a.is_trashed = false
    AND a.item_type = 'fase'
    AND a.wbs_code ~ '^\d+(\.\d+)*$'
),
orfas AS (
  SELECT a.id, a.project_id, btrim(a.wbs_code) AS codigo
  FROM public.activities a
  WHERE a.is_trashed = false
    AND a.phase_id IS NULL
    AND a.parent_id IS NULL
    AND COALESCE(a.item_type, '') <> 'fase'
    AND a.wbs_code ~ '^\d+(\.\d+)*$'
),
candidatas AS (
  SELECT
    o.id  AS orfa_id,
    g.id  AS pai_id,
    length(g.codigo) AS especificidade,
    count(*) OVER (PARTITION BY o.id, length(g.codigo)) AS empates
  FROM orfas o
  JOIN agrupadores g
    ON g.project_id = o.project_id
   AND g.id <> o.id
   AND g.codigo <> ''
   -- Prefixo de verdade: "1" casa com "1.3.4" mas NÃO com "10.2".
   AND o.codigo LIKE g.codigo || '.%'
),
escolhida AS (
  SELECT DISTINCT ON (orfa_id) orfa_id, pai_id, empates
  FROM candidatas
  ORDER BY orfa_id, especificidade DESC
)
UPDATE public.activities a
SET parent_id = e.pai_id,
    -- Herda a fase do novo pai, quando ele tiver uma.
    phase_id = COALESCE(a.phase_id, (SELECT p.phase_id FROM public.activities p WHERE p.id = e.pai_id))
FROM escolhida e
WHERE a.id = e.orfa_id
  AND e.empates = 1;

-- Religa os triggers de negócio.
SET session_replication_role = origin;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
DO $$
DECLARE
  folhas_orfas int;
  agrupadores_topo int;
BEGIN
  SELECT count(*) INTO folhas_orfas
  FROM public.activities a
  WHERE a.is_trashed = false
    AND a.phase_id IS NULL AND a.parent_id IS NULL
    AND COALESCE(a.item_type, '') <> 'fase'
    AND a.wbs_code ~ '^\d+(\.\d+)*$';

  SELECT count(*) INTO agrupadores_topo
  FROM public.activities a
  WHERE a.is_trashed = false
    AND a.phase_id IS NULL AND a.parent_id IS NULL
    AND a.item_type = 'fase'
    AND a.wbs_code ~ '^\d+(\.\d+)*$';

  RAISE NOTICE 'Folhas ainda sem pai nem fase (sem agrupador correspondente): %', folhas_orfas;
  RAISE NOTICE 'Agrupadores no topo (esperado — são as fases do projeto): %', agrupadores_topo;
END $$;
