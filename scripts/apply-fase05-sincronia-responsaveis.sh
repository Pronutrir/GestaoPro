#!/bin/bash
set -e
# ============================================================================
# FASE 05 — A SINCRONIA QUE A FASE 02 PROMETEU E NÃO ESCREVEU
#
# `activity_assignees` foi criada e preenchida por backfill, mas NADA a
# mantém em dia: o único trigger sobre ela valida permissão. Ela é um retrato
# do momento do backfill, e envelhece uma linha por atribuição nova.
#
# Medido em 26/08/2026: 667 atividades com `assigned_to`, 663 com linha na
# tabela — 4 já divergiam.
#
# POR QUE ISTO VEM ANTES DE MIGRAR AS 284 LEITURAS: ler de uma tabela que não
# acompanha escrita faz a tela mostrar responsável vencido, e o sintoma
# ("sumiu o responsável de algumas tarefas") não se parece com o que é.
#
# ROLLBACK: supabase/migrations/20260826160001_fase05_rollback.sql
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-fase05-sincronia-responsaveis.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "── PRÉ-REQUISITO ──"
$PSQL -v ON_ERROR_STOP=1 -c "DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='activity_assignees') THEN
    RAISE EXCEPTION 'aplique apply-fase02-assignees.sh ANTES desta';
  END IF;
END \$\$;"
echo "  ✓ fase 02 aplicada"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ANTES — o tamanho da divergência"
echo "══════════════════════════════════════════════════════════"

$PSQL -c "
SELECT
  (SELECT count(*) FROM public.activities
    WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> '' AND is_trashed = false)
    AS com_assigned_to,
  (SELECT count(*) FROM public.activity_assignees WHERE papel = 'responsavel')
    AS linhas_na_tabela;"

echo ""
echo "Atividades com responsável e SEM linha na tabela (a tela nova perderia):"
$PSQL -c "
SELECT count(*) AS sem_linha
  FROM public.activities a
 WHERE a.assigned_to IS NOT NULL
   AND btrim(a.assigned_to) <> ''
   AND a.is_trashed = false
   AND NOT EXISTS (SELECT 1 FROM public.activity_assignees x
                    WHERE x.activity_id = a.id AND x.papel = 'responsavel');"

echo ""
echo "── O CASO QUE NÃO SE RESOLVE SOZINHO ──"
echo "Nomes REPETIDOS em profiles: 'assigned_to' é texto, e nome ambíguo não"
echo "resolve para pessoa nenhuma. Estas atividades ficam SEM linha de propósito"
echo "— gravar o profile errado é pior que não gravar."
$PSQL -c "
SELECT lower(btrim(full_name)) AS nome, count(*) AS perfis
  FROM public.profiles
 WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
 GROUP BY 1 HAVING count(*) > 1
 ORDER BY 2 DESC;"

echo ""
echo "   Se aparecer 'williame correia de lima' aqui, é o caso já conhecido"
echo "   (dois perfis ativos, ids diferentes). Resolver a duplicidade é outro"
echo "   trabalho — esta migration apenas não chuta qual dos dois é."

echo ""
read -r -p "Aplicar a sincronia? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

FILE="supabase/migrations/20260826160000_fase05_sincronia_dos_responsaveis.sql"
[ -f "$FILE" ] || { echo "ERRO: migration não encontrada: $FILE"; exit 1; }

docker cp "$FILE" "$CONTAINER:/tmp/mig.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (20260826160000, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  DEPOIS"
echo "══════════════════════════════════════════════════════════"

$PSQL -c "
SELECT
  (SELECT count(*) FROM public.activities
    WHERE assigned_to IS NOT NULL AND btrim(assigned_to) <> '' AND is_trashed = false)
    AS com_assigned_to,
  (SELECT count(*) FROM public.activity_assignees WHERE papel = 'responsavel')
    AS linhas_na_tabela,
  (SELECT count(*) FROM public.activities a
    WHERE a.assigned_to IS NOT NULL AND btrim(a.assigned_to) <> '' AND a.is_trashed = false
      AND public.resolver_profile_do_texto(a.assigned_to) IS NULL)
    AS nao_resolvem_o_nome;"

echo ""
echo "Os TRÊS triggers estão de pé?"
$PSQL -c "
SELECT tgname,
       CASE WHEN tgenabled = 'O' THEN 'ativo' ELSE 'DESABILITADO' END AS estado
  FROM pg_trigger
 WHERE tgname IN ('trg_assigned_to_para_tabela',
                  'trg_participants_para_tabela',
                  'trg_tabela_para_assigned_to')
 ORDER BY tgname;"

echo ""
echo "E os participantes, que também passaram a sincronizar:"
$PSQL -c "
SELECT
  (SELECT count(*) FROM public.activities
    WHERE participants IS NOT NULL AND cardinality(participants) > 0 AND is_trashed = false)
    AS atividades_com_participante,
  (SELECT count(*) FROM public.activity_assignees WHERE papel = 'participante')
    AS linhas_participante;"

echo ""
echo "TESTE VIVO — atribua alguém a uma atividade pela tela e confira:"
echo "  SELECT papel, user_id FROM activity_assignees WHERE activity_id = '<id>';"
echo "A linha tem de aparecer sozinha. Se não aparecer, o trigger não pegou —"
echo "e aí NÃO migre nenhuma leitura para a tabela."
echo ""
echo "Se algo der errado:"
echo "  docker cp supabase/migrations/20260826160001_fase05_rollback.sql $CONTAINER:/tmp/rb.sql"
echo "  docker exec -i $CONTAINER psql -U supabase_admin -d postgres -f /tmp/rb.sql"
echo ""
echo "✓ concluído"
