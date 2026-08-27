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

-- DUAS FUNCOES, NAO UMA — e a distincao e o coracao desta migration.
--
-- O congelamento tira uma FOTO do que a tela mostra HOJE, e a tela de hoje usa
-- a formula com o OR. Mas o codigo que vai LER o campo depois usa a formula sem
-- o OR (decisao de 27/08). Se a migration congelasse com a formula nova, ela
-- nao estaria congelando o que a tela mostra — estaria aplicando a regra nova
-- sobre o lixo da importacao, que e justamente a saida "C" que foi descartada.
--
--   eap_tipo_exibido_antigo  -> com o OR. So o backfill usa. E a FOTO.
--   eap_tipo_exibido         -> sem o OR. E a regra daqui para a frente.
--
-- A migration escreve com a primeira e VERIFICA com a segunda. Se as duas
-- discordarem sobre o resultado ja gravado, o backfill nao tem ponto fixo e a
-- migration falha alto — e foi exatamente isso que a prova do passo 3 mediu
-- antes de aplicar: 14 linhas, listadas em
-- docs/medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md, aceitas por decisao.
--
-- Como sao aceitas, o backfill precisa convergir NELAS tambem — e converge,
-- porque o passo 4 abaixo reaplica ate o ponto fixo.

CREATE OR REPLACE FUNCTION public.eap_tipo_exibido_antigo(
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

  -- COM o OR: a formula que a tela usava ate 27/08/2026.
  v_agrupa := (v_t IN ('fase', 'pacote')) OR COALESCE(p_tem_filhas, false);
  v_level  := public.eap_nivel_do_codigo(p_wbs_code);

  IF v_level IS NOT NULL THEN
    IF v_level = 2 THEN RETURN 'fase';    END IF;  -- EAP_FASE_LEVEL
    IF v_level = 1 THEN RETURN 'projeto'; END IF;  -- EAP_PROJECT_LEVEL
    IF v_level = 3 THEN RETURN 'entrega'; END IF;  -- EAP_PACOTE_LEVEL, por posicao
  END IF;

  RETURN CASE WHEN v_agrupa THEN 'entrega' ELSE 'atividade' END;
END $fn$;

COMMENT ON FUNCTION public.eap_tipo_exibido_antigo(text, text, boolean, boolean) IS
  'A formula ANTIGA (com OR hasChildren), que a tela usava ate 27/08/2026. Existe so para o backfill da migration 20260827130000 tirar a foto do estado atual. Nao usar em codigo novo.';

CREATE OR REPLACE FUNCTION public.eap_tipo_exibido(
  p_item_type    text,
  p_wbs_code     text,
  p_is_milestone boolean,
  p_tem_filhas   boolean DEFAULT false
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

  -- SEM o OR: leitura pura do campo. `p_tem_filhas` e ignorado de proposito e
  -- fica na assinatura pelo mesmo motivo do TypeScript — documenta que ter
  -- filhas NAO decide mais o papel de ninguem.
  v_agrupa := v_t IN ('fase', 'entrega', 'pacote');
  v_level  := public.eap_nivel_do_codigo(p_wbs_code);

  IF v_level IS NOT NULL THEN
    IF v_level = 2 THEN RETURN 'fase';    END IF;  -- EAP_FASE_LEVEL
    IF v_level = 1 THEN RETURN 'projeto'; END IF;  -- EAP_PROJECT_LEVEL
    IF v_level = 3 THEN RETURN 'entrega'; END IF;  -- EAP_PACOTE_LEVEL, por posicao
  END IF;

  RETURN CASE WHEN v_agrupa THEN 'entrega' ELSE 'atividade' END;
END $fn$;

COMMENT ON FUNCTION public.eap_tipo_exibido(text, text, boolean, boolean) IS
  'Espelha resolveEapKind() de src/lib/eapModel.ts. Le item_type, nao deduz de hasChildren. Se divergirem, o TypeScript e a fonte.';

-- ---------------------------------------------------------------------------
-- 4) O CONGELAMENTO
--
-- `tem_filhas` sai de um EXISTS sobre parent_id, sem filtrar is_trashed: filha
-- na lixeira volta, e o pai nao pode trocar de tipo quando ela voltar.
--
-- PRIMEIRA PASSADA — a foto, com a formula ANTIGA. E o que a tela mostra hoje.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS _congelar_alvo;
CREATE TEMP TABLE _congelar_alvo AS
  SELECT a.id,
         a.item_type AS de,
         public.eap_tipo_exibido_antigo(
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
-- 4b) ATE O PONTO FIXO, ja pela formula NOVA
--
-- Os 14 itens aceitos na decisao do passo 3 nao convergem em uma passada: eram
-- `item_type='fase'` sem codigo e sem filhas, exibiam "Entrega", e ao gravar
-- 'entrega' deixam de casar com o IN e passam a 'atividade'. Uma passada so
-- pararia com o campo dizendo 'entrega' e a leitura devolvendo 'atividade' —
-- exatamente a divergencia que o congelamento existe para eliminar.
--
-- O laco reaplica a REGRA NOVA ate nao mudar mais nada. Converge rapido porque
-- cada passada so pode mover um item para "menos agrupador", nunca de volta.
-- O teto de 10 e um freio de seguranca: se nao convergir em 10, ha ciclo, e
-- ciclo aqui seria defeito de regra, nao de dado.
-- ---------------------------------------------------------------------------
DO $ponto_fixo$
DECLARE
  v_voltas int := 0;
  v_mudou  int;
BEGIN
  LOOP
    UPDATE public.activities a
       SET item_type = public.eap_tipo_exibido(
             a.item_type, a.wbs_code, a.is_milestone,
             EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = a.id))
     WHERE a.item_type IS DISTINCT FROM public.eap_tipo_exibido(
             a.item_type, a.wbs_code, a.is_milestone,
             EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = a.id));

    GET DIAGNOSTICS v_mudou = ROW_COUNT;
    v_voltas := v_voltas + 1;
    RAISE NOTICE '  ponto fixo, volta %: % linhas', v_voltas, v_mudou;

    EXIT WHEN v_mudou = 0;
    IF v_voltas >= 10 THEN
      RAISE EXCEPTION 'nao convergiu em % voltas — ha ciclo na regra de tipo', v_voltas;
    END IF;
  END LOOP;
