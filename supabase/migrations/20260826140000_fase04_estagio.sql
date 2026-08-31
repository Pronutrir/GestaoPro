-- FASE 04 -- O ESTAGIO VIRA CAMPO DA ATIVIDADE
--
-- ============================================================================
-- LEIA ISTO ANTES: E A TERCEIRA TENTATIVA
--
-- A separacao backlog/quadro ja foi levada ao banco DUAS vezes, e as duas
-- falharam igual -- registrado na decisao de 20/08/2026: "a regra so valia
-- onde a migration tivesse rodado, e nos projetos antigos o Backlog voltava ao
-- quadro sem ninguem pedir". Por isso ela vive hoje no CODIGO (`ehBacklog`,
-- `colunasDoQuadro` em components/kanban/shared.ts).
--
-- Eu recomendei nao fazer. O usuario decidiu fazer em 26/08/2026, e esta
-- migration existe por essa decisao.
--
-- O QUE MUDA EM RELACAO AS DUAS TENTATIVAS ANTERIORES -- e o que precisa ser
-- verdade para esta nao falhar igual:
--
--   1. O CAMPO E DERIVADO, NAO AUTORITATIVO (ainda). Ele nasce preenchido a
--      partir da coluna de workflow atual, e uma trigger o mantem em sincronia
--      a cada movimento. Enquanto o front nao for migrado, `estagio` e um
--      ESPELHO -- se ele divergir, quem manda continua sendo a coluna.
--      As tentativas anteriores inverteram a autoridade de saida, e projeto
--      sem a migration ficava com o campo vazio mandando no quadro.
--
--   2. O DEFAULT E 'quadro', NAO 'backlog'. Projeto novo nasce SEM coluna de
--      backlog (decisao de 12/08), entao o que nao comecou cai em "Nao
--      iniciado", que e quadro. Default 'backlog' esconderia atividade nova.
--
--   3. NADA no front le `estagio` nesta fase. A leitura entra junto com a
--      reescrita da consulta do Kanban, quando houver como testar as duas
--      pontas juntas.
--
-- CRITERIO DE ABANDONO: se depois de aplicada aparecer UM caso de atividade no
-- quadro com `estagio='backlog'` (ou o inverso) sem alguem ter movido, o campo
-- esta divergindo e a tentativa falhou como as outras duas. A consulta que
-- detecta isso esta no fim do script de apply.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) A coluna
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_estagio') THEN
    CREATE TYPE public.activity_estagio AS ENUM ('backlog', 'quadro');
  END IF;
END $$;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS estagio public.activity_estagio NOT NULL DEFAULT 'quadro';

COMMENT ON COLUMN public.activities.estagio IS
  'ESPELHO da coluna de workflow: backlog quando workflow_stage_id aponta para a fila. Mantido por trg_sincronizar_estagio. Enquanto o front nao for migrado, quem manda e a COLUNA -- ver o cabecalho de 20260826140000.';

CREATE INDEX IF NOT EXISTS activities_estagio_projeto
  ON public.activities (project_id, estagio)
  WHERE is_trashed = false;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Uma fila e uma so: a mesma regra de `ehBacklog`
--
-- `categoria` quando existe; senao o NOME, com as grafias que a base tem.
-- Nunca `display_order = 0` -- em projeto novo essa posicao e "Nao iniciado",
-- a coluna de ENTRADA, e confundir as duas foi um bug real.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eh_coluna_de_fila(_stage_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
             -- categoria e enum workflow_category: cast ::text antes de trim/lower.
             WHEN s.categoria IS NOT NULL AND trim(s.categoria::text) <> ''
               THEN lower(trim(s.categoria::text)) = 'backlog'
             ELSE lower(trim(COALESCE(s.title, ''))) IN ('backlog', 'fila', 'a fila', 'fila de espera')
           END
      FROM public.workflow_stages s
     WHERE s.id = _stage_id
  ), false);
$$;

COMMENT ON FUNCTION public.eh_coluna_de_fila(uuid) IS
  'Espelho de ehBacklog (components/kanban/shared.ts): categoria quando existe, senao o nome. NUNCA display_order = 0.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) A trigger que mantem o espelho
--
-- Sem coluna (workflow_stage_id NULL) NAO e backlog: a atividade so ainda nao
-- foi posicionada. Trata-la como fila a esconderia do quadro sem ninguem pedir
-- -- que e exatamente como as duas tentativas anteriores falharam.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_sincronizar_estagio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.estagio := CASE
    WHEN NEW.workflow_stage_id IS NOT NULL
     AND public.eh_coluna_de_fila(NEW.workflow_stage_id) THEN 'backlog'
    ELSE 'quadro'
  END::public.activity_estagio;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_estagio ON public.activities;
CREATE TRIGGER trg_sincronizar_estagio
  BEFORE INSERT OR UPDATE OF workflow_stage_id ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_sincronizar_estagio();

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Backfill
-- ───────────────────────────────────────────────────────────────────────────
-- Guard: o UPDATE muta activities. Trigger de projeto concluido abortaria se
-- uma atividade em coluna de fila caisse em projeto fechado, e o novo
-- trg_sincronizar_estagio dispararia por baixo. Religado apos.
SET session_replication_role = replica;

UPDATE public.activities a
   SET estagio = CASE
     WHEN a.workflow_stage_id IS NOT NULL
      AND public.eh_coluna_de_fila(a.workflow_stage_id) THEN 'backlog'
     ELSE 'quadro'
   END::public.activity_estagio
 WHERE a.estagio IS DISTINCT FROM (CASE
     WHEN a.workflow_stage_id IS NOT NULL
      AND public.eh_coluna_de_fila(a.workflow_stage_id) THEN 'backlog'
     ELSE 'quadro'
   END::public.activity_estagio);

-- Religa os triggers de negocio.
SET session_replication_role = origin;

-- ───────────────────────────────────────────────────────────────────────────
-- Verificacao -- o espelho tem de bater com a coluna em 100% dos casos
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_div integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='activities'
                    AND column_name='estagio') THEN
    RAISE EXCEPTION 'a coluna estagio nao foi criada';
  END IF;

  SELECT count(*) INTO v_div
    FROM public.activities a
   WHERE a.is_trashed = false
     AND a.estagio IS DISTINCT FROM (CASE
           WHEN a.workflow_stage_id IS NOT NULL
            AND public.eh_coluna_de_fila(a.workflow_stage_id) THEN 'backlog'
           ELSE 'quadro' END::public.activity_estagio);

  IF v_div > 0 THEN
    RAISE EXCEPTION '% atividades com estagio divergindo da coluna -- o espelho nasceu torto', v_div;
  END IF;
END $$;
