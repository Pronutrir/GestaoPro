#!/bin/bash
set -e
# ============================================================================
# AS TRES ENTREGAS PENDENTES, NA ORDEM — 27/08/2026
#
# Este script NAO publica sozinho. Ele conduz: confere o estado, mostra o que
# cada entrega faz, e chama o apply certo na ordem certa, pedindo confirmacao
# entre uma e outra.
#
# A ordem e o documento: docs/ORDEM-DE-PUBLICACAO.md. Se os dois divergirem, o
# DOCUMENTO manda — ele e que foi lido e aprovado.
#
# ----------------------------------------------------------------------------
# O PAR ACOPLADO, E POR QUE ELE E O UNICO PASSO PERIGOSO
#
# A entrega 3 tem migration E build, e eles nao funcionam separados:
#
#   build sem migration -> 1.591 itens viram Fase na tela e somem do Kanban
#   migration sem build -> o "+ Subatividade" transforma o pai em faixa
#
# Este script roda a MIGRATION. O build e push sao passos manuais, feitos por
# quem tem Docker — e o script para e diz isso, em vez de fingir que terminou.
#
# ----------------------------------------------------------------------------
# UMA POR VEZ, DE PROPOSITO
#
# Sao tres mudancas de dado. Publicar as tres juntas torna impossivel saber qual
# causou um problema. O script pergunta entre uma e outra, e a resposta certa
# para "seguir para a proxima?" quase sempre e NAO — volte amanha.
#
# RODAR NA VM:  PGPASSWORD=... ./scripts/publicar-as-tres.sh
# ============================================================================

: "${PGPASSWORD:?defina PGPASSWORD no ambiente}"
CONTAINER="${CONTAINER:-supabase-db-1}"
PSQL="docker exec -e PGPASSWORD=$PGPASSWORD -i $CONTAINER psql -U supabase_admin -d postgres"

titulo() {
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "══════════════════════════════════════════════════════════════"
}

confirmar() {
  echo ""
  read -r -p "$1 [s/N] " R
  case "$R" in s|S|sim|SIM) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------------------
# O ESTADO, antes de qualquer coisa
#
# Conferido pelo ESQUEMA, nao pela tabela de controle: `schema_migrations` diz
# o que alguem registrou, e o esquema diz o que existe. Ja divergiram.
# ---------------------------------------------------------------------------
titulo "ESTADO — o que ja esta aplicado"

$PSQL -t -c "
SELECT '  ' || rpad(rotulo, 34) ||
       CASE WHEN existe THEN 'JA APLICADA' ELSE 'pendente' END
  FROM (
    SELECT 'conversao nome -> id' AS rotulo,
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='activities'
                      AND column_name='assigned_to_id') AS existe
    UNION ALL
    SELECT 'marco sem pessoa nem GUT',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='activities'
                      AND column_name='marco_limpeza_backup')
    UNION ALL
    SELECT 'congelar item_type',
           EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='activities'
                      AND column_name='item_type_antes_congelar')
  ) t;"

echo ""
echo "  Se alguma ja aparece como APLICADA, pule-a: o apply e idempotente, mas"
echo "  rodar de novo reimprime numeros que nao correspondem mais ao 'antes'."

# ---------------------------------------------------------------------------
titulo "ENTREGA 1 de 3 — conversao nome -> identificador"
cat <<'TXT'

  O QUE MUDA NA TELA: quase nada, e e intencional. `assigned_to` (o nome) NAO
  e apagada; ganha ao lado `assigned_to_id`. Quem aparecia como responsavel
  continua aparecendo.

  O QUE MUDA DE VERDADE: permissao deixa de ser decidida por NOME. Hoje dois
  perfis "Williame Correia de Lima" sao a mesma pessoa para o sistema, e um
  enxerga as atividades do outro.

  PENDENTE DE PROPOSITO: ~450 atividades ambiguas ficam com id nulo e nome
  intacto. Nao e defeito — e a decisao de nao chutar.

  ACOPLADA A BUILD? Nao. Pode ir sozinha.

TXT

