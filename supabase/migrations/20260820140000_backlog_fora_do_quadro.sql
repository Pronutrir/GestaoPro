-- BACKLOG NUNCA É COLUNA DO QUADRO
--
-- Kanban é fluxo ("onde está cada coisa"), Backlog é fila ("o que existe, e o
-- que vem primeiro"). São telas distintas: a aba Backlog mostra a EAP inteira,
-- com responsável e prazo. Misturar as duas enche o quadro com uma lista que só
-- cresce — o problema do Trello, que Jira e Azure DevOps evitam separando.
--
-- A REGRA AGORA VIVE NO CÓDIGO (`colunasDoQuadro`, em components/kanban/shared),
-- e por isso vale mesmo com esta migration pendente. Já se tentou duas vezes
-- deixá-la a cargo de `is_visible` e as duas falharam pelo mesmo motivo: a
-- decisão passava a depender de a migration ter rodado, e nos projetos antigos
-- o Backlog voltava ao quadro sem ninguém ter pedido.
--
-- O QUE ESTA MIGRATION FAZ é arrumar os DADOS, não a regra:
--
--   1. preenche `categoria` onde ela é nula, para o banco concordar com a
--      leitura da tela (a UI cai no nome quando a categoria falta);
--   2. desliga `is_visible` das colunas de backlog, deixando o estado gravado
--      coerente com o que aparece.
--
-- Aditiva e idempotente. Nenhuma atividade muda de coluna: mexe só em
-- workflow_stages. Rodar na VM:
--   PGPASSWORD=... ./scripts/apply-backlog-fora-do-quadro.sh

-- 1) Categoria nula -> deduz pelo NOME ------------------------------------
-- Só o nome, deliberadamente. NÃO usar `display_order = 0`: em projeto novo
-- essa posição é do "Não iniciado" (a coluna de ENTRADA), e marcá-la como
-- backlog tiraria do quadro justamente a coluna onde a tarefa nasce.
-- Sem a extensão `unaccent`, que pode não estar instalada: translate() cobre as
-- vogais acentuadas do português. Mesmo recurso de
-- 20260729010000_fix_stage_category_backfill.sql.
CREATE OR REPLACE FUNCTION pg_temp.sem_acento(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(translate(
    COALESCE(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  ));
$$;

UPDATE public.workflow_stages
SET categoria = 'backlog'::public.workflow_category
WHERE categoria IS NULL
  AND pg_temp.sem_acento(title) ~ '(backlog|ideias?|captacao|captado)';

-- 2) Backlog sai do quadro -------------------------------------------------
-- Espelha no banco o que a tela já faz. Quem tiver ligado o interruptor "No
-- quadro" para o Backlog perde a escolha: ela não existe mais, por decisão de
-- produto. O contador do script diz quantas linhas mudaram, para não ser
-- silencioso.
UPDATE public.workflow_stages
SET is_visible = false
WHERE categoria = 'backlog' AND is_visible IS DISTINCT FROM false;

-- 3) A fila não pode ser a coluna de ENTRADA -------------------------------
-- Se o Backlog estivesse marcado como entrada, a tarefa nova nasceria numa
-- coluna que o quadro não desenha — invisível para quem acabou de criá-la.
-- Passa a marca para a primeira coluna que o quadro mostra.
WITH fila_entrada AS (
  SELECT id, project_id FROM public.workflow_stages
  WHERE is_entry_point = true AND categoria = 'backlog'
),
substituta AS (
  SELECT DISTINCT ON (s.project_id) s.project_id, s.id
  FROM public.workflow_stages s
  JOIN fila_entrada f ON f.project_id = s.project_id
  WHERE s.categoria IS DISTINCT FROM 'backlog'
    AND s.is_visible IS DISTINCT FROM false
  ORDER BY s.project_id, s.display_order
)
UPDATE public.workflow_stages w
SET is_entry_point = (w.id = sub.id)
FROM substituta sub
WHERE w.project_id = sub.project_id
  AND (w.id = sub.id OR w.id IN (SELECT id FROM fila_entrada));

NOTIFY pgrst, 'reload schema';
