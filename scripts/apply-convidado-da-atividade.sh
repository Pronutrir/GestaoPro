#!/bin/bash
set -e
# ============================================================================
# QUEM TEM ATIVIDADE ATRIBUÍDA PASSA A LER O PROJETO
#
# Sintoma (18/08/2026): o front deixa entrar quem tem atividade atribuída e
# mostra só as atividades dela. A RLS discorda -- `can_view_project_v2` exige
# admin, líder ou MEMBRO, e não conhece a via "tenho atividade aqui".
#
# Das 10 duplas pessoa-projeto nessa situação, 8 recebiam `false` do banco:
# 149 atividades. O caso extremo é uma pessoa com 131 atividades num projeto
# que o banco não deixava ela ler. Não dava erro: o Kanban carregava VAZIO,
# indistinguível de um projeto sem atividades.
#
# A migration cria uma função separada (`can_view_project_work_v2`) e a usa só
# nas quatro tabelas do TRABALHO. `can_view_project_v2` fica intocada porque é
# usada em 33 pontos -- orçamento, TAP, documentos, arquivos --, e afrouxá-la
# entregaria o dossiê do projeto a quem tem uma atividade atribuída.
#
# É idempotente: só recria funções e policies.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-convidado-da-atividade.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

MIG="supabase/migrations/20260818150000_convidado_da_atividade.sql"
VERSION=20260818150000

if [ ! -f "$MIG" ]; then
  echo "ERRO: migration não encontrada: $MIG"
  exit 1
fi

echo "── ANTES: quem trabalha no projeto mas o banco não deixa ler ──"
# Nomes, não só um número: a saída precisa mostrar CASOS.
$PSQL -c "
SELECT pr.full_name AS pessoa,
       p.title      AS projeto,
       count(*)     AS atividades
  FROM public.activities a
  JOIN public.projects p  ON p.id = a.project_id
  JOIN public.profiles pr ON (
       (a.assigned_to IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
       OR a.created_by = pr.id)
 WHERE COALESCE(a.is_trashed, false) = false
   AND COALESCE(p.is_trashed, false) = false
   AND NOT public.can_view_project_v2(p.id, pr.id)
 GROUP BY pr.full_name, p.title
 ORDER BY count(*) DESC;"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Convidado da atividade  ·  vê o projeto, edita só as suas"
echo "══════════════════════════════════════════════════════════"
docker cp "$MIG" "$CONTAINER:/tmp/mig_convidado.sql"
# ON_ERROR_STOP: para no primeiro erro em vez de deixar o banco meio migrado.
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig_convidado.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (${VERSION}, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "── DEPOIS: a mesma consulta deve vir VAZIA ──"
$PSQL -c "
SELECT pr.full_name AS pessoa,
       p.title      AS projeto,
       count(*)     AS atividades
  FROM public.activities a
  JOIN public.projects p  ON p.id = a.project_id
  JOIN public.profiles pr ON (
       (a.assigned_to IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name)))
       OR a.created_by = pr.id)
 WHERE COALESCE(a.is_trashed, false) = false
   AND COALESCE(p.is_trashed, false) = false
   AND NOT public.can_view_project_work_v2(p.id, pr.id)
 GROUP BY pr.full_name, p.title
 ORDER BY count(*) DESC;"

echo ""
echo "── NINGUÉM PERDEU ACESSO? (a função nova é um OR sobre a antiga) ──"
# Se isto retornar qualquer linha, houve regressão: alguém que lia deixou de
# ler. Deve ser sempre 0 por construção, mas medir é mais barato que confiar.
$PSQL -c "
SELECT count(*) AS perderam_acesso
  FROM public.projects p
  CROSS JOIN public.profiles pr
 WHERE public.can_view_project_v2(p.id, pr.id)
   AND NOT public.can_view_project_work_v2(p.id, pr.id);"

echo ""
echo "── O orçamento e o TAP continuam FECHADOS para o convidado? ──"
# A via nova não pode ter vazado para can_view_project_v2.
$PSQL -c "
SELECT count(*) AS convidados_sem_acesso_ao_dossie
  FROM (
    SELECT DISTINCT a.project_id, pr.id AS user_id
      FROM public.activities a
      JOIN public.profiles pr ON (
           (a.assigned_to IS NOT NULL AND lower(trim(a.assigned_to)) = lower(trim(pr.full_name))))
     WHERE COALESCE(a.is_trashed, false) = false) v
 WHERE public.can_view_project_work_v2(v.project_id, v.user_id)
   AND NOT public.can_view_project_v2(v.project_id, v.user_id);"

echo ""
echo "  Esperado: DEPOIS vazia · perderam_acesso = 0 · o último número > 0"
echo "  (o último é a contagem de quem entra pela via nova SEM ver orçamento/TAP)"
