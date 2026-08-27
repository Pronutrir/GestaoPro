# O que falta para tudo estar concluído — 27/08/2026

> Levantamento feito conferindo **código e banco**, não memória. Cada linha foi
> verificada: as colunas por consulta real, o código por leitura, as regras
> pelas 396 asserções das suítes.

---

## A resposta curta

**Uma coisa bloqueia tudo, e não é código: ninguém publicou.**

```
✅ commit    tudo em fix/correcoes_2
✅ push      origin em dia, zero pendentes
❌ build     precisa de Docker — não há nesta máquina
❌ deploy    idem
```

Enquanto isso não acontecer, **nada do que está pronto existe para quem usa o
sistema**. É o item 1 da lista abaixo, e o único que não depende de mais
trabalho — depende de uma pessoa com o ambiente.

---

## 1 · Publicar — BLOQUEIO, não tarefa

| | |
|---|---|
| o que fazer | `git pull && ./scripts/publicar-2026-08-27-02.sh` |
| quem pode | quem tem Docker — a mesma pessoa que publicou em 26/08 18:01 e 27/08 12:08 |
| o que sobe | tela da atividade, promoção recusada, contador, coluna Situação, chip, faixa, rodapé |
| o que **não** sobe | nenhuma migration — é só código |

O script exige `PULAR_BARREIRA=1`, e explica por quê: a barreira pede o backfill
do congelamento, que não rodou. Pular é aceitável **neste caso** porque o build
com a leitura pura já está no ar desde 12:08 — o acoplamento já foi rompido, e
esta leva corrige parte dos efeitos.

**Depois:** as sete conferências, com uma segunda pessoa que não seja
administrador. Duas delas (a 2 e a 6) vão falhar de propósito, porque dependem
de migrations que não entraram.

---

## 2 · O incidente dos 68 — precisa de uma DECISÃO, não de código

68 folhas estão no quadro sem gerar cartão, em 17 projetos. A migration está
escrita (`20260827140000`) e **não deve ser aplicada como está**: medido, ela
liberta **1 dos 68**.

Os outros 67 têm `wbs_code` de nível 2 ou 3, e `resolveEapKind` decide **por
posição antes de olhar o campo**. São duas condições, e a migration trata uma.

**As saídas, e todas passam por uma decisão que ficou fora do escopo:**

| | o que faz | custo |
|---|---|---|
| tirar a dedução por nível | 392 itens mudam de rótulo; combinada com a fatia, liberta os 68 | mexe na regra de tipo do sistema inteiro |
| limpar o `wbs_code` dos 68 | o campo passa a decidir | apaga a posição na EAP, que é informação legítima |
| deixar como está | nada muda | 68 itens de trabalho seguem invisíveis |

---

## 3 · A migration retomável do congelamento

O banco está no **estado B**: a coluna sombra existe, o backfill não rodou.

A migration atual **não pode ser aplicada**: ela pularia o passo da sombra
(`WHERE ... IS NULL` não casa com nada) e gravaria o "antes" de hoje por cima do
original — 785 linhas perderiam o registro de que eram `atividade` antes do
`pacote_e_posicao`.

O requisito está escrito em `FILA-DE-TRABALHO.md` §3.0: reconhecer os três
estados, distinguir B de C pelo **vocabulário** (`entrega`/`projeto` só o
backfill produz), e nunca reescrever a sombra.

---

## 4 · A tela da atividade — o que falta nela

Construída e no build (12,5 kB). Falta:

| | |
|---|---|
| **descrição rica** | hoje é `textarea`. O texto que **prometia** lista, link e @menção foi corrigido — anunciar o que não existe faz a pessoa concluir que a tela quebrou. Falta implementar de verdade |
| **o feed ligado** | a coluna desenha, mas recebe `[]`. `feed_da_subarvore` existe no banco e **ninguém consome** |
| **estado "criar"** | o componente aceita e tem "Criar e continuar criando"; nenhuma rota o aciona |
| **lição aprendida** | o formulário de 4 campos com "concluir também" desmarcado não foi feito |
| **seções 05, 06, 08** | do desenho — descrevem os quatro estados de um campo e de onde se cria |

---

## 5 · Fase 1, item 5 — recálculo da EAP ao mover

Não começado. Ao mover um item, os códigos da subárvore precisam ser
recalculados, com aviso *"os códigos de N itens vão mudar"* e confirmação.

Condição do Raphael: volta à fila **depois de 24 horas de uso real sem
incidente** — e as 24 horas não começaram, porque nada foi publicado.

---

## 6 · Pendências menores

- **o marco promovido** (`904fbbf3`) — está no quadro sem nunca ter sido cartão;
  inconsistência anterior ao incidente, decisão de quem cuida do projeto;
- **os dois sintomas** (a: o quadro não agrupa · b: subatividades somem) —
  registrados, não investigados; dependem do sistema estável;
- **as 84 linhas** de `tipos-a-revisar` — lista de revisão humana que o
  congelamento produz.

---

## 7 · Esperando pessoas, não código

| | |
|---|---|
| **quem publicou** em 26/08 e 27/08 | pergunta aberta desde o começo |
| **qual perfil do Williame** é o correto | ~450 atividades pendentes |
| **a conversa sobre a P00** | já está valendo e concede o projeto inteiro a quem entra por atribuição |
| **as seções 05, 06, 08** do desenho | nunca chegaram |

---

## O que JÁ está pronto e verificado

Para não parecer que falta tudo:

| fase | estado |
|---|---|
| 02 · dados e RLS | aplicada — `activity_assignees`, `activity_breadcrumb` |
| 03 · camada de acesso | **108 casos da matriz batem** |
| 04 · kanban de trabalho | aplicada — `estagio` |
| 05 · responsáveis | aplicada — sincronia dos dois lados |
| 06 · backlog e kanban | as sete decisões, mais Situação/chip/faixa/rodapé |
| 07 · tela única | construída, parcial (ver item 4) |
| 09 · regras pai↔filha | `derived_*` no ar; **nenhuma tela recalcula** |
| 10 · tokens | `--primary` = `221 83% 53%` = `#2563EB` do desenho |

**396 asserções** em todas as suítes, zero falhas. `next build` compila.
