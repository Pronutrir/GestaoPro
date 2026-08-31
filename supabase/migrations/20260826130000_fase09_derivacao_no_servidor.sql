-- FASE 09 -- A DERIVACAO PAI<->FILHA RODA NO SERVIDOR
--
-- ============================================================================
-- O DEFEITO QUE ISTO FECHA
--
-- O inventario de 25/08 achou 21 pontos de rollup, 19 DELES NO CLIENTE, e
-- nenhuma trigger de banco somando horas, custo ou datas. Dois desses pontos
-- GRAVAVAM (EditActivityDialog), a partir de uma lista que passa pela RLS:
-- quem enxergava 1 de 8 filhas persistia o total daquela unica filha.
--
-- A gravacao foi removida em 26/08 (commit 5e05895). Mas remover a gravacao
-- so PAROU O DANO -- nao criou a derivacao correta. Ela e esta migration.
--
-- POR QUE NO SERVIDOR, E NAO NUMA FUNCAO TS MELHOR: porque o cliente NUNCA
-- tem a arvore inteira. Ele tem a fatia que a RLS deixou passar. Qualquer
-- soma feita ali esta certa por acidente -- so vale para quem enxerga tudo.
-- A trigger roda como SECURITY DEFINER, sobre todas as filhas, sempre.
-- ============================================================================
--
-- AS REGRAS, e o que cada uma faz com MARCO (decisao do usuario em 26/08:
-- peso ZERO no progresso):
--
--   horas/custo  -> soma das filhas. Marco NAO entra (nao tem horas nem custo).
--   datas        -> min(inicio) e max(fim). Marco ENTRA: a fase vai ate o
--                   marco, mesmo que a ultima atividade feche antes.
--   progresso    -> media ponderada por horas. Marco tem peso ZERO.
--   conclusao    -> ja existe em recalcular_coluna_do_pai (20260820150000).
--                   Marco pendente CONTA como filha aberta -- e o que aquela
--                   funcao ja faz, porque nao filtra marco.
--
-- A profundidade e a ARVORE INTEIRA, resolvida por recursao natural: cada
-- UPDATE no pai re-dispara a trigger e sobe um nivel. E o mesmo mecanismo de
-- recalcular_coluna_do_pai, e o `WHERE ... IS DISTINCT FROM` e o que corta a
-- cascata quando nada muda.
--
-- NAO TOCA em workflow_stage_id, status nem completed_at -- isso e da trigger
-- de 20260820150000, que continua mandando neles. Duas triggers no mesmo
-- evento, cada uma com o seu conjunto de colunas.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) As colunas derivadas
--
-- Nascem NULL. NULL significa "ainda nao derivado", e o front continua lendo
-- `hours`/`cost` como hoje. O backfill no fim preenche tudo.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS derived_hours    numeric,
  ADD COLUMN IF NOT EXISTS derived_cost     numeric,
  ADD COLUMN IF NOT EXISTS derived_start    date,
  ADD COLUMN IF NOT EXISTS derived_end      date,
  ADD COLUMN IF NOT EXISTS derived_progress numeric,
  ADD COLUMN IF NOT EXISTS derived_children integer;

COMMENT ON COLUMN public.activities.derived_hours IS
  'Soma das horas das filhas (marco nao entra). Escrito SO por tg_derivar_do_pai. NULL = folha ou ainda nao derivado.';
COMMENT ON COLUMN public.activities.derived_progress IS
  'Progresso 0-100 ponderado por horas das filhas. Marco tem peso ZERO (decisao 26/08/2026).';
COMMENT ON COLUMN public.activities.derived_children IS
  'Quantas filhas DIRETAS vivas. Existe para a tela nao precisar contar -- contar no cliente e o que produz numero divergente.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A derivacao de UM pai, a partir das filhas DIRETAS
