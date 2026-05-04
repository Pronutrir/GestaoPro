#!/bin/bash
# fix-pending-migrations.sh
# Resolve as 18 migrations pendentes do insight-finder-pal
# Executar como root no Vps-Hostiger

set -e

PGPW="a7ab971f42663606a59b93e232884e833a71fa6277c7e14e"
CONTAINER="supabase-db-1"
SCHEMA_MIGRATIONS="supabase_migrations.schema_migrations"

log() { echo "[$(date +%H:%M:%S)] $*"; }
ok()  { echo "  ✓ $*"; }
err() { echo "  ✗ $*" >&2; }

# Executa SQL no Postgres; retorna 0 em sucesso, 1 em erro
run_sql() {
  docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "$1" 2>&1
}

# Executa SQL de um arquivo heredoc temporário
run_sql_file() {
  docker exec -e PGPASSWORD="$PGPW" -i "$CONTAINER" \
    psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"
}

# Marca versão como aplicada em schema_migrations
mark_applied() {
  local ver="$1"
  docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
    psql -U supabase_admin -d postgres -q -c \
    "INSERT INTO $SCHEMA_MIGRATIONS(version, name, statements)
     VALUES ('$ver', 'manual-fix', ARRAY['-- applied by fix script'])
     ON CONFLICT DO NOTHING;" 2>&1 \
    && ok "Marcado como aplicado: $ver" \
    || err "Falha ao marcar: $ver"
}

echo "=========================================================="
echo " Fix das 18 migrations pendentes - insight-finder-pal"
echo "=========================================================="

# ------------------------------------------------------------------
# GRUPO A: objetos já existem no schema — apenas marcar como aplicados
# ------------------------------------------------------------------
log "GRUPO A: Marcando migrations cujos objetos já existem..."

MARK_ONLY=(
  "20251125195123"   # CREATE TABLE projects
  "20251126192451"   # ADD COLUMN budget_planned + CREATE TABLE activities
  "20251127132421"   # ADD COLUMN owner, blockers
  "20251203123946"   # ADD COLUMN display_order
  "20260204131554"   # CREATE TABLE phases
  "20260311001846"   # CREATE TYPE app_role + profiles + user_roles + has_role
  "20260311004527"   # CREATE TABLE project_members
  "20260311014518"   # CREATE TABLE workflow_stages
  "20260312223327"   # CREATE TABLE sprints
  "20260315142347"   # CREATE TABLE sticky_notes
  "20260318010658"   # CREATE TABLE user_tab_permissions
  "20260407011316"   # CREATE TABLE user_module_permissions
  "20260423185819"   # CREATE TABLE change_requests
)

for ver in "${MARK_ONLY[@]}"; do
  mark_applied "$ver"
done

# ------------------------------------------------------------------
# 20260402131340 — replica identity + publication + data seed
# ------------------------------------------------------------------
log "20260402131340: replica identity + publication + data seed..."

run_sql "ALTER TABLE public.project_members REPLICA IDENTITY FULL;" \
  && ok "project_members REPLICA IDENTITY FULL" \
  || err "project_members REPLICA IDENTITY (ignorado)"

run_sql "ALTER TABLE public.user_tab_permissions REPLICA IDENTITY FULL;" \
  && ok "user_tab_permissions REPLICA IDENTITY FULL" \
  || err "user_tab_permissions REPLICA IDENTITY (ignorado)"

# Tenta adicionar à publicação; pode já estar lá
docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -q -c \
  "ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;" 2>&1 \
  | grep -v "already member" | grep -v "^ALTER" || true

docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -q -c \
  "ALTER PUBLICATION supabase_realtime ADD TABLE public.user_tab_permissions;" 2>&1 \
  | grep -v "already member" | grep -v "^ALTER" || true

# Data seed (idempotente via WHERE NOT EXISTS)
docker exec -e PGPASSWORD="$PGPW" -i "$CONTAINER" \
  psql -U supabase_admin -d postgres -q <<'EOSQL'
