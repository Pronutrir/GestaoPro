# O "antes" da fase 09 — medido em 26/08/2026, com as telas ainda calculando no cliente

> Gravado **antes** de trocar os pontos de cálculo. Depois da troca, o número da tela passa a
> vir de `derived_hours` e esta comparação deixa de ser possível — não há como voltar e
> perguntar "o que a tela mostrava antes?".

Base de produção, service key. Migration `20260826130000` (fase 09) **já aplicada**; nenhuma
tela lê `derived_*` ainda. É exatamente a janela em que os dois números coexistem.

---

## O resultado, em uma linha

**581 pais conferidos. 581 dão o mesmo número nos dois lados. Nenhuma divergência.**

Isso é uma boa notícia e uma notícia incompleta, e as duas partes importam.

---

## Parte 1 — o gatilho contra os cinco caminhos

O que `derivar_do_pai()` precisa acertar são as cinco formas de a árvore mudar. A trigger
`trg_derivar_do_pai` dispara em `INSERT`, `DELETE` e `UPDATE OF` — e a lista de colunas cobre
os cinco:

| Caminho | Coberto por | Como foi conferido |
|---|---|---|
| Inserir filha | `AFTER INSERT` | lista de colunas da trigger |
| Alterar horas | `UPDATE OF hours, cost` | lista de colunas da trigger |
| Mandar para a lixeira | `UPDATE OF is_trashed` | **medido em dados reais, abaixo** |
| Restaurar da lixeira | `UPDATE OF is_trashed` | mesmo caminho, simétrico |
| **Trocar o pai** | `UPDATE OF parent_id` **+ recontagem do pai antigo** | leitura do código |

O reparentar é o que mais escapa, e é o único que precisa de dois recálculos — o pai novo
ganha uma filha, o pai antigo perde uma. A trigger faz os dois:

```sql
PERFORM public.derivar_do_pai(NEW.parent_id);
IF TG_OP = 'UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
  PERFORM public.derivar_do_pai(OLD.parent_id);   -- o pai ANTIGO tambem reconta
END IF;
```

### A lixeira, medida e não deduzida

Ler o código não prova comportamento. O que prova é dado real: **11 pais que têm, ao mesmo
tempo, filha viva e filha na lixeira** — os únicos casos em que o filtro tem o que fazer.

| pai | filhas vivas | filhas na lixeira | `derived_children` | veredito |
|---|---|---|---|---|
| Fase de Cadastros e Funções Es… | 2 | 5 | **2** | ignora a lixeira |
| POP - cadastro de novos medica… | 3 | 3 | **3** | ignora a lixeira |
| Processo de ajuste prescrição | 3 | 1 | **3** | ignora a lixeira |
| Função cargas | 2 | 2 | **2** | ignora a lixeira |
| Módulo - Quimioterapia | 3 | 5 | **3** | ignora a lixeira |
| Processo de lançamento de nota | 4 | 1 | **4** | ignora a lixeira |
| Módulo agenda de consulta | 8 | 1 | **8** | ignora a lixeira |
| Cadastro de Operação de Estoqu… | 2 | 1 | **2** | ignora a lixeira |
| Módulo contabilidade | 2 | 1 | **2** | ignora a lixeira |
| 1.0 — Fundação e Arquitetura ✦ | 1 | 12 | **1** | ignora a lixeira |
| Fundação: projeto, design syst… | 8 | 1 | **8** | ignora a lixeira |

`derived_children` conta sempre só as vivas — 2 e não 7, 8 e não 9, 1 e não 13.

**A linha que decide** é a última, a única em que as horas também diferem: soma das vivas
**11h**, soma de todas **12h**, e `derived_hours` = **11**. A hora da filha descartada fica
de fora. Nas outras dez, as descartadas tinham zero hora — por isso só esta separa as duas
hipóteses.

### A cascata de três níveis

`derivar_do_pai` soma **filhas diretas**, usando `COALESCE(f.derived_hours, f.hours, 0)` — a
profundidade sobe pelo derivado da filha, não por recursão. Isso só funciona se o UPDATE do
pai redisparar a trigger para o avô. Redispara: `derived_hours` está na lista de colunas
observadas.

