#!/bin/bash
set -e
# Aplica, NA ORDEM CORRETA, todas as migrations pendentes desta leva
# (notificacoes + hierarquia EAP). Idempotente: pode rodar de novo.
#
# Rodar NA VM (20.65.208.119), onde o container do Postgres e alcancavel:
#   PGPASSWORD=... ./scripts/apply-all-pending-migrations.sh
#
# Ordem importa:
#   1) read_at            (notificacoes; independente)
#   2) item_type_normalize (unifica tarefa/subtarefa -> atividade + CHECK + 'pacote')
#   3) normalize_levels    (classifica base em fase/pacote/atividade por posicao)
#   4) nesting_rule        (trigger por papel folha/agrupador — DEPOIS da normalizacao)
#
# Nota: 20260722140000 (integrity_triggers) NAO entra aqui — foi substituida
# pela 160000 (nesting_rule), que instala o trigger final.

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

apply() {
  local version="$1"; local file="$2"
  echo "── [$version] aplicando $(basename "$file") ──"
  docker cp "$file" "$CONTAINER:/tmp/mig_${version}.sql"
  $PSQL -v ON_ERROR_STOP=1 -f "/tmp/mig_${version}.sql"
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${version}', NOW()) ON CONFLICT DO NOTHING;"
  echo
}

apply 20260722120000 supabase/migrations/20260722120000_notifications_read_at.sql
apply 20260722130000 supabase/migrations/20260722130000_eap_item_type_normalize.sql
apply 20260722150000 supabase/migrations/20260722150000_eap_normalize_levels.sql
apply 20260722160000 supabase/migrations/20260722160000_eap_nesting_rule.sql

echo "── Verificacao final ──"
$PSQL -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='read_at';"
$PSQL -c "SELECT item_type, count(*) FROM public.activities GROUP BY item_type ORDER BY count(*) DESC;"
$PSQL -c "SELECT proname FROM pg_proc WHERE proname IN ('eap_is_group','validate_activity_hierarchy');"
$PSQL -c "SELECT tgname FROM pg_trigger WHERE tgname = 'trg_validate_activity_hierarchy';"

cat <<'FIM'

────────────────────────────────────────────────────────────────────────
Tudo aplicado. Esperado acima:
  - coluna read_at presente
  - item_type apenas em: fase / pacote / atividade / historia_usuario
  - funcoes eap_is_group + validate_activity_hierarchy
  - trigger trg_validate_activity_hierarchy
────────────────────────────────────────────────────────────────────────
FIM
