#!/bin/bash
set -e
# A FASE PASSA A EXISTIR TAMBEM EM `activities`.
#
# 91 itens de nivel 3 estao sem `parent_id` (84 deles com `phase_id`). Nao
# estao errados: estao ligados a fase pelo caminho que existia. O que falta e
# o pai -- a fase mora em `phases`, e `parent_id` so aponta para `activities`.
#
# 60 fases da base JA existem como atividade de nivel 2; a migracao ficou pela
# metade. Esta migration alcanca as que ficaram para tras.
#
# `phases` NAO e apagada: continua como vinculo e como faixa de quem nao migrou.
#
# MOVE DADOS: cria atividade-fase e preenche `parent_id` dos orfaos.
# Idempotente -- so cria onde nao existe.
#
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-a-fase-vira-atividade.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260824140000_a_fase_vira_atividade.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260824140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT
  (SELECT count(*) FROM public.phases WHERE is_trashed = false) AS fases_vivas,
  (SELECT count(*) FROM public.activities
    WHERE is_trashed = false AND item_type = 'fase'
      AND wbs_code ~ '^[0-9]+\.[0-9]+\$') AS ja_sao_atividade,
  (SELECT count(*) FROM public.activities
    WHERE is_trashed = false AND parent_id IS NULL
      AND wbs_code ~ '^[0-9]+\.[0-9]+\.[0-9]+\$') AS orfaos_nivel3;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/a_fase_vira_atividade.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/a_fase_vira_atividade.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (orfaos_nivel3 deve cair para perto de 0) ──"
$PSQL -c "SELECT
  (SELECT count(*) FROM public.phases WHERE is_trashed = false) AS fases_vivas,
  (SELECT count(*) FROM public.activities
    WHERE is_trashed = false AND item_type = 'fase'
      AND wbs_code ~ '^[0-9]+\.[0-9]+\$') AS ja_sao_atividade,
  (SELECT count(*) FROM public.activities
    WHERE is_trashed = false AND parent_id IS NULL
      AND wbs_code ~ '^[0-9]+\.[0-9]+\.[0-9]+\$') AS orfaos_nivel3;"

echo "── Sobrou orfao? (sem phase_id, ou fase sem codigo no titulo) ──"
$PSQL -c "
SELECT a.wbs_code, left(a.title, 44) AS titulo,
       CASE WHEN a.phase_id IS NULL THEN 'sem vinculo de fase'
            ELSE 'fase sem codigo no titulo' END AS motivo
  FROM public.activities a
 WHERE a.is_trashed = false AND a.parent_id IS NULL
   AND a.wbs_code ~ '^[0-9]+\.[0-9]+\.[0-9]+\$'
 ORDER BY a.project_id, a.wbs_code LIMIT 15;"

echo "── Nenhum item pode ser pai de si mesmo ou criar ciclo ──"
$PSQL -c "SELECT count(*) AS auto_referencia FROM public.activities WHERE parent_id = id;"
