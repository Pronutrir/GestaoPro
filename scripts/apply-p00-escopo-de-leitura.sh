#!/bin/bash
set -e
# ============================================================================
# P00 — O ESCOPO DE LEITURA PASSA A VALER NA POLICY
#
# ESTA É A ÚNICA MIGRATION DESTA REVISÃO QUE TIRA LEITURA DE QUEM TRABALHA.
#
# O sintoma, se sair errada, é imediato e não se parece com um bug de
# permissão: a pessoa abre a tela e o item sumiu. Por isso a sonda vem antes,
# e por isso ela pergunta mais do que "quantas atividades".
#
# A PERGUNTA QUE DECIDE não é "quantas cada uma deixa de ver" — é "quantas
# dessas ela ABRIU nos últimos 90 dias". "Deixa de ver 40" trava a decisão;
# "deixa de ver 40, e abriu zero em 90 dias" é sinal verde.
#
# ROLLBACK: supabase/migrations/20260826150001_p00_rollback.sql — devolve a
# policy ampla. Reabre o furo de propósito: é melhor o vazamento de volta por
# um dia do que gente sem conseguir trabalhar.
#
# ORDEM: rode DEPOIS de apply-fase02-assignees.sh. A verificação da migration
# falha alto se a fase 02 não estiver aplicada.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-p00-escopo-de-leitura.sh
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

echo "── PRÉ-REQUISITO ──"
$PSQL -v ON_ERROR_STOP=1 -c "DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='eh_descendente_de_atividade_do_ator') THEN
    RAISE EXCEPTION 'aplique apply-fase02-assignees.sh ANTES desta';
  END IF;
END \$\$;"
echo "  ✓ fase 02 aplicada"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  A SONDA — leia antes de confirmar"
echo "══════════════════════════════════════════════════════════"

echo ""
echo "(a) Quantas pessoas entram em algum projeto SÓ por atribuição:"
$PSQL -c "
WITH vinculo AS (
  SELECT DISTINCT a.project_id, pr.id AS user_id
    FROM public.activities a
    JOIN public.profiles pr ON true
   WHERE a.is_trashed = false
     AND public.is_activity_actor_v2(a.id, pr.id)
)
SELECT count(DISTINCT v.user_id) AS pessoas_so_por_atribuicao
  FROM vinculo v
 WHERE NOT public.is_admin_user_v2(v.user_id)
   AND NOT public.is_project_leader_v2(v.project_id, v.user_id)
   AND NOT public.is_project_member_v2(v.project_id, v.user_id);"
echo "   Se for ZERO, a mudança não afeta ninguém hoje — passa a valer daqui pra frente."

echo ""
echo "(b) Quem são, e quantas atividades cada uma deixa de ver:"
$PSQL -c "
WITH vinculo AS (
  SELECT DISTINCT a.project_id, pr.id AS user_id
    FROM public.activities a
    JOIN public.profiles pr ON true
   WHERE a.is_trashed = false
     AND public.is_activity_actor_v2(a.id, pr.id)
),
so_atribuicao AS (
  SELECT v.* FROM vinculo v
   WHERE NOT public.is_admin_user_v2(v.user_id)
     AND NOT public.is_project_leader_v2(v.project_id, v.user_id)
     AND NOT public.is_project_member_v2(v.project_id, v.user_id)
)
SELECT COALESCE(pr.full_name, s.user_id::text) AS pessoa,
       p.title AS projeto,
       count(*) FILTER (WHERE a.is_trashed = false) AS ve_hoje,
       count(*) FILTER (WHERE a.is_trashed = false
                          AND public.eh_descendente_de_atividade_do_ator(a.id, s.user_id)) AS vera_depois
  FROM so_atribuicao s
  JOIN public.projects p ON p.id = s.project_id AND p.is_trashed = false
  LEFT JOIN public.profiles pr ON pr.id = s.user_id
  JOIN public.activities a ON a.project_id = s.project_id
 GROUP BY 1, 2
 ORDER BY 3 - 4 DESC;"

echo ""
echo "(c) Alguém tem atividade cujo PAI está em outro ramo (perderia contexto):"
$PSQL -c "
WITH vinculo AS (
  SELECT DISTINCT a.id AS activity_id, a.parent_id, a.project_id, pr.id AS user_id
    FROM public.activities a
    JOIN public.profiles pr ON true
   WHERE a.is_trashed = false
     AND public.is_activity_actor_v2(a.id, pr.id)
)
SELECT count(*) AS atividades_com_pai_fora_do_alcance
  FROM vinculo v
 WHERE v.parent_id IS NOT NULL
   AND NOT public.eh_descendente_de_atividade_do_ator(v.parent_id, v.user_id);"
