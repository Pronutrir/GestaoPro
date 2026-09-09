# Responsável e Participantes — o que o mercado faz

Pesquisa feita em **25/08/2026**, em documentação oficial dos produtos, para decidir se vale
fundir os dois campos da atividade num único campo de N responsáveis.

**Conclusão: não fundir.** O par que o GestãoPro já tem é a estrutura que os produtos mais
próximos dele adotam, e é a implementação literal do RACI.

---

## Os sete produtos

| Produto | Responsável | Campo separado de envolvidos | Justificativa documentada |
|---|---|---|---|
| **Jira** | **1 só** | Watchers · Request participants | Pedido de multi-assignee fechado como *"Won't Fix"* após ~20 anos e 413 votos: *"By design JIRA can only have 1 assignee at a time to a given issue."* |
| **Asana** | **1 só** | Collaborators (followers) | Página institucional *"Why one assignee?"*, baseada no modelo DRI da Apple |
| **Linear** | **1 só** | Subscribers · delegates | *"Issues in Linear are assigned to a single person at a time, giving teams clear ownership and responsibility."* |
| **ClickUp** | 1 por padrão, N **opt-in** | Followers (ex-watchers) | Multi-assignee é um ClickApp **desligado**; só admin liga. *"unlike assignees, followers aren't necessarily responsible."* |
| **monday** | **N** ilimitado | — | Restringir é por vagas, não responsabilidade |
| **Trello** | **N** members | — (member já é watcher) | Sem conceito de dono |
| **Planner** | **N** (até 11) | — | Documenta o efeito colateral: um marca concluído e conclui para todos |

**A divisão não é aleatória.** Ferramentas de execução com rastreio de responsabilidade
convergem em responsável único + campo separado. Ferramentas de colaboração leve usam
multi-pessoa e **não têm** campo de participantes — porque não têm conceito forte de dono.

O GestãoPro está no primeiro grupo.

---

## Três evidências que pesam mais que a contagem

1. **Recusa ativa, não omissão.** Jira acumulou 413 votos e 15+ duplicatas em duas décadas e
   manteve o "Won't Fix". Asana recusa desde 2017 e escreveu uma página para explicar.

2. **Quem oferece N, oferece desligado.** ClickUp tem multi-assignee **desativado por padrão**
   — e manteve `followers` separado justamente para preservar a fronteira.

3. **O caso de teste da IA.** Linear precisou representar "um agente trabalhando na tarefa de
   alguém" — o cenário mais legítimo para dois responsáveis. Criou **delegation**, preservando
   o dono único. Reforçaram o modelo quando tinham a melhor desculpa para abandoná-lo.

---

## O princípio: RACI

- **Responsible (R)** — quem faz. *"There is at least one role with a participation type of
  responsible, although others can be delegated to assist."* → **pode ser múltiplo**
- **Accountable (A)** — quem responde. *"There must be only one accountable stakeholder
  specified for each task or deliverable."* → **exatamente um**

O par **Responsável + Participantes** é essa estrutura. E o banco já a reforça: existe o
trigger `enforce_single_accountable` em `activities`.

**Ressalva de rigor:** a regra "um único A" é prática consolidada da literatura RACI, citada
ao PMI — **não** cláusula literal do PMBOK, que padroniza a RAM e trata RACI como exemplo de
formato.

---

## Por que fundir destrói informação

- **Perde-se a distinção semântica.** Depois da fusão não há como responder "quem responde
  por isto?" — só "quem está por perto?".
- **Quebra o mapeamento com RACI.** Um campo único de N pessoas não representa "um A + vários R".
- **É migração de mão única.** Fundir descarta qual das N era a responsável; separar depois
  exige readjudicar tarefa por tarefa, à mão.
- **O efeito colateral já está documentado por quem fez.** No Planner, com N responsáveis, um
  marca concluído e conclui para todos.

---

## Contrapontos honestos

Para não vender a conclusão como mais limpa do que é:

- Multi-assignee é a feature request **mais votada** do Jira e da Asana há duas décadas — a
  demanda dos usuários é real e persistente.
- monday é comercialmente muito bem-sucedido com o modelo oposto.
- **Não há estudo** ligando diretamente número de responsáveis a taxa de conclusão. A base é a
  posição declarada dos fabricantes mais a teoria de responsabilidade difusa (*social loafing*),
  não medição direta no contexto de software.

---

## O que fazer em vez de fundir

O problema que motivou a pergunta é **real**: os dois campos concedem o mesmo acesso, e a tela
não dizia isso. Mas o defeito não era existirem dois campos.

1. **Feito** (commit `81494c1`): o rótulo passou a dizer o que o campo concede — "Participantes
   da atividade · trabalham junto e também podem editá-la".
2. **Feito** (commit `acb5307`): `can_edit_own` passou a ser lido, então "Visualizar e comentar"
   barra de verdade.
3. **A fazer** (fase 02, item 5): a checagem de equipe no banco, para atribuir alguém de fora
   deixar de ser possível pela API.

**Se ainda assim quiser N responsáveis:** o caminho menos destrutivo é o do ClickUp — permitir
vários como **opção desligada por padrão**, mantendo participantes ao lado. Preserva a
informação e deixa a porta aberta.

## Fontes

- [Asana — Why one assignee?](https://asana.com/resources/why-one-assignee)
- [Jira — JRASERVER-1397 (Won't Fix)](https://jira.atlassian.com/browse/JRASERVER-1397)
- [Linear — Assigning issues](https://linear.app/docs/assigning-issues)
- [ClickUp — Multiple Assignees](https://help.clickup.com/hc/en-us/articles/6309029762583-Multiple-Assignees)
- [monday — The People Column](https://support.monday.com/hc/en-us/articles/360002281539-The-People-Column)
- [Microsoft — Assign people to tasks (Planner)](https://support.microsoft.com/en-us/planner/assign-people-to-tasks)
- [Responsibility assignment matrix (RACI)](https://en.wikipedia.org/wiki/Responsibility_assignment_matrix)