--
-- Diretas, e nao a subarvore: as filhas ja carregam o proprio derivado, entao
-- somar as diretas ja soma a arvore toda. Foi a mistura de profundidades (1
-- nivel num lugar, subarvore noutro) que produziu numeros divergentes na
-- mesma tela.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.derivar_do_pai(p_pai uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_horas   numeric;
  v_custo   numeric;
  v_inicio  date;
  v_fim     date;
  v_prog    numeric;
  v_filhas  integer;
BEGIN
  IF p_pai IS NULL THEN RETURN; END IF;

  SELECT
    -- horas e custo: o proprio derivado da filha quando ela tem filhas,
    -- senao o valor dela. Marco fora dos dois.
    COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                      ELSE COALESCE(f.derived_hours, f.hours, 0) END), 0),
    COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                      ELSE COALESCE(f.derived_cost, f.cost, 0) END), 0),
    -- datas: marco ENTRA. A fase vai ate o marco.
    MIN(COALESCE(f.derived_start, f.start_date)),
    MAX(COALESCE(f.derived_end, f.end_date)),
    -- progresso ponderado por horas. Marco: peso ZERO -- nao entra no
    -- numerador nem no denominador.
    CASE
      WHEN COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                             ELSE COALESCE(f.derived_hours, f.hours, 0) END), 0) > 0
      THEN ROUND(
        SUM(CASE WHEN f.is_milestone THEN 0
                 ELSE COALESCE(f.derived_hours, f.hours, 0)
                      * (CASE WHEN f.status = 'completed' THEN 100
                              ELSE COALESCE(f.derived_progress, 0) END) END)
        / NULLIF(SUM(CASE WHEN f.is_milestone THEN 0
                          ELSE COALESCE(f.derived_hours, f.hours, 0) END), 0), 2)
      -- Sem horas em filha nenhuma, a media e simples -- senao uma fase toda
      -- sem estimativa ficaria eternamente em 0%.
      ELSE ROUND(
        COALESCE(AVG(CASE WHEN f.is_milestone THEN NULL
                          WHEN f.status = 'completed' THEN 100
                          ELSE COALESCE(f.derived_progress, 0) END), 0), 2)
    END,
    COUNT(*)
  INTO v_horas, v_custo, v_inicio, v_fim, v_prog, v_filhas
  FROM public.activities f
  WHERE f.parent_id = p_pai
    AND f.is_trashed = false;

  IF v_filhas = 0 THEN
    -- Deixou de ter filhas: volta a ser folha e os derivados somem, senao o
    -- numero antigo fica congelado na tela para sempre.
    UPDATE public.activities
       SET derived_hours = NULL, derived_cost = NULL, derived_start = NULL,
           derived_end = NULL, derived_progress = NULL, derived_children = NULL
     WHERE id = p_pai
       AND (derived_children IS NOT NULL OR derived_hours IS NOT NULL);
    RETURN;
  END IF;

  UPDATE public.activities
     SET derived_hours    = v_horas,
         derived_cost     = v_custo,
         derived_start    = v_inicio,
         derived_end      = v_fim,
         derived_progress = v_prog,
         derived_children = v_filhas
   WHERE id = p_pai
     -- Corta a cascata: sem mudanca, sem UPDATE, sem re-disparo.
     AND (derived_hours    IS DISTINCT FROM v_horas
       OR derived_cost     IS DISTINCT FROM v_custo
       OR derived_start    IS DISTINCT FROM v_inicio
       OR derived_end      IS DISTINCT FROM v_fim
       OR derived_progress IS DISTINCT FROM v_prog
       OR derived_children IS DISTINCT FROM v_filhas);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) A trigger
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_derivar_do_pai()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.derivar_do_pai(OLD.parent_id);
    RETURN OLD;
  END IF;

  PERFORM public.derivar_do_pai(NEW.parent_id);
  -- Reparenting: o pai ANTIGO tambem precisa recontar.
  IF TG_OP = 'UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    PERFORM public.derivar_do_pai(OLD.parent_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derivar_do_pai ON public.activities;
CREATE TRIGGER trg_derivar_do_pai
  AFTER INSERT OR DELETE OR UPDATE OF
    hours, cost, start_date, end_date, status, is_trashed, parent_id,
    is_milestone, derived_hours, derived_cost, derived_start, derived_end,
    derived_progress
  ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_derivar_do_pai();

