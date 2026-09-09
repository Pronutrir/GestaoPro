# Correções de permissão, EAP e conclusão — validação E2E 08–09/09/2026

> Consolida os achados e correções de duas rodadas de teste E2E manual contra
> **produção** (https://gestaopro.pronutrir.com.br), cobrindo Kanban, Backlog
> e Cronograma, com foco no perfil "Editar apenas as minhas" e nos gates de
> permissão dos quatro perfis de projeto. Existe para quem for alterar essas
> regras de novo não repetir a investigação.

## Contexto

O texto de referência que motivou a rodada (relatado pelo usuário):

> **Editar apenas as minhas** — Quando o usuário for designado como
> responsável por uma atividade, seja ela pai ou filha, ele terá autonomia
> para criar, editar, mover e excluir atividades dentro do seu escopo de
> responsabilidade. Se for responsável por uma atividade pai, poderá criar,
> editar, mover e excluir suas subatividades; se for responsável por uma
> subatividade, poderá criar, editar, mover e excluir atividades/subatividades
> dentro do seu escopo permitido. Ao movimentar uma atividade ou entrega no
> Kanban, ela não deve ficar bloqueada para o responsável.
>
> Os quatro perfis devem ficar coerentes: **Criar e excluir** (qualquer
> atividade do projeto), **Editar tudo** (edita e move qualquer atividade,
> não exclui), **Editar apenas as minhas** (só o que está sob sua
> responsabilidade), **Visualizar e comentar** (visualiza e comenta, sem
> escrever nada).

Essa regra **já existia no código** desde a migration `20260901120000` e o
fix `dfd35f3` (04/09/2026) — o texto exibido na tela do perfil é que estava
desatualizado, e a investigação revelou 6 bugs reais na aplicação prática
dessa regra.

## Achados e correções

### 1. Perfil "Editar apenas as minhas" — texto da UI desatualizado

**Arquivo:** `src/lib/projectRoles.ts`
**Commit:** `edf3c41`

O `hint` do papel dizia "vê o projeto inteiro. Edita só onde é responsável ou
participante" — não mencionava criar/mover/excluir, que a regra já concedia
desde 04/09. Corrigido para: "vê o projeto inteiro. Cria, edita, move e
exclui o que está sob sua responsabilidade".

### 2. "Editar tudo" conseguia arquivar fora do escopo (achado grave)

**Arquivo:** `src/app/(dashboard)/project/[id]/atividade/[activityId]/page.tsx`
**Commit:** `ecfe8b2`

O botão "Arquivar" da tela de detalhe era gateado por `caps.canEditPlanejamento`
(a mesma capacidade de "editar") em vez de `caps.canDelete`. Resultado: um
usuário com o papel "Editar tudo" (`can_edit=true, can_delete=false`)
conseguia arquivar **qualquer** atividade do projeto, inclusive fora do seu
vínculo — a única diferença real entre "Editar tudo" e "Criar e excluir"
desaparecia.

### 3. Diálogo de edição não reconhecia responsável de ancestral

**Arquivo:** `src/components/EditActivityDialog.tsx`
**Commit:** `3d21e7f`

`souResponsavel` (dentro do diálogo) só testava `created_by`/`assigned_to`/
`participants` da própria atividade — nunca subia a árvore. Um responsável de
`P1` abrindo a filha `P1.1` via a faixa "Somente leitura — se for o
responsável por ela, a edição libera automaticamente", mesmo sendo
literalmente esse o caso. Corrigido reutilizando
`souResponsavelDeAncestralNaArvore` (`lib/activityAccess.ts`), o mesmo helper
já validado no Kanban. Os botões "Arquivar"/"Duplicar" também passaram a
respeitar `!readOnly` — antes ficavam clicáveis mesmo com o diálogo travado.

### 4. `getNextTopWbs` duplicava código EAP de raiz

**Arquivo:** `src/lib/wbsAuto.ts`
**Commit:** `a357143`

Para item de topo sem fase, a função chamava `getNextSubWbs(eapRootCode(),
siblingWbs)` passando os **irmãos de topo** como se fossem os **filhos** da
raiz. Numa EAP com convenção antiga (fase = código inteiro solto, ex. "1"),
isso gerava sempre `"1.1"`, colidindo com o código real da primeira
subatividade da fase — duas atividades diferentes com o mesmo `wbs_code`,
confirmado em produção. Corrigido: se um irmão de topo já ocupa literalmente
o código da raiz, cai na convenção antiga (próximo inteiro livre), nunca
`"1.x"`.

### 5. "Duplicar" oferecido sem `canCreate`, RLS recusava em silêncio

**Arquivo:** `src/app/(dashboard)/project/[id]/atividade/[activityId]/page.tsx`
**Commit:** `1f3454f`

Gate trocado de `canEditPlanejamento` para `canCreate` — duplicar é criação,
não edição. Antes, um usuário sem `can_create` via o botão, clicava, a RLS
recusava com 403/`42501`, e a tela não mostrava nenhum feedback.

### 6. "Arquivar" do diálogo gravava campo errado (órfão)

**Arquivo:** `src/components/EditActivityDialog.tsx`
**Commit:** `ae2231b`

Esse era o único dos 7 caminhos de arquivamento do sistema que gravava
`closed_at` em vez de `is_trashed`/`trashed_at`. `closed_at` não é lido em
nenhum outro lugar do código — a atividade "arquivada" por esse caminho não
ia para a Lixeira, ao contrário do que o próprio texto de confirmação
prometia. Corrigido para o padrão comum (`is_trashed=true` + `trashed_at`).

### 7. Filtros rápidos do Backlog não persistiam (F5 zerava)

**Arquivo:** `src/components/BacklogSection.tsx`
**Commit:** `7080fcc`

`recortesAtivos` (chips "Minhas"/"Sem responsável"/"Sem data"/"No quadro")
nascia em `useState(new Set())` sem nenhuma leitura/gravação em
`localStorage`. O Kanban já tinha esse padrão (`kanban-filters:<projectId>`);
o Backlog não. Adicionada persistência por projeto, mesmo padrão do Kanban.

### 8. Dois pares de campos de conclusão nunca alinhados

**Arquivos:** `EditActivityDialog.tsx`, `atividade/[activityId]/page.tsx`,
`BacklogSection.tsx`, `ActivityKanban.tsx`
**Commits:** `ae2231b`, `7080fcc`, `b89a577`

Existem dois campos que marcam "atividade concluída": `completed_at`
(lido por `ProjectDashboard.tsx:209` para contar concluídas) e
`actual_end_date` (a data real de término, mostrada na tela/tooltip). Cada
caminho de "Concluir" gravava só um dos dois:

| Caminho | Antes gravava |
|---|---|
| Tela de detalhe da atividade (`aoConcluir`) | só `actual_end_date` |
| Menu de linha do Backlog / mover para coluna final | só `completed_at` |
| `EditActivityDialog` (botão + auto-conclusão do pai) | só `completed_at` |
| Kanban (drag para coluna final/backlog) | só `completed_at` |

Uma atividade concluída pela tela de detalhe nunca entrava na contagem do
dashboard; nenhum caminho preenchia o par completo. Todos os pontos de
escrita agora gravam os dois campos juntos (e limpam os dois ao reabrir).

## Regra a reafirmar no CLAUDE.md

A exclusão pelo responsável do ramo (`podeExcluirAtividade`/`ehResponsavelDoRamo`)
**é intencional**, cobre apenas ARQUIVAR (`is_trashed`, reversível) — não a
exclusão permanente (DELETE físico, só via Lixeira, gate de papel/dono/gestor).
Ver CLAUDE.md, seção "Ordem de decisão de acesso", passo 5.

## Como reproduzir / conferir

`docs/plano-teste-e2e-2026-09-09.md` tem o roteiro completo com os cenários
que expuseram cada achado (A: responsável de pai, B: responsável de filha,
negativo: fora do escopo, coerência dos 4 perfis).

**Suíte:** `npx tsc --noEmit` limpo e as 31 suítes de
`scripts/verificar-*.cjs` passando em cada commit desta leva.
