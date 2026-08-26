#!/bin/bash
set -e
# ============================================================================
# HOMÔNIMOS — A PERMISSÃO PARA DE COMPARAR POR NOME
#
# A RLS compara pessoas por `full_name`. Existem DOIS perfis ativos chamados
# "Williame Correia de Lima", e os dois passavam nas mesmas 450 atividades e
# nos mesmos 2 projetos — cada um recebendo o acesso do outro.
#
# Depois desta migration, nome que pertence a mais de um perfil NÃO CONCEDE a
# ninguém. Decidem as vias por identificador: created_by, activity_assignees,
# project_members.
#
# ISTO PODE TIRAR LEITURA DE ALGUÉM — leia a sonda antes de confirmar. A rede
# de segurança embutida põe como MEMBRO quem era dono só pelo nome, para não
# deixar ninguém fora do próprio projeto.
#
# ROLLBACK: supabase/migrations/20260826180001_homonimos_rollback.sql
# Reabre o furo de propósito: é melhor o vazamento de volta por um dia do que
# gente sem conseguir trabalhar.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/apply-homonimos.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

echo "══════════════════════════════════════════════════════════"
echo "  A SONDA — leia antes de confirmar"
echo "══════════════════════════════════════════════════════════"

echo ""
echo "(a) Nomes que pertencem a MAIS DE UM perfil:"
$PSQL -c "
SELECT lower(btrim(full_name)) AS nome,
       count(*) AS perfis,
       count(*) FILTER (WHERE is_active) AS ativos
  FROM public.profiles
 WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
 GROUP BY 1 HAVING count(*) > 1
 ORDER BY 2 DESC;"
echo "   Se vier VAZIO, a mudança não afeta ninguém hoje — passa a valer daqui pra frente."

echo ""
echo "(b) Quantas ATIVIDADES trazem um desses nomes em assigned_to:"
$PSQL -c "
WITH amb AS (
  SELECT lower(btrim(full_name)) AS nome
    FROM public.profiles
   WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
   GROUP BY 1 HAVING count(*) > 1
)
SELECT a.nome, count(*) AS atividades
  FROM amb a
  JOIN public.activities t
    ON lower(btrim(t.assigned_to)) = a.nome AND t.is_trashed = false
 GROUP BY 1 ORDER BY 2 DESC;"

echo ""
echo "(c) E quantos PROJETOS têm um desses nomes como dono/gestor:"
echo "    (esta é a concessão MAIOR — dono manda em tudo dentro do projeto)"
$PSQL -c "
WITH amb AS (
  SELECT lower(btrim(full_name)) AS nome
    FROM public.profiles
   WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
   GROUP BY 1 HAVING count(*) > 1
)
SELECT p.title AS projeto,
       p.owner, p.manager
  FROM public.projects p
  JOIN amb a ON lower(btrim(p.owner)) = a.nome OR lower(btrim(p.manager)) = a.nome
 WHERE p.is_trashed = false
 ORDER BY 1;"

echo ""
echo "── A PERGUNTA QUE DECIDE ──"
echo "(d) Nesses projetos, os homônimos JÁ são membros por user_id?"
echo "    SIM para todos = ninguém perde acesso: a via de membro cobre os dois."
echo "    NÃO para algum = a rede de segurança da migration vai inseri-lo como membro."
$PSQL -c "
WITH amb AS (
  SELECT lower(btrim(full_name)) AS nome
    FROM public.profiles
   WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
   GROUP BY 1 HAVING count(*) > 1
),
gente AS (
  SELECT pr.id, pr.full_name, pr.email
    FROM public.profiles pr JOIN amb a ON lower(btrim(pr.full_name)) = a.nome
),
proj AS (
  SELECT p.id, p.title
    FROM public.projects p JOIN amb a
      ON lower(btrim(p.owner)) = a.nome OR lower(btrim(p.manager)) = a.nome
   WHERE p.is_trashed = false
)
SELECT pj.title AS projeto, g.email,
       CASE WHEN EXISTS (SELECT 1 FROM public.project_members m
                          WHERE m.project_id = pj.id AND m.user_id = g.id)
            THEN 'JA e membro — nao perde nada'
            ELSE 'NAO e membro — a rede de seguranca vai inseri-lo' END AS situacao
  FROM proj pj CROSS JOIN gente g
 ORDER BY 1, 2;"

