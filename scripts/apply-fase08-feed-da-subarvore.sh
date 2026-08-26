#!/bin/bash
set -e
# ============================================================================
# FASE 08 — O FEED DO PAI AGREGA OS EVENTOS DAS FILHAS
#
# Cria `activity_feed_events` (view) e `feed_da_subarvore()`. NÃO cria tabela
# nova: os eventos já existem em `audit_log` (22.557 linhas de activities) e
# `activity_comments`. Uma tabela seria um terceiro lugar, exigiria caminho de
# escrita novo em cada ponto que grava hoje — e nasceria sem o histórico antigo.
#
# A COISA A CONFERIR NA SAÍDA é o `security_invoker=true`. Sem ele o feed
# entrega a conversa das irmãs invisíveis a quem entra por atribuição — o furo
# que a P00 fecha, reaberto por outra porta. A migration falha alto se faltar,
# e a sonda abaixo confirma depois.
#
# Não tem rollback dedicado: são objetos de leitura, e derrubar é
#   DROP FUNCTION feed_da_subarvore(uuid,int,timestamptz);
#   DROP FUNCTION subarvore_da_atividade(uuid);
#   DROP VIEW activity_feed_events;
# Nenhuma tela lê isso ainda, então derrubar não quebra nada.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-fase08-feed-da-subarvore.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── ANTES — de onde os eventos vêm ──"
$PSQL -c "
SELECT
  (SELECT count(*) FROM public.audit_log WHERE table_name='activities') AS historico,
  (SELECT count(*) FROM public.activity_comments WHERE is_trashed=false) AS conversa;"

echo ""
read -r -p "Aplicar a fase 08? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

FILE="supabase/migrations/20260826170000_fase08_eventos_da_subarvore.sql"
[ -f "$FILE" ] || { echo "ERRO: migration não encontrada: $FILE"; exit 1; }

docker cp "$FILE" "$CONTAINER:/tmp/mig.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (20260826170000, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS — a conferência que importa ──"
$PSQL -c "
SELECT c.relname,
       CASE WHEN c.reloptions::text LIKE '%security_invoker=true%'
            THEN 'OK — passa pela RLS de quem consulta'
            ELSE 'PERIGO — entrega a conversa das irmãs invisíveis' END AS estado
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname='activity_feed_events';"

echo ""
echo "As funções NÃO podem ser SECURITY DEFINER:"
$PSQL -c "
SELECT p.proname,
       CASE WHEN p.prosecdef THEN 'PERIGO — é DEFINER' ELSE 'OK — invoker' END AS estado
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('feed_da_subarvore','subarvore_da_atividade')
 ORDER BY 1;"

echo ""
echo "Teste — o feed de um pai com filhas (troque o uuid):"
echo "  SELECT wbs_code, tipo, ocorrido_em, autor FROM feed_da_subarvore('<id-do-pai>', 20);"
echo ""
echo "Deve trazer linhas das FILHAS junto, com o wbs_code delas. E, entrando"
echo "como alguém que só enxerga a própria atividade, NÃO pode trazer as irmãs."
echo ""
echo "✓ concluído"
