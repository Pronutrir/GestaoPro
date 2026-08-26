# Atividade v2 — contexto permanente

Leia este arquivo antes de qualquer alteração em atividade, backlog, Kanban ou permissão.
Ele descreve o alvo. **O repositório é a verdade**: quando o que está escrito aqui divergir
do código, o código ganha — e me avise da divergência em vez de "corrigir" o código para
bater com o documento.

> **Divergências já levantadas:** ver `docs/atividade-v2/DIVERGENCIAS.md`. Seis pontos deste
> documento divergem do repositório — as duas principais: **`lider_id` não existe** (o que
> existe é `assigned_to` + `participants`) e **marco não tem `wbs_code`**. Leia antes de
> executar qualquer fase.

## A decisão que organiza tudo

O projeto é da equipe **e** do gestor. Isso separa dois eixos que nunca podem se misturar:

| Eixo | O que decide | Quem decide |
|---|---|---|
| Permissão | quem pode mexer | gestor/dono, através do papel na equipe |
| Trabalho | quem faz o quê | a equipe, através dos responsáveis da atividade |

**Regra inviolável:** atribuir alguém a uma atividade nunca dá a essa pessoa acesso que ela
não tinha ao projeto. Quem atribui alguém de fora da equipe recebe a proposta de adicioná-la
à equipe — e isso é ato de quem gerencia equipe. Essa checagem vive no banco, não na interface.

## Ordem de decisão de acesso

Espelhada entre `lib/activityAccess.ts` e a RLS. Se as duas divergirem, **a RLS está certa**.

1. É administrador do sistema? → tudo
2. O perfil é Visualizador? → só leitura, **encerra aqui** (`canWrite = false` anula qualquer papel de projeto)
3. É dono ou gestor deste projeto? → tudo dentro do projeto
4. Está na equipe do projeto? → o papel manda
5. É responsável ou participante desta atividade? → execução apenas
6. Nada disso → a atividade não existe para essa pessoa

`matriz-acesso.json` tem os 108 casos com o resultado esperado e qual passo decidiu cada um.
É o fixture do teste da Fase 03 e o gabarito para conferir a RLS.

**Estado hoje:** os passos 1, 3, 4 e 5 estão em `podeMutarAtividade`. O passo 2 é aplicado
**por fora**, na página (`canEdit = canWrite && ...`), e não dentro da função — unificar na
fase 03.

## Vocabulário

- **Responsável** — responde pela entrega. No máximo um por atividade. Hoje: `assigned_to`.
- **Participante** — executa junto. N por atividade. Conta para carga de trabalho. Hoje: `participants`.
- **Observador** — só acompanha. **Nenhum efeito em permissão.** Não existe hoje.
- **Promover** — mover do backlog para o quadro. É decisão de escopo (`canEditPlanejamento`).
- **Assumir** — pegar para si atividade sem responsável que já está no quadro. É execução.
- **Estágio** — hoje é a **coluna de workflow**, não um campo. Ver `DIVERGENCIAS.md` item 2:
  a decisão de 20/08 é que essa regra vive no código (`ehBacklog`, `colunasDoQuadro`), não no
  banco. Promover nunca muda a posição na EAP.

## Regras que já existem e devem ser reafirmadas, não reescritas

- **Agrupador não é trabalho.** Fase, Entrega e Pacote nunca viram card no Kanban — viram chip
  no card da filha e, opcionalmente, raia. Marco vira marcador no topo da coluna, nunca card.
  Só itens do tipo **Atividade** viram card.
- **Marco** — ponto no tempo, irmão das Atividades, **ancorado por `parent_id`** e podendo
  ficar na raiz. **Não tem `wbs_code`** (decisão de 11/08/2026, `lib/eapModel.ts`: marco é do
  CRONOGRAMA, não da EAP). Não tem filhas, duração, horas, custo, GUT nem responsável.
  Não entra no Kanban e não é promovível.
  - **Afeta o pai:** término previsto (a fase vai até o marco) e conclusão (conta como filha
    aberta). *Ambos ainda não implementados — fase 09.*
  - **Não afeta o pai:** soma de horas, soma de custo.
  - **Peso no progresso:** hoje entra como 0 ou 100. O kit propõe peso zero — **decisão em
    aberto**, ver `DIVERGENCIAS.md` item 6.
  - GUT fica **ausente, não vazio**: no Marco quer dizer "não se aplica". O filtro
    *Sem prioridade* exclui marcos.
  - Fecha **por confirmação** de quem tem `canEditPlanejamento`, com volta a *proposto* se uma
    predecessora for reaberta.
