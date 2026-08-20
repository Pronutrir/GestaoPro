-- O AGRUPADOR VOLTAVA PARA O QUADRO SOZINHO
--
-- Sintoma relatado: "continuo importando no backlog e indo para o kanban em
-- nao iniciado". A EAP nascia certa, na fila, e reaparecia no quadro logo
-- depois -- sem ninguem mexer.
--
-- ── A CAUSA ────────────────────────────────────────────────────────────────
--
-- A trigger `sincroniza_coluna_do_pai` (20260818140000) faz a coluna do
-- agrupador seguir os filhos, e isso continua certo. Com os filhos ainda nao
-- comecados ela pede `stage_do_papel(projeto, 'inicio')`, que aceita as
-- categorias 'a_iniciar' E 'backlog'.
--
-- A 20260819110000 acrescentou "prefira colunas VISIVEIS" para tirar o
-- agrupador de uma gaveta que o quadro nao desenhava. Naquele desenho o
-- Backlog era uma coluna do quadro como outra qualquer, escondida por
-- `is_visible`; preferir a visivel era o conserto certo.
--
-- Esse desenho MUDOU em 20/08/2026: o Backlog deixou de ser preferencia de
-- projeto e passou a ser regra de produto, no codigo (`colunasDoQuadro`, em
-- components/kanban/shared). Kanban e fluxo, Backlog e fila, e a fila tem tela
-- propria, que mostra a EAP inteira.
--
-- Com o Backlog sempre invisivel, "prefira a visivel" virou exatamente o
-- contrario do que se quer: ela EMPURRA o agrupador da fila para o quadro. O
-- backfill daquela migration fez isso em massa, e a trigger refazia a cada
-- insercao -- por isso a importacao "voltava" para "Nao iniciado" mesmo depois
-- de nascer no lugar certo.
--
-- ── A CORRECAO ─────────────────────────────────────────────────────────────
--
-- Para 'inicio', a FILA GANHA quando existe: nada comecou, e o lugar de quem
-- nao comecou e a fila. Sem coluna de backlog no projeto, cai em 'a_iniciar'
-- como antes -- nenhum quadro fica sem destino.
--
-- Para 'andamento' e 'concluida' a preferencia por visivel CONTINUA: ali o
-- trabalho existe e pertence ao quadro; era o defeito legitimo que a
-- 20260819110000 corrigiu, e ele nao volta.
--
-- Aditiva e idempotente. Rodar NA VM:
--   PGPASSWORD=... ./scripts/apply-inicio-e-a-fila.sh

CREATE OR REPLACE FUNCTION public.stage_do_papel(p_project_id uuid, p_papel text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
    FROM public.workflow_stages s
   WHERE s.project_id = p_project_id
     AND CASE p_papel
           WHEN 'concluida' THEN
             (lower(coalesce(s.categoria, '')) = 'concluida' OR s.is_final = true)
           WHEN 'inicio' THEN
             (lower(coalesce(s.categoria, '')) IN ('a_iniciar', 'backlog')
              OR (s.categoria IS NULL AND s.display_order = 0))
           WHEN 'andamento' THEN
             (lower(coalesce(s.categoria, '')) IN ('andamento', 'revisao')
              OR (s.categoria IS NULL
                  AND s.is_final IS DISTINCT FROM true
                  AND s.display_order > 0
                  AND s.contributes_to_progress IS DISTINCT FROM false))
         END
   ORDER BY
     -- 'inicio': A FILA PRIMEIRO. Nada comecou -- o lugar e o Backlog, nao o
     -- quadro. Nos outros papeis a expressao e constante e nao altera a ordem.
     CASE WHEN p_papel = 'inicio'
               AND lower(coalesce(s.categoria, '')) = 'backlog'
          THEN 0 ELSE 1 END,
     -- Visivel primeiro nos DEMAIS papeis: trabalho em curso ou concluido
     -- pertence ao quadro. Para 'inicio' o criterio acima ja decidiu.
     CASE WHEN p_papel = 'inicio' THEN 0
          WHEN s.is_visible IS DISTINCT FROM false THEN 0 ELSE 1 END,
     -- Empate pela ordem do quadro: a PRIMEIRA coluna que serve.
     s.display_order
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.stage_do_papel(uuid, text) IS
  'Coluna que cumpre um papel (inicio/andamento/concluida) no projeto. Para "inicio" prefere a FILA (Backlog), que e onde fica o que nao comecou; para "andamento" e "concluida" prefere colunas visiveis no quadro.';

-- ── BACKFILL: devolve para a fila quem foi empurrado ───────────────────────
--
-- So AGRUPADOR (tem filho vivo), so quando NENHUM filho comecou, e so quando
-- o projeto tem coluna de backlog. Nao encosta em folha: a folha em "Nao
-- iniciado" pode ter sido posta ali por alguem, de proposito.
WITH agrupador AS (
  SELECT a.id, a.project_id,
         count(*) FILTER (
           WHERE sf.id IS NOT NULL
             AND sf.is_final IS DISTINCT FROM true
             AND lower(coalesce(sf.categoria, '')) NOT IN ('a_iniciar', 'backlog')
             AND NOT (sf.categoria IS NULL AND sf.display_order = 0)
         ) AS iniciados
    FROM public.activities a
    JOIN public.activities f
      ON f.parent_activity_id = a.id AND f.is_trashed = false
    LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
   WHERE a.is_trashed = false
     AND lower(coalesce(sf.categoria, '')) IS DISTINCT FROM 'cancelada'
   GROUP BY a.id, a.project_id
),
fila AS (
  SELECT DISTINCT ON (project_id) project_id, id
    FROM public.workflow_stages
   WHERE lower(coalesce(categoria, '')) = 'backlog'
   ORDER BY project_id, display_order
)
UPDATE public.activities a
   SET workflow_stage_id = fila.id,
       status = 'pending',
       completed_at = NULL
  FROM agrupador g
  JOIN fila ON fila.project_id = g.project_id
 WHERE a.id = g.id
   AND g.iniciados = 0
   AND a.workflow_stage_id IS DISTINCT FROM fila.id;

NOTIFY pgrst, 'reload schema';
