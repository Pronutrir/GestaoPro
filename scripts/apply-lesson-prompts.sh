#!/bin/bash
set -e
# LIÇÕES APRENDIDAS: captura por gatilho de evento e ciclo até a ação.
# Cria lesson_prompts (convites com contexto), acrescenta origem/ciclo/reuso em
# lessons_learned, e a função generate_lesson_prompts.
#
# TAMBÉM CORRIGE um defeito existente: o ramo 'blocked' de
# generate_overdue_notifications procurava workflow_stages.is_blocked, mas a
# flag migrou para activities em 29/07 — nenhum aviso de bloqueio saía desde
# então.
#
# Aditiva e idempotente; sem ela a aba Lições segue como formulário manual.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-lesson-prompts.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
MIGRATION="supabase/migrations/20260731140000_lesson_prompts.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
VERSION="20260731140000"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES ──"
$PSQL -c "SELECT to_regclass('public.lesson_prompts') AS prompts;"
$PSQL -c "SELECT count(*) AS licoes_com_categoria_invalida FROM public.lessons_learned
          WHERE category NOT IN ('general','technical','process','communication','risk','quality');"

echo "── APLICANDO ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/lesson_prompts.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/lesson_prompts.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at) VALUES ('${VERSION}', NOW()) ON CONFLICT DO NOTHING;"

echo "── DEPOIS (tabela, colunas e as 2 funcoes) ──"
$PSQL -c "SELECT to_regclass('public.lesson_prompts') AS prompts;"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='lessons_learned'
            AND column_name IN ('source_activity_id','lifecycle','owner_id','reuse_count') ORDER BY 1;"
$PSQL -c "SELECT proname FROM pg_proc WHERE proname IN ('generate_lesson_prompts','generate_overdue_notifications');"