- Horas e custo do pai são a soma dos subitens.
- A policy de DELETE não aceita a via do ator da atividade.
- **`can_edit_own`** é a única coluna que separa "Editar apenas as minhas" de "Visualizar e
  comentar". É lida por `podeMutarAtividade` e por `can_update_activity_v2` — **nunca** por
  `is_activity_actor_v2`, que serve também visibilidade e comentário.

## Visibilidade

Quem chega à atividade **só por atribuição**, sem papel na equipe, enxerga a própria atividade
e a trilha de ancestrais como contexto — código, nome e tipo. **Nunca** as atividades irmãs,
nunca custo, nunca os responsáveis dos ancestrais.

Essa visibilidade alcança também **a subárvore** da atividade: quem é responsável por `1.1.2`
enxerga `1.1.2.1`. Sem isso a atividade é inútil, porque o trabalho está nas filhas.

Duas views servem as frestas controladas: `activity_breadcrumb` (trilha) e
`activity_dependency_card` (a dependência que bloqueia, mesmo sendo irmã invisível). As duas
carregam código, nome, tipo — e status, no caso da dependência. **Nenhuma das duas carrega
contador, soma, pessoa, data ou custo**: um "3 subatividades" na trilha entrega a existência
das irmãs. Existe teste travando isso — não relaxe.

Vazamento aceito e registrado: o próprio código `1.1.2` revela que existe um `1.1.1`. Não dá
para esconder sem destruir a EAP. A numeração revela a **existência** de irmãs, nunca o
conteúdo delas.

**Nada disso existe hoje** — ver `DIVERGENCIAS.md` item 3. O acesso por atribuição hoje é
binário (`isActivityScoped`, com as quatro permissões zeradas).

## A derivação pai↔filha roda no servidor

O pai deriva das filhas: status, janela de datas, horas, custo, progresso. Essa derivação roda
no banco, sobre a árvore inteira, **independente do que o ator enxerga**. Um usuário restrito
enxerga uma filha só; se a tela dele recalcular o pai a partir do que carregou, o pai encolhe.
Nenhuma tela recalcula agregado do pai — todas consomem o resultado.

**Não está protegido hoje.** É o melhor achado do kit e o motivo de a fase 09 não ser opcional.

## Interface

- **Uma tela por atividade**, em rota própria `/project/:projectId/atividade/:activityId`,
  apresentada como modal e fechável pelo voltar do navegador.
- **Sem modo "Editar".** Cada campo é editável no lugar conforme as capacidades e salva sozinho.
  Campo sem permissão **vira texto**, não controle desabilitado.
- **Regra dos três**: no máximo três controles visíveis no topo do Backlog e do Kanban.
  O resto vive atrás de um botão `Filtrar` que abre fechado.
- Todo filtro e toda coluna precisa responder "que decisão eu tomo olhando para isso?".
  O que não responder, sai.
- Tokens em `tokens.css`. Nenhum componente destas telas declara hex ou tamanho de fonte
  fora deles. Os valores marcados `[atual]` vieram da aplicação em produção e não mudam.

## Nunca

- Escrever UUID ou enum em inglês em qualquer texto que um usuário lê. Resolver o rótulo
  na origem, não com um de-para no componente.
- Deixar a promoção atribuir automaticamente.
- Reescrever regra de pai/filha dentro de uma tela. Todas consomem o mesmo módulo.
- Recalcular agregado do pai no cliente, nem "só para o preview".
- Gatear `is_activity_actor_v2` por `can_edit_own` — aquele helper serve visibilidade e
  comentário; gatear ali tira a leitura de quem é "Visualizar e comentar".

## Cor e referência visual

