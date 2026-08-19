#!/bin/bash
set -e
# ============================================================================
# REALINHA status COM A COLUNA (de novo)
#
# A 20260811100000 já fez este alinhamento, mas corrigiu o DADO sem corrigir
# todas as FONTES. Três caminhos seguiram gravando a coluna sem o status:
#
#   1. Cronograma → célula "Coluna"  (o sintoma relatado: muda no Cronograma,
#      aparece no Backlog, não aparece no Kanban)
#   2. Kanban → "mover para o Backlog"
#   3. Kanban → "Desfazer" do toast de mover
#
# Os três foram corrigidos no código, no mesmo commit desta migration. Aqui se
# limpa o que eles gravaram desde 11/08.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-realinhar-status.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260819100000_realinhar_status_com_coluna.sql"
VERSION=20260819100000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: as divergências, com nome e projeto ──"
# Nomes em vez de só um número: a saída precisa mostrar CASOS, e serve de
# registro do que foi alterado (esta migration não tem reversão).
$PSQL -c "
SELECT p.title AS projeto,
       a.title AS atividade,
       s.title AS coluna,
       s.is_final AS coluna_final,
       a.status
  FROM public.activities a
  JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
  JOIN public.projects p ON p.id = a.project_id
 WHERE a.is_trashed = false
   AND ((a.status = 'completed') IS DISTINCT FROM (s.is_final = true))
 ORDER BY p.title, a.title
 LIMIT 40;"

echo ""
echo "── Total, e de que lado está cada uma ──"
$PSQL -c "
SELECT CASE WHEN s.is_final THEN 'coluna final + status pendente'
            ELSE 'coluna aberta + status concluído' END AS tipo,
       count(*) AS total
  FROM public.activities a
  JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
 WHERE a.is_trashed = false
   AND ((a.status = 'completed') IS DISTINCT FROM (s.is_final = true))
 GROUP BY 1;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  A coluna manda; o status acompanha"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig_realinhar.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de deixar o banco meio migrado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig_realinhar.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: deve vir ZERO ──"
$PSQL -c "
SELECT count(*) AS divergentes
  FROM public.activities a
  JOIN public.workflow_stages s ON s.id = a.workflow_stage_id
 WHERE a.is_trashed = false
   AND ((a.status = 'completed') IS DISTINCT FROM (s.is_final = true));"

echo ""
echo "── Atividades sem coluna (NÃO tocadas, por decisão) ──"
$PSQL -c "
SELECT count(*) AS sem_coluna
  FROM public.activities
 WHERE is_trashed = false
   AND workflow_stage_id IS NULL;"

echo ""
echo "  Esperado: divergentes = 0."
echo "  As sem coluna ficam como estão — não há coluna para o status seguir."
