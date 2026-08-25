#!/bin/bash
set -e
# ============================================================================
# O GESTOR DO PROJETO PASSA A SER RECONHECIDO PELA VIA DA EQUIPE
#
# `can_member_action` — a função que autoriza pela permissão da equipe, e que
# está no caminho de toda escrita em atividade — chamava a versão LEGADA de
# `is_project_leader`, que conhece só `projects.owner`.
#
# O campo `projects.manager` (Gestor do Projeto) nasceu em 20260729140000 e só
# foi ensinado à `is_project_leader_v2`. Resultado: a tela usa
# `podeGerenciarProjeto` (owner OU manager OU admin) e diz que o gestor pode;
# esta via do banco dizia que não.
#
# Idempotente: CREATE OR REPLACE. Rodar duas vezes não faz nada na segunda.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-gestor-do-projeto-na-via-da-equipe.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

run() {
  local version="$1" file="$2" nome="$3"
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  $nome"
  echo "══════════════════════════════════════════════════════════"
  if [ ! -f "$file" ]; then
    echo "  ERRO: migration não encontrada: $file"
    exit 1
  fi
  docker cp "$file" "$CONTAINER:/tmp/mig.sql"
  $PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
  $PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
            VALUES (${version}, NOW()) ON CONFLICT DO NOTHING;"
  echo "  ✓ aplicada"
}

echo "── ANTES ──"
echo "Projetos com gestor definido que NÃO é o dono (os afetados):"
$PSQL -c "SELECT count(*) AS projetos_com_gestor_distinto
            FROM public.projects
           WHERE manager IS NOT NULL
             AND trim(manager) <> ''
             AND lower(trim(coalesce(manager,''))) <> lower(trim(coalesce(owner,'')))
             AND is_trashed = false;"
echo "A função aponta hoje para:"
$PSQL -c "SELECT CASE
             WHEN pg_get_functiondef(p.oid) LIKE '%is_project_leader_v2%' THEN 'is_project_leader_v2 (já corrigida)'
             ELSE 'is_project_leader (LEGADA — não conhece manager)'
           END AS versao
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_member_action';"

run 20260825140000 "supabase/migrations/20260825140000_gestor_do_projeto_na_via_da_equipe.sql" \
  "can_member_action passa a usar is_project_leader_v2  ·  o gestor é reconhecido"

echo ""
echo "── DEPOIS ──"
$PSQL -c "SELECT CASE
             WHEN pg_get_functiondef(p.oid) LIKE '%is_project_leader_v2%' THEN 'OK — is_project_leader_v2'
             ELSE 'FALHOU — ainda na legada'
           END AS versao
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='can_member_action';"
echo ""
echo "✓ concluído"
