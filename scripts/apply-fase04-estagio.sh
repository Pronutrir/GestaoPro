#!/bin/bash
set -e
# ============================================================================
# FASE 04 — O ESTÁGIO VIRA CAMPO DA ATIVIDADE
#
# ATENÇÃO — ESTA É A TERCEIRA TENTATIVA de levar a separação backlog/quadro ao
# banco. As duas anteriores falharam igual (decisão de 20/08/2026: "a regra só
# valia onde a migration tivesse rodado, e nos projetos antigos o Backlog
# voltava ao quadro sem ninguém pedir").
#
# O que muda desta vez: o campo é ESPELHO, não autoridade. Ele é derivado da
# coluna de workflow por trigger, e NADA no front o lê ainda. Se ele divergir,
# quem manda continua sendo a coluna — e a sonda "DEPOIS" detecta a divergência.
#
# CRITÉRIO DE ABANDONO: se aparecer uma atividade com `estagio` divergindo da
# coluna sem alguém ter movido, a tentativa falhou como as outras duas. A
# consulta que detecta isso roda no fim deste script — guarde a saída.
#
# Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE + UPDATE condicional.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-fase04-estagio.sh
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
echo ""
echo "1) Colunas que a regra considera FILA (deve casar com o que o Kanban esconde):"
$PSQL -c "SELECT COALESCE(categoria,'(null)') AS categoria, title, count(*) AS colunas
            FROM public.workflow_stages
           WHERE (categoria IS NOT NULL AND lower(trim(categoria)) = 'backlog')
              OR (COALESCE(categoria,'') = '' AND lower(trim(COALESCE(title,''))) IN ('backlog','fila','a fila','fila de espera'))
           GROUP BY 1,2 ORDER BY 3 DESC;"

echo "2) ARMADILHA — colunas com 'backlog' no NOME mas outra categoria:"
$PSQL -c "SELECT categoria, title, count(*) AS colunas
            FROM public.workflow_stages
           WHERE lower(trim(COALESCE(title,''))) LIKE '%backlog%'
             AND COALESCE(lower(trim(categoria)),'') <> 'backlog'
           GROUP BY 1,2;"
echo "   (essas NÃO viram fila — a categoria manda sobre o nome, como em ehBacklog)"

echo "3) Quantas atividades vão para cada estágio:"
$PSQL -c "SELECT CASE WHEN a.workflow_stage_id IS NOT NULL
                       AND EXISTS (SELECT 1 FROM public.workflow_stages s
                                    WHERE s.id = a.workflow_stage_id
                                      AND lower(trim(COALESCE(s.categoria,''))) = 'backlog')
                      THEN 'backlog' ELSE 'quadro' END AS estagio,
                 count(*)
            FROM public.activities a WHERE a.is_trashed = false
           GROUP BY 1 ORDER BY 2 DESC;"

echo ""
read -r -p "Aplicar a migration? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

run 20260826140000 "supabase/migrations/20260826140000_fase04_estagio.sql" \
  "activities.estagio + trigger de sincronia + backfill"

echo ""
echo "── DEPOIS ──"
$PSQL -c "SELECT estagio, count(*) FROM public.activities
           WHERE is_trashed = false GROUP BY 1 ORDER BY 2 DESC;"

echo ""
echo "O ESPELHO ESTÁ BATENDO? (tem de ser ZERO — guarde esta saída)"
$PSQL -c "SELECT count(*) AS divergentes
            FROM public.activities a
           WHERE a.is_trashed = false
             AND a.estagio IS DISTINCT FROM (CASE
                   WHEN a.workflow_stage_id IS NOT NULL
                    AND public.eh_coluna_de_fila(a.workflow_stage_id) THEN 'backlog'
                   ELSE 'quadro' END::public.activity_estagio);"
echo ""
echo "   Rode esta mesma consulta daqui a alguns dias. Se o número deixar de"
echo "   ser zero sem ninguém ter movido nada, a terceira tentativa falhou como"
echo "   as duas anteriores — e o campo deve ser abandonado, não remendado."
echo ""
echo "✓ concluído"