COMMENT ON FUNCTION public.derivar_do_pai(uuid) IS
  'Deriva horas, custo, janela de datas, progresso e contagem de UM pai a partir das filhas diretas. Marco: fora de horas/custo/progresso, DENTRO das datas.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Marco nao recebe horas nem custo
--
-- O modelo diz que marco nao tem esforco. Ate aqui isso era so convencao no
-- front -- `hoursStatsByActivity` inclusive ignorava a flag e somava.
-- Recusar e melhor que aceitar e nao somar: aceitar deixa o numero no banco
-- para alguem somar depois, por engano.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_marco_sem_esforco()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_milestone AND (COALESCE(NEW.hours, 0) <> 0 OR COALESCE(NEW.cost, 0) <> 0) THEN
    RAISE EXCEPTION 'marco nao tem horas nem custo (atividade %)', NEW.id
      USING HINT = 'Se ha esforco, o item e uma Atividade, nao um Marco.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marco_sem_esforco ON public.activities;
CREATE TRIGGER trg_marco_sem_esforco
  BEFORE INSERT OR UPDATE OF hours, cost, is_milestone ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_marco_sem_esforco();

-- Guard: os UPDATE abaixo (limpeza de marcos + backfill via derivar_do_pai)
-- mutam activities em massa. O trigger de projeto concluido abortaria nos pais
-- com filhas dos 7 projetos concluidos, e os triggers novos (derivar/marco)
-- dispariam por baixo do backfill. Religado apos o loop.
SET session_replication_role = replica;

-- Limpa o que ja existe, senao a trigger nova quebra a primeira edicao de
-- qualquer marco que tenha herdado horas.
UPDATE public.activities
   SET hours = NULL, cost = NULL
 WHERE is_milestone = true
   AND (COALESCE(hours, 0) <> 0 OR COALESCE(cost, 0) <> 0);

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Backfill -- das folhas para a raiz
--
-- Ordem por profundidade DESC: quando um pai e derivado, as filhas dele ja
-- foram. Sem isso, um avo somaria filhas ainda com derived_* nulo.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH RECURSIVE arv AS (
      SELECT a.id, a.parent_id, 0 AS nivel
        FROM public.activities a
       WHERE a.parent_id IS NULL AND a.is_trashed = false
      UNION ALL
      SELECT f.id, f.parent_id, arv.nivel + 1
        FROM public.activities f
        JOIN arv ON f.parent_id = arv.id
       WHERE f.is_trashed = false AND arv.nivel < 20
    )
    SELECT DISTINCT a.id, a.nivel
      FROM arv a
     WHERE EXISTS (SELECT 1 FROM public.activities f
                    WHERE f.parent_id = a.id AND f.is_trashed = false)
     ORDER BY a.nivel DESC
  LOOP
    PERFORM public.derivar_do_pai(r.id);
  END LOOP;
END $$;

-- Religa os triggers de negocio.
SET session_replication_role = origin;

-- ───────────────────────────────────────────────────────────────────────────
-- Verificacao
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_divergentes integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='activities'
                    AND column_name='derived_hours') THEN
    RAISE EXCEPTION 'derived_hours nao foi criada';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_derivar_do_pai') THEN
    RAISE EXCEPTION 'trg_derivar_do_pai nao existe';
  END IF;

  -- Nenhum marco pode ter sobrado com esforco.
  IF EXISTS (SELECT 1 FROM public.activities
              WHERE is_milestone = true
                AND (COALESCE(hours,0) <> 0 OR COALESCE(cost,0) <> 0)) THEN
    RAISE EXCEPTION 'ha marco com horas ou custo depois da limpeza';
  END IF;

  -- Todo pai vivo tem de ter derivado.
  SELECT count(*) INTO v_divergentes
    FROM public.activities p
   WHERE p.is_trashed = false
     AND EXISTS (SELECT 1 FROM public.activities f
                  WHERE f.parent_id = p.id AND f.is_trashed = false)
     AND p.derived_children IS NULL;
  IF v_divergentes > 0 THEN
    RAISE EXCEPTION '% pais ficaram sem derivacao apos o backfill', v_divergentes;
  END IF;
END $$;