WITH target_user AS (
  SELECT id FROM public.profiles
  WHERE lower(email) = 'guilherme.gomes@pronutrir.com.br'
), target_projects AS (
  SELECT id FROM public.projects WHERE title IN (
    'Agente de IA - Tasy / Pops',
    'Conferência Eletrônica a Beira do Leito',
    'Guia Jornada do Paciente - Pronutrir Onboard'
  )
)
INSERT INTO public.project_members (project_id, user_id, can_create, can_edit, can_delete, can_move)
SELECT tp.id, tu.id, true, true, false, true
FROM target_user tu CROSS JOIN target_projects tp
WHERE EXISTS (SELECT 1 FROM target_user)
  AND NOT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = tp.id AND pm.user_id = tu.id
  );
EOSQL

docker exec -e PGPASSWORD="$PGPW" -i "$CONTAINER" \
  psql -U supabase_admin -d postgres -q <<'EOSQL'
WITH target_user AS (
  SELECT id FROM public.profiles
  WHERE lower(email) = 'guilherme.gomes@pronutrir.com.br'
)
INSERT INTO public.user_tab_permissions (user_id, allowed_tabs)
SELECT tu.id,
  ARRAY['dashboard','kanban','backlog','timeline','deliveries','documents',
        'stories','tap','meetings','assumptions','risks','lessons','workflow']::text[]
FROM target_user tu
WHERE EXISTS (SELECT 1 FROM target_user)
  AND NOT EXISTS (
    SELECT 1 FROM public.user_tab_permissions utp WHERE utp.user_id = tu.id
  );
EOSQL

ok "Data seed 20260402131340 concluído"
mark_applied "20260402131340"

# ------------------------------------------------------------------
# 20260402165152 — ADD COLUMN trashed_at (is_trashed já existe)
# ------------------------------------------------------------------
log "20260402165152: ADD COLUMN trashed_at em activities..."

run_sql "ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS is_trashed boolean NOT NULL DEFAULT false;" \
  && ok "is_trashed OK (IF NOT EXISTS)" \
  || err "is_trashed falhou"

run_sql "ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS trashed_at timestamp with time zone;" \
  && ok "trashed_at adicionado" \
  || err "trashed_at falhou"

mark_applied "20260402165152"

# ------------------------------------------------------------------
# 20260422175356 — created_by, created_by_email, closed_at + trigger
#                  (backfill do audit_log omitido — audit_log pode não existir)
# ------------------------------------------------------------------
log "20260422175356: colunas created_by + trigger set_activity_created_by..."

docker exec -e PGPASSWORD="$PGPW" -i "$CONTAINER" \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'EOSQL'
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_email text,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.set_activity_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL AND NEW.created_by IS NULL THEN
    NEW.created_by := v_uid;
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
    NEW.created_by_email := v_email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_activity_created_by ON public.activities;
CREATE TRIGGER trg_set_activity_created_by
  BEFORE INSERT ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.set_activity_created_by();
EOSQL

ok "20260422175356 SQL aplicado"

# Backfill do audit_log se a tabela existir
AUDIT_EXISTS=$(docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -tAq \
  -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_log';")

if [ "$AUDIT_EXISTS" = "1" ]; then
  log "  audit_log encontrado — executando backfill..."
  docker exec -e PGPASSWORD="$PGPW" -i "$CONTAINER" \
    psql -U supabase_admin -d postgres -q <<'EOSQL'
UPDATE public.activities a
SET created_by = sub.changed_by,
    created_by_email = sub.changed_by_email
FROM (
  SELECT DISTINCT ON (record_id) record_id, changed_by, changed_by_email
  FROM public.audit_log
  WHERE table_name = 'activities' AND operation = 'INSERT'
  ORDER BY record_id, created_at ASC
) sub
WHERE a.id = sub.record_id
  AND a.created_by IS NULL;
EOSQL
  ok "Backfill audit_log concluído"
else
  ok "audit_log não existe — backfill omitido (sem dados históricos a migrar)"
fi

mark_applied "20260422175356"

# ------------------------------------------------------------------
# 20260422215547 — políticas holidays + RLS user_work_schedules
#                  usa has_role com cast explícito para app_role
# ------------------------------------------------------------------
log "20260422215547: políticas holidays + user_work_schedules..."

# Verifica se 'gestor' está no enum app_role; adiciona se faltar
GESTOR_EXISTS=$(docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -tAq \
  -c "SELECT COUNT(*) FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='app_role' AND e.enumlabel='gestor';")

if [ "$GESTOR_EXISTS" != "1" ]; then
  log "  'gestor' não está no enum app_role — adicionando..."
  run_sql "ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor';" \
    && ok "'gestor' adicionado ao enum app_role" \
    || err "Falha ao adicionar 'gestor' ao enum"
fi

docker exec -e PGPASSWORD="$PGPW" -i "$CONTAINER" \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'EOSQL'
DROP POLICY IF EXISTS "Admins manage holidays" ON public.holidays;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='holidays' AND policyname='Admins and gestores manage holidays'
  ) THEN
    CREATE POLICY "Admins and gestores manage holidays"
      ON public.holidays FOR ALL TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin'::public.app_role) OR
        public.has_role(auth.uid(), 'gestor'::public.app_role)
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'admin'::public.app_role) OR
        public.has_role(auth.uid(), 'gestor'::public.app_role)
      );
  END IF;
