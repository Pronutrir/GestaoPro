#!/bin/bash
set -e
# Aplica a migration 20260720120000_restrict_roadmap_items_update_delete.sql.
#
# Rodar NA VM (20.65.208.119), onde o container do Postgres é alcançável:
#   PGPASSWORD=... ./scripts/apply-roadmap-rls-migration.sh
#
# Antes de trocar as policies, imprime as atuais — se algo der errado, o
# rollback está documentado no fim deste arquivo.

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"

MIGRATION="supabase/migrations/20260720120000_restrict_roadmap_items_update_delete.sql"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── Policies ANTES ──"
$PSQL -c "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='roadmap_items' ORDER BY cmd, policyname;"

echo
echo "── Aplicando migration ──"
docker cp "$MIGRATION" "$CONTAINER:/tmp/rls_roadmap.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/rls_roadmap.sql

echo
echo "── Policies DEPOIS ──"
$PSQL -c "SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='roadmap_items' ORDER BY cmd, policyname;"

echo
echo "── Verificação: has_role existe e responde ──"
$PSQL -c "SELECT proname FROM pg_proc WHERE proname='has_role';"

cat <<'FIM'

────────────────────────────────────────────────────────────────────────
TESTAR AGORA, logado como GESTOR na aplicação:
  1. Mover uma demanda de estágio (botão "Analisar")
  2. Salvar uma priorização
  3. Projetizar um item aprovado
E como USUÁRIO COMUM:
  4. Editar a própria solicitação em backlog (deve funcionar)
  5. Confirmar que não há botões de priorizar/mover

ROLLBACK (se os fluxos do gestor quebrarem):
  DROP POLICY IF EXISTS "Dono edita propria solicitacao nao priorizada" ON public.roadmap_items;
  DROP POLICY IF EXISTS "Gestor edita qualquer roadmap_item" ON public.roadmap_items;
  DROP POLICY IF EXISTS "Dono apaga propria solicitacao nao priorizada" ON public.roadmap_items;
  DROP POLICY IF EXISTS "Gestor apaga qualquer roadmap_item" ON public.roadmap_items;
  CREATE POLICY "Auth users can update roadmap_items" ON public.roadmap_items
    FOR UPDATE TO authenticated USING (true);
  CREATE POLICY "Auth users can delete roadmap_items" ON public.roadmap_items
    FOR DELETE TO authenticated USING (true);
────────────────────────────────────────────────────────────────────────
FIM
