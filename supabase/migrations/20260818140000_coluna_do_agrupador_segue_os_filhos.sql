-- ============================================================================
-- A COLUNA DO AGRUPADOR PASSA A SEGUIR OS FILHOS
--
-- Sintoma relatado em 18/08/2026: um pacote com 5 subatividades exibia a barra
-- em 84% sentado na coluna "Não iniciado". As subatividades foram todas
-- concluídas e depois uma voltou para "Em Andamento" -- e o pacote apareceu em
-- "Não iniciado", como se nada tivesse acontecido.
--
-- CAUSA: `activities.workflow_stage_id` do PAI é um campo gravado, e nada no
-- sistema o recalculava a partir dos filhos. Não havia trigger, rollup nem
-- propagação -- zero ocorrências em todas as migrations do repositório.
--
-- O pacote nunca "foi para Não iniciado": ele NUNCA SAIU DE LÁ. Concluir os 5
-- filhos não deu erro nenhum -- deu um pai com a barra em 100% parado na coluna
-- errada, que é indistinguível de estar certo. Só mover um filho de volta, e
-- ver a barra cair para 84%, revelou a divergência que já existia.
--
-- POR QUE FALTAVA
--
-- `lib/activityProgress.ts` decide, de propósito, que agrupador IGNORA a
-- própria coluna e vale a média dos filhos ("não é trabalho, é caixa: mover a
-- caixa não move o que está dentro dela"). Essa regra está certa para o
-- PERCENTUAL. O que nunca foi implementado é o recíproco: se a caixa não manda
-- nos filhos, são os filhos que precisam mandar na caixa.
--
-- Havia até um detector de divergência (`divergente`), mas ele só pega o caso
-- oposto -- coluna "Concluída" com filho aberto. Coluna "Não iniciado" com
-- filho andando passava sem aviso.
--
-- A REGRA (derivada dos filhos NÃO cancelados e não excluídos)
--
--   nenhum filho começou           → coluna de entrada (a_iniciar/backlog)
--   todos os filhos concluídos     → coluna final (concluida)
--   qualquer outro caso            → coluna de andamento
--
-- Filho cancelado sai da conta: ele não é trabalho pendente nem entrega feita.
-- Se TODOS os filhos estiverem cancelados a conta fica vazia e o pai não é
-- tocado -- não há trabalho a reportar, e mover a caixa seria inventar um fato.
-- É a mesma decisão que `subAvanco` já toma ao devolver `null` (fora da média)
-- em vez de zero.
--
-- QUEM É AGRUPADOR: quem TEM FILHOS. Não é o `item_type` -- `eapModel.ts` diz
-- que Fase/Entrega são POSIÇÕES na árvore, não tipos escolhidos, e a maioria da
-- base foi criada sem `wbs_code`. Um item vira agrupador ao ganhar subitens e
-- deixa de ser ao perdê-los, então a presença de filhos é o único teste que não
-- diverge das telas.
--
-- MARCO NUNCA É TOCADO: marco não agrupa (o trigger de EAP recusa), é binário
-- (0 ou 100) e um filho pendurado nele é dado inconsistente, não estrutura.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- ANTES: quantos agrupadores estão com a coluna divergente dos filhos?
--
-- Roda antes de qualquer escrita, para o alcance ficar registrado na saída do
-- script. Sem esta medida o backfill corrige em silêncio e ninguém sabe se
-- eram 3 casos ou 300.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  divergentes int;
  total_pais  int;
BEGIN
  SELECT count(*) INTO total_pais
  FROM public.activities p
  WHERE p.is_trashed = false
    AND p.is_milestone IS DISTINCT FROM true
    AND EXISTS (SELECT 1 FROM public.activities f
                 WHERE f.parent_id = p.id AND f.is_trashed = false);

  SELECT count(*) INTO divergentes
  FROM public.activities p
  JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
  WHERE p.is_trashed = false
    AND p.is_milestone IS DISTINCT FROM true
    AND EXISTS (SELECT 1 FROM public.activities f
                 WHERE f.parent_id = p.id AND f.is_trashed = false)
    AND (
      -- pai fora da coluna final, mas todos os filhos concluídos
      (sp.is_final IS DISTINCT FROM true AND NOT EXISTS (
         SELECT 1 FROM public.activities f
           JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
          WHERE f.parent_id = p.id AND f.is_trashed = false
            AND sf.is_final IS DISTINCT FROM true))
      OR
      -- pai na coluna final, mas há filho aberto
      (sp.is_final = true AND EXISTS (
         SELECT 1 FROM public.activities f
           JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
          WHERE f.parent_id = p.id AND f.is_trashed = false
            AND sf.is_final IS DISTINCT FROM true))
    );

  RAISE NOTICE 'ANTES: % agrupadores no total, % com a coluna divergente dos filhos.',
    total_pais, divergentes;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Qual coluna representa cada papel, DENTRO DE UM PROJETO.
--
-- As colunas são por projeto (cada quadro tem as suas), então a escolha tem de
-- ser feita no projeto do item -- pegar "a coluna final" global misturaria
-- quadros e moveria a atividade para o Kanban de outro projeto.
--
-- `categoria` manda quando existe; as flags legadas são o fallback, porque a
-- base tem quadros anteriores ao backfill de categoria. É a mesma ordem de
-- precedência de `parseWorkflowCategory` / `categoryFromLegacyFlags`.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stage_do_papel(p_project_id uuid, p_papel text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
    FROM public.workflow_stages s
   WHERE s.project_id = p_project_id
     AND CASE p_papel
           WHEN 'concluida' THEN
             (lower(coalesce(s.categoria, '')) = 'concluida' OR s.is_final = true)
           WHEN 'inicio' THEN
             (lower(coalesce(s.categoria, '')) IN ('a_iniciar', 'backlog')
              OR (s.categoria IS NULL AND s.display_order = 0))
           WHEN 'andamento' THEN
             (lower(coalesce(s.categoria, '')) IN ('andamento', 'revisao')
              OR (s.categoria IS NULL
                  AND s.is_final IS DISTINCT FROM true
                  AND s.display_order > 0
                  AND s.contributes_to_progress IS DISTINCT FROM false))
         END
     -- Empate resolvido pela ordem do quadro: a PRIMEIRA coluna que serve.
     -- Para 'andamento' isso é o começo do trabalho, não o fim -- um pai com
     -- filho recém-iniciado não deve pular para "Revisão".
     ORDER BY s.display_order
     LIMIT 1;
$$;

COMMENT ON FUNCTION public.stage_do_papel(uuid, text) IS
  'Coluna que representa um papel (inicio/andamento/concluida) no quadro DO PROJETO. Categoria manda; flags legadas são fallback.';

-- ────────────────────────────────────────────────────────────────────────────
-- Recalcula a coluna de UM pai a partir dos filhos.
--
-- Idempotente e silenciosa quando não há o que mudar: só escreve se a coluna
-- calculada for diferente da atual. Isso importa porque a função é chamada por
-- trigger -- um UPDATE incondicional dispararia a si mesmo em cascata.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalcular_coluna_do_pai(p_pai uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_projeto     uuid;
  v_marco       boolean;
  v_atual       uuid;
  n_filhos      int;
  n_concluidos  int;
  n_iniciados   int;
  v_alvo        uuid;
BEGIN
  IF p_pai IS NULL THEN RETURN; END IF;

  SELECT a.project_id, a.is_milestone, a.workflow_stage_id
    INTO v_projeto, v_marco, v_atual
    FROM public.activities a
   WHERE a.id = p_pai AND a.is_trashed = false;

  -- Pai inexistente, na lixeira, ou marco: não se mexe. Marco é binário e não
  -- agrupa; filho nele é dado inconsistente e não deve mover nada.
  IF v_projeto IS NULL OR v_marco IS TRUE THEN RETURN; END IF;

  -- Filhos que contam: vivos e NÃO cancelados. Cancelado não é trabalho
  -- pendente nem entrega feita -- fica fora da conta, como em `subAvanco`.
  SELECT count(*),
         count(*) FILTER (WHERE sf.is_final = true
                             OR lower(coalesce(sf.categoria, '')) = 'concluida'),
         -- INICIADO exige uma coluna DE VERDADE. O `sf.id IS NOT NULL` não é
         -- redundante: filho sem `workflow_stage_id` (criado pelo importador,
         -- ou de quadro antigo) faz o LEFT JOIN devolver tudo NULL, e aí
         -- `is_final IS DISTINCT FROM true` é verdadeiro e `coalesce(categoria,'')`
         -- vira '' -- que não está na lista de exclusão. Sem esta guarda um pai
         -- com filhos sequer começados seria empurrado para "Em Andamento",
         -- que é a mesma classe de erro que esta migration foi corrigir.
         count(*) FILTER (WHERE sf.id IS NOT NULL
                             AND sf.is_final IS DISTINCT FROM true
                             AND lower(coalesce(sf.categoria, '')) NOT IN ('a_iniciar', 'backlog')
                             AND NOT (sf.categoria IS NULL AND sf.display_order = 0))
    INTO n_filhos, n_concluidos, n_iniciados
    FROM public.activities f
    LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
   WHERE f.parent_id = p_pai
     AND f.is_trashed = false
     AND lower(coalesce(sf.categoria, '')) IS DISTINCT FROM 'cancelada';

  -- Sem filhos que contem (folha, ou todos cancelados): o pai volta a
  -- responder pela própria coluna. Não há trabalho a medir, e mover a caixa
  -- seria inventar um fato.
  IF n_filhos = 0 THEN RETURN; END IF;

  IF n_concluidos = n_filhos THEN
    v_alvo := public.stage_do_papel(v_projeto, 'concluida');
  ELSIF n_iniciados = 0 THEN
    v_alvo := public.stage_do_papel(v_projeto, 'inicio');
  ELSE
    v_alvo := public.stage_do_papel(v_projeto, 'andamento');
  END IF;

  -- Quadro sem coluna para o papel: não force. Mover para uma coluna arbitrária
  -- seria pior que a divergência que estamos corrigindo.
  IF v_alvo IS NULL THEN RETURN; END IF;

  -- `status` acompanha a coluna, pela decisão de 11/08/2026 ("a coluna manda",
  -- migration 20260811100000). Sem isto o pai iria para a coluna certa com o
  -- título riscado ao lado de um badge dizendo o contrário.
  --
  -- O WHERE compara os TRÊS campos, em vez de sair cedo quando a coluna já
  -- está certa: existe base com a coluna correta e o `status` errado (é o que
  -- a migration 20260811100000 foi corrigir), e um retorno antecipado por
  -- `v_alvo = v_atual` deixaria justamente esses casos sem conserto.
  --
  -- É também o que impede a recursão de virar cascata: o UPDATE casa ZERO
  -- linhas quando nada mudou, então o trigger não redispara e o ciclo morre
  -- na primeira volta -- em vez de depender de o Postgres cortar por
  -- profundidade.
  UPDATE public.activities a
     SET workflow_stage_id = v_alvo,
         status = CASE WHEN n_concluidos = n_filhos THEN 'completed' ELSE 'pending' END,
         completed_at = CASE WHEN n_concluidos = n_filhos
                             THEN COALESCE(a.completed_at, now())
                             ELSE NULL END
   WHERE a.id = p_pai
     AND (a.workflow_stage_id IS DISTINCT FROM v_alvo
          OR a.status IS DISTINCT FROM
             CASE WHEN n_concluidos = n_filhos THEN 'completed' ELSE 'pending' END);
END $$;

COMMENT ON FUNCTION public.recalcular_coluna_do_pai(uuid) IS
  'Recalcula a coluna de um agrupador a partir dos filhos vivos e não cancelados. Idempotente.';

-- ────────────────────────────────────────────────────────────────────────────
-- O gatilho: qualquer mexida num filho recalcula o pai.
--
-- Cobre os quatro caminhos que mudam a conta, e é por isso que não basta ouvir
-- UPDATE de coluna:
--   INSERT              -- nasce um filho (o pai deixa de estar concluído)
--   DELETE              -- some um filho
--   UPDATE de coluna    -- o caso do relato
--   UPDATE de is_trashed-- vai para a lixeira ou volta dela
--   UPDATE de parent    -- mudou de pai: os DOIS precisam recalcular
--
-- E É ASSIM QUE O AVÔ SE ATUALIZA: quando a função move o pai, esse UPDATE de
-- `workflow_stage_id` dispara este mesmo trigger com o pai no papel de filho,
-- que então recalcula o avô. A EAP inteira sobe sozinha, um nível por vez, sem
-- recursão explícita. Por isso `workflow_stage_id` precisa estar na lista.
--
-- `status` NÃO entra na lista de colunas ouvidas: a coluna é a fonte da
-- verdade (decisão de 11/08/2026) e o `status` é consequência dela, então
-- ouvi-lo só criaria uma segunda porta para o mesmo recálculo.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_filho_recalcula_pai()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_coluna_do_pai(OLD.parent_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalcular_coluna_do_pai(NEW.parent_id);

  -- Reparenting: o pai ANTIGO também perdeu um filho e precisa recalcular.
  IF TG_OP = 'UPDATE'
     AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    PERFORM public.recalcular_coluna_do_pai(OLD.parent_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_filho_recalcula_pai ON public.activities;

CREATE TRIGGER trg_filho_recalcula_pai
AFTER INSERT OR DELETE OR UPDATE OF workflow_stage_id, is_trashed, parent_id
ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.tg_filho_recalcula_pai();

-- ────────────────────────────────────────────────────────────────────────────
-- BACKFILL — corrige o que já está divergente.
--
-- Dos filhos para os pais, do nível MAIS FUNDO para o mais raso: uma EAP tem
-- netos, e recalcular um pai antes dos filhos dele usaria o valor velho do
-- neto. Ordenar por profundidade decrescente faz cada nível já encontrar os
-- filhos corrigidos.
-- ────────────────────────────────────────────────────────────────────────────
-- Guard defensivo: o backfill chama recalcular_coluna_do_pai, que faz UPDATE em
-- activities. Se um agrupador divergente cair em projeto concluido, o trigger
-- trg_prevent_activity_mutation_on_concluded_project abortaria a migration.
-- Desliga os triggers de negocio (inclui o novo trg_filho_recalcula_pai, ja que
-- o backfill recursa explicitamente por nivel e nao depende dele). Religado apos.
SET session_replication_role = replica;

DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    WITH RECURSIVE arvore AS (
      SELECT a.id, a.parent_id, 0 AS nivel
        FROM public.activities a
       WHERE a.is_trashed = false AND a.parent_id IS NULL
      UNION ALL
      SELECT a.id, a.parent_id, t.nivel + 1
        FROM public.activities a
        JOIN arvore t ON a.parent_id = t.id
       WHERE a.is_trashed = false
    )
    SELECT t.id, t.nivel
      FROM arvore t
     WHERE EXISTS (SELECT 1 FROM public.activities f
                    WHERE f.parent_id = t.id AND f.is_trashed = false)
     ORDER BY t.nivel DESC
  LOOP
    PERFORM public.recalcular_coluna_do_pai(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'BACKFILL: % agrupadores reavaliados.', n;
END $$;

-- Religa os triggers de negocio.
SET session_replication_role = origin;

-- ────────────────────────────────────────────────────────────────────────────
-- DEPOIS: a mesma contagem do início. Deve dar ZERO divergentes.
--
-- Não aborta se sobrar: um quadro sem coluna de andamento (ou sem final) é
-- motivo legítimo para um pai não ter para onde ir, e derrubar a migration
-- inteira por causa disso seria pior. O número fica na saída para conferência.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  divergentes int;
BEGIN
  SELECT count(*) INTO divergentes
  FROM public.activities p
  JOIN public.workflow_stages sp ON sp.id = p.workflow_stage_id
  WHERE p.is_trashed = false
    AND p.is_milestone IS DISTINCT FROM true
    AND EXISTS (SELECT 1 FROM public.activities f
                 WHERE f.parent_id = p.id AND f.is_trashed = false)
    AND (
      (sp.is_final IS DISTINCT FROM true AND NOT EXISTS (
         SELECT 1 FROM public.activities f
           JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
          WHERE f.parent_id = p.id AND f.is_trashed = false
            AND sf.is_final IS DISTINCT FROM true))
      OR
      (sp.is_final = true AND EXISTS (
         SELECT 1 FROM public.activities f
           JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
          WHERE f.parent_id = p.id AND f.is_trashed = false
            AND sf.is_final IS DISTINCT FROM true))
    );

  IF divergentes = 0 THEN
    RAISE NOTICE 'DEPOIS: 0 divergentes. A coluna do agrupador passa a seguir os filhos.';
  ELSE
    RAISE WARNING 'DEPOIS: sobraram % divergentes -- provavelmente quadros sem coluna para o papel. Conferir.', divergentes;
  END IF;
END $$;
