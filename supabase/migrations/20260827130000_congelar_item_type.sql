-- CONGELAR item_type NO QUE A TELA JA MOSTRA
--
-- ============================================================================
-- A DECISAO (Raphael, 27/08/2026) — e por que nenhuma das tres saidas medidas
--
-- A medicao de 27/08 (docs/medicoes/tipo-gravado-vs-posicao-27-08-2026.md)
-- perguntou, das 818 linhas em que o gravado discorda do exibido, qual dos dois
-- bate com a posicao na arvore. A resposta:
--
--   o gravado esta certo ......  84   11%
--   o deduzido esta certo ..... 319   42%
--   nenhum dos dois ........... 358   47%
--
-- E a propria medicao registra o limite dela: nao havia arbitro. A "posicao na
-- arvore" nao e verdade externa — e uma terceira heuristica, escrita a partir
-- da secao 07 do desenho. Entao "o deduzido esta certo em 42%" quer dizer, com
-- precisao, que DUAS HEURISTICAS CONCORDAM em 42% dos casos.
--
-- Nao se escolhe entre heuristicas sem arbitro. Escolhe-se outro criterio:
--
--   GRAVAR O QUE A TELA JA MOSTRA.
--
-- Nao e regra nova. E a FOTO do estado atual — o valor que `resolveEapKind`
-- produz hoje, com o `hasChildren` REAL. Consequencias:
--
--   * ninguem ve nada mudar no dia seguinte; nenhum relatorio muda de numero;
--   * os 232 "fase sem filha nenhuma" se resolvem sozinhos: sem filha, a
--     deducao ja os classifica como atividade, que e o que eles sao;
--   * os 319 em que o deduzido acerta continuam certos;
--   * os 2.076 que mudavam conforme a tela param de mudar;
--   * e o defeito fatal morre: criar uma subatividade deixa de mudar o tipo de
--     alguem.
--
-- O CUSTO, declarado: 84 linhas em que o gravado batia com a posicao e o
-- congelamento passa por cima. Elas NAO sao corrigidas aqui — viram lista de
-- revisao humana em docs/medicoes/tipos-a-revisar-27-08-2026.md. Congelar erra
-- em 84 linhas conhecidas e listadas; qualquer outra saida erra em centenas,
-- sem lista.
--
-- ============================================================================
-- hasChildren REAL — o ponto que faz esta migration existir
--
-- Duas telas chamam `resolveEapKind` passando CONSTANTE em vez do valor real:
--
--   src/components/ActivityDetailPanel.tsx:77
--   src/components/ProjectCronogramaPanel.tsx:3156
--
-- Congelar o que ELAS mostram propagaria o defeito para dentro do banco. O que
-- se congela e o valor com o `hasChildren` de verdade — existe alguma linha
-- apontando `parent_id` para esta?
--
-- A lixeira ENTRA de proposito: restaurar uma filha descartada nao pode mudar o
-- tipo do pai. A unica exclusao e o item apagado em definitivo, que nao existe
-- mais na tabela.
--
-- ============================================================================
-- A TRADUCAO DE resolveEapKind PARA SQL — src/lib/eapModel.ts:271
--
--   if (is_milestone)                    -> marco
--   agrupa = item_type IN (fase,pacote) OR hasChildren
--   level  = eapLevel(wbs_code)          -- null se nao for 1, 1.2, 1.2.3
--   se level existe:
--     level = 2 (EAP_FASE_LEVEL)         -> fase
--     level = 1 (EAP_PROJECT_LEVEL)      -> projeto
--     level = 3 (EAP_PACOTE_LEVEL)       -> entrega   (por posicao, nao agrupa)
--     senao                              -> agrupa ? entrega : atividade
--   sem level:                           -> agrupa ? entrega : atividade
--
-- `eapLevel` tem duas sutilezas que a traducao precisa honrar:
--   1. so numeracao pontuada conta — "Anexo A" devolve null;
--   2. zeros decorativos a direita caem: "1.0" e nivel 1, nao 2. Sem isso a
--      fase do topo de uma EAP exportada de planilha viraria atividade.
--
-- ============================================================================
-- METADADO, PERGUNTADO AO ESQUEMA
--
-- Regra permanente desde 27/08: para saber se uma coluna aceita NULL, qual o
-- tipo, se existe — pergunte ao catalogo, NUNCA ao dado, e nunca escrevendo em
-- producao. Por isso a checagem abaixo le `information_schema`, que aqui dentro
-- esta disponivel (o PostgREST nao o expoe: PGRST106).
--
-- O que ja se sabe do schema OpenAPI:
--   item_type    text  NOT NULL  default 'atividade'
--   wbs_code     text  aceita NULL
--   is_milestone bool  NOT NULL  default false
--
-- `item_type` ser NOT NULL importa: o congelamento nunca pode produzir vazio.
--
-- ROLLBACK: 20260827130001 — devolve o valor pela coluna sombra.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) O esquema e o que eu penso que e?
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE
  v_nullable text;
  v_tipo     text;
