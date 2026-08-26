#!/bin/bash
set -e
# ============================================================================
# FASE 02 — DADOS E RLS
#
# Cria activity_assignees e activity_watchers, faz o backfill a partir de
# `assigned_to`/`participants`, ensina a via do ator a ler a tabela nova
# (SEM parar de ler as colunas antigas), e cria as duas views de fresta
# controlada.
#
# NADA É REMOVIDO. As colunas antigas continuam sendo a fonte do front até a
# fase 05 migrar as 284 leituras. A RLS aceita as duas vias por OR — o pior
# caso no intervalo é acesso a mais, nunca a menos.
#
# ATENÇÃO — a migration 20260825150000 ("Visualizar não edita") deve estar
# aplicada ANTES desta. A verificação abaixo falha alto se não estiver, porque
# esta fase reescreve `is_activity_actor_v2` e a outra depende de
# `can_update_activity_v2` continuar lendo `can_edit_own`.
#
# ROLLBACK: supabase/migrations/20260826120001_fase02_rollback.sql — leia o
# cabeçalho dele antes. Não é aplicado por este script.
#
# Idempotente: CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING +
# CREATE OR REPLACE. Rodar duas vezes não faz nada na segunda.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-fase02-assignees.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

run() {
  local version="$1" file="$2" nome="$3"
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  $nome"
  echo "══════════════════════════════════════════════════════════"
  if [ ! -f "$file" ]; then
    echo "  ERRO: migration não encontrada: $file"
    exit 1
  fi
  docker cp "$file" "$CONTAINER:/tmp/mig.sql"
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
            VALUES (${version}, NOW()) ON CONFLICT DO NOTHING;"
  echo "  ✓ aplicada"
}

echo "── PRÉ-REQUISITO ──"
$PSQL -v ON_ERROR_STOP=1 -c "DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_update_activity_v2'
       AND pg_get_functiondef(p.oid) LIKE '%can_edit_own%'
  ) THEN
    RAISE EXCEPTION 'aplique 20260825150000 (apply-visualizar-nao-edita.sh) ANTES desta fase';
  END IF;
END \$\$;"
echo "  ✓ 20260825150000 está aplicada"

echo ""
echo "── ANTES ──"
echo "Quantas linhas o backfill deve criar (aproximado):"
$PSQL -c "SELECT
            count(*) FILTER (WHERE assigned_to IS NOT NULL AND trim(assigned_to) <> '') AS com_responsavel,
            count(*) FILTER (WHERE participants IS NOT NULL AND array_length(participants,1) > 0) AS com_participantes,
            count(*) AS atividades_vivas
          FROM public.activities WHERE is_trashed = false;"

echo "Nomes em assigned_to que NÃO casam com nenhum perfil (não viram linha):"
$PSQL -c "SELECT count(DISTINCT a.assigned_to) AS nomes_orfaos
            FROM public.activities a
           WHERE a.is_trashed = false
             AND a.assigned_to IS NOT NULL AND trim(a.assigned_to) <> ''
             AND NOT EXISTS (
               SELECT 1 FROM public.profiles pr
                WHERE lower(trim(a.assigned_to)) = lower(trim(pr.id::text))
                   OR (pr.full_name IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
             );"
echo "   (esses continuam funcionando pela via legada — por isso ela não sai agora)"

run 20260826120000 "supabase/migrations/20260826120000_fase02_assignees_watchers_e_visibilidade.sql" \
  "activity_assignees + watchers + subárvore + as duas views"

echo ""
echo "── DEPOIS ──"
$PSQL -c "SELECT papel, count(*) FROM public.activity_assignees GROUP BY 1 ORDER BY 2 DESC;"
$PSQL -c "SELECT
            (SELECT count(*) FROM public.activity_assignees) AS assignees,
            (SELECT count(*) FROM public.activity_watchers)  AS watchers;"
echo ""
echo "A via do ator lê as DUAS fontes?"
$PSQL -c "SELECT
            pg_get_functiondef(p.oid) LIKE '%activity_assignees%' AS le_tabela_nova,
            pg_get_functiondef(p.oid) LIKE '%participants%'       AS le_colunas_antigas
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='is_activity_actor_v2';"
echo ""
echo "✓ concluído"
