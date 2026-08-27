# A tabela do backlog — o desenho, item por item · 27/08/2026

Projeto de prova: **`6d01b1b3-4ac6-45ad-b255-0818877cd54c`** — 141 itens,
4 fases, 133 atividades (103 folhas), 4 marcos, tudo no backlog, quadro vazio.

---

## As colunas — antes e depois

| antes | depois |
|---|---|
| Prioridade · **Status** · Responsável · Prazo · Horas | **EAP · Tipo · Nome** · Responsável · **Previsto** · Esforço · **GUT** |

**Saiu a coluna STATUS.** O backlog inteiro está no backlog: repetir isso em
141 linhas não distingue nada e ocupa a largura de que o nome precisa. Quem
quer ver estágio abre o quadro — é a tela que existe para isso.

**Saiu o texto `a definir` repetido.** A contagem do que falta já vive na faixa
do topo; em cada linha era ruído. No lugar do vazio de responsável há agora um
**botão**.

### O que mudou em cada coluna

| coluna | o que era | o que é |
|---|---|---|
| **EAP** | selo dentro do título, empurrando o nome | coluna própria, mono, alinhada à direita |
| **Tipo** | badge colorido (saiu na rodada anterior) | texto: `ATIVIDADE` quase invisível, `MARCO` em âmbar |
| **Responsável** | texto *"a definir"* | **botão** `+ Sem responsável` que abre o seletor na linha |
| **Previsto** | só o prazo (`09/09`) | a **janela** (`08/09 → 09/09`); no agrupador, a janela derivada |
| **Esforço** | `Horas`, à esquerda | à direita, `tabular-nums`; marco não tem |
| **GUT** | (era a 1ª coluna) | última, número, sem cor até 59 |

O código EAP em coluna própria resolve um desalinho que era estrutural: dentro
do título, ele empurrava o nome numa distância que variava com o número de
dígitos — `1.1` e `1.1.10.2` começavam o nome em pontos diferentes.

---

## A faixa de grupo

```
1.1  Fase de Planejamento e Lançamento            3 no backlog · 24h
1.2  Fase de Execução                    6 no backlog · 72h · recolhido
```

**A barra de progresso saiu das três faixas** — fase real, fase virtual e raia.
Uma barra marcando 0% em todas as fases de um backlog não distingue nada, e
ocupava a largura onde o subtotal — que distingue — precisa caber.

**A pastilha "Backlog" saiu** da faixa da fase virtual. Ela existia porque o
agrupador acompanhava o conteúdo para o quadro e era a única linha que não
dizia onde estava; agora ele não vai a coluna nenhuma — é faixa.

Recolhida, a faixa **continua mostrando o resumo**. É o único momento em que
ele é indispensável: com o grupo fechado, é a única informação sobre o que há
dentro.

---

## Os chips de recorte

`Todas / Prontas / Incompletas` → **`Minhas · Sem responsável · Sem data`**

O segmentado respondia *"quantas estão prontas?"* — pergunta que a faixa de
prontidão já responde melhor, dizendo **o que** falta em vez de só contar. O
que faltava era o recorte **acionável**: *"me mostre as sem responsável, para
eu atribuir"*.

Cada chip liga e desliga por conta própria, e eles **combinam por E** — porque
as perguntas não são exclusivas: *"minhas e sem data"* é um recorte legítimo.
Chip com zero não é renderizado.

### Os números, medidos no projeto de prova

| chip | conta |
|---|---|
| Sem responsável | **103** |
| Sem data | **107** |

E fecham exatamente com a faixa do topo — que já estava certa:

- **107** = 103 atividades + **4 marcos** — marco *tem* data, e sem ela é falta;
- **103** = só atividades — marco **não tem** responsável, e agrupador é rollup.

Os 34 agrupadores ficam fora dos dois de propósito.

---

## As provas pedidas

### Soma por grupo × soma das linhas visíveis

Testado num projeto com horas de verdade (`167d71c6…`, 235 itens vivos):

| | |
|---|---|
| soma das raízes (`derived_hours` quando pai) | **512h** |
| soma de todas as folhas | **512h** |
| | **confere** |

No projeto de prova as duas dão 0h — nenhuma atividade tem horas ainda. Confere,
mas não prova nada; por isso a verificação foi refeita onde há dado.

### Total do rodapé × soma dos grupos

O rodapé consome `topLevelByPhase`, **a mesma fonte que a tabela** — então ele
acompanha o recorte sem código extra. Ligar um chip muda o topo e o rodapé
juntos, e o rótulo passa a dizer *"Total do recorte"*.

### Nenhum GUT abaixo de 60 tem cor

Na base inteira, **143 GUTs preenchidos**:

| faixa | quantos | cor |
|---|---|---|
| < 60 | **75** | nenhuma (cinza) |
| 60–99 | 27 | âmbar |
| 100+ | 41 | vermelho |

A regra roda em `lib/mesaDePlanejamento` (42 verificações), e a tela a
**consome** — o limiar não aparece escrito no componente, o que é travado por
teste.

### Promover um pacote não move nenhuma outra linha

Simulado no pacote *"Treinamento Contas a Receber"*:

| | escritas |
|---|---|
| sem levar junto | **1** — só o próprio pacote |
| com levar junto | 5 |
| as outras 136 linhas | **intocadas** |

### Quatro cores na tabela

Contadas no bloco da linha: **primary** (seleção), **destructive** (atraso),
**âmbar** (GUT alto e MARCO), e a cor própria do **ponto de status**.

O `text-success` que aparece no arquivo está dentro do menu suspenso da linha
("marcar como concluída") — só pinta com o menu aberto, não na tabela.

---

## O que continua não feito

**Teclado** (setas, `P`, `A`, `D`, `N`) e **presets de coluna por papel**. São
interação pura — foco, rolagem, ordem de tabulação — e só se sabe se funcionam
abrindo a tela. Registrado, não entregue às cegas.

**37 verificações** travam a tabela do backlog.
