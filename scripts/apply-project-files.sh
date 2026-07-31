#!/bin/bash
set -e
# CENTRAL DE DOCUMENTOS — fase 2: bucket `project-files` para upload de verdade.
#
# A aba Documentos só aceitava URL colada à mão. Este bucket é PRIVADO, ao
# contrário dos outros do sistema: aqui circulam contratos e termos assinados, e
# em bucket público a URL vira a credencial — quem recebe o link lê o arquivo
# sem ser membro do projeto, esvaziando o fluxo de assinatura.
#
# Depende de can_view_project_v2 / can_manage_project_v2 (já existem).
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-project-files.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260801110000_project_files_bucket.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260801110000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES (buckets existentes) ──"
$PSQL -c "SELECT id, public FROM storage.buckets ORDER BY id;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/project_files.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/project_files.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (project-files deve aparecer com public = f) ──"
$PSQL -c "SELECT id, public FROM storage.buckets WHERE id = 'project-files';"
$PSQL -c "SELECT policyname, cmd FROM pg_policies
          WHERE schemaname='storage' AND tablename='objects'
            AND policyname ILIKE '%project-files%' ORDER BY policyname;"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='project_documents'
            AND column_name = 'storage_path';"
