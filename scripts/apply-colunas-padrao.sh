#!/bin/bash
set -e
# ============================================================================
# COLUNAS PADRÃO DE PROJETO NOVO
#
# Projeto novo nascia com cinco colunas: A Fazer · Em Andamento · Em Teste ·
# Aprovada · Concluída. "Em Teste" e "Aprovada" são etapas de um fluxo de
# desenvolvimento de software e vinham em TODO projeto, inclusive nos que não
# têm teste nem aprovação nenhuma.
#
# Passa a nascer com: Não iniciado · Em Andamento · Pendências · Concluída.
#
# Também corrige a FONTE do nome "A Fazer": a 20260814120000 renomeou o título
# em 41 projetos, mas não tocou nesta função — cada projeto criado depois dela
# reintroduzia o nome antigo, e a padronização se desfazia sozinha.
#
# Pendências entra com categoria `espera` (não `andamento`): não conta no
# limite de trabalho simultâneo nem avança o percentual, que é a semântica
# correta de "parado esperando alguém de fora".
#
# NÃO toca em projeto existente: cada um tem o quadro que sua equipe montou.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-colunas-padrao.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260818180000_colunas_padrao_do_projeto_novo.sql"
VERSION=20260818180000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: o que a função cria hoje ──"
$PSQL -c "
SELECT substring(pg_get_functiondef(oid) from 'VALUES(.*)RETURN') AS colunas_padrao
  FROM pg_proc
 WHERE proname = 'create_default_workflow_stages'
   AND pronamespace = 'public'::regnamespace;"

echo ""
echo "── 'espera' precisa existir no enum (veio da 20260812140000) ──"
# Se isto vier vazio, a migration falha: pare e aplique a 20260812140000 antes.
$PSQL -c "
SELECT enumlabel
  FROM pg_enum
 WHERE enumtypid = 'public.workflow_category'::regtype
 ORDER BY enumsortorder;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Não iniciado · Em Andamento · Pendências · Concluída"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig_colunas.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de deixar o banco meio migrado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig_colunas.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: o novo padrão ──"
$PSQL -c "
SELECT substring(pg_get_functiondef(oid) from 'VALUES(.*)RETURN') AS colunas_padrao
  FROM pg_proc
 WHERE proname = 'create_default_workflow_stages'
   AND pronamespace = 'public'::regnamespace;"

echo ""
echo "── Projetos existentes NÃO foram tocados ──"
# O total de colunas por projeto deve continuar igual ao de antes da migration.
$PSQL -c "
SELECT count(*) AS colunas_no_total,
       count(DISTINCT project_id) AS projetos
  FROM public.workflow_stages;"

echo ""
echo "  Esperado: a função sem 'A Fazer' e com 'Pendências';"
echo "  os totais acima iguais aos de antes (nada retroativo)."
