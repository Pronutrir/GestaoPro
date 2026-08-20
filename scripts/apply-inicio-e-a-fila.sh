#!/bin/bash
set -e
# O AGRUPADOR VOLTAVA PARA O QUADRO SOZINHO.
#
# A trigger que faz a coluna do pai seguir os filhos pedia "a coluna de
# inicio", e desde a 20260819110000 essa busca preferia colunas VISIVEIS.
# Com o Backlog agora sempre fora do quadro (regra de produto, 20/08), essa
# preferencia passou a EMPURRAR o agrupador da fila para "Nao iniciado" --
# a cada insercao, desfazendo a importacao.
#
# Aqui 'inicio' passa a preferir a FILA. 'andamento' e 'concluida' continuam
# preferindo o visivel: la o trabalho existe e pertence ao quadro.
#
# DIFERENTE das outras: esta migration MOVE ATIVIDADE (o backfill devolve
# para a fila os agrupadores empurrados). So agrupador, so quando nenhum
# filho comecou, so em projeto que tem Backlog. Folha nao e tocada.
#
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-inicio-e-a-fila.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260820150000_inicio_e_a_fila.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260820150000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES: agrupadores sem nenhum filho iniciado, por tipo de coluna ──"
$PSQL -c "
WITH g AS (
  SELECT a.id, a.project_id, a.workflow_stage_id,
         count(*) FILTER (
           WHERE sf.id IS NOT NULL
             AND sf.is_final IS DISTINCT FROM true
             AND lower(coalesce(sf.categoria,'')) NOT IN ('a_iniciar','backlog')
         ) AS iniciados
    FROM public.activities a
    JOIN public.activities f ON f.parent_activity_id = a.id AND f.is_trashed = false
    LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
   WHERE a.is_trashed = false
   GROUP BY a.id, a.project_id, a.workflow_stage_id
)
SELECT coalesce(lower(s.categoria::text),'(sem categoria)') AS coluna_do_agrupador,
       count(*) AS qtd
  FROM g LEFT JOIN public.workflow_stages s ON s.id = g.workflow_stage_id
 WHERE g.iniciados = 0
 GROUP BY 1 ORDER BY 2 DESC;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/inicio_e_a_fila.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/inicio_e_a_fila.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS: o mesmo recorte deve concentrar-se em 'backlog' ──"
$PSQL -c "
WITH g AS (
  SELECT a.id, a.project_id, a.workflow_stage_id,
         count(*) FILTER (
           WHERE sf.id IS NOT NULL
             AND sf.is_final IS DISTINCT FROM true
             AND lower(coalesce(sf.categoria,'')) NOT IN ('a_iniciar','backlog')
         ) AS iniciados
    FROM public.activities a
    JOIN public.activities f ON f.parent_activity_id = a.id AND f.is_trashed = false
    LEFT JOIN public.workflow_stages sf ON sf.id = f.workflow_stage_id
   WHERE a.is_trashed = false
   GROUP BY a.id, a.project_id, a.workflow_stage_id
)
SELECT coalesce(lower(s.categoria::text),'(sem categoria)') AS coluna_do_agrupador,
       count(*) AS qtd
  FROM g LEFT JOIN public.workflow_stages s ON s.id = g.workflow_stage_id
 WHERE g.iniciados = 0
 GROUP BY 1 ORDER BY 2 DESC;"

echo "── A funcao devolve a FILA para 'inicio'? (amostra de 5 projetos) ──"
$PSQL -c "
SELECT p.id AS projeto,
       coalesce(lower(s.categoria::text),'(nenhuma)') AS inicio_resolve_para
  FROM (SELECT DISTINCT project_id AS id FROM public.workflow_stages LIMIT 5) p
  LEFT JOIN public.workflow_stages s ON s.id = public.stage_do_papel(p.id, 'inicio');"