if confirmar "Aplicar a entrega 1?"; then
  ./scripts/apply-conversao-identificador.sh
  echo ""
  echo "  CONFERENCIA 1 (do documento): /pendencias -> Minhas mostra tarefas,"
  echo "  nas DUAS contas. Se sumir tudo ou aparecer tarefa de outra pessoa,"
  echo "  reverta so esta entrega."
else
  echo "  pulada."
fi

confirmar "Seguir para a entrega 2 AGORA? (o normal e voltar amanha)" || {
  echo ""; echo "  Parado na entrega 1. Rode este script de novo quando quiser seguir."; exit 0; }

# ---------------------------------------------------------------------------
titulo "ENTREGA 2 de 3 — marco nao tem responsavel nem GUT"
cat <<'TXT'

  O QUE MUDA NA TELA: 60 marcos perdem o responsavel, 3 perdem o GUT.
    11 sao VIVOS — alguem pode notar que o nome sumiu.
    49 estao na lixeira, e entram de proposito: restaurar devolveria o dado
    sujo.

  O NOME NAO SE PERDE: vai para a sombra `marco_limpeza_backup`, consultavel.

  O QUE TRAVA DEPOIS: duas CHECK constraints. Marco passa a RECUSAR esses
  campos em qualquer via de escrita — tela, importacao, API.

  ACOPLADA A BUILD? Nao. A tela ja parou de oferecer os campos (6ace54d, no ar).

TXT

if confirmar "Aplicar a entrega 2?"; then
  ./scripts/apply-marco-sem-pessoa.sh
else
  echo "  pulada."
fi

confirmar "Seguir para a entrega 3 AGORA? (o normal e voltar amanha)" || {
  echo ""; echo "  Parado na entrega 2. Rode este script de novo quando quiser seguir."; exit 0; }

# ---------------------------------------------------------------------------
titulo "ENTREGA 3 de 3 — congelar item_type + a leitura pura   *** ACOPLADA ***"
cat <<'TXT'

  ESTA E A UNICA PERIGOSA. Migration e build nao funcionam separados:

    build sem migration -> 1.591 itens viram Fase e SOMEM do Kanban
    migration sem build -> o "+ Subatividade" transforma o pai em faixa

  O QUE MUDA NA TELA: 14 itens trocam de rotulo (Entrega -> Atividade), 7 deles
  vivos, todos em projeto de teste ou piloto. Listados um a um em
  docs/medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md. MAIS NADA muda de
  aparencia — medido nas 8.199 linhas.

  O QUE PASSA A FUNCIONAR: subatividade dentro de atividade. Hoje o banco
  proibe, e por isso existem ZERO. 5.382 atividades ganham a capacidade, e
  nenhuma linha muda: e permissao futura, nao migracao.

  O APPLY roda a migration DUAS VEZES (prova de ponto fixo) e depois um TESTE
  DE FUMACA DE ESCRITA em transacao com ROLLBACK. Leia a saida dele: se algum
  destino que a tela oferece for recusado pelo banco, NAO publique o build.

TXT

if confirmar "Aplicar a MIGRATION da entrega 3?"; then
  ./scripts/apply-congelar-item-type.sh
else
  echo "  pulada — e sem ela o build NAO pode subir."
  exit 0
fi

# ---------------------------------------------------------------------------
titulo "AGORA O BUILD — e este script nao faz isso"
cat <<'TXT'

  A migration esta aplicada. O build TEM de subir agora: enquanto nao subir, o
  banco aceita subatividade sob atividade mas a tela ainda transforma o pai em
  faixa ao ganhar a primeira filha.

  Quem tem Docker roda:

    ./scripts/build-prod.sh 2026-08-27-01
    docker push pronutrir/gestaopro:2026-08-27-01
    APP_VERSION=2026-08-27-01 docker compose -f docker-compose.prod.yml up -d app

  DEPOIS, sem falta:

    1. anote em docs/deploys.md — data, APP_VERSION, commit e QUEM publicou.
       A data se descobre pelo ETag; o commit, so se estiver escrito la.
    2. no dia seguinte, as SETE CONFERENCIAS de
       docs/ORDEM-DE-PUBLICACAO.md — duas pessoas, contas diferentes, e a
       segunda NAO pode ser administrador.
    3. o item 5 da Fase 1 volta a fila depois de 24 HORAS de uso real sem
       incidente — nao depois das sete conferencias.

TXT