echo ""
echo "   ATENÇÃO ao efeito humano: quem trabalha logado no perfil que NÃO tem"
echo "   as atribuições deixa de ver aquelas atividades como suas. Ele continua"
echo "   com o projeto (é membro), mas o vínculo com as atividades some."
echo "   Ver docs/medicoes/homonimos-26-08-2026.md — o caso do Williame."

echo ""
read -r -p "Aplicar? [s/N] " RESP
case "$RESP" in
  s|S|sim|SIM) ;;
  *) echo "Cancelado. Nada foi alterado."; exit 0 ;;
esac

FILE="supabase/migrations/20260826180000_homonimos_permissao_por_identificador.sql"
[ -f "$FILE" ] || { echo "ERRO: migration não encontrada: $FILE"; exit 1; }

docker cp "$FILE" "$CONTAINER:/tmp/mig.sql"
$PSQL -v ON_ERROR_STOP=1 -f /tmp/mig.sql
$PSQL -c "INSERT INTO public.schema_migrations(version, inserted_at)
          VALUES (20260826180000, NOW()) ON CONFLICT DO NOTHING;"
echo "  ✓ aplicada"

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  DEPOIS — o furo fechou?"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "Para cada projeto com dono ambíguo: quantos homônimos ainda são LÍDER,"
echo "e quantos continuam com acesso como MEMBRO."
echo "Esperado: lideres = 0, membros > 0."
$PSQL -c "
WITH amb AS (
  SELECT lower(btrim(full_name)) AS nome
    FROM public.profiles
   WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
   GROUP BY 1 HAVING count(*) > 1
),
gente AS (
  SELECT pr.id FROM public.profiles pr JOIN amb a ON lower(btrim(pr.full_name)) = a.nome
),
proj AS (
  SELECT p.id, p.title FROM public.projects p JOIN amb a
      ON lower(btrim(p.owner)) = a.nome OR lower(btrim(p.manager)) = a.nome
   WHERE p.is_trashed = false
)
SELECT pj.title AS projeto,
       count(*) FILTER (WHERE public.is_project_leader_v2(pj.id, g.id)) AS lideres,
       count(*) FILTER (WHERE public.is_project_member_v2(pj.id, g.id)) AS membros
  FROM proj pj CROSS JOIN gente g
 GROUP BY 1 ORDER BY 1;"

echo ""
echo "E na atividade: os homônimos deixaram de ser atores da MESMA atividade?"
echo "Esperado: no máximo 1."
$PSQL -c "
WITH amb AS (
  SELECT lower(btrim(full_name)) AS nome
    FROM public.profiles
   WHERE full_name IS NOT NULL AND btrim(full_name) <> ''
   GROUP BY 1 HAVING count(*) > 1
),
gente AS (
  SELECT pr.id FROM public.profiles pr JOIN amb a ON lower(btrim(pr.full_name)) = a.nome
),
uma AS (
  SELECT t.id FROM public.activities t JOIN amb a
      ON lower(btrim(t.assigned_to)) = a.nome
   WHERE t.is_trashed = false LIMIT 1
)
SELECT u.id AS atividade,
       count(*) FILTER (WHERE public.is_activity_actor_v2(u.id, g.id)) AS atores
  FROM uma u CROSS JOIN gente g
 GROUP BY 1;"

echo ""
echo "Se algo der errado:"
echo "  docker cp supabase/migrations/20260826180001_homonimos_rollback.sql $CONTAINER:/tmp/rb.sql"
echo "  docker exec -i $CONTAINER psql -U supabase_admin -d postgres -f /tmp/rb.sql"
echo ""
echo "✓ concluído"
