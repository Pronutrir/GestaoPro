#!/bin/bash
# fix-pending-migrations-v3.sh
# Registra as 18 migrations pendentes em public.schema_migrations
# e executa o SQL necessário para as que ainda precisam
#
# public.schema_migrations colunas: version bigint, inserted_at timestamp
# has_role: NÃO EXISTE no banco — precisa ser criada
# user_roles.role: text (não enum app_role)
# profiles: sem coluna email

set -uo pipefail

PW="***REMOVED***"
CONTAINER="supabase-db-1"

echo "================================================================"
echo " Fix das 18 migrations pendentes - v3"
echo "================================================================"

# Helper: executa SQL via stdin (heredoc); não aborta em erro de SQL
psql_run() {
  docker exec -i -e PGPASSWORD="$PW" "$CONTAINER" \
    psql -U supabase_admin -d postgres "$@"
}

mark() {
  local v=$1
  echo "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ($v, now()) ON CONFLICT (version) DO NOTHING;" \
    | psql_run -tAq 2>&1
  echo "  ✓ Marcado: $v"
}

# ----------------------------------------------------------------
# PASSO 1: Criar função has_role (user_roles.role é text)
# ----------------------------------------------------------------
echo ""
echo "[PASSO 1] Criando função public.has_role..."
psql_run << 'EOSQL'
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$func$;
EOSQL
echo "  ✓ has_role criada"

# ----------------------------------------------------------------
# PASSO 2: Grupo A — objetos já existem, só marcar
# ----------------------------------------------------------------
echo ""
echo "[PASSO 2] Marcando migrations do Grupo A (objetos já existem)..."
for v in \
  20251125195123 \
  20251126192451 \
  20251127132421 \
  20251203123946 \
  20260204131554 \
  20260311001846 \
  20260311004527 \
  20260311014518 \
  20260312223327 \
  20260315142347 \
  20260318010658 \
  20260402165152 \
  20260407011316 \
  20260422175356 \
  20260423185819
do
  mark "$v"
done

# ----------------------------------------------------------------
# PASSO 3: 20260402131340 — REPLICA IDENTITY + publication
#           seed de guilherme.gomes IGNORADO (profiles sem email)
# ----------------------------------------------------------------
echo ""
echo "[PASSO 3] 20260402131340: REPLICA IDENTITY + publication..."
psql_run << 'EOSQL'
ALTER TABLE public.project_members REPLICA IDENTITY FULL;
ALTER TABLE public.user_tab_permissions REPLICA IDENTITY FULL;

DO $do$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'project_members já está na publication: %', SQLERRM;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_tab_permissions;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'user_tab_permissions já está na publication: %', SQLERRM;
  END;
END
$do$;
EOSQL
echo "  ✓ REPLICA IDENTITY e publication OK (seed ignorado — profiles sem email)"
mark 20260402131340

# ----------------------------------------------------------------
# PASSO 4: 20260422215547 — políticas holidays + user_work_schedules
# ----------------------------------------------------------------
echo ""
echo "[PASSO 4] 20260422215547: políticas holidays + user_work_schedules..."
psql_run << 'EOSQL'
-- holidays
DROP POLICY IF EXISTS "Admins manage holidays" ON public.holidays;
DROP POLICY IF EXISTS "Admins and gestores manage holidays" ON public.holidays;

CREATE POLICY "Admins and gestores manage holidays"
  ON public.holidays FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'gestor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'gestor')
  );

-- user_work_schedules
ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read all schedules" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Users manage own schedule" ON public.user_work_schedules;
DROP POLICY IF EXISTS "Admins manage all schedules" ON public.user_work_schedules;

CREATE POLICY "Read all schedules"
  ON public.user_work_schedules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users manage own schedule"
  ON public.user_work_schedules FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage all schedules"
  ON public.user_work_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
EOSQL
echo "  ✓ Políticas holidays e user_work_schedules criadas"
mark 20260422215547

# ----------------------------------------------------------------
# PASSO 5: 20260423021906 — move subtarefas órfãs para lixeira
# ----------------------------------------------------------------
echo ""
echo "[PASSO 5] 20260423021906: move subtarefas órfãs para lixeira..."
psql_run << 'EOSQL'
UPDATE public.activities AS child
SET is_trashed = true,
    trashed_at = COALESCE(child.trashed_at, now())
FROM public.activities AS parent
WHERE child.parent_id = parent.id
  AND parent.is_trashed = true
  AND child.is_trashed = false;
EOSQL
echo "  ✓ Subtarefas órfãs movidas para lixeira"
mark 20260423021906

# ----------------------------------------------------------------
# PASSO 6: Verificação final
# ----------------------------------------------------------------
echo ""
echo "================================================================"
echo " Verificação final"
echo "================================================================"
echo ""
echo "Total de migrations registradas:"
echo "SELECT COUNT(*) FROM public.schema_migrations;" | psql_run -tAq

echo ""
echo "Verificando as 18 migrations pendentes:"
psql_run -tAq << 'EOSQL'
SELECT version,
       CASE WHEN version IN (
         20251125195123,20251126192451,20251127132421,20251203123946,
         20260204131554,20260311001846,20260311004527,20260311014518,
         20260312223327,20260315142347,20260318010658,20260402131340,
         20260402165152,20260407011316,20260422175356,20260422215547,
         20260423021906,20260423185819
       ) THEN 'PENDENTE -> AGORA OK' ELSE 'existia antes' END AS status
FROM public.schema_migrations
WHERE version IN (
  20251125195123,20251126192451,20251127132421,20251203123946,
  20260204131554,20260311001846,20260311004527,20260311014518,
  20260312223327,20260315142347,20260318010658,20260402131340,
  20260402165152,20260407011316,20260422175356,20260422215547,
  20260423021906,20260423185819
)
ORDER BY version;
EOSQL

echo ""
echo "Verificando has_role:"
echo "SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname='has_role' AND pronamespace='public'::regnamespace;" \
  | psql_run -tAq

echo ""
echo "================================================================"
echo " Concluído!"
echo "================================================================"
