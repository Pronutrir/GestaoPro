-- ============================================================================
-- TESTE DE FUMACA DE ESCRITA — o que o banco ACEITA de verdade
--
-- Um teste que so LE nunca vai ver trigger. Este TENTA ESCREVER: insere filha,
-- move item e troca tipo, para uma amostra de cada valor de `item_type` que o
-- congelamento produz. Registra o que passou e o que foi recusado, e compara
-- com o que a TELA oferece.
--
-- TUDO DENTRO DE UMA TRANSACAO QUE TERMINA EM ROLLBACK. Nada fica gravado.
--
-- ----------------------------------------------------------------------------
-- POR QUE CADA TENTATIVA VIVE NUM BLOCO PROPRIO
--
-- Um erro em plpgsql aborta a transacao inteira. Sem o BEGIN...EXCEPTION em
-- volta de cada tentativa, o primeiro trigger que recusasse mataria o teste, e
-- as tentativas seguintes nem rodariam — o relatorio mostraria uma recusa e
-- ficaria calado sobre as outras vinte. Um bloco com EXCEPTION e um savepoint
-- implicito: ele desfaz so a tentativa que falhou.
--
-- As tentativas que PASSAM tambem precisam ser desfeitas, senao o proximo tipo
-- comeca com a arvore mexida. Nao da para usar SAVEPOINT explicito aqui: dentro
-- de um bloco com EXCEPTION o plpgsql recusa (SPI_ERROR_TRANSACTION), porque o
-- proprio bloco JA e um savepoint. Entao cada escrita que passa e desfeita a
-- mao, logo depois de registrada — o teste mede o banco como ele esta, nao como
-- ficou depois da tentativa anterior.
--
-- ----------------------------------------------------------------------------
-- O CONTRATO DA TELA, lido de src/lib/eapModel.ts em 27/08/2026
--
--   eapCanMoveInto      recusa: marco como destino, ciclo, item inexistente.
--                       Diz textualmente "escolha uma fase, entrega ou
--                       ATIVIDADE como destino" — a tela OFERECE atividade
--                       como pai.
--   eapMilestoneAllowed recusa marcar como Marco quem tem filhas.
--   O seletor de tipo   oferece os QUATRO papeis sempre; so Marco-com-filhas
--                       fica desabilitado. Todo o resto e aviso, nao bloqueio.
--
-- Onde o banco recusar o que a tela oferece, e a mesma familia do eap_is_group:
-- duas listas de regra que ninguem amarrou.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _fumaca (
  tipo     text,
  amostra  uuid,
  operacao text,
  aceitou  boolean,
  erro     text
) ON COMMIT DROP;

DO $fumaca$
DECLARE
  TIPOS text[] := ARRAY['projeto','fase','entrega','pacote','atividade','marco','historia_usuario'];
  v_tipo    text;
  v_alvo    uuid;
  v_projeto uuid;
  v_movel   uuid;
  v_pai_ant uuid;
  v_nova    uuid;
  v_erro    text;
  v_novo_t  text;
  v_tipo_real text;   -- o item_type gravado na cobaia; para 'marco' e 'atividade'
