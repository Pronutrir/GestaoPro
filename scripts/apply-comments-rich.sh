#!/bin/bash
set -e
# CONVERSA DA ATIVIDADE — anexo, resposta, reação e registro de edição.
#
# activity_comments guardava só texto. Para discutir trabalho falta mostrar a
# tela, responder a um ponto específico e concordar sem gerar mais mensagem.
#
# Cria também o bucket PRIVADO activity-attachments: print de tarefa pode ter
# dado de cliente, e em bucket público a URL vira a credencial.
#
# Aditiva e idempotente. Rodar NA VM: PGPASSWORD=... ./scripts/apply-comments-rich.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260802120000_activity_comments_rich.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260802120000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='activity_comments' ORDER BY 1;"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/comments_rich.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/comments_rich.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='activity_comments'
            AND column_name IN ('attachments','reply_to_id','reactions','edited_at')
          ORDER BY 1;"
$PSQL -c "SELECT id, public FROM storage.buckets WHERE id = 'activity-attachments';"
$PSQL -c "SELECT policyname FROM pg_policies
          WHERE tablename='objects' AND policyname LIKE '%activity-attachments%' ORDER BY 1;"
