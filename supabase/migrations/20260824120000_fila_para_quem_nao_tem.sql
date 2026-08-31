-- "Importo no Backlog e a EAP vai para Nao iniciado."
--
-- ── A CAUSA, medida em 24/08/2026 ─────────────────────────────────────────
--
-- 5 dos 48 projetos NAO TEM coluna de Backlog. Projeto novo nasce sem ela
-- desde 12/08 (migration 20260812140000): a fila virou opcional.
--
-- Sem fila, o importador grava `workflow_stage_id = NULL` -- e isso esta
-- CERTO: deixar o item fora de qualquer coluna e o que o mantem na aba
-- Backlog (que lista tudo) e fora do quadro.
--
-- O erro estava no QUADRO, que adotava o item sem coluna na PRIMEIRA coluna
-- ("Nao iniciado"), como se alguem o tivesse posto la. Corrigido no mesmo
-- commit desta migration, em ActivityKanban.
--
-- ── POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────────────
--
-- So a correcao de tela ja resolve o sintoma: o item some do quadro e fica na
-- aba Backlog. Mas fica num limbo -- sem coluna nenhuma, o selo de status na
-- lista aparece vazio, e mover para o quadro e a unica forma de sair dali.
--
-- Projeto que trabalha com EAP importada PRECISA de fila. Esta migration cria
-- a coluna que falta e recolhe para ela os itens orfaos.
--
-- Idempotente: so cria onde nao existe. Rodar NA VM:
--   PGPASSWORD=... ./scripts/apply-fila-para-quem-nao-tem.sh

-- 1) Cria a coluna de fila onde ela falta ----------------------------------
-- `display_order = -1`: antes de todas, sem renumerar as existentes (o que
-- mexeria na ordem do quadro de quem ja trabalha nele). A coluna nao aparece
-- no quadro de qualquer forma -- `colunasDoQuadro` exclui a categoria
-- `backlog` por regra de produto --, entao a posicao so ordena a lista.
--
-- `is_entry_point = false`: a entrada continua onde esta. Quem decide o que
-- entra no fluxo e o usuario, ao trazer da fila para o quadro.
INSERT INTO public.workflow_stages
  (project_id, title, color, display_order, is_final, contributes_to_progress,
   progress_percent, categoria, is_visible, is_entry_point)
SELECT p.id, 'Backlog', 'hsl(220, 15%, 50%)', -1, false, true,
       null, 'backlog', false, false
  FROM public.projects p
 WHERE NOT EXISTS (
   SELECT 1 FROM public.workflow_stages s
    WHERE s.project_id = p.id
      AND lower(coalesce(s.categoria::text, '')) = 'backlog'
 );

-- 2) Recolhe os orfaos para a fila do proprio projeto -----------------------
-- Atividade sem coluna nenhuma: com a fila criada acima, ela passa a ter
-- lugar. So mexe em quem esta com NULL -- quem ja tem coluna ficou onde
-- alguem o colocou.
--
-- Guard: o UPDATE muta activities. Sem ele o trigger de projeto concluido
-- abortaria se um orfao caisse em projeto fechado, e o rollup da leva 8
-- dispararia por baixo. Religado logo apos.
SET session_replication_role = replica;

UPDATE public.activities a
   SET workflow_stage_id = s.id
  FROM public.workflow_stages s
 WHERE a.workflow_stage_id IS NULL
   AND a.is_trashed = false
   AND s.project_id = a.project_id
   AND lower(coalesce(s.categoria::text, '')) = 'backlog';

SET session_replication_role = origin;

NOTIFY pgrst, 'reload schema';