BEGIN
  FOREACH v_tipo IN ARRAY TIPOS LOOP

    -- ── a cobaia: um item REAL de cada tipo ────────────────────────────────
    -- Real, nao inventado: um item criado agora nao tem o codigo EAP, os
    -- filhos nem o historico que fazem os triggers se comportarem como em
    -- producao.
    IF v_tipo = 'marco' THEN
      SELECT id, project_id, item_type INTO v_alvo, v_projeto, v_tipo_real
        FROM public.activities
       WHERE is_milestone = true AND is_trashed = false
       ORDER BY id LIMIT 1;
    ELSE
      SELECT id, project_id, item_type INTO v_alvo, v_projeto, v_tipo_real
        FROM public.activities
       WHERE item_type = v_tipo AND COALESCE(is_milestone, false) = false
         AND is_trashed = false
       ORDER BY id LIMIT 1;
    END IF;

    IF v_alvo IS NULL THEN
      INSERT INTO _fumaca VALUES (v_tipo, NULL, '(nao existe na base)', NULL, NULL);
      CONTINUE;
    END IF;

    -- ── 1. INSERIR UMA FILHA ───────────────────────────────────────────────
    BEGIN
      INSERT INTO public.activities (project_id, title, item_type, parent_id, status)
      VALUES (v_projeto, '__fumaca__', 'atividade', v_alvo, 'pending')
      RETURNING id INTO v_nova;
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'inserir filha', true, NULL);
      DELETE FROM public.activities WHERE id = v_nova;   -- desfaz
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'inserir filha', false, v_erro);
    END;

    -- ── 2. MOVER UM ITEM PARA DEBAIXO DELE ─────────────────────────────────
    -- Uma folha do mesmo projeto, que nao seja o alvo nem ancestral dele —
    -- senao o que falharia seria a regra de CICLO, e nao a de aninhamento que
    -- se quer medir.
    BEGIN
      SELECT a.id INTO v_movel
        FROM public.activities a
       WHERE a.project_id = v_projeto AND a.id <> v_alvo
         AND COALESCE(a.is_milestone, false) = false
         AND a.is_trashed = false
         AND COALESCE(a.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_alvo
         AND NOT EXISTS (SELECT 1 FROM public.activities f WHERE f.parent_id = a.id)
       ORDER BY a.id LIMIT 1;

      IF v_movel IS NULL THEN
        INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'mover para dentro', NULL, 'sem item movivel no projeto');
      ELSE
        SELECT parent_id INTO v_pai_ant FROM public.activities WHERE id = v_movel;
        UPDATE public.activities SET parent_id = v_alvo WHERE id = v_movel;
        INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'mover para dentro', true, NULL);
        UPDATE public.activities SET parent_id = v_pai_ant WHERE id = v_movel;  -- desfaz
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'mover para dentro', false, v_erro);
    END;

    -- ── 3. TROCAR O TIPO ───────────────────────────────────────────────────
    -- Vira 'atividade' (folha) — a troca que a tela permite e que o trigger
    -- deve recusar quando o item tem filhas. Quem ja e atividade vira 'fase'.
    --
    -- `is_milestone` NAO e tocado aqui: mexer nos dois campos de uma vez faria
    -- duas mudancas numa tentativa so, e uma recusa nao diria qual delas o
    -- banco rejeitou. Virar marco e o caso 4, separado de proposito.
    v_novo_t := CASE WHEN v_tipo_real = 'atividade' THEN 'fase' ELSE 'atividade' END;
    BEGIN
      UPDATE public.activities
         SET item_type = v_novo_t
       WHERE id = v_alvo;
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo,
        'trocar tipo -> ' || v_novo_t, true, NULL);
      UPDATE public.activities SET item_type = v_tipo_real WHERE id = v_alvo; -- desfaz
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo,
        'trocar tipo -> ' || v_novo_t, false, v_erro);
    END;

    -- ── 4. VIRAR MARCO ─────────────────────────────────────────────────────
    -- A UNICA restricao que a tela declara bloquear (eapMilestoneAllowed).
    -- Se o item tem filhas, o banco tem de recusar — e a tela promete isso.
    IF v_tipo = 'marco' THEN
      -- A cobaia JA e marco: "virar marco" nao testaria nada. Registrar como
      -- nao-aplicavel e melhor que um ACEITOU que so quer dizer "nada mudou".
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'virar marco', NULL, 'ja e marco');
      CONTINUE;
    END IF;
    BEGIN
      UPDATE public.activities SET is_milestone = true WHERE id = v_alvo;
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'virar marco', true, NULL);
      UPDATE public.activities SET is_milestone = false WHERE id = v_alvo;  -- desfaz
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
      INSERT INTO _fumaca VALUES (v_tipo, v_alvo, 'virar marco', false, v_erro);
    END;

  END LOOP;
