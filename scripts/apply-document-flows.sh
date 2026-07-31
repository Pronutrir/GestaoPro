#!/bin/bash
set -e
# DOCUMENTOS: fluxo de ciência, aprovação e assinatura interna.
# Cria document_flows (envelope), document_participants (papel + ordem + prova)
# e document_flow_events (trilha append-only), mais as colunas de versão
# vigente em project_documents.
# Aditiva e idempotente; sem ela a aba Documentos segue como lista simples e
# avisa que o fluxo está indisponível.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-document-flows.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260731120000_document_flows.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260731120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.document_flows') AS flows,
                 to_regclass('public.document_participants') AS participants,
                 to_regclass('public.document_flow_events') AS events;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/document_flows.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/document_flows.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (3 tabelas + colunas de versao) ──"
$PSQL -c "SELECT to_regclass('public.document_flows') AS flows,
                 to_regclass('public.document_participants') AS participants,
                 to_regclass('public.document_flow_events') AS events;"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='project_documents'
            AND column_name IN ('is_current','supersedes_id','uploaded_by_id') ORDER BY 1;"
