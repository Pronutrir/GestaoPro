# 06 · Backlog e Kanban enxutos  (era Fase 9)

**Objetivo:** menos filtro, menos coluna, mais decisão. E o Backlog vira a mesa de planejamento
que o produto não tem.

## Referência visual

O canvas **Mesa de Planejamento** é a especificação desta fase — a tela, as sete decisões e a
operação por teclado. Os outros canvas de mockup valem para as demais telas.

> A **sala de operação** (o simulador) **não** é referência visual. Ela tem seletor de pessoas,
> painel "Por quê", barra de cenários e registro — instrumentos de laboratório que não existem
> no produto. O que ela empresta são os tokens, não a chrome.

## As sete decisões

Estas não são preferência: cada uma tira ruído sem tirar informação.

1. **O badge "Atividade" sai.** Fase e Entrega viram faixa de grupo, Marco tem tratamento
   próprio — então tudo que sobra numa linha *é* atividade. O badge repetia o que a indentação
   e o código EAP já diziam, e era 90% dos badges da tela.
2. **Status é um ponto de 7px, não uma pílula.** Em 200 linhas, pílula colorida vira listra.
3. **GUT só ganha cor a partir de 60.** Abaixo disso é número cinza; 60 a 99 âmbar; 100+
   vermelho. Se todo GUT é colorido, nenhum chama atenção.
4. **Número alinha à direita e usa `tabular-nums`.** Esforço e custo existem para serem
   comparados de relance; à esquerda e com dígito de largura variável, não comparam nada.
5. **Vazio diz o que falta.** `—` não distingue *não preenchi* de *não se aplica*. Atividade
   sem responsável mostra *a definir* em itálico claro; no Marco a célula fica **vazia**.
6. **Zebra não, faixa de grupo sim.** A faixa da fase separa e ainda carrega contagem, horas
   somadas e janela — informação que a zebra não dá.
7. **Subtotal por grupo e total fixo no rodapé.** Planejar é somar. Hoje, saber as horas da
   fase 2 exige contar na mão ou exportar.

Resultado: sobram **quatro cores** na tela inteira — o ponto de status, o âmbar do GUT alto,
o vermelho do atraso e o azul da seleção. Todo o resto é tipografia e espaço.

> **Sobre o subtotal e o total (decisão 7): de onde vem o número.**
>
> O inventário achou que **nenhuma trigger faz rollup de horas ou custo** — as somas são todas
> do cliente, e há **três fórmulas de progresso** com profundidades diferentes. Pior:
> `EditActivityDialog.tsx:593-618` **grava** o total do pai a partir da lista que o cliente
> carregou, que passa pela RLS.
>
> Se esta fase somar por conta própria, vira a **quarta** fórmula — e para um usuário restrito
> o subtotal mostra menos do que a fase realmente tem.
>
> **Consuma o agregado da fase 09**, não recalcule. Se a 09 ainda não tiver rodado, o subtotal
> é somatório de leitura (nunca persistido) e a fase 09 o substitui depois.

## Marco nas listas

Marco **não tem `wbs_code`** (`lib/eapModel.ts`, decisão de 11/08/2026 — ver `DIVERGENCIAS.md`
item 6). Na coluna de código, mostre a âncora (o código do pai) ou deixe vazio — **nunca um
código inventado**, e nunca renumere irmãos por causa dele.

Os chips **Sem responsável** e **Sem prioridade** EXCLUEM marcos: senão ficam listados para
sempre como pendência que nunca fecha. O chip **Sem data** continua valendo, porque marco sem
data é lacuna de verdade.

## Prompt