END $fumaca$;

-- ── CONDICAO 3 (27/08): nivel-1 ATIVIDADE na RAIZ pode receber filha? ────────
-- O congelamento gera 'atividade' de nivel 1 com parent null -- "trabalho na
-- raiz", que o desenho nao preve para item novo mas existe no dado legado (os 9
-- de nivel-1 sem filha viram atividade). Com eap_is_group = NOT is_milestone, o
-- banco tem de ACEITAR a insercao de filha sob ela. Projeto NAO concluido de
-- proposito: la o trigger de concluido recusaria antes do de aninhamento, e o
-- que se quer medir aqui e SO o aninhamento.
DO $c3$
DECLARE
  v_raiz uuid;
  v_proj uuid;
  v_erro text;
BEGIN
  SELECT a.id, a.project_id INTO v_raiz, v_proj
    FROM public.activities a
    JOIN public.projects p ON p.id = a.project_id
   WHERE a.item_type = 'atividade' AND a.is_milestone = false
     AND a.parent_id IS NULL AND a.wbs_code ~ '^[0-9]+$'
     AND a.is_trashed = false AND p.status IS DISTINCT FROM 'concluido'
   LIMIT 1;

  IF v_raiz IS NULL THEN
    INSERT INTO _fumaca VALUES ('nivel-1 raiz', NULL, 'receber filha', NULL,
      'nenhuma atividade nivel-1 na raiz de projeto vivo — testar com um sintetico');
    -- Sintetico: cria a raiz, tenta a filha, e o bloco inteiro sai no ROLLBACK.
    INSERT INTO public.activities (project_id, title, item_type, is_milestone, wbs_code)
      SELECT id, '__fumaca_raiz__', 'atividade', false, '9' FROM public.projects
       WHERE status IS DISTINCT FROM 'concluido' LIMIT 1
      RETURNING id, project_id INTO v_raiz, v_proj;
  END IF;

  BEGIN
    INSERT INTO public.activities (project_id, title, item_type, is_milestone, parent_id)
      VALUES (v_proj, '__fumaca_filha__', 'atividade', false, v_raiz);
    INSERT INTO _fumaca VALUES ('nivel-1 raiz', v_raiz, 'receber filha', true, NULL);
    DELETE FROM public.activities WHERE title = '__fumaca_filha__' AND parent_id = v_raiz;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_erro = MESSAGE_TEXT;
    INSERT INTO _fumaca VALUES ('nivel-1 raiz', v_raiz, 'receber filha', false, v_erro);
  END;
END $c3$;

-- ── QUEM TEM FILHAS, para ler o relatorio ───────────────────────────────────
SELECT '--- as cobaias ---' AS " ";
SELECT rpad(f.tipo, 18)                                        AS "tipo",
       CASE WHEN EXISTS (SELECT 1 FROM public.activities c
                          WHERE c.parent_id = f.amostra)
            THEN 'tem filhas' ELSE 'folha' END                 AS "estrutura",
       left(a.title, 44)                                       AS "titulo"
  FROM (SELECT DISTINCT tipo, amostra FROM _fumaca WHERE amostra IS NOT NULL) f
  JOIN public.activities a ON a.id = f.amostra
 ORDER BY f.tipo;

-- ── O RELATORIO ─────────────────────────────────────────────────────────────
SELECT '--- o que o banco fez ---' AS " ";
SELECT rpad(tipo, 18)                            AS "tipo",
       rpad(operacao, 26)                        AS "operacao",
       CASE WHEN aceitou IS NULL THEN '  -    '
            WHEN aceitou THEN 'ACEITOU'
            ELSE 'RECUSOU' END                   AS "banco",
       left(COALESCE(erro, ''), 62)              AS "motivo"
  FROM _fumaca
 ORDER BY tipo, operacao;

-- ── NADA FICA GRAVADO ───────────────────────────────────────────────────────
ROLLBACK;
