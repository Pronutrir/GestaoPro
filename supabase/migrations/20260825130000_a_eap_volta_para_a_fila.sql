-- A EAP PENDENTE VOLTA PARA A FILA
--
-- ── O QUE FICOU PARA TRAS ──────────────────────────────────────────────────
--
-- Medido em 25/08/2026: 760 atividades com codigo EAP, ainda PENDENTES, estao
-- numa coluna de categoria `a_iniciar` -- "Nao iniciado". Delas, 686 em
-- projetos que JA TEM a coluna de Backlog.
--
-- Nao e falta de fila. Foram para o quadro antes das correcoes, e nenhuma
-- migration as trouxe de volta:
--
--   * a 20260820150000 mexeu so em AGRUPADOR (folha ficou onde estava);
--   * a 20260824120000 recolheu so quem estava SEM COLUNA nenhuma.
--
-- Quem ja tinha "Nao iniciado" gravado ficou la -- e era a maioria. O efeito
-- na tela e o relato: "tudo esta indo para o nao iniciado", com a EAP
-- inteira no quadro em vez da fila.
--
-- ── O QUE E MOVIDO ─────────────────────────────────────────────────────────
--
-- Tres condicoes, todas necessarias:
--
--   1. COM CODIGO EAP numerado. Item criado a mao no quadro nao tem codigo --
--      ele nasceu no fluxo e nao veio de importacao nenhuma.
--
--   2. AINDA PENDENTE. Quem esta em andamento ou concluido esta no quadro por
--      merito; mover apagaria trabalho registrado.
--
--   3. EM COLUNA `a_iniciar`. As demais categorias significam que alguem
--      moveu de proposito -- em andamento, em espera, concluida.
--
-- O que esta operacao NAO consegue distinguir: dentro de `a_iniciar` e
-- pendente, um item que veio da importacao e um que alguem trouxe da fila
-- para o quadro de proposito. Os dois voltam. Foi decisao explicita
-- (25/08/2026), sabendo que o custo e ter de trazer de novo o que ja tinha
-- sido puxado.
--
-- ── ALCANCE ────────────────────────────────────────────────────────────────
--
-- 7 projetos, sendo 2 sem fila (a coluna e criada antes, pela 20260824120000,
-- que o script roda primeiro) e 1 EM EXECUCAO -- "Gestao dos processos tasy -
-- oficial", 127 itens. O script imprime o antes e o depois por projeto.
--
-- SEM DESFAZER. Fazer backup antes.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-a-eap-volta-para-a-fila.sh

-- Guard: o UPDATE muta activities (686 itens). Trigger de projeto concluido +
-- rollup da leva 8 (UPDATE de workflow_stage_id). Religado apos.
SET session_replication_role = replica;

WITH fila AS (
  -- Uma fila por projeto. `DISTINCT ON` com ordem estavel: se houver mais de
  -- uma coluna de backlog (nao deveria), vence a de menor display_order.
  SELECT DISTINCT ON (project_id) project_id, id
    FROM public.workflow_stages
   WHERE lower(coalesce(categoria::text, '')) = 'backlog'
   ORDER BY project_id, display_order
)
UPDATE public.activities a
   SET workflow_stage_id = fila.id
  FROM fila, public.workflow_stages atual
 WHERE a.is_trashed = false
   AND a.project_id = fila.project_id
   AND a.workflow_stage_id = atual.id
   AND lower(coalesce(atual.categoria::text, '')) = 'a_iniciar'
   AND a.status = 'pending'
   AND a.wbs_code IS NOT NULL
   AND a.wbs_code ~ '^[0-9]+(\.[0-9]+)*$';

-- Religa os triggers de negocio.
SET session_replication_role = origin;

NOTIFY pgrst, 'reload schema';

-- Verificacao: nao pode sobrar EAP pendente em `a_iniciar` onde ha fila.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM public.activities a
    JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
   WHERE a.is_trashed = false
     AND lower(coalesce(s.categoria::text, '')) = 'a_iniciar'
     AND a.status = 'pending'
     AND a.wbs_code ~ '^[0-9]+(\.[0-9]+)*$'
     AND EXISTS (SELECT 1 FROM public.workflow_stages f
                  WHERE f.project_id = a.project_id
                    AND lower(coalesce(f.categoria::text, '')) = 'backlog');

  IF n > 0 THEN
    RAISE EXCEPTION 'sobraram % item(ns) de EAP pendentes em "Nao iniciado"', n;
  END IF;
  RAISE NOTICE 'OK: a EAP pendente esta na fila.';
END $$;