BEGIN
  SELECT is_nullable, data_type INTO v_nullable, v_tipo
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'activities'
     AND column_name = 'item_type';

  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'activities.item_type nao existe';
  END IF;
  IF v_nullable <> 'NO' THEN
    RAISE EXCEPTION 'esperava item_type NOT NULL, veio is_nullable=%', v_nullable;
  END IF;

  RAISE NOTICE 'item_type: % / NOT NULL — confere', v_tipo;
END $chk$;

-- ---------------------------------------------------------------------------
-- 1) A COLUNA SOMBRA — antes de escrever qualquer coisa
--
-- Guarda o item_type anterior linha a linha. Sem ela o congelamento e
-- irreversivel: o valor antigo nao esta em lugar nenhum, e as 84 linhas da
-- lista de revisao humana precisam poder ser conferidas contra o que havia.
--
-- Preenchida para TODAS as linhas, nao so para as que mudam — "esta linha nao
-- mudou" tambem e informacao, e sem ela o rollback teria de adivinhar.
-- ---------------------------------------------------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS item_type_antes_congelar text;

COMMENT ON COLUMN public.activities.item_type_antes_congelar IS
  'O item_type que existia antes da migration 20260827130000 congelar o tipo exibido. Existe para reverter e para conferir as 84 linhas da lista de revisao. Nunca reescrita depois.';

UPDATE public.activities
   SET item_type_antes_congelar = item_type
 WHERE item_type_antes_congelar IS NULL;

-- ---------------------------------------------------------------------------
-- 2) O ANTES, com numeros
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS _congelar_antes;
CREATE TEMP TABLE _congelar_antes AS
  SELECT item_type, count(*) AS n FROM public.activities GROUP BY item_type;

DO $antes$
DECLARE r record; v_total int;
BEGIN
  SELECT count(*) INTO v_total FROM public.activities;
  RAISE NOTICE '--- ANTES (% linhas) ---', v_total;
  FOR r IN SELECT item_type, n FROM _congelar_antes ORDER BY n DESC LOOP
    RAISE NOTICE '  % : %', rpad(COALESCE(r.item_type, '(null)'), 12), r.n;
  END LOOP;
END $antes$;

-- ---------------------------------------------------------------------------
-- 3) A FUNCAO — resolveEapKind em SQL
--
-- IMMUTABLE de proposito: depende so dos argumentos. `tem_filhas` entra como
-- parametro em vez de ser consultado aqui dentro, para que a funcao continue
-- pura e possa ser usada em CHECK ou indice depois, se um dia for preciso.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eap_nivel_do_codigo(p_wbs text)
RETURNS int
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_raw   text := btrim(COALESCE(p_wbs, ''));
  v_parts text[];
  v_n     int;
BEGIN
  IF v_raw = '' THEN RETURN NULL; END IF;
  -- Espelha /^\d+(\.\d+)*$/ — "Anexo A" nao define nivel.
  IF v_raw !~ '^[0-9]+(\.[0-9]+)*$' THEN RETURN NULL; END IF;

  v_parts := string_to_array(v_raw, '.');
  v_n     := array_length(v_parts, 1);

  -- Zeros decorativos a direita caem: "1.0" e nivel 1.
  WHILE v_n > 1 AND v_parts[v_n] = '0' LOOP
    v_parts := v_parts[1:v_n - 1];
    v_n     := v_n - 1;
  END LOOP;

  RETURN v_n;
END $fn$;

COMMENT ON FUNCTION public.eap_nivel_do_codigo(text) IS
  'Espelha eapLevel() de src/lib/eapModel.ts. Se divergirem, o TypeScript e a fonte — esta e a copia.';

