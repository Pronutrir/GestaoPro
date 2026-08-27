-- ============================================================================
-- INCIDENTE 27/08 12:08 — DEVOLVER AO BACKLOG OS ITENS PRESOS NO QUADRO
--
-- RODAR JUNTO DA REVERSAO DO BUILD, nao depois. Ver "Por que junto" abaixo.
--
-- ----------------------------------------------------------------------------
-- POR QUE A REVERSAO SOZINHA NAO BASTA
--
-- A pergunta que decidiu isto: com a formula ANTIGA — item_type IN (fase,
-- pacote) OR hasChildren — os itens presos no quadro voltariam a ser CARTAO?
--
-- Nao. Nenhum dos cinco:
--
--   wbs     item_type   filhas   formula antiga
--   1.1     fase        sim      FAIXA
--   1.1.1   fase        nao      FAIXA   <- o `IN (fase,pacote)` pega direto,
--   1.1.2   fase        nao      FAIXA      independente de ter filhas
--   1.1.3   fase        nao      FAIXA
--   (marco) atividade   nao      fora do quadro (marco nunca e cartao)
--
-- Os quatro estao gravados como 'fase'. A formula antiga tem o `IN` ANTES do
-- `OR hasChildren`, entao eles ja eram faixa antes do build de hoje — reverter
-- devolve a tela ao estado anterior, e nesse estado eles continuam sem cartao.
--
-- Ou seja: reverter conserta os OUTROS itens do sistema (os ~1.591 de nivel 3
-- que viraram Entrega na leitura), mas NAO liberta estes cinco. Eles ficam
-- presos no quadro, sem cartao, sem como arrastar de volta pela tela.
--
-- A unica saida para eles e escrita direta. E dai este arquivo.
--
-- ----------------------------------------------------------------------------
-- POR QUE JUNTO DA REVERSAO, E NAO DEPOIS
--
-- Enquanto o build atual estiver no ar, mover estes itens pela tela e
-- impossivel e qualquer escrita compete com uma interface que os le errado.
-- Rodar depois tambem funcionaria, mas deixa uma janela em que alguem olha o
-- quadro, nao acha os itens, e conclui que a reversao falhou.
--
-- ----------------------------------------------------------------------------
-- O QUE ESTE SCRIPT NAO FAZ
--
-- Nao toca em `item_type`. Os quatro continuam gravados como 'fase', que e o
-- que o `pacote_e_posicao` gravou neles em 24/08 e que a sombra registra como
-- tendo sido 'atividade' antes. Corrigir isso e trabalho da migration
-- retomavel (FILA-DE-TRABALHO.md 3.0), com decisao humana — nao de um script
-- de incidente rodado sob pressao.
--
-- Este script so devolve o ESTAGIO. E reversivel, e a reversao esta no fim.
--
-- ----------------------------------------------------------------------------
-- O MARCO FICA DE FORA — sao QUATRO itens, nao cinco
--
-- `904fbbf3` (Milestone 1 - Lancamento do Projeto) esta com estagio='quadro',
-- mas marco NUNCA foi cartao — nem antes do build, nem depois. O estado dele
-- nao mudou com o incidente.
--
-- E uma inconsistencia ANTERIOR: alguem o promoveu em algum momento, e o
-- quadro simplesmente nunca o desenhou. Provavelmente deve voltar para a fila
-- tambem, mas isso e decisao de quem cuida do projeto, tomada com calma — nao
-- carona num script de incidente. Consertar de passagem o que o incidente nao
-- causou e como se perde a fronteira do que foi mexido e por que.
--
-- Anotado em docs/FILA-DE-TRABALHO.md para nao se perder.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) O ANTES — para conferir e para poder desfazer
--
-- Os ids sao EXPLICITOS de proposito. Um `WHERE estagio='quadro'` pegaria
-- tambem o que alguem promover legitimamente entre agora e a execucao, e um
-- script de incidente nao pode desfazer trabalho de outra pessoa.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _antes ON COMMIT DROP AS
SELECT id, wbs_code, title, item_type, is_milestone, estagio,
       workflow_stage_id, status
  FROM public.activities
 WHERE id IN (
   'ffdd6396-7d1f-4221-b984-b7af37178b71',  -- 1.1    Fase de Planejamento e Lancamento
   '78ff79d0-caeb-4ebd-9659-8db17c559eed',  -- 1.1.1  Lancamento do Projeto
   '4c3083a9-260f-41d6-8e7f-3147e8c59d21',  -- 1.1.2  Reuniao de Kickoff
   '2c092a32-fe93-4fd3-9251-94224b8cbf64'   -- 1.1.3  Tasy Native
   -- O MARCO NAO ENTRA. Ver "O marco fica de fora" no cabecalho.
 );

