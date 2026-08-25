-- PROJETO NOVO PASSA A NASCER COM A FILA
--
-- ── O QUE ACONTECEU ────────────────────────────────────────────────────────
--
-- "Por que as fases importadas estao indo para o Nao iniciado no kanban?"
--
-- O projeto "Teste 02 - Revitalizacao Tasy", criado em 25/08/2026 as 01:23,
-- nasceu SEM coluna de Backlog -- e a EAP importada nele foi inteira para
-- "Nao iniciado", porque era o unico destino possivel.
--
-- A migration 20260824120000 criou a fila nos 5 projetos que nao tinham, mas
-- NAO mexeu em como projeto novo nasce. O gatilho continuou produzindo as
-- quatro colunas sem fila, entao o defeito voltou no primeiro projeto criado
-- depois dela. Ja eram 2 projetos quando isto foi escrito.
--
-- Corrigir o dado sem corrigir a origem so adia o problema.
--
-- ── A CORRECAO ─────────────────────────────────────────────────────────────
--
-- A fila entra no padrao, com `display_order = -1`: antes de todas, sem
-- renumerar as demais. A posicao so ordena a lista -- no quadro ela nao
-- aparece de qualquer forma, porque `colunasDoQuadro` exclui a categoria
-- `backlog` por regra de produto (ver components/kanban/shared).
--
-- `is_entry_point` continua em "Nao iniciado". A fila NAO e a entrada: quem
-- decide o que entra no fluxo e o usuario, ao trazer da fila para o quadro.
-- Marca-la como entrada faria a tarefa nova nascer numa coluna que o quadro
-- nao desenha.
--
-- `is_visible = false`: coerente com o que a migration 20260812140000 gravou
-- em todas as filas existentes. Redundante em relacao a regra do codigo, mas
-- mantem o banco dizendo a mesma coisa que a tela.
--
-- Aditiva: redefine a funcao, nao toca em dado existente. Para os projetos
-- que ja nasceram sem fila, rodar `apply-fila-para-quem-nao-tem.sh` de novo --
-- ele e idempotente.
--
-- Rodar NA VM: PGPASSWORD=... ./scripts/apply-projeto-novo-com-fila.sh

CREATE OR REPLACE FUNCTION public.create_default_workflow_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.workflow_stages (
    project_id, title, color, display_order,
    is_final, contributes_to_progress, progress_percent, categoria,
    is_entry_point, is_visible
  ) VALUES
    -- A FILA. Fora do quadro por regra de produto; e onde a EAP importada
    -- nasce e de onde o trabalho e trazido para o fluxo.
    (NEW.id, 'Backlog',      'hsl(220, 15%, 50%)', -1, false, true,  null, 'backlog',
     false, false),
    -- `is_entry_point`: onde a tarefa nova cai. Uma por projeto (indice unico
    -- parcial criado em 20260812140000). Continua sendo "Nao iniciado".
    (NEW.id, 'Não iniciado', 'hsl(38, 92%, 50%)',   0, false, true,  null, 'a_iniciar',
     true,  true),
    (NEW.id, 'Em Andamento', 'hsl(220, 90%, 56%)',  1, false, true,  null, 'andamento',
     false, true),
    -- `contributes_to_progress = false`: pendencia nao avanca o projeto. Junto
    -- com a categoria `espera`, tira o item do WIP e do calculo de progresso.
    (NEW.id, 'Pendências',   'hsl(25, 95%, 53%)',   2, false, false, null, 'espera',
     false, true),
    (NEW.id, 'Concluída',    'hsl(142, 76%, 36%)',  3, true,  true,  100,  'concluida',
     false, true);
  RETURN NEW;
END;
$$;

-- ── O QUE JA FOI PARA O QUADRO POR FALTA DE FILA ──────────────────────────
--
-- Nos 2 projetos que nasceram sem Backlog, a EAP importada caiu inteira em
-- "Nao iniciado" -- 166 atividades em cada. Criar a fila agora nao os traz de
-- volta sozinho.
--
-- Este UPDATE recolhe SO o que tem cara de EAP recem-importada:
--
--   * item com codigo EAP (`wbs_code` numerado) -- item criado a mao no
--     quadro nao tem codigo e fica onde esta;
--   * ainda PENDENTE -- quem ja comecou ou concluiu esta no quadro por
--     merito, e mover seria apagar trabalho registrado;
--   * numa coluna de categoria `a_iniciar` -- as demais significam que
--     alguem moveu de proposito.
--
-- Roda DEPOIS de a fila existir. Como esta migration nao cria as filas (isso e
-- da 20260824120000, que o script executa em seguida), o UPDATE so encontra
-- destino nos projetos que ja a tem -- e e por isso que o script roda as duas
-- na ordem certa.
--
-- Guard: o UPDATE muta activities. Trigger de projeto concluido + rollup da
-- leva 8 (UPDATE de workflow_stage_id). Religado apos.
SET session_replication_role = replica;

WITH fila AS (
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
   AND a.wbs_code ~ '^[0-9]+(\.[0-9]+)*$';

-- Religa os triggers de negocio.
SET session_replication_role = origin;

NOTIFY pgrst, 'reload schema';

-- Verificacao: a funcao precisa produzir a fila, e so uma entrada.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_default_workflow_stages';

  IF def IS NULL OR position('''backlog''' in def) = 0 THEN
    RAISE EXCEPTION 'a funcao nao cria a coluna de backlog';
  END IF;
  IF def LIKE '%A Fazer%' THEN
    RAISE EXCEPTION 'a funcao voltou a produzir "A Fazer"';
  END IF;

  RAISE NOTICE 'OK: projeto novo nasce com Backlog + 4 colunas do quadro.';
END $$;