END;
$$;

ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own schedule"   ON public.user_work_schedules;
DROP POLICY IF EXISTS "Admins manage all schedules" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Read all schedules"          ON public.user_work_schedules;

CREATE POLICY "Read all schedules"
  ON public.user_work_schedules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users manage own schedule"
  ON public.user_work_schedules FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage all schedules"
  ON public.user_work_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EOSQL

ok "20260422215547 SQL aplicado"
mark_applied "20260422215547"

# ------------------------------------------------------------------
# 20260423021906 — mover subtarefas órfãs para lixeira
#                  depende de trashed_at (adicionado em 20260402165152)
# ------------------------------------------------------------------
log "20260423021906: mover subtarefas órfãs para lixeira..."

docker exec -e PGPASSWORD="$PGPW" -i "$CONTAINER" \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'EOSQL'
UPDATE public.activities AS child
SET is_trashed = true,
    trashed_at = COALESCE(child.trashed_at, now())
FROM public.activities AS parent
WHERE child.parent_id = parent.id
  AND parent.is_trashed = true
  AND child.is_trashed = false;
EOSQL

ok "20260423021906 SQL aplicado"
mark_applied "20260423021906"

# ------------------------------------------------------------------
# VERIFICAÇÃO FINAL
# ------------------------------------------------------------------
echo ""
echo "=========================================================="
log "VERIFICAÇÃO FINAL"
echo "=========================================================="

TOTAL_REMOTE=$(docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -tAq \
  -c "SELECT COUNT(*) FROM $SCHEMA_MIGRATIONS;")

log "Total de versões em schema_migrations: $TOTAL_REMOTE"

# Lista versões locais esperadas
EXPECTED=(
  20251125195123 20251126192451 20251127132421 20251203123946
  20260204131554 20260311001846 20260311004527 20260311014518
  20260312223327 20260315142347 20260318010658 20260402131340
  20260402165152 20260407011316 20260422175356 20260422215547
  20260423021906 20260423185819
)

STILL_MISSING=0
for ver in "${EXPECTED[@]}"; do
  EXISTS=$(docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
    psql -U supabase_admin -d postgres -tAq \
    -c "SELECT COUNT(*) FROM $SCHEMA_MIGRATIONS WHERE version='$ver';")
  if [ "$EXISTS" != "1" ]; then
    err "AINDA FALTANDO: $ver"
    STILL_MISSING=$((STILL_MISSING + 1))
  fi
done

if [ "$STILL_MISSING" -eq 0 ]; then
  echo ""
  echo "  ✓ TODAS as 18 migrations estão agora registradas!"
else
  echo ""
  err "$STILL_MISSING migration(s) ainda pendentes."
fi

# Verifica colunas críticas em activities
log "Checando colunas críticas em activities..."
docker exec -e PGPASSWORD="$PGPW" "$CONTAINER" \
  psql -U supabase_admin -d postgres -c \
  "SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema='public' AND table_name='activities'
     AND column_name IN ('is_trashed','trashed_at','created_by','created_by_email','closed_at')
   ORDER BY column_name;"

echo "=========================================================="
echo " Script concluído."
echo "=========================================================="
