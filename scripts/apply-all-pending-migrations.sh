#!/bin/bash
set -e
# Aplica, NA ORDEM CORRETA, TODAS as migrations pendentes desta leva.
# Idempotente: pode rodar de novo sem efeito colateral.
#
# Rodar NA VM (20.65.208.119), onde o container do Postgres e alcancavel:
#   PGPASSWORD=... ./scripts/apply-all-pending-migrations.sh
#
# Ordem:
#   1) fix_projects_insert_policy  CORRIGE "erro ao criar projeto" (RLS 42501).
#                                  Independente das demais; vem primeiro por ser
#                                  o bug mais visivel hoje.
#   2) notifications_read_at       coluna read_at (carimbo "Lida em...").
#   3) eap_item_type_normalize     unifica tarefa/subtarefa -> atividade,
#                                  CHECK item_type e habilita 'pacote'.
#   4) eap_normalize_levels        classifica a base em fase/pacote/atividade.
#   5) eap_nesting_rule            trigger por papel folha/agrupador (DEPOIS da
#                                  normalizacao).
#
# Notas:
# - 20260722140000 (integrity_triggers) NAO entra: foi substituida pela 160000.
# - 20260723000000 (allow_pacote) NAO entra: seu efeito (CHECK aceitar 'pacote')
#   ja e feito pela 130000. Existe so como alternativa MINIMA/isolada.

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

apply 20260723100000 supabase/migrations/20260723100000_fix_projects_insert_policy.sql
apply 20260722120000 supabase/migrations/20260722120000_notifications_read_at.sql
apply 20260722130000 supabase/migrations/20260722130000_eap_item_type_normalize.sql
apply 20260722150000 supabase/migrations/20260722150000_eap_normalize_levels.sql
apply 20260722160000 supabase/migrations/20260722160000_eap_nesting_rule.sql

echo "════════ Verificacao final ════════"
echo "-- projects: deve haver uma policy de INSERT --"
$PSQL -c "SELECT policyname, cmd FROM pg_policies WHERE tablename='projects' AND cmd='INSERT';"
echo "-- notifications.read_at presente? --"
$PSQL -c "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='read_at';"
echo "-- item_type normalizado (fase/pacote/atividade/historia_usuario) --"
$PSQL -c "SELECT item_type, count(*) FROM public.activities GROUP BY item_type ORDER BY count(*) DESC;"
echo "-- funcoes/trigger EAP --"
$PSQL -c "SELECT proname FROM pg_proc WHERE proname IN ('eap_is_group','validate_activity_hierarchy');"
$PSQL -c "SELECT tgname FROM pg_trigger WHERE tgname = 'trg_validate_activity_hierarchy';"

cat <<'FIM'

════════════════════════════════════════════════════════════════════════
Tudo aplicado. Esperado acima:
  - projects: policy de INSERT (criar projeto volta a funcionar)
  - coluna read_at presente
  - item_type so em: fase / pacote / atividade / historia_usuario
  - eap_is_group + validate_activity_hierarchy + trigger
════════════════════════════════════════════════════════════════════════
FIM
