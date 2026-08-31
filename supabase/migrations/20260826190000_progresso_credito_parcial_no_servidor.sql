-- O SERVIDOR APRENDE A REGUA DA TELA -- credito parcial por coluna
--
-- ============================================================================
-- A DECISAO, E POR QUE ELA INVERTE O TRABALHO
--
-- Medido em 26/08/2026: trocar `computeActivityProgress` por `derived_progress`
-- derrubaria 74 das 581 barras, ate 66 pontos percentuais, varias de 50% para
-- 0%. Nao e troca de fonte: e troca de REGUA.
--
--   TELA     -- credito parcial pela POSICAO da coluna. Filha em "Em Revisao"
--               vale 75, nao 0.
--   SERVIDOR -- binario: `status = 'completed' ? 100 : COALESCE(derived, 0)`.
--
-- A decisao de produto foi: **mantem o credito parcial**. Entao o servidor e
-- que muda -- esta migration copia para `derivar_do_pai()` os MESMOS pesos que
-- `lib/activityProgress.ts` usa.
--
-- RESULTADO ESPERADO: zero barra mudando de valor para quem enxerga o projeto
-- inteiro. A correcao aparece so para quem enxerga uma FATIA -- que e o motivo
-- da fase 09 existir: o cliente nunca tem a arvore toda, so o que a RLS deixou
-- passar, e somar ali esta certo por acidente.
--
-- ============================================================================
-- A REGUA, COPIADA LINHA A LINHA DE `computeActivityProgress`
--
-- Ordem exata dos testes (activityProgress.ts:326-424). A ordem importa: dois
-- casos so se distinguem por ela.
--
--   1. categoria = 'espera'    -> CONGELA. Vem ANTES do teste de peso nulo,
--                                 porque 'espera' e 'cancelada' compartilham
--                                 progressWeight = null por motivos OPOSTOS --
--                                 uma esta parada e volta, a outra saiu dos
--                                 indicadores. Sem esta guarda, espera exibiria
--                                 "Cancelada".
--   2. categoria = 'cancelada' -> FORA da media (peso null).
--   3. andamento/revisao       -> a) progress_percent explicito, se houver;
--                                 b) senao POSICIONAL: j-esima de K colunas de
--                                    trabalho vale j/(K+1). Divide por K+1, e
--                                    nao K, para nunca dar 100% antes da
--                                    Concluida.
--   4. demais categorias       -> o peso fixo do META:
--                                 backlog 0, a_iniciar 0, concluida 100.
--
-- `ehTrabalhoEmCurso` = categoria IN ('andamento','revisao'). Sao as duas que
-- entram no denominador K.
--
-- COLUNA SEM CATEGORIA entra pela leitura legada (`categoryFromLegacyFlags`),
-- para o fluxo ficar completo em quadros mistos (pre/pos-backfill):
--   is_final              -> concluida
--   display_order = 0     -> backlog
--   is_blocked/exception  -> andamento
--   contributes = false   -> a_iniciar
--   senao                 -> andamento  (aproximacao; ver a nota ao fim)
--
-- ROLLBACK: 20260826190001_progresso_rollback.sql -- devolve a regua binaria.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) O percentual de UMA coluna -- o espelho de percentualAutomaticoDaColuna
--
-- Devolve NULL quando a coluna nao produz percentual (espera, cancelada): quem
-- chama decide se congela ou se tira da media.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.percentual_da_coluna(_stage_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col        record;
  v_categoria  text;
  v_j          int;
  v_k          int;
BEGIN
  IF _stage_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_col FROM public.workflow_stages WHERE id = _stage_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Categoria explicita, ou a leitura legada das flags.
  v_categoria := NULLIF(btrim(COALESCE(v_col.categoria::text, '')), '');
  IF v_categoria IS NULL THEN
    v_categoria := CASE
      WHEN v_col.is_final THEN 'concluida'
      WHEN v_col.display_order = 0 THEN 'backlog'
      WHEN v_col.is_blocked OR v_col.is_exception THEN 'andamento'
      WHEN v_col.contributes_to_progress = false THEN 'a_iniciar'
      ELSE 'andamento'
    END;
  END IF;

  -- 1. Espera CONGELA -- antes do teste de peso nulo, de proposito.
  IF v_categoria = 'espera' THEN
    RETURN v_col.progress_percent;   -- NULL quando nao ha percentual congelado
  END IF;

  -- 2. Cancelada sai da media.
  IF v_categoria = 'cancelada' THEN
    RETURN NULL;
  END IF;

  -- 3. Trabalho em curso: explicito vence a posicao.
  IF v_categoria IN ('andamento', 'revisao') THEN
    IF v_col.progress_percent IS NOT NULL THEN
      RETURN GREATEST(0, LEAST(100, v_col.progress_percent));
    END IF;

    -- Posicional: j de K colunas de trabalho DO MESMO PROJETO.
    WITH fluxo AS (
      SELECT s.id,
             row_number() OVER (ORDER BY s.display_order) AS pos
        FROM public.workflow_stages s
       WHERE s.project_id = v_col.project_id
         AND COALESCE(
               NULLIF(btrim(COALESCE(s.categoria::text, '')), ''),
               CASE
                 WHEN s.is_final THEN 'concluida'
                 WHEN s.display_order = 0 THEN 'backlog'
                 WHEN s.is_blocked OR s.is_exception THEN 'andamento'
                 WHEN s.contributes_to_progress = false THEN 'a_iniciar'
                 ELSE 'andamento'
               END
             ) IN ('andamento', 'revisao')
    )
    SELECT f.pos, (SELECT count(*) FROM fluxo) INTO v_j, v_k
      FROM fluxo f WHERE f.id = _stage_id;

    IF v_j IS NULL OR v_j <= 0 THEN
      -- Posicao indeterminavel: o peso fixo do META para andamento/revisao.
      RETURN 25;
    END IF;

    -- j/(K+1) -- nunca 100% antes da Concluida.
    --
    -- INTEIRO, nao 2 casas: `clampPercent` da tela e
    -- `Math.max(0, Math.min(100, Math.round(value)))`. Guardar 62.5 onde a tela
    -- mostra 63 produz divergencia de meio ponto em dezenas de pais -- medido:
    -- 30 deles, todos por isto. Arredonda no mesmo lugar e do mesmo jeito.
    RETURN GREATEST(0, LEAST(100, ROUND((v_j::numeric / (v_k + 1)) * 100)));
  END IF;

  -- 4. Peso fixo do META.
  RETURN CASE v_categoria
    WHEN 'concluida' THEN 100
    WHEN 'backlog'   THEN 0
    WHEN 'a_iniciar' THEN 0
    ELSE 0
  END;
END;
$$;

COMMENT ON FUNCTION public.percentual_da_coluna(uuid) IS
  'O percentual de uma coluna, com a MESMA regua de lib/activityProgress.ts: espera congela, cancelada sai, andamento/revisao vale j/(K+1), demais usam o peso do META. NULL = nao entra na media.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) O avanco de UMA filha -- o espelho de `subAvanco`
--
--   status completed  -> 100, independente da coluna
--   marco             -> binario: so a coluna final o realiza
--   senao             -> o percentual da COLUNA dela
--
-- ── UM NIVEL, E SO UM. NAO RECURSAR AQUI. ─────────────────────────────────
--
-- A tentacao e obvia: se a filha tem filhas, usar o derivado dela, que ja
-- responde pela subarvore. Foi o que esta funcao fazia na primeira versao, e
-- estava ERRADO -- nao por bug, por divergir da tela.
--
-- `subAvanco` (activityProgress.ts) e explicito:
--
--   "Sem netos aqui: `SubActivityLike` nao os carrega, e busca-los abriria uma
--    recursao que nenhuma das telas alimenta hoje. UM NIVEL E O QUE EXISTE."
--
-- A tela pontua cada filha pela COLUNA dela, mesmo quando a filha e pai. Entao
-- o servidor tem de fazer igual -- senao a barra muda de valor, que e
-- exatamente o que a decisao proibiu.
--
-- MEDIDO: com recursao, 56 dos 582 pais divergiam da tela, um deles em 100
-- pontos. Sem recursao, sobraram 30 -- todas por arredondamento, resolvido no
-- item 3.
--
-- Isto NAO desfaz a fase 09: as HORAS continuam somando a arvore inteira (via
-- `derived_hours` da filha, no item 3), porque ali a tela tambem soma tudo. E
-- so o progresso que mede um nivel, nos dois lados.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.avanco_da_filha(_activity_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a       record;
  v_final   boolean;
BEGIN
  SELECT * INTO v_a FROM public.activities WHERE id = _activity_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_a.status = 'completed' THEN
    RETURN 100;
  END IF;

  IF v_a.is_milestone THEN
    SELECT COALESCE(s.is_final, false)
           OR NULLIF(btrim(COALESCE(s.categoria::text, '')), '') = 'concluida'
      INTO v_final
      FROM public.workflow_stages s WHERE s.id = v_a.workflow_stage_id;
    RETURN CASE WHEN COALESCE(v_final, false) THEN 100 ELSE 0 END;
  END IF;

  -- Sem ramo para "ja e pai": ver o cabecalho. Um nivel e o que existe.
  RETURN public.percentual_da_coluna(v_a.workflow_stage_id);
END;
$$;

COMMENT ON FUNCTION public.avanco_da_filha(uuid) IS
  'Quanto UMA filha avancou, espelhando subAvanco de lib/activityProgress.ts: pela COLUNA dela, um nivel so, sem recursar na subarvore. NULL = fora da media (cancelada, ou espera sem congelado).';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) derivar_do_pai -- so a parte do PROGRESSO muda
--
-- Horas, custo, datas e contagem seguem identicos: foram medidos em 581 pais
-- e batem com a tela (docs/medicoes/antes-da-fase09-26-08-2026.md).
--
-- O progresso passa a ser a MEDIA SIMPLES do avanco das filhas -- nao mais
-- ponderada por horas. A tela nunca ponderou, e o motivo esta registrado: so
-- 48% das atividades tem horas preenchidas, e ponderar por um campo ausente em
-- metade da base produz numero pior. Ponderar aqui e nao la era exatamente a
-- divergencia.
--
-- Marco continua com peso ZERO em horas e custo; no progresso ele ENTRA, como
-- 0 ou 100, porque e assim que a tela faz (`subAvanco` trata marco antes de
-- tudo). Se um dia o marco sair do progresso, sai nos dois lugares.
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
  v_filhas  int;
BEGIN
  IF p_pai IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                      ELSE COALESCE(f.derived_hours, f.hours, 0) END), 0),
    COALESCE(SUM(CASE WHEN f.is_milestone THEN 0
                      ELSE COALESCE(f.derived_cost, f.cost, 0) END), 0),
    MIN(COALESCE(f.derived_start, f.start_date)),
    MAX(COALESCE(f.derived_end, f.end_date)),
    -- MEDIA SIMPLES do avanco, ignorando quem devolve NULL (cancelada, ou
    -- espera sem congelado). Se TODAS devolverem NULL, COALESCE segura em 0 --
    -- mas o caso e o mesmo da tela: nao ha trabalho mensuravel ali.
    --
    -- ROUND sem casas: a tela aplica `clampPercent` (Math.round) na media
    -- tambem, nao so em cada coluna. Arredondar em 2 casas aqui deixaria
    -- 62.5 onde a tela mostra 63.
    COALESCE(ROUND(AVG(public.avanco_da_filha(f.id))), 0),
    COUNT(*)
  INTO v_horas, v_custo, v_inicio, v_fim, v_prog, v_filhas
  FROM public.activities f
  WHERE f.parent_id = p_pai
    AND f.is_trashed = false;

  IF v_filhas = 0 THEN
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
     AND (derived_hours    IS DISTINCT FROM v_horas
       OR derived_cost     IS DISTINCT FROM v_custo
       OR derived_start    IS DISTINCT FROM v_inicio
       OR derived_end      IS DISTINCT FROM v_fim
       OR derived_progress IS DISTINCT FROM v_prog
       OR derived_children IS DISTINCT FROM v_filhas);
