-- O AGRUPADOR VOLTAVA PARA O QUADRO SOZINHO
--
-- Sintoma relatado: "continuo importando no backlog e indo para o kanban em
-- nao iniciado". A EAP nascia certa, na fila, e reaparecia no quadro logo
-- depois -- sem ninguem mexer.
--
-- ── A CAUSA ────────────────────────────────────────────────────────────────
--
-- A trigger `sincroniza_coluna_do_pai` (20260818140000) faz a coluna do
-- agrupador seguir os filhos, e isso continua certo. Com os filhos ainda nao
-- comecados ela pede `stage_do_papel(projeto, 'inicio')`, que aceita as
-- categorias 'a_iniciar' E 'backlog'.
--
-- A 20260819110000 acrescentou "prefira colunas VISIVEIS" para tirar o
-- agrupador de uma gaveta que o quadro nao desenhava. Naquele desenho o
-- Backlog era uma coluna do quadro como outra qualquer, escondida por
-- `is_visible`; preferir a visivel era o conserto certo.
--
-- Esse desenho MUDOU em 20/08/2026: o Backlog deixou de ser preferencia de
-- projeto e passou a ser regra de produto, no codigo (`colunasDoQuadro`, em
-- components/kanban/shared). Kanban e fluxo, Backlog e fila, e a fila tem tela
-- propria, que mostra a EAP inteira.
--
-- Com o Backlog sempre invisivel, "prefira a visivel" virou exatamente o
-- contrario do que se quer: ela EMPURRA o agrupador da fila para o quadro. O
-- backfill daquela migration fez isso em massa, e a trigger refazia a cada
-- insercao -- por isso a importacao "voltava" para "Nao iniciado" mesmo depois
-- de nascer no lugar certo.
--
-- ── A CORRECAO ─────────────────────────────────────────────────────────────
--
-- Para 'inicio', a FILA GANHA quando existe: nada comecou, e o lugar de quem
-- nao comecou e a fila. Sem coluna de backlog no projeto, cai em 'a_iniciar'
-- como antes -- nenhum quadro fica sem destino.
--
-- Para 'andamento' e 'concluida' a preferencia por visivel CONTINUA: ali o
-- trabalho existe e pertence ao quadro; era o defeito legitimo que a
-- 20260819110000 corrigiu, e ele nao volta.
--
-- Aditiva e idempotente. Rodar NA VM:
--   PGPASSWORD=... ./scripts/apply-inicio-e-a-fila.sh

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
             (lower(coalesce(s.categoria::text, '')) = 'concluida' OR s.is_final = true)
           WHEN 'inicio' THEN
             (lower(coalesce(s.categoria::text, '')) IN ('a_iniciar', 'backlog')
              OR (s.categoria IS NULL AND s.display_order = 0))
           WHEN 'andamento' THEN
             (lower(coalesce(s.categoria::text, '')) IN ('andamento', 'revisao')
              OR (s.categoria IS NULL
                  AND s.is_final IS DISTINCT FROM true
                  AND s.display_order > 0
                  AND s.contributes_to_progress IS DISTINCT FROM false))
         END
   ORDER BY
     -- 'inicio': A FILA PRIMEIRO. Nada comecou -- o lugar e o Backlog, nao o
     -- quadro. Nos outros papeis a expressao e constante e nao altera a ordem.
     CASE WHEN p_papel = 'inicio'
               AND lower(coalesce(s.categoria::text, '')) = 'backlog'
          THEN 0 ELSE 1 END,
     -- Visivel primeiro nos DEMAIS papeis: trabalho em curso ou concluido
     -- pertence ao quadro. Para 'inicio' o criterio acima ja decidiu.
     CASE WHEN p_papel = 'inicio' THEN 0
          WHEN s.is_visible IS DISTINCT FROM false THEN 0 ELSE 1 END,
     -- Empate pela ordem do quadro: a PRIMEIRA coluna que serve.
     s.display_order
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.stage_do_papel(uuid, text) IS
  'Coluna que cumpre um papel (inicio/andamento/concluida) no projeto. Para "inicio" prefere a FILA (Backlog), que e onde fica o que nao comecou; para "andamento" e "concluida" prefere colunas visiveis no quadro.';