SELECT '--- ANTES ---' AS "";
SELECT rpad(COALESCE(wbs_code, '(sem codigo)'), 14) AS "wbs",
       rpad(left(title, 38), 40)                    AS "titulo",
       rpad(item_type, 11)                          AS "item_type",
       rpad(COALESCE(estagio, '(null)'), 9)         AS "estagio",
       status
  FROM _antes ORDER BY wbs_code NULLS LAST;

-- ---------------------------------------------------------------------------
-- 2) A DEVOLUCAO
--
-- `workflow_stage_id` E `estagio` juntos: a coluna manda (e o que o codigo le,
-- via estagioDoItem), mas o espelho `estagio` existe e ficaria mentindo se so
-- um dos dois mudasse. Os dois concordavam antes; tem de continuar concordando.
--
-- `status` NAO e tocado. Ele descreve o trabalho — "em andamento" continua
-- verdade sobre o item mesmo que ele volte para a fila. Zerar o status junto
-- seria apagar informacao que ninguem pediu para apagar.
-- ---------------------------------------------------------------------------
UPDATE public.activities
   SET workflow_stage_id = 'c7614db4-71c5-4b96-825a-e3c1115969d0',  -- Backlog
       estagio           = 'backlog'
 WHERE id IN (SELECT id FROM _antes);

-- ---------------------------------------------------------------------------
-- 3) O DEPOIS, e a falha alta
-- ---------------------------------------------------------------------------
SELECT '--- DEPOIS ---' AS "";
SELECT rpad(COALESCE(a.wbs_code, '(sem codigo)'), 14) AS "wbs",
       rpad(left(a.title, 38), 40)                    AS "titulo",
       rpad(c.title, 16)                              AS "coluna",
       rpad(COALESCE(a.estagio, '(null)'), 9)         AS "estagio",
       a.status
  FROM public.activities a
  LEFT JOIN public.workflow_stages c ON c.id = a.workflow_stage_id
 WHERE a.id IN (SELECT id FROM _antes)
 ORDER BY a.wbs_code NULLS LAST;

DO $conf$
DECLARE
  v_fora int;
  v_proj uuid := '6d01b1b3-4ac6-45ad-b255-0818877cd54c';
BEGIN
  -- Nenhum dos alvos pode ter sobrado fora do backlog.
  SELECT count(*) INTO v_fora
    FROM public.activities a
    JOIN public.workflow_stages c ON c.id = a.workflow_stage_id
   WHERE a.id IN (SELECT id FROM _antes)
     AND lower(btrim(COALESCE(c.categoria, ''))) <> 'backlog';
  IF v_fora > 0 THEN
    RAISE EXCEPTION '% item(ns) alvo continuam fora do backlog', v_fora;
  END IF;

  -- Quem sobra no quadro? So o marco deveria — se sobrar mais alguem, e item
  -- que alguem promoveu entre a consulta e a execucao, e isso precisa ser visto
  -- por gente antes do COMMIT.
  SELECT count(*) INTO v_fora
    FROM public.activities a
    JOIN public.workflow_stages c ON c.id = a.workflow_stage_id
   WHERE a.project_id = v_proj AND a.is_trashed = false
     AND COALESCE(a.is_milestone, false) = false
     AND lower(btrim(COALESCE(c.categoria, ''))) <> 'backlog';
  IF v_fora > 0 THEN
    RAISE EXCEPTION 'sobraram % item(ns) nao-marco no quadro — alguem promoveu algo; confira antes de commitar', v_fora;
  END IF;

  RAISE NOTICE 'os 4 itens voltaram ao backlog';
END $conf$;

-- ---------------------------------------------------------------------------
-- CONFIRA A SAIDA ACIMA E ENTAO:
--
--   COMMIT;    para gravar
--   ROLLBACK;  para desistir sem gravar nada
--
-- Deixado ABERTO de proposito. Um script de incidente que commita sozinho tira
-- de quem executa a ultima chance de olhar os numeros.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- COMO DESFAZER, se depois se decidir que eles deviam ter ficado no quadro
--
-- (rodar so se o COMMIT ja tiver sido dado)
--
--   UPDATE public.activities SET workflow_stage_id = v.col, estagio = 'quadro'
--     FROM (VALUES
--       ('ffdd6396-7d1f-4221-b984-b7af37178b71'::uuid, '5b66f484-6304-4552-97ba-c90a83961b0b'::uuid),
--       ('78ff79d0-caeb-4ebd-9659-8db17c559eed'::uuid, '90b0a11b-02af-4fa8-b32f-725ddbcd4b72'::uuid),
--       ('4c3083a9-260f-41d6-8e7f-3147e8c59d21'::uuid, '5b66f484-6304-4552-97ba-c90a83961b0b'::uuid),
--       ('2c092a32-fe93-4fd3-9251-94224b8cbf64'::uuid, '5b66f484-6304-4552-97ba-c90a83961b0b'::uuid)
--     ) AS v(id, col)
--    WHERE activities.id = v.id;
--
-- (1.1.1 estava em "Nao iniciado"; os outros tres em "Em Andamento".)
-- ============================================================================
