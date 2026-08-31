# "Dependências não carregaram" — 31/08/2026

> Pergunta do Raphael, com captura: *"ao recarregar a página essas mensagens
> aparecem. isso acontece por que ainda não subimos as migrations?"*

## Resposta curta

**Não.** Nenhuma migration pendente causa isso. É aritmética de URL, e o
conserto é só de código — não depende de subir nada no banco.

## Como isso foi descartado sem tocar em dado

A mensagem vem de quatro telas que leem `task_dependencies`. A hipótese
"a tabela ou uma coluna ainda não existe" foi verificada pelo esquema OpenAPI,
via `scripts/metadado-da-coluna.cjs` — que não lê nem escreve linha nenhuma,
conforme a regra permanente sobre metadado:

```
task_dependencies — 6 colunas
  id               uuid   NOT NULL
  predecessor_id   uuid   NOT NULL
  successor_id     uuid   NOT NULL
  dependency_type  text   NOT NULL
  lag_days         int4
  created_at       timestamptz NOT NULL
```

As três colunas que as telas selecionam existem. A hipótese está descartada.

## A causa real: o lote que dobra na URL

`ID_CHUNK = 50` foi calibrado em 07/08 para **um** `.in(...)` — cerca de 1,9 KB,
metade do limite de ~3,7 KB que o proxy aceita antes de devolver 502.

As telas de dependência não usam um `.in()`. Usam `.or(...)` com o
**mesmo lote em dois filtros**:

```ts
.or(`predecessor_id.in.(${batch}),successor_id.in.(${batch})`)
```

Cada id passa a custar o dobro na URL:

| Consulta | 50 ids | Resultado |
|---|---:|---|
| um `.in()` — o caso para que o 50 foi calibrado | 1.869 chars | cabe |
| o `.or()` das telas de dependência | **3.742 chars** | **502** |
| o `.or()` com o lote dividido (25) | 1.892 chars | cabe |

Estoura por **42 caracteres**. É por isso que o defeito parecia intermitente:
projeto pequeno gera um lote curto e funciona; projeto grande atinge o lote
cheio de 50 e quebra. E aparece "ao recarregar" porque é no carregamento que a
consulta roda.

O `selectInChunks` lança no primeiro lote com erro, o `.catch` da tela dispara,
e sai o toast da captura.

## O conserto

O que faltava não era um número menor, era o módulo **saber** que a lista pode
aparecer mais de uma vez na URL.

- `chunkIdsFor(items, vezesNaUrl)` divide o `ID_CHUNK` pela repetição.
- `selectInChunks` ganha um terceiro parâmetro, **com padrão 1** — nenhuma das
  dezenas de chamadas existentes muda de comportamento.
- As cinco chamadas passam `2`, com o motivo escrito ao lado de cada uma.

**Baixar o `ID_CHUNK` global seria o conserto errado:** puniria todas as
chamadas com um filtro só, dobrando o número de viagens delas sem nenhum ganho.
Quem repete a lista é que declara.

## O que fica travado

`scripts/verificar-lote-com-or.cjs` — 13 asserções. Duas calculam o tamanho real
da URL (a aritmética é verificada, não citada); seis travam o módulo; quatro
travam as telas (contando as duas do Kanban); e a última varre `src/components` inteiro procurando
qualquer `.or` que repita o lote **sem** declarar a contagem.

Essa última é a que importa a médio prazo: como o parâmetro tem padrão 1, uma
tela nova que esqueça de passar `2` voltaria silenciosamente ao lote que
estoura — e o 502 reapareceria meses depois, de novo só no projeto grande.

## Adendo: eram cinco chamadas, não quatro

`ActivityKanban.tsx` tem **duas** — `task_dependencies` e `task_relations`. A
segunda quase escapou por dois motivos que vale registrar:

1. **A varredura tinha o mesmo defeito do código que vigiava.** Ela perguntava
   "este arquivo tem alguma ocorrência?", e parava na primeira. Agora conta:
   tantos `.or` que repetem o lote quantos `2,` declarando a contagem. Um `2,`
   solto no arquivo não prova nada sobre a segunda chamada.

2. **O comentário na segunda chamada já descrevia o defeito — e concluía
   errado.** Estava escrito, desde antes:

   > *"o `.or()` monta a lista de ids DUAS vezes na mesma URL, então estourava o
   > limite do proxy com metade das atividades. Em lotes, cada requisição
   > carrega no máximo 2×50 ids."*

   O diagnóstico está certo. A conclusão trata **2×50 como seguro**, e 2×50 é
   exatamente o que estoura: 3.742 chars. O lote virou metade do que era e a URL
   continuou do tamanho do problema original — meio conserto, com um comentário
   afirmando que estava resolvido.

É o caso que mais custa a achar: não há silêncio nem ausência de análise. Há uma
análise correta com o último passo errado, e um comentário que faz qualquer
leitor seguinte pular o trecho.