END;
$$;

COMMENT ON FUNCTION public.derivar_do_pai(uuid) IS
  'Deriva horas, custo, janela, progresso e contagem de UM pai. O progresso usa a MESMA regua da tela: credito parcial por posicao de coluna, media simples. Marco: fora de horas/custo, dentro das datas e do progresso (0 ou 100).';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Recalcular TODA a arvore, de baixo para cima
--
-- Sem isto os valores antigos (regua binaria) ficam congelados: a trigger so
-- dispara em escrita nova. De baixo para cima porque o pai le o derivado da
-- filha -- fazer na ordem errada propaga numero velho.
--
-- Guard: derivar_do_pai faz UPDATE em activities. A regua nova muda o
-- derived_progress de pais em projeto concluido tambem, e o trigger de projeto
-- concluido abortaria (mesma razao do guard da fase09). Religado apos o loop.
-- ───────────────────────────────────────────────────────────────────────────
SET session_replication_role = replica;

DO $$
DECLARE
  v_id    uuid;
  v_total int := 0;
BEGIN
  FOR v_id IN
    WITH RECURSIVE prof AS (
      SELECT a.id, a.parent_id, 0 AS nivel
        FROM public.activities a
       WHERE a.parent_id IS NULL AND a.is_trashed = false
      UNION ALL
      SELECT f.id, f.parent_id, p.nivel + 1
        FROM public.activities f
        JOIN prof p ON f.parent_id = p.id
       WHERE f.is_trashed = false AND p.nivel < 10
    )
    SELECT pr.id FROM prof pr
     WHERE EXISTS (SELECT 1 FROM public.activities c
                    WHERE c.parent_id = pr.id AND c.is_trashed = false)
     ORDER BY pr.nivel DESC
  LOOP
    PERFORM public.derivar_do_pai(v_id);
    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE 'recalculados % pais, de baixo para cima', v_total;
