-- A FASE PASSA A EXISTIR TAMBEM EM `activities`
--
-- ── O PROBLEMA ─────────────────────────────────────────────────────────────
--
-- Medido em 24/08/2026: 91 itens de nivel 3 sem `parent_id`, sendo 84 com
-- `phase_id` preenchido. Eles NAO estao errados -- estao ligados a fase pelo
-- caminho que existia. O que falta e o pai: a fase mora em `phases`, e
-- `parent_id` so aponta para `activities`.
--
-- Sao dois vinculos paralelos para a mesma hierarquia, e so um alimenta a
-- arvore da lista. O efeito na tela e a fase nao se mover, abrir uma ficha
-- reduzida (7 campos contra dezenas) e o pacote ficar solto no lugar de
-- pendurado nela.
--
-- ── POR QUE ESTE CAMINHO ───────────────────────────────────────────────────
--
-- A migracao ja estava em curso: 60 fases da base JA existem como atividade de
-- nivel 2, e a lista sabe lidar com elas -- a faixa de `phases` cede o lugar
-- quando a atividade-fase existe (ver BacklogSection). O que ficou pela metade
-- foi a importacao, que continuou criando so o registro em `phases`.
--
-- Esta migration alcanca as que ficaram para tras. Depois dela a fase e um
-- item da EAP como qualquer outro: mesma ficha, mesmo "Mover para dentro
-- de...", mesmo recuo, mesma selecao em lote -- sem codigo novo para cada
-- recurso, porque ela herda o que ja existe.
--
-- `phases` NAO e apagada: continua como vinculo (`phase_id`) e como faixa para
-- quem ainda nao migrou. Remover seria destrutivo e desnecessario.
--
-- Idempotente: so cria onde nao existe. Rodar NA VM:
--   PGPASSWORD=... ./scripts/apply-a-fase-vira-atividade.sql.sh

-- 1) Cria a atividade-fase para cada fase viva que ainda nao tem -----------
--
-- O CODIGO vem do titulo: as fases sao gravadas como "1.1 Nome da fase" pelo
-- importador. Sem codigo no titulo a fase nao entra -- sem nivel ela nao
-- recuaria nem ordenaria, e viraria um item solto, que e o defeito oposto.
--
-- A coluna e a FILA do projeto: a fase e agrupador, nao trabalho, e o lugar
-- dela e onde esta o conteudo que ela agrupa.
WITH fase_com_codigo AS (
  SELECT p.id, p.project_id, p.display_order,
         substring(btrim(p.title) FROM '^([0-9]+(\.[0-9]+)*)')        AS codigo,
         btrim(regexp_replace(btrim(p.title), '^[0-9]+(\.[0-9]+)*\s*', '')) AS nome
    FROM public.phases p
   WHERE p.is_trashed = false
),
fila AS (
  SELECT DISTINCT ON (project_id) project_id, id
    FROM public.workflow_stages
   WHERE lower(coalesce(categoria::text, '')) = 'backlog'
   ORDER BY project_id, display_order
)
INSERT INTO public.activities
  (project_id, title, wbs_code, item_type, is_milestone, parent_id, phase_id,
   workflow_stage_id, status, priority, display_order)
SELECT f.project_id,
       -- Sem nome no titulo, o codigo vira o nome: melhor que titulo vazio.
       CASE WHEN f.nome = '' THEN f.codigo ELSE f.nome END,
       f.codigo, 'fase', false, NULL, f.id,
       fila.id, 'pending', 'pendente', COALESCE(f.display_order, 0)
  FROM fase_com_codigo f
  LEFT JOIN fila ON fila.project_id = f.project_id
 WHERE f.codigo IS NOT NULL
   -- Nivel 2 apenas: um ponto no codigo. Fase gravada com codigo de outro
   -- nivel e dado torto e nao deve virar atividade de nivel 2.
   AND f.codigo ~ '^[0-9]+\.[0-9]+$'
   AND NOT EXISTS (
     SELECT 1 FROM public.activities a
      WHERE a.project_id = f.project_id
        AND a.wbs_code = f.codigo
        AND a.is_trashed = false
   );

-- 2) Pendura os orfaos na atividade-fase recem-criada ----------------------
--
-- SO quem esta sem pai E tem `phase_id`: o vinculo pela fase e o que diz a
-- qual delas o item pertence. Quem ja tem `parent_id` fica onde esta -- pode
-- ter sido movido de proposito.
--
-- A juncao e por `phase_id`, nao pelo codigo: e o vinculo que o item de fato
-- tem, e ele sobrevive a fase ter sido renomeada.
UPDATE public.activities filho
   SET parent_id = pai.id
  FROM public.activities pai
 WHERE filho.is_trashed = false
   AND filho.parent_id IS NULL
   AND filho.phase_id IS NOT NULL
   AND pai.phase_id = filho.phase_id
   AND pai.project_id = filho.project_id
   AND pai.item_type = 'fase'
   AND pai.is_trashed = false
   AND pai.id <> filho.id
   -- O pai tem de estar no nivel da FASE (um ponto). Sem isto um pacote
   -- irmao, que tambem tem `item_type = 'fase'` e o mesmo `phase_id`, poderia
   -- ser escolhido como pai -- e dois pacotes viveriam um dentro do outro.
   AND pai.wbs_code ~ '^[0-9]+\.[0-9]+$'
   -- E o filho tem de estar ABAIXO dele: so pendura quem e mais fundo.
   AND filho.wbs_code IS NOT NULL
   AND filho.wbs_code LIKE pai.wbs_code || '.%';

NOTIFY pgrst, 'reload schema';