echo "   Esperado: um número alto. O PAI vem pela view activity_breadcrumb,"
echo "   não pela policy — é por isso que ela existe. Confirme abaixo."

echo ""
echo "(d) A TRILHA sobrevive? A breadcrumb tem de ser security_invoker=false:"
$PSQL -c "SELECT c.relname,
                 CASE WHEN c.reloptions::text LIKE '%security_invoker=true%'
                      THEN 'PERIGO — a trilha vai fechar junto'
                      ELSE 'OK — a trilha sobrevive' END AS estado
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname='public'
             AND c.relname IN ('activity_breadcrumb','activity_dependency_card');"

echo ""
echo "── A PERGUNTA QUE DECIDE ──"
echo "(e) Das atividades que cada pessoa deixa de ver, quantas ela ABRIU nos últimos 90 dias?"
$PSQL -c "
WITH vinculo AS (
  SELECT DISTINCT a.project_id, pr.id AS user_id
    FROM public.activities a
    JOIN public.profiles pr ON true
   WHERE a.is_trashed = false
     AND public.is_activity_actor_v2(a.id, pr.id)
),
so_atribuicao AS (
  SELECT v.* FROM vinculo v
   WHERE NOT public.is_admin_user_v2(v.user_id)
     AND NOT public.is_project_leader_v2(v.project_id, v.user_id)
     AND NOT public.is_project_member_v2(v.project_id, v.user_id)
),
perdidas AS (
  SELECT s.user_id, a.id AS activity_id
    FROM so_atribuicao s
    JOIN public.activities a ON a.project_id = s.project_id AND a.is_trashed = false
   WHERE NOT public.eh_descendente_de_atividade_do_ator(a.id, s.user_id)
)
SELECT COALESCE(pr.full_name, pd.user_id::text) AS pessoa,
       count(DISTINCT pd.activity_id) AS deixa_de_ver,
       count(DISTINCT al.record_id) FILTER (
         WHERE al.created_at > now() - interval '90 days'
       ) AS mexeu_nelas_em_90_dias
  FROM perdidas pd
  LEFT JOIN public.profiles pr ON pr.id = pd.user_id
  LEFT JOIN public.audit_log al
    ON al.table_name = 'activities'
   AND al.record_id = pd.activity_id
   AND al.changed_by = pd.user_id
 GROUP BY 1
 ORDER BY 3 DESC, 2 DESC;"
echo ""
echo "   'mexeu_nelas_em_90_dias' = ZERO em todas as linhas → sinal verde."
echo "   Qualquer número acima de zero: leia QUEM é, e converse antes de aplicar."
echo "   (A sonda mede EDIÇÃO, não leitura — o audit_log não registra visualização."
echo "    É a melhor aproximação disponível, e subestima o uso."
echo "    Conferido em 26/08: 20.637 de 22.357 registros têm changed_by preenchido"
echo "    — 92%. Os 8% nulos são de trigger sem sessão, e não distorcem o sinal.)"

echo ""
read -r -p "Aplicar a P00? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

run 20260826150000 "supabase/migrations/20260826150000_p00_escopo_de_leitura_da_atividade.sql" \
  "a policy de activities passa a respeitar o escopo"

echo ""
echo "── DEPOIS ──"
$PSQL -c "SELECT policyname,
                 CASE WHEN qual LIKE '%pode_ler_atividade_v2%' THEN 'OK — escopo aplicado'
                      ELSE 'FALHOU — ainda na policy ampla' END AS estado
            FROM pg_policies
           WHERE schemaname='public' AND tablename='activities' AND cmd='SELECT';"
echo ""
echo "Confira agora, com uma pessoa da lista (b): ela ainda abre a atividade dela?"
echo "E a trilha do pai aparece no cabeçalho?"
echo ""
echo "Se algo deu errado:"
echo "  docker cp supabase/migrations/20260826150001_p00_rollback.sql $CONTAINER:/tmp/rb.sql"
echo "  docker exec -i $CONTAINER psql -U supabase_admin -d postgres -f /tmp/rb.sql"
echo ""
echo "✓ concluído"
