#!/bin/bash
set -e
# CENTRAL DE DOCUMENTOS — fase 3: comentários e menções na página escrita.
#
# Cria page_comments (conversa em trecho do documento, com resposta, resolução
# e menções). O comentário guarda o TEXTO citado como âncora, não a posição:
# posição envelhece a cada parágrafo inserido acima, o texto sobrevive à edição.
#
# Sem ela, o editor continua funcionando e o botão de comentar não aparece.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-page-comments.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260801120000_page_comments.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260801120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.page_comments') AS page_comments;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/page_comments.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/page_comments.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS ──"
$PSQL -c "SELECT to_regclass('public.page_comments') AS page_comments;"
$PSQL -c "SELECT policyname, cmd FROM pg_policies
          WHERE schemaname='public' AND tablename='page_comments' ORDER BY policyname;"