-- ── A TRIGGER APONTAVA PARA UMA COLUNA QUE NAO EXISTE ─────────────────────
--
-- A 20260818140000 escreveu `parent_activity_id` em toda parte. A coluna de
-- pai em `public.activities` chama-se `parent_id` -- e so ela existe: o nome
-- `parent_activity_id` nao aparece em nenhuma outra migration, nem nos tipos
-- gerados, nem no front. A 20260819110000 ja usava `parent_id`, mas so
-- redefiniu `stage_do_papel`; as funcoes da trigger ficaram como estavam.
--
-- Uma funcao plpgsql so resolve nomes de coluna em tempo de EXECUCAO, entao
-- `CREATE FUNCTION` passa e o erro aparece na primeira insercao. As duas sao
-- reescritas aqui com o nome certo, junto com o trigger (a lista de colunas
-- ouvidas tambem citava o nome inexistente).
--
-- Idempotente: se algum ambiente ja estiver correto, o resultado e o mesmo.

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

  -- Filhos que contam: vivos e NÃO cancelados.
  SELECT count(*),
         count(*) FILTER (WHERE sf.is_final = true
                             OR lower(coalesce(sf.categoria::text, '')) = 'concluida'),
         -- INICIADO exige uma coluna DE VERDADE: filho sem `workflow_stage_id`
         -- faz o LEFT JOIN devolver NULL, e sem esta guarda um pai com filhos
         -- sequer começados seria empurrado para "Em Andamento".
         count(*) FILTER (WHERE sf.id IS NOT NULL
                             AND sf.is_final IS DISTINCT FROM true
                             AND lower(coalesce(sf.categoria::text, '')) NOT IN ('a_iniciar', 'backlog')
                             AND NOT (sf.categoria IS NULL AND sf.display_order = 0))
    INTO n_filhos, n_concluidos, n_iniciados
    FROM public.activities f
    LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
   WHERE f.parent_id = p_pai
     AND f.is_trashed = false
     AND lower(coalesce(sf.categoria::text, '')) IS DISTINCT FROM 'cancelada';

  -- Sem filhos que contem (folha, ou todos cancelados): o pai volta a
  -- responder pela própria coluna.
  IF n_filhos = 0 THEN RETURN; END IF;

  IF n_concluidos = n_filhos THEN
    v_alvo := public.stage_do_papel(v_projeto, 'concluida');
  ELSIF n_iniciados = 0 THEN
    v_alvo := public.stage_do_papel(v_projeto, 'inicio');
  ELSE
    v_alvo := public.stage_do_papel(v_projeto, 'andamento');
  END IF;

  -- Quadro sem coluna para o papel: não force.
  IF v_alvo IS NULL THEN RETURN; END IF;

  -- O WHERE compara os TRÊS campos em vez de sair cedo quando a coluna já
  -- está certa: existe base com a coluna correta e o `status` errado. É também
  -- o que impede a recursão de virar cascata — o UPDATE casa ZERO linhas
  -- quando nada mudou, então o trigger não redispara.
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

-- ── BACKFILL: devolve para a fila quem foi empurrado ───────────────────────
--
-- So AGRUPADOR (tem filho vivo), so quando NENHUM filho comecou, e so quando
-- o projeto tem coluna de backlog. Nao encosta em folha: a folha em "Nao
-- iniciado" pode ter sido posta ali por alguem, de proposito.
--
-- Guard: o UPDATE muta activities. Sem ele (1) o trigger de projeto concluido
-- abortaria se um agrupador caisse em projeto fechado; (2) o rollup
-- trg_filho_recalcula_pai (leva 8) dispararia a cada linha e brigaria com o
-- movimento explicito. Religado logo apos.
SET session_replication_role = replica;

WITH agrupador AS (
  SELECT a.id, a.project_id,
         count(*) FILTER (
           WHERE sf.id IS NOT NULL
             AND sf.is_final IS DISTINCT FROM true
             AND lower(coalesce(sf.categoria::text, '')) NOT IN ('a_iniciar', 'backlog')
             AND NOT (sf.categoria IS NULL AND sf.display_order = 0)
         ) AS iniciados
    FROM public.activities a
    JOIN public.activities f
      ON f.parent_id = a.id AND f.is_trashed = false
    LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
   WHERE a.is_trashed = false
     AND lower(coalesce(sf.categoria::text, '')) IS DISTINCT FROM 'cancelada'
   GROUP BY a.id, a.project_id
),
fila AS (
  SELECT DISTINCT ON (project_id) project_id, id
    FROM public.workflow_stages
   WHERE lower(coalesce(categoria::text, '')) = 'backlog'
   ORDER BY project_id, display_order
)
UPDATE public.activities a
   SET workflow_stage_id = fila.id,
       status = 'pending',
       completed_at = NULL
  FROM agrupador g
  JOIN fila ON fila.project_id = g.project_id
 WHERE a.id = g.id
   AND g.iniciados = 0
   AND a.workflow_stage_id IS DISTINCT FROM fila.id;

-- Religa os triggers de negocio.
SET session_replication_role = origin;

NOTIFY pgrst, 'reload schema';
