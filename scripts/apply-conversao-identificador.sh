#!/bin/bash
set -e
# ============================================================================
# CONVERSÃO nome → identificador  ·  PARTE (a)
#
# Adiciona as colunas de identificador AO LADO das de texto, guarda o nome
# original numa coluna sombra, e converte só os registros cujo nome resolve
# para UM perfil ativo.
#
# NUNCA APAGA NOME. `assigned_to`, `participants`, `owner` e `manager`
# continuam exatamente como estão — e a sombra é uma segunda cópia.
#
# Os ambíguos ficam PENDENTES de propósito e estão listados em
# docs/medicoes/ambiguos-26-08-2026.md. Para convertê-los depois da decisão:
#   PERFIL=<uuid> ./scripts/desempatar-homonimo.sh
#
# ROLLBACK: supabase/migrations/20260826200001_conversao_rollback.sql
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-conversao-identificador.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "══════════════════════════════════════════════════════════"
echo "  ANTES — o que vai converter, e o que não"
echo "══════════════════════════════════════════════════════════"

echo ""
echo "Nomes que pertencem a mais de um perfil ATIVO (a causa dos pendentes):"
$PSQL -c "
SELECT lower(btrim(full_name)) AS nome, count(*) AS perfis_ativos
  FROM public.profiles
 WHERE is_active = true AND full_name IS NOT NULL AND btrim(full_name) <> ''
 GROUP BY 1 HAVING count(*) > 1
 ORDER BY 2 DESC;"
echo "   Vazio = tudo converte. Cada linha aqui vira um bloco de pendentes."

echo ""
echo "activities.assigned_to:"
$PSQL -c "
WITH amb AS (
  SELECT lower(btrim(full_name)) AS nome FROM public.profiles
   WHERE is_active = true AND full_name IS NOT NULL
   GROUP BY 1 HAVING count(*) > 1
)
SELECT count(*) AS preenchidos,
       count(*) FILTER (WHERE lower(btrim(a.assigned_to)) NOT IN (SELECT nome FROM amb))
         AS convertem,
       count(*) FILTER (WHERE lower(btrim(a.assigned_to)) IN (SELECT nome FROM amb))
         AS pendentes,
       count(*) FILTER (WHERE a.is_trashed = false
                          AND lower(btrim(a.assigned_to)) IN (SELECT nome FROM amb))
         AS pendentes_vivas
  FROM public.activities a
 WHERE a.assigned_to IS NOT NULL AND btrim(a.assigned_to) <> '';"

echo ""
echo "projects.owner / manager:"
$PSQL -c "
WITH amb AS (
  SELECT lower(btrim(full_name)) AS nome FROM public.profiles
   WHERE is_active = true AND full_name IS NOT NULL
   GROUP BY 1 HAVING count(*) > 1
)
SELECT count(*) FILTER (WHERE owner   IS NOT NULL AND btrim(owner)   <> '') AS owner_preenchido,
       count(*) FILTER (WHERE manager IS NOT NULL AND btrim(manager) <> '') AS manager_preenchido,
       count(*) FILTER (WHERE lower(btrim(owner))   IN (SELECT nome FROM amb)) AS owner_pendente,
       count(*) FILTER (WHERE lower(btrim(manager)) IN (SELECT nome FROM amb)) AS manager_pendente
  FROM public.projects WHERE is_trashed = false;"

echo ""
echo "   Conferido em 26/08: 344 de 1877 convertem, 1533 pendentes (450 vivas)."
echo "   Todos os pendentes vêm de UM nome: 'Williame Correia de Lima'."
echo ""
read -r -p "Aplicar a conversão? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

FILE="supabase/migrations/20260826200000_conversao_nome_para_identificador.sql"
[ -f "$FILE" ] || { echo "ERRO: migration não encontrada: $FILE"; exit 1; }

docker cp "$FILE" "$CONTAINER:/tmp/mig.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (20260826200000, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  DEPOIS"
echo "══════════════════════════════════════════════════════════"
$PSQL -c "
SELECT
  (SELECT count(*) FROM public.activities
    WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> '') AS com_responsavel,
  (SELECT count(*) FROM public.activities WHERE assigned_to_id IS NOT NULL) AS convertidos,
  (SELECT count(*) FROM public.activities
    WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> '' AND assigned_to_id IS NULL)
    AS pendentes,
  (SELECT count(*) FROM public.activities
    WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> ''
      AND assigned_to_nome_original IS NULL) AS sem_sombra;"

echo ""
echo "   sem_sombra TEM de ser 0 — é o que permite reverter."
echo ""
echo "O texto original continua intacto? (esperado: 0 divergências)"
$PSQL -c "
SELECT count(*) AS texto_divergente_da_sombra
  FROM public.activities
 WHERE assigned_to_nome_original IS NOT NULL
   AND assigned_to IS DISTINCT FROM assigned_to_nome_original;"

echo ""
echo "Os pendentes, por projeto (só vivas):"
$PSQL -c "
SELECT p.title AS projeto, count(*) AS atividades
  FROM public.activities a JOIN public.projects p ON p.id = a.project_id
 WHERE a.assigned_to IS NOT NULL AND btrim(a.assigned_to) <> ''
   AND a.assigned_to_id IS NULL AND a.is_trashed = false
 GROUP BY 1 ORDER BY 2 DESC;"

echo ""
echo "Para converter os pendentes, depois de decidir qual perfil é o certo:"
echo "  PERFIL=<uuid> ./scripts/desempatar-homonimo.sh"
echo ""
echo "Se algo der errado:"
echo "  docker cp supabase/migrations/20260826200001_conversao_rollback.sql $CONTAINER:/tmp/rb.sql"
echo "  docker exec -i $CONTAINER psql -U supabase_admin -d postgres -f /tmp/rb.sql"
echo ""
echo "✓ concluído"
