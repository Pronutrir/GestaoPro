# Por que a fase aparece duplicada no Cronograma — 27/08/2026

> Relatado com captura: `1.1 · 1ª. Fase - Planejamento e Lançamento` aparece
> **duas vezes seguidas** — uma sem ID, outra com `8277fd5`.
>
> Confirmado no projeto `dcf977e9` (Revitalização Tasy):
> `phases` tem `"1.1 1ª. Fase - Planejamento e Lançamento"` (id `54cee826`) e
> `activities` tem `"1ª. Fase - Planejamento e Lançamento"` (id `8277fd50`).

---

## A resposta curta

**A fase existe em dois lugares do banco, e o Cronograma desenha os dois.**

| linha | de onde vem | por que não tem ID |
|---|---|---|
| a **primeira** (sem ID) | tabela `phases` | é uma **linha sintética**, montada em memória com id `phase:<uuid>` — não é uma atividade |
| a **segunda** (`8277fd5`) | tabela `activities`, com `item_type='fase'` | é uma atividade de verdade |

Não é bug de renderização: são **dois registros distintos** descrevendo a mesma
fase.

---

## Por que ninguém percebeu antes

Os títulos **não são idênticos**, e por isso nenhuma verificação por igualdade
os pegava:

```
phases.title       "1.1 1ª. Fase - Planejamento e Lançamento"   ← código no TEXTO
activities.title   "1ª. Fase - Planejamento e Lançamento"        ← código em wbs_code
```

Na `phases`, o código foi digitado dentro do nome. Na `activities`, ele mora na
coluna certa. Comparando texto cru, são strings diferentes; para quem lê a tela,
é a mesma linha duas vezes.

---

## O alcance

| | |
|---|---|
| fases em `phases` | **64** |
| atividades com `item_type='fase'` | **837** |
| **duplicadas** (mesmo título, normalizado) | **60**, em **10 projetos** |
| atividades que apontam para uma `phase` | 2.218 de 3.209 |
| projetos com linhas em `phases` | 14 de 45 |

| duplicatas | projeto |
|---|---|
| **16** | **Revitalização Tasy** ← o da captura |
| 13 | Serviço de Ultrassonografia |
| 9 | Guia Jornada do Paciente — Desenvolvimento |
| 5 | Projeto Escritório de Processos |
| ≤4 | e mais 6 projetos (quase todos "Teste …") |

Lista completa, com os dois ids de cada par, em
[fase-duplicada-27-08-2026.csv](fase-duplicada-27-08-2026.csv).

### ⚠ A primeira contagem foi baixa, e o erro era meu

Contei **34 em 6 projetos** antes de corrigir a normalização. O regex que
removia o código do início do título era `^\s*[\d.]+\s*` — e ele comia o
`1` de `"1ª. Fase"`, produzindo `"ª. fase…"` de um lado e `"1ª. fase…"` do
outro. Os pares não casavam.

Pior: **"Revitalização Tasy" ficava de fora** — justamente o projeto da captura.
Um número que não inclui o caso relatado está errado, e foi isso que denunciou.

Corrigido para `^\s*\d+(\.\d+)*\s+` — só remove código seguido de **espaço**.
"1ª" não é código EAP.

`phases` **não é vestigial** — 2.218 atividades dependem dela. O problema é a
sobreposição: em 10 projetos alguém criou a fase nos dois lugares.

---

## Como o Cronograma chega a isso

Ele monta uma linha em memória para cada `phase`, para que ela agrupe e indente
junto das atividades:

```ts
{ ...p, id: `phase:${p.id}`, __isPhaseRow: true }   // ProjectCronogramaPanel:797
```

A linha sintética é uma decisão **correta e necessária**: fases vivem noutra
tabela e precisam aparecer na mesma árvore. O que não está previsto é a mesma
fase existir também como atividade — aí as duas linhas coexistem.

O ID vazio na primeira é o sintoma visível disso: `phase:<uuid>` não é id de
atividade, então a coluna fica em branco.

---

## Por que isto não é conserto de uma linha

São três saídas, e todas mexem em dado de 6 projetos:

| | o que faz | custo |
|---|---|---|
| **esconder a sintética quando há atividade equivalente** | some a duplicata na tela | o dado continua duplicado; a próxima tela repete o defeito |
| **apagar a fase de `phases`** | resolve na origem | as atividades que apontam para ela via `phase_id` perdem o vínculo |
| **apagar a atividade `item_type='fase'`** | idem | ela pode ter filhas e histórico próprios |

A escolha depende de qual das duas é "a de verdade" em cada projeto — e isso é
decisão de quem cuida do projeto, não de quem lê o dado.

---

## O que isto conversa com o Projeto v2

É literalmente o primeiro item da Onda 1 de `docs/projeto-v2/`:

> **Onda 1 — parar de mentir:** fase duplicada no cronograma · uma definição só
> de fase/entrega/atividade/marco

A causa é a que o próprio documento nomeia: *"existem 25 lugares para guardar
informação de projeto e nenhuma ligação entre eles."* Fase é um deles, guardada
em dois.

**Não está no escopo das fases A–E.** Fica registrado com o número e a lista dos
6 projetos, para a decisão vir com dado em mãos.

---

**Método:** `phases` e `activities` inteiras, comparação por título normalizado
(removendo o código do início). Só `SELECT`.