Conferido em **20 avós** (nó com filho que também é pai): **20 de 20** batem com a soma
`COALESCE(derived_hours, hours)` das filhas diretas vivas. **Zero divergências.**

---

## Parte 2 — a tabela dos dez pais

Os dez maiores por `derived_hours`. "Tela hoje" é `hoursStatsByActivity`
(`ActivityKanban.tsx:1728`) reimplementado fielmente e rodado sobre a mesma base.

| pai | filhas | `derived_children` | tela hoje | `derived_hours` | |
|---|---|---|---|---|---|
| Paciente reconhece a clinica em cada… | 10 | 10 | 172 | 172 | igual |
| Paciente instala o app e cuida do pr… | 5 | 5 | 72 | 72 | igual |
| Paciente entra com sua conta | 3 | 3 | 60 | 60 | igual |
| Fase 01 - Diagnóstico | 2 | 2 | 60 | 60 | igual |
| Capacitação em Fundamentos da Gestão… | 12 | 12 | 60 | 60 | igual |
| Paciente e clinica compartilham vide… | 4 | 4 | 56 | 56 | igual |
| Paciente percorre a jornada de video… | 3 | 3 | 48 | 48 | igual |
| Iniciar a extração de dados Camada S… | 1 | 1 | 40 | 40 | igual |
| Iniciar a extração de dados Camada G… | 1 | 1 | 40 | 40 | igual |
| Iniciar a extração de dados Camada R… | 1 | 1 | 40 | 40 | igual |

Ampliado para **todos os 581 pais**: 581 iguais, 0 diferentes, 0 sem `derived_hours`.

---

## Parte 3 — por que "zero divergências" NÃO é o mesmo que "os dois cálculos concordam"

Os dois lados são estruturalmente diferentes em duas coisas. Só uma delas tem dados hoje.

**Diferença 1 — profundidade.** A tela recorre a subárvore inteira; o servidor soma filhas
diretas e conta com o derivado da filha. Dão o mesmo resultado enquanto a cascata estiver
íntegra — e ela está (20/20 acima). Esta diferença é real e está **coberta**.

**Diferença 2 — marco.** O servidor tira o marco de horas, custo e progresso
(`CASE WHEN f.is_milestone THEN 0`). A tela **não tira**: `hoursStatsByActivity` soma a filha
sem olhar `is_milestone` — os filtros `!is_milestone` das linhas 1793 e 1818 acontecem
depois, para desenhar o quadro, e não alcançam o rollup.

Essa diferença deveria produzir divergência. Não produz, e a razão é factual:

> **Não existe hoje, na base inteira, um único marco com horas.** `is_milestone = true` e
> `hours > 0`: **0 registros.**

Ou seja: a divergência está no código dos dois lados, mas **nenhum dado a exercita**. Os
581 iguais confirmam a profundidade e a lixeira; **não** confirmam o tratamento do marco,
porque não havia o que confirmar.

E há um detalhe que fecha o assunto para frente: a mesma migration criou
`tg_marco_sem_esforco`, que **recusa** marco com horas ou custo. Depois dela, o caso não
volta a aparecer — o banco passa a impedir. Por isso a diferença 2 é inofensiva na troca:
os dados que a tornariam visível não existem e não podem mais ser criados.

**A lixeira, essa sim, não aparece na comparação por outro motivo:** a consulta do Kanban já
busca com `is_trashed = false`, então a lista que chega ao cliente nunca tem descartada. O
filtro do servidor é o mesmo recorte, aplicado num lugar mais seguro.

---

## O que esta medição autoriza, e o que não autoriza

**Autoriza** trocar os pontos de cálculo: nos 581 pais reais, o número na tela não muda. A
troca é invisível para quem usa — que é exatamente o que se quer de uma mudança de fonte.

**Não autoriza** dizer que os dois cálculos são equivalentes. São diferentes no marco, e a
igualdade de hoje vem da ausência de dados, não de acordo entre as fórmulas.

**Método:** `_antes.cjs` reimplementa `walk()` linha a linha a partir de
`ActivityKanban.tsx:1728`. Reimplementar tem risco — foi assim que as duas metades de
`canMutateActivity` divergiram por meses. Aqui era inevitável: a função vive dentro de um
`useMemo` de componente React e não roda fora do navegador. Fica registrado como ressalva,
não como detalhe.
