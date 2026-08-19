-- O agrupador ia parar no Backlog, que o quadro nao desenha.
--
-- A 20260818140000 fez a coluna do agrupador seguir os filhos, e isso esta
-- certo. Mas `stage_do_papel(projeto, 'inicio')` escolhe a coluna assim:
--
--     WHEN 'inicio' THEN categoria IN ('a_iniciar', 'backlog') ...
--     ORDER BY display_order LIMIT 1
--
-- O Backlog e SEMPRE display_order = 0. Entao, num projeto que tem Backlog, a
-- funcao escolhia justamente ele -- e o Backlog nasce com `is_visible = false`
-- por decisao de produto (o quadro diz "onde esta cada coisa", a fila diz "o
-- que vem primeiro"; misturar as duas enche o quadro com uma lista que so
-- cresce -- ver `colunasDoQuadro` em lib/kanban/shared.ts).
--
-- O efeito na tela e o que foi relatado: as subatividades aparecem soltas em
-- "Nao iniciado" e o pacote que as agrupa some do quadro. Nao ha nada errado
-- com as tarefas -- o pai esta numa gaveta que o quadro nao abre.
--
-- Medido em 19/08/2026: 164 agrupadores estao em coluna invisivel, e em 28
-- deles ha pelo menos um filho VISIVEL no quadro -- o caso do relato, com o pai
-- sumido e os filhos orfaos na tela. Sao 764 atividades no Backlog no total,
-- mas as folhas ali sao legitimas: fila de trabalho e o proposito da coluna.
-- O problema e so com AGRUPADOR, que nao e trabalho: e a caixa que mostra onde
-- o trabalho esta.
--
-- ── A CORRECAO ─────────────────────────────────────────────────────────────
--
-- `stage_do_papel` passa a preferir colunas VISIVEIS. Nao exclui a invisivel:
-- um projeto pode ter escondido tudo menos o Backlog, e devolver NULL ali
-- deixaria o agrupador sem destino nenhum -- pior que a coluna errada. A
-- invisivel vira ULTIMO recurso, nao a primeira escolha.
--
-- Vale para os tres papeis, nao so 'inicio': se alguem esconder a coluna de
-- andamento ou a final, o mesmo defeito apareceria por la.

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
   -- VISIVEL PRIMEIRO. Sem esta linha o Backlog vencia sempre em 'inicio', por
   -- ser display_order = 0 -- e o agrupador ia para uma coluna que o quadro nao
   -- desenha. A invisivel continua elegivel, como ultimo recurso: e melhor que
   -- devolver NULL e deixar o pai onde estava.
   ORDER BY (s.is_visible IS DISTINCT FROM false) DESC,
   -- Empate resolvido pela ordem do quadro: a PRIMEIRA coluna que serve.
   -- Para 'andamento' isso e o comeco do trabalho, nao o fim -- um pai com
   -- filho recem-iniciado nao deve pular para "Revisao".
            s.display_order
     LIMIT 1;
$$;

COMMENT ON FUNCTION public.stage_do_papel(uuid, text) IS
  'Coluna que cumpre um papel (inicio/andamento/concluida) no projeto. Prefere colunas VISIVEIS no quadro; a invisivel (tipicamente o Backlog) so entra se nao houver outra.';

-- ── BACKFILL: tira os agrupadores da gaveta ────────────────────────────────
--
-- Recalcula a coluna dos agrupadores que estao numa coluna invisivel. Reusa
-- `recalcular_coluna_do_pai`, a mesma funcao que o trigger chama -- assim o
-- backfill e a operacao normal nao podem divergir.
--
-- Ordem: dos NIVEIS MAIS FUNDOS para os mais rasos. Um avo so pode ser
-- recalculado depois que os filhos dele (que tambem sao pais) ja estiverem na
-- coluna certa, senao ele decidiria com base em dado velho.
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    WITH RECURSIVE prof AS (
      SELECT a.id, a.parent_id, 0 AS nivel
        FROM public.activities a
       WHERE a.parent_id IS NULL
         AND a.is_trashed = false
      UNION ALL
      SELECT a.id, a.parent_id, p.nivel + 1
        FROM public.activities a
        JOIN prof p ON p.id = a.parent_id
       WHERE a.is_trashed = false
    )
    SELECT DISTINCT pai.id, prof.nivel
      FROM public.activities pai
      JOIN prof ON prof.id = pai.id
      JOIN public.workflow_stages s ON s.id = pai.workflow_stage_id
     WHERE pai.is_trashed = false
       AND pai.is_milestone IS DISTINCT FROM true
       AND s.is_visible = false
       -- Só AGRUPADOR: folha no Backlog é fila de trabalho, e está certa ali.
       AND EXISTS (
         SELECT 1 FROM public.activities f
          WHERE f.parent_id = pai.id AND f.is_trashed = false
       )
     ORDER BY prof.nivel DESC
  LOOP
    PERFORM public.recalcular_coluna_do_pai(r.id);
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Agrupadores recalculados (estavam em coluna invisivel): %', n;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificacao: nenhum agrupador com filho VISIVEL pode ter ficado escondido.
-- Esse e o caso que produz o sintoma -- pai sumido, filhos orfaos na tela.
DO $$
DECLARE
  sobrando int;
BEGIN
  SELECT count(*) INTO sobrando
    FROM public.activities pai
    JOIN public.workflow_stages sp ON sp.id = pai.workflow_stage_id
   WHERE pai.is_trashed = false
     AND pai.is_milestone IS DISTINCT FROM true
     AND sp.is_visible = false
     AND EXISTS (
       SELECT 1
         FROM public.activities f
         JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
        WHERE f.parent_id = pai.id
          AND f.is_trashed = false
          AND sf.is_visible IS DISTINCT FROM false
     );

  IF sobrando > 0 THEN
    RAISE WARNING 'Ainda ha % agrupador(es) escondido(s) com filho visivel -- conferir se o projeto tem coluna visivel para o papel.', sobrando;
  ELSE
    RAISE NOTICE 'Nenhum agrupador escondido com filho visivel.';
  END IF;
END $$;

-- Reversao: restaurar `stage_do_papel` da 20260818140000 (sem o criterio de
-- visibilidade). O backfill nao se desfaz -- e os agrupadores voltarem para o
-- Backlog nao seria desejavel de qualquer forma.