END $ponto_fixo$;

-- ---------------------------------------------------------------------------
-- 4c) O TRIGGER DE ANINHAMENTO PRECISA APRENDER OS VALORES NOVOS
--
-- Isto nao e detalhe: sem este passo, o congelamento QUEBRA A ARVORE.
--
-- `eap_is_group` (migration 20260722160000) decide quem pode ter filhos, e a
-- lista dela e ('fase', 'pacote', 'historia_usuario'). O congelamento passa a
-- gravar 'entrega' e 'projeto', que nao estao la. O efeito, medido antes de
-- aplicar:
--
--   PAIS que o trigger passaria a RECUSAR ... 1.272
--     item_type = 'entrega' ................. 1.256
--     item_type = 'projeto' .................    16
--
-- Ninguem conseguiria criar nem mover uma subatividade sob nenhum deles. O
-- erro apareceria como "Aninhamento EAP invalido: uma entrega nao pode conter
-- subitens" — uma frase que, depois desta migration, seria simplesmente falsa.
--
-- O teste de ponto fixo NAO pega isto: o trigger so dispara em escrita, e o
-- backfill nao insere nem move nada. So aparece quando um usuario tenta
-- trabalhar — que e o pior momento para descobrir.
--
-- 'projeto' entra na lista pelo mesmo motivo que 'fase': e a raiz da EAP, e a
-- raiz tem filhas por definicao.
--
-- ============================================================================
-- E 'ATIVIDADE' TAMBEM ENTRA — SO MARCO E FOLHA (decisao de 27/08/2026)
--
-- A regra deixa de ser uma LISTA de quem agrupa e passa a ser uma EXCECAO: todo
-- item pode ter filha, menos marco.
--
-- POR QUE: o desenho inteiro depende de subatividade sob atividade — e o corpo
-- da tela nova, o botao "+ Subatividade", o total derivado das filhas. Foi o
-- primeiro pedido do Raphael. Hoje o banco proibe, e por isso existem ZERO.
--
-- ISSO SO DEIXOU DE SER ARRISCADO COM O CONGELAMENTO. Enquanto o papel era
-- deduzido de `hasChildren`, deixar uma atividade ter filha a transformava em
-- agrupador no mesmo instante: ela sumia do quadro, virava faixa e deixava de
-- ser arrastavel, sem ninguem ter decidido. Agora o tipo e gravado — uma
-- Atividade com filhas continua Atividade, continua no quadro, continua com
-- responsavel e horas. So passa a ter os numeros vindos das filhas.
--
-- MEDIDO ANTES DE MUDAR:
--   atividades que sao pai HOJE .................    0  (o trigger impedia)
--   atividades que GANHAM a capacidade .......... 5.382
--   linhas alteradas por esta mudanca ...........    0
--
-- E permissao futura, nao migracao de dado. Nenhuma linha muda.
--
-- Auditado no codigo, nao so no banco: `activityProgress` ja usa a media das
-- filhas para qualquer pai (so `is_milestone` e excecao); a derivacao da fase
-- 09 filtra por `is_milestone`, nunca por `item_type`; o Backlog ja tinha o
-- caso previsto e comentado (selecao nao cascateia em atividade). A unica
-- regra que dependia de "atividade nunca tem filha" era
-- `ehAgrupadorDoQuadro`, que decidia por estrutura e passou a ler o tipo.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.eap_is_group(_item_type text, _is_milestone boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $grp$
  -- Marco e o unico que nunca tem filha. `_item_type` fica na assinatura
  -- porque ha chamadas existentes que o passam, e porque a pergunta "este tipo
  -- agrupa?" continua fazendo sentido — a resposta e que hoje todos agrupam.
  SELECT NOT COALESCE(_is_milestone, false);
$grp$;

COMMENT ON FUNCTION public.eap_is_group(text, boolean) IS
  'Quem pode ter filhos. Desde 27/08/2026 e uma excecao, nao uma lista: todo item agrupa, menos marco. Antes era IN (fase, pacote, historia_usuario), o que proibia subatividade sob atividade — e por isso existiam zero.';

-- As MENSAGENS do trigger tambem mudam: as duas diziam "so Pacote ou Fase
-- agrupam", e isso passou a ser falso. Mensagem de erro que descreve uma regra
-- que nao existe mais e pior que nenhuma — manda o usuario "marcar como Fase"
-- para resolver um problema que nao e esse.
CREATE OR REPLACE FUNCTION public.validate_activity_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $vah$
DECLARE
  parent_row public.activities%ROWTYPE;
  cursor_id uuid;
  hops int := 0;
BEGIN
  -- Regra 1: folha nao tem filhas. Desde 27/08/2026 a unica folha e o marco.
  IF NOT public.eap_is_group(NEW.item_type, NEW.is_milestone) AND EXISTS (
    SELECT 1 FROM public.activities WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Este item tem subitens, e marco e um ponto no tempo: nao agrupa. Desmarque Marco ou mova os subitens.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Uma atividade nao pode ser pai de si mesma.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO parent_row FROM public.activities WHERE id = NEW.parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atividade pai (%) nao encontrada.', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Regra 2: o pai precisa poder agrupar — ou seja, nao pode ser marco.
  IF NOT public.eap_is_group(parent_row.item_type, parent_row.is_milestone) THEN
    RAISE EXCEPTION 'Marco nao agrupa: escolha uma fase, entrega ou atividade como destino.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF parent_row.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'A atividade pai pertence a outro projeto.'
      USING ERRCODE = 'check_violation';
  END IF;

  cursor_id := NEW.parent_id;
  WHILE cursor_id IS NOT NULL AND hops < 1000 LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'parent_id criaria um ciclo na hierarquia.'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO cursor_id FROM public.activities WHERE id = cursor_id;
    hops := hops + 1;
  END LOOP;

  RETURN NEW;
END;
$vah$;

DO $conf_grp$
DECLARE v_ruins int;
BEGIN
  -- Nenhum pai existente pode estar fora da regra depois do congelamento.
  SELECT count(*) INTO v_ruins
    FROM public.activities p
   WHERE EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = p.id)
     AND NOT public.eap_is_group(p.item_type, p.is_milestone);

  IF v_ruins > 0 THEN
    RAISE EXCEPTION '% pais ficariam invalidos para o trigger de aninhamento', v_ruins;
  END IF;
  RAISE NOTICE 'aninhamento: todos os pais existentes continuam validos';
END $conf_grp$;

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
  -- Comparado contra a SOMBRA, nao contra a primeira passada: a sombra tem o
  -- valor com que a tabela comecou, e o laco do ponto fixo pode ter mexido
  -- depois. E o numero honesto de "quantas linhas esta migration alterou".
  SELECT count(*) FILTER (WHERE item_type IS DISTINCT FROM item_type_antes_congelar),
         count(*) FILTER (WHERE item_type IS NOT DISTINCT FROM item_type_antes_congelar)
    INTO v_mudou, v_igual
    FROM public.activities;

  RAISE NOTICE '--- MUDANCA ---';
  RAISE NOTICE '  linhas alteradas : %', v_mudou;
  RAISE NOTICE '  linhas iguais    : %', v_igual;

  RAISE NOTICE '--- DE -> PARA ---';
  FOR r IN SELECT item_type_antes_congelar AS de, item_type AS para, count(*) AS n
             FROM public.activities
            WHERE item_type IS DISTINCT FROM item_type_antes_congelar
            GROUP BY 1, 2 ORDER BY n DESC LOOP
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
