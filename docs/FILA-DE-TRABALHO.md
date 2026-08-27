# Fila de trabalho — o que está esperando, e esperando o quê

> Um item por bloco. Cada um diz **o que fazer**, **por que**, e sobretudo
> **o que precisa acontecer antes** — porque a ordem aqui não é preferência,
> é dependência.
>
> Atualizado em **27/08/2026**, durante o incidente das 12:08.

---

## 🔴 BLOQUEIO ATIVO — o incidente de 27/08 12:08

**Nada abaixo começa antes disto fechar.**

O build com a leitura pura de `item_type` está no ar com o backfill do
congelamento incompleto. Itens de nível 3 gravados como `'fase'` são lidos como
Entrega, somem do Kanban e recusam arrasto em silêncio.

O relato completo, a causa real e o conserto da barreira estão em
[deploys.md](deploys.md). O que falta, e não depende de código:

1. **Reverter o build** para a versão de 26/08 18:01 — travado porque ninguém
   anotou a `APP_VERSION` daquele dia. Precisa ser lida da VM.
2. **Confirmar na tela** que os cartões voltaram e que mover funciona.
3. **Descobrir quem publicou** — a pergunta continua aberta desde 26/08.

---

## 1 · Coluna "Situação" no backlog

**Origem:** correção de desenho do Raphael, 27/08/2026.
**Depende de:** o incidente fechado. Não entra antes.

### O erro que originou

O desenho tirou a coluna **Status** do backlog partindo de que a tela lista
apenas itens da fila. **Ela lista todos.** Sem status, ninguém sabe o que já foi
promovido nem em que pé está.

Confirmado no projeto de teste `6d01b1b3`: **141 itens vivos**, dos quais
**5 já estão no quadro** e aparecem misturados aos 136 da fila, sem nada que os
distinga.

> *(O comando falava em 107 itens; não consegui reproduzir esse número por
> nenhum recorte — 141 vivos, 137 sem marcos. Provavelmente havia um filtro
> ativo na tela. Não muda a conclusão: promovido e não-promovido aparecem
> juntos e indistinguíveis.)*

### O que fazer

**a) Coluna estreita `SITUAÇÃO`, entre `PREVISTO` e `ESFORÇO`.**

| o item está | a coluna mostra |
|---|---|
| ainda no backlog | **vazia** — sem traço, sem palavra, sem placeholder |
| já no quadro | ponto de **7px** com a cor do status **+ a palavra** |

As palavras são os títulos reais das colunas do projeto: *Não iniciado*,
*Em Andamento*, *Pendências*, *Concluída*.

> **A coluna só fala quando tem o que dizer.** Um traço para "está no backlog"
> seria ruído em 136 das 141 linhas — e o vazio já significa "na fila", porque
> é o estado normal desta tela.

O ponto de 7px é o mesmo do status no resto do backlog, e segue a regra de cor:
cor só onde significa.

**b) Chip `No quadro` no topo,** junto de *Sem responsável* e *Sem data*,
filtrando os promovidos.

**c) A faixa de grupo passa a dizer `4 de 6 no backlog`** em vez de `4 no
backlog`. A diferença entre os dois números já revela quantos foram promovidos,
sem precisar de outra coluna.

### O que conferir ao implementar

- A regra dos três controles no topo continua valendo — o chip novo entra no
  grupo que já existe, não cria uma quarta fileira.
- "Está no quadro" **deriva da coluna**, via `estagioDoItem` — não de um campo
  próprio. A coluna `estagio` existe no banco mas nasceu como espelho e ninguém
  a lê; ler dois lugares recria a divergência.
- A contagem da faixa não pode ser recalculada na tela a partir do que foi
  carregado. É o defeito do agregado, e a lista passa pela RLS.

---

## 2 · Fase 1, item 5 — recálculo da EAP ao mover

**Depende de:** o incidente fechado **e** 24 horas de uso real sem incidente
após a publicação das três entregas.

Ao mover um item, os códigos EAP da subárvore precisam ser recalculados, com
aviso *"os códigos de N itens vão mudar"* e confirmação antes de gravar.

A condição das 24 horas é do Raphael e não é a mesma coisa que "as sete
conferências passaram": as conferências provam o caminho feliz; as 24 horas
provam que o resto do sistema não tropeçou no que ninguém pensou em conferir.

---

## 3 · A reescrita da migration de congelamento

**Depende de:** o incidente fechado.

Gravar via `eapToPersisted` em vez do valor cru, clone-teste com duas passadas,
e só então aplicar — migration primeiro, build na mesma janela.

**Atenção herdada do incidente:** a coluna sombra `item_type_antes_congelar`
**já está preenchida** em produção, pela execução parcial. A migration reescrita
precisa lidar com isso explicitamente — do jeito que está, ela pularia o passo
da sombra (`WHERE item_type_antes_congelar IS NULL` não casa com nada) e o
registro do "antes" passaria a ser o estado de hoje, não o original.

---

## Esperando gente, não código

- **Quem publicou** em 26/08 18:01 e em 27/08 12:08 — e qual `APP_VERSION`.
- **Qual perfil do Williame** é o correto: ~450 atividades aguardam.
- **A conversa sobre a P00**, que já está valendo e concede o projeto inteiro a
  quem entra por atribuição.
- **As seções 05, 06, 08, 09, 10 e 11** do desenho, que nunca chegaram.
