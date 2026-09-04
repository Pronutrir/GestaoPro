#!/bin/bash
set -e
# Aplica 20260904150000_responsavel_cria_na_subarvore.sql — o responsável de
# um ancestral passa a poder CRIAR subatividade dentro da própria subárvore
# (can_create_activity_v2 ganha a via do ator; policy de INSERT usa parent_id).
#
# PRÉ-REQUISITO: 20260901120000 (eh_descendente_de_atividade_do_responsavel)
# já precisa estar aplicada — o script tem interlock e recusa rodar sem ela.
#
# Rodar NA VM (20.65.208.119), onde o container do Postgres é alcançável:
#   PGPASSWORD=... ./scripts/apply-responsavel-cria-na-subarvore.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"
FILE="supabase/migrations/20260904150000_responsavel_cria_na_subarvore.sql"
VERSION="20260904150000"

echo "── [$VERSION] aplicando $(basename "$FILE") ──"
docker cp "$FILE" "$CONTAINER:/tmp/mig_${VERSION}.sql"
$PSQL -v ON_ERROR_STOP=1 -f "/tmp/mig_${VERSION}.sql"
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "════════ Verificação final ════════"
echo "-- can_create_activity_v2/3 existe e cita a via do responsável --"
$PSQL -c "SELECT proname, pronargs FROM pg_proc WHERE proname = 'can_create_activity_v2' ORDER BY pronargs;"
echo "-- policy de INSERT usa a versão de 3 argumentos --"
$PSQL -c "SELECT policyname, with_check FROM pg_policies WHERE tablename='activities' AND policyname='Activities access v2 insert';"

cat <<'FIM'

════════════════════════════════════════════════════════════════════════
Tudo aplicado. Esperado acima:
  - can_create_activity_v2 com DUAS linhas: pronargs=2 (wrapper) e pronargs=3
  - a policy de INSERT citando can_create_activity_v2(project_id, auth.uid(), parent_id)
════════════════════════════════════════════════════════════════════════
FIM