END $$;

-- Religa os triggers de negocio.
SET session_replication_role = origin;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Verificacao
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sem_prog int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='percentual_da_coluna') THEN
    RAISE EXCEPTION 'percentual_da_coluna nao foi criada';
  END IF;

  -- Nenhum pai com filhas pode ficar sem progresso derivado.
  SELECT count(*) INTO v_sem_prog
    FROM public.activities a
   WHERE a.is_trashed = false
     AND EXISTS (SELECT 1 FROM public.activities c
                  WHERE c.parent_id = a.id AND c.is_trashed = false)
     AND a.derived_progress IS NULL;

  IF v_sem_prog > 0 THEN
    RAISE EXCEPTION '% pais com filhas ficaram sem derived_progress', v_sem_prog;
  END IF;

  RAISE NOTICE 'ok -- todos os pais com filhas tem derived_progress';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- NOTA SOBRE A APROXIMACAO QUE SOBROU
--
-- `categoryFromLegacyFlags` termina em `suggestCategoryFromTitle(title)`, que
-- le o NOME da coluna ("A Fazer" -> a_iniciar, "Em Andamento" -> andamento).
-- Aqui isso vira `ELSE 'andamento'`.
--
-- Portar a leitura de titulo para SQL seria copiar uma lista de sinonimos que
-- muda no front sem avisar o banco -- e a divergencia voltaria pela porta que
-- esta migration esta fechando.
--
-- ALCANCE, conferido em 26/08: das 309 colunas da base, ZERO estao sem
-- `categoria` preenchida. O ramo legado nao e alcancado por nenhuma coluna
-- hoje; ele existe para quadro criado antes do backfill. Se um dia alguem
-- criar coluna sem categoria, o efeito e ela contar como 'andamento' -- e o
-- mesmo palpite que o front faria na ausencia de titulo reconhecivel.
-- ───────────────────────────────────────────────────────────────────────────
