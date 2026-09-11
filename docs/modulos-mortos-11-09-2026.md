# Módulos de regra sem uso — varredura de `src/lib/`

**Data:** 11/09/2026 · **Motivo:** dois bugs seguidos tiveram a mesma forma —
um módulo com a regra certa, escrito e documentado, que **nenhuma tela chamava**.

- `dateValidation.ts` guardava a validação de intervalo. Zero imports. Quatro
  telas mantinham cópias inline e a mais nova não recebeu nenhuma: aceitava
  `Previsto 14/09 → 10/09` calada.
- `projectStatus.ts` guardava `normalizeProjectStatus`. Importado só pela
  constante. Um projeto gravado como `execucao` sumiu da lista inteira.

A varredura abaixo é por **export**, não por arquivo — foi essa a diferença
entre os dois casos.

---

## 1. Vivo e medido — `responsaveisDaAtividade.ts`

**228 linhas, zero importadores.** O arquivo inteiro.

Ele existe para resolver um problema concreto: `activities.assigned_to` guarda
**nome em texto livre**, e o front adivinha de quem é. O próprio módulo diz que
são 284 leituras espalhadas fazendo essa adivinhação.

Medido em produção hoje:

| | |
|---|---|
| Nomes de perfil duplicados | **1** |
| Atividades com responsável de nome ambíguo | **439** |
| Dessas, resolvíveis por `activity_assignees` (FK real) | **439 — todas** |

O módulo lê `activity_assignees.user_id` e devolve `origem` (`"tabela"`,
`"texto"`, `"ausente"`) para quem exibe saber o que está olhando. **Funcionaria
hoje**: os dados estão lá. Ninguém o chama.

Permissão não está em risco — a RLS e `lib/identityMatch` já recusam nome
ambíguo (migration `20260826180000`). O que está em risco é a **exibição**: 439
atividades em que a tela pode mostrar a pessoa errada entre duas de mesmo nome.

**Custo de ligar:** alto. São 284 pontos de leitura, e é um trabalho próprio,
não um remendo. Fica registrado, não feito.

## 2. Latente — `activityState.ts`

`isActivityCompleted` e `isActivityClosed` estão sem uso externo. O módulo
abre dizendo:

> *"Antes desta função havia três definições concorrentes de 'concluída' e
> 'atrasada' no código (Cronograma, healthScore e Kanban), que produziam números
> diferentes para o mesmo projeto."*

Só `healthScore` e o Cronograma o chamam. O **Kanban**, citado no próprio
comentário, não — e várias telas comparam `a.status === "completed"` ao pé da
letra, o que ignora a coluna do Kanban.

Divergência medida hoje: **1 atividade** em coluna final com status aberto, e
**0** no sentido contrário. O app grava status e coluna juntos em cada
movimento, então as duas definições concordam na prática. É risco latente, não
bug vivo — e some no dia em que alguém gravar só um dos dois.

## 3. Duplicado, mas honrado — `telaDaAtividade.ts`

`modoDoCampo` está sem uso; de todo o módulo só `rotaDaAtividade` é importado.
A regra que ele guarda — *"campo sem permissão vira TEXTO, não controle
desabilitado"* — **é aplicada**, mas reimplementada dentro da tela v2. Segunda
cópia da mesma decisão, que é como os dois bugs acima começaram.

## 4. Falso alarme — `quadroDeExecucao.viraCartao`

Aparece como morto, mas **não é problema**. `viraCartao` empacota três
condições, e o Kanban aplica as mesmas chamando `ehAgrupadorDoQuadro` (que é
usado) junto com `!is_milestone`. A regra do CLAUDE.md — *"só itens do tipo
Atividade viram card"* — está honrada. Conferido nas linhas 1583 e 1972 de
`ActivityKanban.tsx`.

---

## O resto

A varredura acusou exports sem uso em ~29 módulos. Fora os quatro acima, são
helpers soltos — `parseHoras`, `countChildren`, `chunkIdsFor`, `prefsKey` e
afins. Código morto é sujeira, não defeito: não decidem nada que alguma tela
precise decidir de outro jeito. Não justificam mexer.

## O que fica valendo

O CLAUDE.md ganhou as duas regras que os bugs produziram (datas e status de
projeto). O padrão a vigiar é sempre o mesmo:

> Um módulo em `lib/` que descreve uma REGRA e não é importado por ninguém não é
> código morto — é uma regra que o produto acha que tem e não tem.