CREATE OR REPLACE FUNCTION public.eap_tipo_exibido(
  p_item_type    text,
  p_wbs_code     text,
  p_is_milestone boolean,
  p_tem_filhas   boolean
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $fn$
DECLARE
  v_t      text := lower(btrim(COALESCE(p_item_type, '')));
  v_agrupa boolean;
  v_level  int;
BEGIN
  IF COALESCE(p_is_milestone, false) THEN RETURN 'marco'; END IF;

  v_agrupa := (v_t IN ('fase', 'pacote')) OR COALESCE(p_tem_filhas, false);
  v_level  := public.eap_nivel_do_codigo(p_wbs_code);

  IF v_level IS NOT NULL THEN
    IF v_level = 2 THEN RETURN 'fase';    END IF;  -- EAP_FASE_LEVEL
    IF v_level = 1 THEN RETURN 'projeto'; END IF;  -- EAP_PROJECT_LEVEL
    IF v_level = 3 THEN RETURN 'entrega'; END IF;  -- EAP_PACOTE_LEVEL, por posicao
  END IF;

  RETURN CASE WHEN v_agrupa THEN 'entrega' ELSE 'atividade' END;
END $fn$;

COMMENT ON FUNCTION public.eap_tipo_exibido(text, text, boolean, boolean) IS
  'Espelha resolveEapKind() de src/lib/eapModel.ts:271. Se divergirem, o TypeScript e a fonte.';

-- ---------------------------------------------------------------------------
-- 4) O CONGELAMENTO
--
-- `tem_filhas` sai de um EXISTS sobre parent_id, sem filtrar is_trashed: filha
-- na lixeira volta, e o pai nao pode trocar de tipo quando ela voltar.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS _congelar_alvo;
CREATE TEMP TABLE _congelar_alvo AS
  SELECT a.id,
         a.item_type AS de,
         public.eap_tipo_exibido(
           a.item_type, a.wbs_code, a.is_milestone,
           EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = a.id)
         ) AS para
    FROM public.activities a;

UPDATE public.activities a
   SET item_type = t.para
  FROM _congelar_alvo t
 WHERE t.id = a.id
   AND t.para IS DISTINCT FROM a.item_type;

-- ---------------------------------------------------------------------------
-- 5) O DEPOIS, e a falha alta
-- ---------------------------------------------------------------------------
DO $depois$
DECLARE
  r         record;
  v_mudou   int;
  v_igual   int;
  v_vazios  int;
  v_diverge int;
BEGIN
  SELECT count(*) FILTER (WHERE de IS DISTINCT FROM para),
         count(*) FILTER (WHERE de IS NOT DISTINCT FROM para)
    INTO v_mudou, v_igual
    FROM _congelar_alvo;

  RAISE NOTICE '--- MUDANCA ---';
  RAISE NOTICE '  linhas alteradas : %', v_mudou;
  RAISE NOTICE '  linhas iguais    : %', v_igual;

  RAISE NOTICE '--- DE -> PARA ---';
  FOR r IN SELECT de, para, count(*) AS n FROM _congelar_alvo
            WHERE de IS DISTINCT FROM para
            GROUP BY de, para ORDER BY n DESC LOOP
    RAISE NOTICE '  % -> % : %', rpad(COALESCE(r.de, '(null)'), 10), rpad(r.para, 10), r.n;
  END LOOP;

  RAISE NOTICE '--- DEPOIS ---';
  FOR r IN SELECT item_type, count(*) AS n FROM public.activities
            GROUP BY item_type ORDER BY n DESC LOOP
    RAISE NOTICE '  % : %', rpad(COALESCE(r.item_type, '(null)'), 12), r.n;
  END LOOP;

  -- item_type e NOT NULL: congelar nunca pode produzir vazio.
  SELECT count(*) INTO v_vazios
    FROM public.activities WHERE COALESCE(btrim(item_type), '') = '';
  IF v_vazios > 0 THEN
    RAISE EXCEPTION 'o congelamento deixou % linhas com item_type vazio', v_vazios;
  END IF;

  -- A prova que importa: reaplicar nao muda mais nada. Se mudasse, a regra nao
  -- teria ponto fixo e o tipo voltaria a oscilar — que e o defeito que esta
  -- migration existe para matar.
  SELECT count(*) INTO v_diverge
    FROM public.activities a
   WHERE a.item_type IS DISTINCT FROM public.eap_tipo_exibido(
           a.item_type, a.wbs_code, a.is_milestone,
           EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = a.id));
  IF v_diverge > 0 THEN
    RAISE EXCEPTION 'nao convergiu: % linhas ainda divergem apos o congelamento', v_diverge;
  END IF;

  -- Sombra preenchida para todas, senao o rollback e parcial.
  SELECT count(*) INTO v_vazios
    FROM public.activities WHERE item_type_antes_congelar IS NULL;
  IF v_vazios > 0 THEN
    RAISE EXCEPTION 'a sombra ficou vazia em % linhas', v_vazios;
  END IF;

  RAISE NOTICE 'congelado. Ponto fixo confirmado: reaplicar nao muda nada.';
END $depois$;
