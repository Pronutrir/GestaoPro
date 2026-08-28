# Os caronas da regra removida — varredura de 27/08/2026

> O item 4 trocou `ehAgrupadorDoQuadro` de **"tem filhas?"** para **"o tipo diz
> que agrupa?"**. Quem lia aquela função querendo saber *"tem filhas?"* quebrou
> naquele momento, em silêncio.
>
> O contador de subatividades foi o primeiro a aparecer, porque o Raphael
> esbarrou nele. Esta varredura procura os outros **antes** de alguém esbarrar.

---

## O resultado

**13 leitores. Um quebrado — o que já se conhecia.** Os outros 12 perguntavam
mesmo *"é uma caixa?"* e continuam certos.

| | |
|---|---|
| leitores encontrados | **13** |
| queriam *"é uma caixa?"* → continuam certos | **12** |
| queriam *"tem filhas?"* → **quebrados** | **1** |

O único quebrado é o contador de subatividades, já registrado na fila (item 5b).
**Nenhum outro carona foi encontrado.**

---

## A tabela completa

### Quebrado (1)

| onde | o que pergunta | veredito |
|---|---|---|
| `KanbanCard.tsx:1054` | `(isPhase \|\| cardFields.subCount) && subActivityCount > 0` | **"tem filhas?"** — mostrava o contador porque uma atividade com filhas *era* `isPhase`. Sem a regra estrutural, o contador caiu para trás de `subCount`, que vem **desligada** |

### Continuam certos (12)

| onde | o que pergunta | por que está certo |
|---|---|---|
| `KanbanCard.tsx:358` | a definição de `isPhase` | é a própria leitura da regra |
| `KanbanCard.tsx:527` | ícone de camadas no cartão | "é caixa?" — o ícone identifica caixa, não quem tem filhas |
| `ActivityKanban.tsx:721` | `ehAgrupador` local → `isGrouper` do progresso | "é caixa?" — e a doc de `activityProgress` é explícita: *"uma caixa que contém trabalho, não trabalho que alguém executa"*. Caixa ignora a própria coluna e vale a média das filhas |
| `ActivityKanban.tsx:1843` | quem **não** entra nas colunas | "é caixa?" — caixa vira faixa, não cartão |
| `ActivityKanban.tsx:2122` | recusa de arrasto | "é caixa?" — caixa não se move no quadro |
| `BacklogSection.tsx:2409` | seleção leva a família | "é contêiner?" — e o comentário **já antecipava** o caso: *"ATIVIDADE não é contêiner… promover move só a atividade escolhida"* |
| `BacklogSection.tsx:2422` | texto do tooltip da caixa | "é caixa?" **e** já testa `hasChildren` em separado — as duas perguntas feitas separadamente, que é o padrão certo |
| `BacklogSection.tsx:2469` | rótulo de tipo na linha | "é caixa?" |
| `BacklogSection.tsx:2512` | `mostrarBadgeDeTipo` | "é caixa?" — agrupador não recebe badge porque vira faixa |
| `ProjectCronogramaPanel.tsx:1008` | `isGrouper` do progresso no cronograma | "é caixa?" — mesma razão do Kanban, e o comentário diz que usa a mesma fonte de propósito |
| `EditActivityDialog.tsx:2076` | ícone do tipo no diálogo | "é caixa?" |
| `quadroDeExecucao.ts:295` | `subatividadesPromoviveis` | "é caixa?" — separa trabalho de caixa na contagem do *"levar N junto"* |

*(As linhas 143, 158, 181 e 224 de `quadroDeExecucao.ts` são a definição e os
usos internos do próprio módulo — `viraCartao`, `faixaDoCartao`,
`escritasDeMoverColuna` —, todos "é caixa?" por construção.)*

---

## Por que só um quebrou — e por que isso não é sorte

Os 12 corretos têm uma coisa em comum: **nasceram perguntando "é caixa?"**.
Ícone, badge, rótulo, recusa de arrasto, régua de progresso, seleção em cascata
— todos são sobre a **natureza** do item, e a natureza é o que o tipo descreve.

O contador é diferente por natureza: ele conta **filhas**. Nunca foi uma
pergunta sobre o tipo. Ele funcionava porque, na regra antiga, "tem filhas" e "é
caixa" eram *a mesma coisa* — e quando as duas se separaram, ele ficou do lado
errado.

> **A lição, para a próxima vez que uma regra assim mudar:** o risco não está em
> quem *usa* a função, está em quem usava a **coincidência** entre dois
> conceitos que a função juntava. Procurar por "quem chama" acha os 13;
> distinguir os 12 do 1 exige ler o que cada um queria saber.

## O que não foi varrido, e por quê

`isPhaseLikeActivity` (`BacklogSection.tsx:927`), `__isPhaseRow`
(`ProjectCronogramaPanel`) e `isPhaseBlocked` (`useChangeRequestBlocks`) têm
nomes parecidos e **não** consomem esta regra:

- `isPhaseLikeActivity` lê `item_type === "fase"` direto — nunca dependeu de
  `hasChildren`;
- `__isPhaseRow` marca a linha sintética da tabela `phases`, que não é
  atividade;
- `isPhaseBlocked` é sobre solicitação de mudança, outro assunto.

---

**Método:** `grep` por `isPhase`, `ehAgrupadorDoQuadro` e `eapCanGroup` em
`src/`, seguido de leitura do contexto de cada ocorrência. Nada foi alterado.

---

# Segunda varredura — os caronas da DEDUÇÃO POR NÍVEL (27/08, à noite)

A cirurgia do nível é irmã da do `OR hasChildren`, então merece a mesma
varredura: quem lia `eapLevel` para **decidir papel** quebrou; quem lia para
**saber posição** continua certo.

## Resultado: 6 leitores, nenhum quebrado

| onde | o que faz | veredito |
|---|---|---|
| `BacklogSection:1015` | decide se é "fase virtual" da lista | posição ✓ |
| `BacklogSection:1947` | filtra códigos de nível de fase | posição ✓ |
| `BacklogSection:2189` | calcula a **indentação** da linha | posição ✓ |
| `BacklogSection:4206` | acha fases vazias para não repetir | posição ✓ |
| `EditActivityDialog:2004` | monta o aviso *"pela estrutura seria X"* | posição ✓ |
| `eapModel:500,518` | `eapRoleForImport` — importação | posição ✓ |

**Nenhum decidia papel exibido.** O único que fazia isso era o bloco dentro de
`resolveEapKind`, e ele saiu.

### Por que a importação continua usando o nível — e está certa

`eapRoleForImport` (linhas 500 e 518) decide por posição de propósito: **ao
importar uma EAP colada, o campo ainda não existe.** A posição é a única
informação disponível naquele instante. É o oposto do defeito — ali a
heurística supre uma ausência real, não uma que já foi preenchida.

### E o aviso âmbar continua fazendo sentido

`EditActivityDialog:2004` lê o nível para dizer *"pela estrutura, este item
seria Atividade"*. Ele **compara** a posição com o campo, e é justamente a
comparação que dá valor ao aviso. Com o nível fora da decisão, ele deixou de
ser redundante e passou a ser a única voz que discorda do campo — o que o torna
mais útil, não menos.

É o que registra a decisão de mantê-lo mesmo depois da correção em massa: **a
correção resolve o passado, o aviso resolve o futuro.**
