#!/bin/bash
set -e
# ============================================================================
# NORMALIZA OS MEMBROS NUM ESTADO QUE A TELA NÃO SABE EXIBIR
#
# `can_create = true` com as outras três colunas `false`: a pessoa pode criar
# atividade, mas não pode editar nem mover — nem a que ela mesma acabou de
# criar. Não há nível na tela de equipe que signifique isso, então ela era
# exibida como o nível mais baixo, errado nos dois sentidos.
#
# Não foi escolha de ninguém: vinha do AddProjectDialog, que gravava esse
# estado para quem entrava na equipe na CRIAÇÃO do projeto, enquanto o
# EditProjectDialog gravava o preset completo para a mesma ação. As duas telas
# foram unificadas no mesmo commit desta migration.
#
# Medido em 18/08/2026: 2 linhas em 72. Vão para "Editar tudo" — o destino
# coerente com o único sinal deliberado da linha (alguém quis que criassem).
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-normaliza-membro-orfao.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260818160000_normaliza_membro_orfao.sql"
VERSION=20260818160000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: quem está no estado órfão (com nome, para ficar rastreável) ──"
$PSQL -c "
SELECT pr.full_name AS pessoa,
       p.title      AS projeto,
       pm.can_create, pm.can_edit, pm.can_move, pm.can_delete
  FROM public.project_members pm
  JOIN public.projects p  ON p.id = pm.project_id
  LEFT JOIN public.profiles pr ON pr.id = pm.user_id
 WHERE COALESCE(pm.can_create, false) = true
   AND COALESCE(pm.can_edit,   false) = false
   AND COALESCE(pm.can_move,   false) = false
   AND COALESCE(pm.can_delete, false) = false;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Órfãos passam a 'Editar tudo' (criar + editar + mover)"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig_orfao.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de deixar o banco meio migrado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig_orfao.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: o estado órfão deve ter sumido (esperado: 0) ──"
$PSQL -c "
SELECT count(*) AS ainda_orfaos
  FROM public.project_members
 WHERE COALESCE(can_create, false) = true
   AND COALESCE(can_edit,   false) = false
   AND COALESCE(can_move,   false) = false
   AND COALESCE(can_delete, false) = false;"

echo ""
echo "── DEPOIS: todas as combinações que restam ──"
# Só devem sobrar as três canônicas: ---- , CE-M , CEDM.
$PSQL -c "
SELECT (CASE WHEN can_create THEN 'C' ELSE '-' END)
    || (CASE WHEN can_edit   THEN 'E' ELSE '-' END)
    || (CASE WHEN can_delete THEN 'D' ELSE '-' END)
    || (CASE WHEN can_move   THEN 'M' ELSE '-' END) AS combo,
       count(*) AS membros
  FROM public.project_members
 GROUP BY 1
 ORDER BY count(*) DESC;"

echo ""
echo "  Esperado: ainda_orfaos = 0, e só as combinações ----, CE-M e CEDM."
echo "  Qualquer outra combinação é estado que a tela aproxima ao salvar."