- **Cor só onde significa.** Na tela do backlog sobram quatro: ponto de status, âmbar do GUT
  alto, vermelho do atraso, azul da seleção. Status é ponto de 7px, não pílula. GUT só ganha
  cor a partir de 60. Número em coluna alinha à direita com `tabular-nums`. Sem zebra.
  Sem badge de tipo em atividade — a indentação e o código EAP já dizem.
- **Referência visual:** os canvas de mockup (*Mesa de Planejamento* para o backlog e o Kanban,
  *Atividade v2* para as demais telas). O **simulador não é referência** — seletor de pessoas,
  painel "Por quê", barra de cenários e registro são instrumentos de teste, não do produto.
- **Agregado (soma de horas, custo, contagem) nunca é recalculado na tela.** Consome o módulo
  da fase 09 e nunca persiste. Hoje há três fórmulas de progresso vivas e duas escritas
  implícitas que gravam o total do pai a partir do que o cliente carregou — ver `inventario.md`.


## Projeto v2 — os quatro lugares

Segunda onda, depois do Atividade v2. Reorganiza os módulos de projeto e liga o que hoje são ilhas.

### A tese

Existem 25 lugares para guardar informação de projeto e nenhuma ligação entre eles. Não se
constrói módulo novo: **liga-se o que existe e desliga-se o que ninguém usa.**

Quatro lugares, no lugar de doze abas:

| Lugar | O que reúne | Para quê |
|---|---|---|
| **Plano** | TAP · Cronograma · EAP | decidir e congelar a linha de base |
| **Execução** | Backlog · Kanban | o único lugar onde se trabalha |
| **Controle** | Financeiro · Riscos · Mudanças | quanto saiu da linha de base, e por quê |
| **Memória** | Documentos · Reuniões · Lições | o que ficou registrado |

### A regra que organiza tudo

**A linha de base existe uma vez só.** Aprovar o TAP cria a linha de base de prazo **e** de
custo. Prazo, custo e escopo passam a ser medidos contra ela. Mudança aprovada não edita a
base — cria a v2, e a v1 fica no histórico.

Hoje o Financeiro tem linha de base e o Cronograma não. Enquanto for assim, atraso é opinião:
qualquer reprogramação apaga o atraso junto com o prazo antigo.

### Tudo que os outros produzem chega como atividade

Risco com resposta, mudança aprovada e encaminhamento de reunião **geram atividade no
backlog**, com o campo `origem` apontando para onde nasceram. É o que faz o Kanban ser o único
lugar de trabalho.

### Um vocabulário só

Dependência se chama **Predecessora, Sucessora, Bloqueio, Em espera, Vinculada** — o do modal
da atividade, que explica o efeito. FS/SS/FF/SF são detalhe interno do cronograma, não
vocabulário de usuário. "Tarefas vinculadas" e "vínculo" morrem como termos de interface.

### Zero vazio não é zero

O sistema precisa distinguir **está tudo certo** de **ninguém preencheu**. "0 atrasadas" só
pode aparecer quando existem datas; sem datas, mostra "5 sem data". Vale no painel do projeto
e na Visão Geral.

### Toda lista que atravessa projetos respeita o escopo

Pendências, Cronograma global, Visão Geral e qualquer relatório consomem a **mesma** camada de
acesso e o **mesmo** escopo de leitura da atividade. Não existe consulta "de fora" que ignore
a regra — senão vira porta lateral.

> **ESTADO EM 26/08/2026: a regra acima NÃO vale hoje, e a causa é a policy, não a consulta.**
> `can_view_project_work_v2` concede o projeto inteiro a quem tem qualquer atividade nele —
> então quem entra por atribuição enxerga as irmãs. Ver `docs/projeto-v2/DIVERGENCIAS.md`
> item 1 e a fase P00. A correção é migration, e sai junto com as outras pendentes.

### Saem do menu

Agente de IA, CSC, Gestão da Qualidade e Calendário (decisão tomada). E, no projeto,
Dependências (vira filtro do Cronograma) e Registros (vira o feed dentro de cada objeto).
**Nenhum recurso é perdido** — o que eles faziam passa a viver onde é útil.
