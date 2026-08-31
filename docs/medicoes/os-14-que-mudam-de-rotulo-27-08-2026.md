# Os 14 itens que trocam de rótulo no congelamento — 27/08/2026

> Registro pedido no passo 3 da Fase 1, **depois** de a decisão ser tomada.
> A decisão foi **aceitar**. Este arquivo existe para que, se alguém estranhar,
> a resposta esteja escrita.

---

## O que muda, para quem olha a tela

14 itens que hoje aparecem como **Entrega** passam a aparecer como
**Atividade**. Nenhum outro item da base muda de rótulo — a prova rodou nas
8.199 linhas, não numa amostra.

### Vivos (7) — estes alguém pode ver

| id | projeto | título | antes | depois |
|---|---|---|---|---|
| `2d8a777e` | Implementação do setor da Qualidade no GLPI | Coleta de requisitos | Entrega | **Atividade** |
| `18608b20` | Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |
| `688a7597` | Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |
| `9efd21b8` | Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |
| `63aaa80f` | Teste  - Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |
| `f6055856` | Teste - Revitalização Tasy | Processo iniciais | Entrega | **Atividade** |
| `95351bc9` | Teste 02 - Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |

### Na lixeira (7) — só reaparecem se alguém restaurar

| id | projeto | título | antes | depois |
|---|---|---|---|---|
| `7ed7dad7` | Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |
| `b8726560` | Revitalização Tasy | fase teste | Entrega | **Atividade** |
| `ea5583a6` | Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |
| `6686a941` | Serviço de Ultrassonografia | 1.3 Levantamento do Processo Atual | Entrega | **Atividade** |
| `7914636f` | Teste  - Revitalização Tasy | Processo iniciais | Entrega | **Atividade** |
| `ecf621f9` | Teste  - Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |
| `7b4dd1bf` | Teste 02 - Revitalização Tasy | Inicio do teste Piloto | Entrega | **Atividade** |

---

## Por que mudam — e por que não é defeito do congelamento

Os 14 são **a mesma linha**, repetida: `item_type = 'fase'`, **sem
`wbs_code`** e **sem filhas**.

A fórmula antiga era:

```
agrupa = item_type IN (fase, pacote)  OR  hasChildren
```

O campo entra na conta. Sem código EAP e sem filhas, esses itens só exibiam
"Entrega" **porque o campo dizia 'fase'** — o `hasChildren` real é `false`.
Gravado o valor exibido (`entrega`), ele deixa de casar com `IN (fase, pacote)`
e a leitura seguinte devolve `atividade`.

**Não é o `hasChildren` real divergindo do que a tela usava** — essa era a
suspeita que o passo 3 mandava investigar, e ela se descartou: o `hasChildren`
bate em todos. O que existe é um estado **sem ponto fixo**: o valor exibido,
regravado, produz outro valor exibido. Esses 14 não poderiam ser
congelados sem mudar, por caminho nenhum.

## Por que aceitar foi a decisão certa

- São **7 linhas vivas**, todas em projetos de teste ou piloto.
- **"Atividade" é o rótulo correto.** *"Inicio do teste Piloto"*,
  *"Processo iniciais"*, *"Coleta de requisitos"* são trabalho que alguém
  executa — não fases do ciclo de vida do projeto.
- A alternativa era congelar `'fase'` neles: preservaria a aparência **mantendo
  o campo mentindo**, que é exatamente o defeito que o congelamento existe para
  consertar.

Eles são a ponta visível dos **232 "fase sem filha nenhuma"** que a medição de
27/08 encontrou — a fatia que também não tem código EAP. Os outros 218 têm
código, e o nível decide por eles antes de `agrupa` ser consultado; por isso
trocam de campo em silêncio, sem trocar de rótulo.

## O que foi feito com o OR

Ele saiu. A fórmula passou a ser leitura pura do campo:

```
agrupa = item_type IN (fase, entrega)
```

Era o `OR hasChildren` que criava o estado sem ponto fixo. Sem ele, o tipo de
um item deixa de mudar quando ele ganha ou perde uma subatividade — que era o
defeito fatal do modelo anterior.

---

**Método:** `activities` inteira (8199 linhas), `resolveEapKind`
compilado de `src/lib/eapModel.ts` e chamado de verdade. Só `SELECT`.

---

## Adendo 27/08 — o `'projeto'` (nível 1) e os 5 que trocam de CAMPO, não de rótulo

A decisão sobre o `'projeto'` (14 itens de nível 1, wbs de um dígito) foi:
**com filhas → `fase`; sem filhas → `atividade`.** Sem alargar a CHECK, sem
mudar modelo. Isso porque `eapToPersisted('projeto')` cai em `atividade` pelo
fallthrough, e um nível-1 **com filhas** gravado como `atividade` seria recusado
pelo trigger de aninhamento (pai tem de ser `fase`/`pacote`).

Medido direto na tabela:

- **5 com filhas** — todos `Projeto Escritório de Processos` (FASE 1..4 +
  GERENCIAMENTO DO PROJETO), `item_type='fase'` → congelam em **`fase`**.
  **Nenhum muda.**
- **9 sem filhas** — congelam em **`atividade`**. Destes:
  - 4 já eram `atividade` (`f5945dba`, `04570694` vivos; `672f6eef`, `0b0f6f65`
    na lixeira) — nada muda.
  - **5 eram `fase` e passam a `atividade`** — TODOS na lixeira:

    | id | projeto | título | item_type antes→depois | rótulo antes→depois |
    |---|---|---|---|---|
    | `70d9453b` | Revitalização Tasy | Cadastros e Funções Essenciais | fase → **atividade** | projeto → projeto |
    | `22e95b23` | Revitalização Tasy | ETAPA I - Teste Piloto / Liberação | fase → **atividade** | projeto → projeto |
    | `75e5bd24` | Revitalização Tasy | Planejamento e Lançamento | fase → **atividade** | projeto → projeto |
    | `a10ea71d` | Ambiente de Homologação (Teste) | teste | fase → **atividade** | projeto → projeto |
    | `3945ac17` | Revitalização Tasy | Validações / Testes / Ajustes | fase → **atividade** | projeto → projeto |

### A correção da frase "nenhum outro muda de rótulo"

Ela continua **verdadeira para o RÓTULO**: `resolveEapKind` (`eapModel.ts:314`)
devolve `'projeto'` para todo nível-1 lendo o **nível**, não o `item_type` —
então os 5 acima seguem exibindo `projeto` dos dois lados. Nenhum usuário vê
diferença.

O que a frase NÃO cobria é o **campo gravado**: 5 itens (todos na lixeira)
trocam `item_type` de `fase` para `atividade` (agrupador → trabalho no
armazenamento). É mudança real de dado, mesmo sem mudança de tela. A
consequência prática está em `20260827130000`/condição 3: um nível-1
`atividade` na raiz é aceito como folha, mas para **receber filha** teria de ser
promovido a `fase` — os 5 estão na lixeira, então isso só importa se um deles
for restaurado e ganhar subitem.