```
Refaça as páginas de Backlog e Kanban seguindo a regra dos três: no máximo
três controles visíveis no topo; todo o resto atrás de um botão "Filtrar"
que abre fechado.

BACKLOG — a mesa de planejamento.

Cabeçalho: nome do projeto, e à direita contadores CLICÁVEIS que viram
filtro ao clicar: "18 no backlog · 12 sem responsável · 5 sem data".
Controles: busca, alternância Minhas/Todas, e Colunas. Filtrar e a
densidade ficam à direita, discretos.

Tabela em árvore da EAP:
- Faixa de grupo por Fase/Entrega: chevron, código, nome, o tipo em texto
  fraco, e à direita "3 itens · 24h · 25/08 → 12/09". Recolhível.
- Linha de atividade: caixa de seleção, código EAP em mono indentado pela
  profundidade, ponto de status + nome, responsável (avatar + primeiro
  nome, ou "a definir" em itálico claro), previsto, esforço, custo, GUT.
- SEM badge de tipo nas atividades.
- Marco: ícone de losango, nome, a palavra "marco" em caixa alta pequena,
  a data em destaque — e as células de responsável, esforço, custo e GUT
  literalmente VAZIAS, não com "—". Marco não tem wbs_code: mostre a
  âncora do pai ou deixe a célula de código vazia.
- Subtotal discreto ao fim de cada grupo; total do projeto fixo no rodapé.
  Consuma o agregado do módulo da fase 09 — não escreva uma soma nova, e
  em hipótese nenhuma persista o resultado.
- Atraso: a data fica vermelha com os dias de atraso ao lado.
- Sem zebra.

Seleção múltipla com barra de ação flutuante escura mostrando quantas,
o total de horas e custo selecionados, e Promover / Atribuir / Definir
datas — cada um com a sua tecla ao lado. Quando houver item sem
responsável na seleção, dizer quantos e que o seletor abre ao promover.

Edição na própria linha: clicar na célula de responsável abre o seletor
ali; clicar na data abre o calendário. Quem não pode atribuir vê os mesmos
nomes como texto. Quem não está na equipe aparece desabilitado com o
motivo, e perfil Visualizador aparece com "perfil não escreve" — nunca
some da lista sem explicação.

Toda escrita da edição em linha tem de LER O RESULTADO antes de mostrar
salvo: no PostgREST um UPDATE que não casa linha nenhuma volta SEM erro, e
é assim que a recusa da RLS vira silêncio. Use count exact.

Datas: colunas date não podem passar por new Date() — use lib/dataLocal.

Teclado: setas cima/baixo navegam; esquerda/direita recolhem e abrem o
grupo; espaço seleciona e shift+espaço seleciona o intervalo; Enter abre a
atividade; P promove; A atribui; D define datas; N cria nova atividade
abaixo, no mesmo grupo.

Densidade em dois níveis: compacto 30px e confortável 36px, guardado por
usuário. As preferências de exibição já vivem no banco (useKanbanPrefs) —
siga o mesmo caminho, não invente um segundo.

Presets de coluna por papel, aplicados na abertura:
- quem planeja: EAP, nome, responsável, previsto, esforço, custo, GUT
- quem executa: o mesmo, sem custo
- externo: EAP, nome, previsto — sem custo, sem esforço, sem as irmãs
"Colunas" continua disponível, mas ninguém precisa configurar para começar.

KANBAN — a mesa de execução.

Card: código curto, título, avatares dos responsáveis, GUT com número e a
mesma regra de cor (só colore a partir de 60), prazo que fica vermelho ao
atrasar, e contador de subatividades apenas quando houver. Fase como chip.
Coluna com contador e limite de WIP. Topo: busca, Minhas/Todas, Agrupar por
(status, fase, responsável).

Padrão de abertura por papel: quem tem "Editar apenas as minhas" abre em
Minhas; dono, gestor e quem edita tudo abrem em Todas.

O filtro "Minhas" JÁ EXISTE em quatro implementações diferentes (ver o
inventário, item 3). Consuma UMA — de lib/activityAccess — e não escreva a
quinta.

ANTES DE REMOVER qualquer filtro existente, liste todos os que existem hoje
nas duas páginas e proponha para cada um: manter à vista, mover para o
menu, ou remover — com uma linha justificando qual decisão ele apoia. O
inventário (item 7) já mapeou os filtros: nenhum é decorativo, mas
soMinhas é silenciosamente inerte para gestor e admin.
```

## Pronto quando

- As duas páginas abrem **sem barra de filtros**.
- Dá para lançar e promover uma fase inteira **sem tocar no mouse**.
- Qualquer coluna que sobrou responde "que decisão eu tomo olhando para isso?".
- Contando as cores na tela do backlog, dá quatro.
- O subtotal de um grupo bate com o total do pai mostrado na tela de atividade.

## Não faça

- Não devolva o badge de tipo nas atividades "para ficar consistente". A consistência aqui é
  com a indentação e o código, não com um rótulo repetido.
- Não colora GUT abaixo de 60.
- Não use zebra.
- Não puxe a chrome do simulador — seletor de pessoas, painel "Por quê", registro. Aquilo é
  bancada de teste.
- **Não escreva uma quarta fórmula de soma** para o subtotal, e não persista agregado.
- Não invente `wbs_code` para marco.

## Uma decisão em aberto

O custo aparece como `3.600`, sem "R$" em cada linha, porque o cabeçalho já diz. Se quem
confere orçamento precisar de centavos, acrescente um modo exato no menu Colunas — sem sujar
o padrão.
