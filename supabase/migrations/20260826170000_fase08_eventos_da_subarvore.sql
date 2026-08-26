-- FASE 08 -- O FEED DO PAI AGREGA OS EVENTOS DAS FILHAS
--
-- ============================================================================
-- O PEDIDO
--
--   "todo o historico da atividade e as regras entrelacadas entre a atividade
--    principal e suas subatividades"
--
-- Hoje o Registro le so a propria atividade (`activityId`). O contador do sino
-- funciona -- conversa e historico -- mas o feed que JUNTA pai e filhas nao
-- existe.
--
-- ============================================================================
-- POR QUE UMA VIEW, E NAO UMA TABELA NOVA
--
-- A fase 08 previa `activity_events`. Ao conferir a base, uma tabela nova seria
-- um TERCEIRO lugar guardando o que ja esta em dois:
--
--   - `audit_log`        -- 22.557 linhas de `activities`, com operacao, campos
--                           alterados, autor e instante
--   - `activity_comments`-- a conversa, com autor e instante
--
-- Uma tabela exigiria um caminho de escrita novo em cada ponto que hoje grava
-- nessas duas -- e todo ponto esquecido vira evento que nunca aparece, sem erro
-- nenhum. Pior: os eventos ANTIGOS nao existiriam nela, e o feed nasceria vazio.
--
-- A view resolve as duas coisas que a fase 08 pedia da tabela:
--   1. um lugar unico que responde "o que aconteceu nesta subarvore, em ordem
--      de tempo", com tipo e autor ja resolvidos;
--   2. sem lista de ids na URL -- a recursao roda no banco, entao nao esbarra
--      no teto de ~3,7 KB do proxy (o motivo de `chunkedIn` existir).
--
-- Se um dia houver evento que NAO seja escrita nem comentario (ex.: "fulano
-- abriu"), ai sim entra uma tabela -- e esta view passa a fazer UNION com ela,
-- sem que nenhuma tela mude.
--
-- ============================================================================
-- A RESTRICAO QUE ELA PRECISA RESPEITAR
--
-- O feed agregado e uma PORTA DE LEITURA. Quem entra por atribuicao nao enxerga
-- as irmas, e o feed nao pode ser o caminho lateral -- nem como "alguem alterou
-- algo". Por isso:
--
--   - `security_invoker = true` de proposito, AO CONTRARIO das views da fase 02.
--     A breadcrumb precisa furar a RLS (e uma fresta controlada, com codigo,
--     nome e tipo). O feed NAO: ele carrega texto de comentario e valor de
--     campo, entao tem de passar pela RLS de quem consulta.
--
--   - a recursao desce por `parent_id` sobre `activities`, que ja e filtrada
--     pela policy de SELECT. Filha invisivel nao entra na arvore, e portanto
--     nao entra no feed.
--
-- E a mesma razao pela qual `activity_breadcrumb` nao carrega feed: um feed na
-- trilha reabriria o vazamento por outra porta.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) A subarvore de uma atividade
--
-- Devolve a propria e todas as descendentes VIVAS, com a profundidade. Como
-- roda sobre `activities`, herda a RLS de quem chama.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.subarvore_da_atividade(_raiz uuid)
RETURNS TABLE (id uuid, profundidade int, wbs_code text, title text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE arvore AS (
    SELECT a.id, 0 AS profundidade, a.wbs_code, a.title
      FROM public.activities a
     WHERE a.id = _raiz
       AND a.is_trashed = false
    UNION ALL
    SELECT f.id, t.profundidade + 1, f.wbs_code, f.title
      FROM public.activities f
      JOIN arvore t ON f.parent_id = t.id
     WHERE f.is_trashed = false
       -- Teto de profundidade: ciclo em `parent_id` nao deveria existir (ha
       -- validacao no front), mas recursao sem teto trava o banco, nao a tela.
       AND t.profundidade < 10
  )
  SELECT * FROM arvore;
$$;

COMMENT ON FUNCTION public.subarvore_da_atividade(uuid) IS
  'A atividade e suas descendentes vivas, com profundidade. Roda sobre activities, entao herda a RLS de quem chama: filha invisivel nao aparece.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) A view do feed
--
-- Une historico (audit_log) e conversa (activity_comments) numa linha do tempo
-- so. NAO agrega sozinha: quem consulta passa a raiz e faz o JOIN com a
-- subarvore -- assim a mesma view serve o feed de UMA atividade (raiz = ela) e
-- o do pai (raiz = pai).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.activity_feed_events AS
  -- ── Conversa ──
  SELECT
    c.activity_id                       AS activity_id,
    'comentario'::text                  AS tipo,
    c.id                                AS evento_id,
    c.created_at                        AS ocorrido_em,
    COALESCE(p.full_name, c.author)     AS autor,
    c.created_by                        AS autor_id,
    NULL::text                          AS campo,
    left(c.content, 280)                AS resumo
  FROM public.activity_comments c
  LEFT JOIN public.profiles p ON p.id = c.created_by
  WHERE c.is_trashed = false

  UNION ALL

  -- ── Historico ──
  --
  -- `changed_fields` e a lista de colunas alteradas. Uma linha por campo seria
  -- mais granular, mas tambem transformaria um salvamento de formulario em oito
  -- linhas de feed -- ruido. Uma linha por escrita, com os campos juntos.
  SELECT
    a.record_id                         AS activity_id,
    CASE a.operation
      WHEN 'INSERT' THEN 'criacao'
      WHEN 'DELETE' THEN 'exclusao'
      ELSE 'alteracao'
    END::text                           AS tipo,
    a.id                                AS evento_id,
    a.created_at                        AS ocorrido_em,
    COALESCE(p.full_name, a.changed_by_email) AS autor,
    a.changed_by                        AS autor_id,
    array_to_string(a.changed_fields, ', ') AS campo,
    NULL::text                          AS resumo
  FROM public.audit_log a
  LEFT JOIN public.profiles p ON p.id = a.changed_by
  WHERE a.table_name = 'activities';

-- SECURITY_INVOKER = TRUE, DE PROPOSITO.
--
-- As views da fase 02 (breadcrumb, dependency_card) sao `invoker = false`: elas
-- precisam furar a RLS porque sao frestas controladas -- so codigo, nome e tipo.
--
-- Esta carrega TEXTO DE COMENTARIO e valor de campo. Se rodasse como owner,
-- quem entra por atribuicao leria a conversa das irmas invisiveis -- o furo que
-- a P00 fecha, reaberto por outra porta.
ALTER VIEW public.activity_feed_events SET (security_invoker = true);

COMMENT ON VIEW public.activity_feed_events IS
  'Historico + conversa de atividades numa linha do tempo. security_invoker=true de proposito: carrega texto, entao passa pela RLS de quem consulta.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) O feed agregado de uma raiz
--
-- E o que a tela chama. Junta a subarvore com os eventos e devolve ja
-- ordenado, com o codigo EAP da filha para o prefixo do item.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.feed_da_subarvore(
  _raiz  uuid,
  _limit int DEFAULT 50,
  _antes timestamptz DEFAULT NULL
)
RETURNS TABLE (
  activity_id  uuid,
  wbs_code     text,
  titulo       text,
  ehRaiz       boolean,
  tipo         text,
  evento_id    uuid,
  ocorrido_em  timestamptz,
  autor        text,
  autor_id     uuid,
  campo        text,
  resumo       text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    e.activity_id,
    s.wbs_code,
    s.title,
    (s.profundidade = 0) AS ehRaiz,
    e.tipo,
    e.evento_id,
    e.ocorrido_em,
    e.autor,
    e.autor_id,
    e.campo,
    e.resumo
  FROM public.subarvore_da_atividade(_raiz) s
  JOIN public.activity_feed_events e ON e.activity_id = s.id
  WHERE (_antes IS NULL OR e.ocorrido_em < _antes)
  ORDER BY e.ocorrido_em DESC
  LIMIT LEAST(COALESCE(_limit, 50), 200);
$$;

COMMENT ON FUNCTION public.feed_da_subarvore(uuid, int, timestamptz) IS
  'O feed do pai agregando as filhas: subarvore + eventos, em ordem de tempo, com o wbs_code da filha para prefixar. Pagina por _antes (keyset), nao por OFFSET.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Verificacao -- falha alto se a view virar owner
--
-- O modo de esta migration causar dano nao e erro de sintaxe: e alguem
-- recriar a view sem `security_invoker`, e o feed passar a vazar a conversa
-- das irmas invisiveis. Silenciosamente.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_opts text;
BEGIN
  SELECT COALESCE(c.reloptions::text, '') INTO v_opts
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'activity_feed_events';

  IF v_opts NOT LIKE '%security_invoker=true%' THEN
    RAISE EXCEPTION 'activity_feed_events precisa de security_invoker=true -- sem isso o feed entrega a conversa das irmas invisiveis';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'feed_da_subarvore'
  ) THEN
    RAISE EXCEPTION 'feed_da_subarvore nao foi criada';
  END IF;

  -- As funcoes nao podem ser SECURITY DEFINER: seriam a mesma porta lateral.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('feed_da_subarvore','subarvore_da_atividade')
       AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'feed_da_subarvore/subarvore_da_atividade nao podem ser SECURITY DEFINER -- o feed tem de passar pela RLS de quem consulta';
  END IF;
END $$;
