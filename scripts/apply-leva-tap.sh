#!/bin/bash
set -e
# LEVA DE 31/07/2026 — aplica NA ORDEM e PARA no primeiro erro.
#
# Todo o código desta leva já está no repositório, mas depende destas migrations
# para funcionar. Enquanto não rodarem, as telas novas simplesmente somem (foi
# assim que degradaram de propósito) — o que passa a impressão de que nada foi
# implantado.
#
# ORDEM (há dependência real entre elas):
#   0) wbs_code                 coluna wbs_code em activities e phases, com
#                               backfill do prefixo do título. É DÍVIDA ANTIGA
#                               (migration de maio nunca aplicada): sem ela a
#                               importação de EAP falha na primeira fase com
#                               "Could not find the 'wbs_code' column of
#                               'phases'". Vem primeiro por ser o bug visível.
#   1) pages_rls_and_versions   RLS de project_pages + page_versions + page_id
#                               no envelope de fluxo. A 4 depende desta.
#   2) project_files_bucket     bucket privado dos arquivos de projeto.
#   3) page_comments            comentários por página.
#   4) tap_flow_and_versions    TAP como alvo de fluxo, charter_status,
#                               project_charter_versions e a função que
#                               NOTIFICA os participantes.
#   5) migrate_legacy_budget    converte os R$ 215.500 que hoje só existem em
#                               projects.budget_planned em item de orçamento.
#                               URGENTE: o botão antigo já foi escondido pelo
#                               código, então esses projetos estão exibindo
#                               orçamento zerado até isto rodar.
#
# Idempotente: rodar de novo não duplica nada.
# Rodar NA VM: PGPASSWORD=... ./scripts/apply-leva-tap.sh

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

run() {
  local version="$1" file="$2" nome="$3"
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  $version · $nome"
  echo "══════════════════════════════════════════════════════════"
  if [ ! -f "$file" ]; then
    echo "  ERRO: migration não encontrada: $file"
    exit 1
  fi
  docker cp "$file" "$CONTAINER:/tmp/mig.sql"
  # ON_ERROR_STOP: para no primeiro erro em vez de seguir com o banco meio
  # migrado, que é pior que não ter começado.
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
            VALUES ('${version}', NOW()) ON CONFLICT DO NOTHING;"
  echo "  ✓ aplicada"
}

echo "── PRÉ-REQUISITO: document_flows precisa existir ──"
$PSQL -t -c "SELECT to_regclass('public.document_flows');" | grep -q document_flows || {
  echo "ERRO: document_flows não existe. Rode antes: ./scripts/apply-document-flows.sh"
  exit 1
}
echo "  ✓ document_flows presente"

run 20260512013359 "supabase/migrations/20260512013359_0d23dad5-dd70-4dd9-bf05-9011ec5f18c5.sql" "wbs_code em activities e phases"
run 20260801100000 "supabase/migrations/20260801100000_pages_rls_and_versions.sql"      "RLS de páginas + versões"
run 20260801110000 "supabase/migrations/20260801110000_project_files_bucket.sql"        "Bucket privado de arquivos"
run 20260801120000 "supabase/migrations/20260801120000_page_comments.sql"               "Comentários por página"
run 20260801140000 "supabase/migrations/20260801140000_tap_flow_and_versions.sql"       "TAP como ato formal"
run 20260801130000 "supabase/migrations/20260801130000_migrate_legacy_budget_to_items.sql" "Orçamento legado → itens"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  VERIFICAÇÃO FINAL"
echo "══════════════════════════════════════════════════════════"

echo "── tabelas que deviam existir agora ──"
$PSQL -c "SELECT
            to_regclass('public.page_versions')            AS page_versions,
            to_regclass('public.page_comments')            AS page_comments,
            to_regclass('public.project_charter_versions') AS charter_versions;"

echo "── wbs_code (importação de EAP depende disto) ──"
$PSQL -c "SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema='public' AND column_name='wbs_code'
            AND table_name IN ('phases','activities') ORDER BY 1;"

echo "── colunas do TAP ──"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='projects'
            AND column_name IN ('charter_status','charter_version') ORDER BY 1;"
$PSQL -c "SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='document_flows'
            AND column_name IN ('document_id','page_id','charter_project_id') ORDER BY 1;"

echo "── função que notifica os participantes ──"
$PSQL -c "SELECT proname FROM pg_proc
          WHERE proname IN ('notify_flow_participants','on_participant_resolved') ORDER BY 1;"

echo "── orçamento: soma dos itens deve bater com o campo antigo ──"
$PSQL -c "SELECT p.title,
                 p.budget_planned AS legado,
                 coalesce(sum(b.total_cost),0) AS itens
          FROM public.projects p
          LEFT JOIN public.budget_items b ON b.project_id = p.id
          WHERE coalesce(p.budget_planned,0) > 0 AND p.is_trashed = false
          GROUP BY p.id, p.title, p.budget_planned
          ORDER BY p.budget_planned DESC;"

echo ""
echo "✓ Leva aplicada. Recarregue a aplicação (Ctrl+Shift+R) para ver:"
echo "   · painel de aprovação na aba TAP do projeto"
echo "   · blocos 'Aguardando você' e 'Enviados por você' no Dashboard"
echo "   · orçamento dos 6 projetos de volta na Composição"
