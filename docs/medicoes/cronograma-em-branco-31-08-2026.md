# O cronograma em branco — 31/08/2026

> Relato do Raphael: *"além disso, o cronograma não aparece informação alguma."*

## O que foi encontrado

Não um defeito, **quatro** — todos com o mesmo sintoma visível, e é justamente
por isso que o relato não conseguia ser mais específico: a tela não tinha como
dizer qual dos quatro estava acontecendo.

O painel tem um único estado inicial, `useState([])`. Qualquer coisa que impeça
o carregamento de chegar ao `setActivities` deixa esse estado intacto — e o
resultado na tela é idêntico ao de um projeto que legitimamente não tem
atividades.

### 1. `Promise.all` amarrava as cinco consultas

```ts
const [{ data: acts }, { data: phs }, ... ] = await Promise.all([
  actsQ, phasesQ, profilesQ, stagesQ, respQ,
]);
```

`Promise.all` rejeita inteiro quando **uma** rejeita. A exceção escapava de
`fetchData` como promise não aguardada: o React não a mostra, o `useEffect` a
ignora, e nenhum dos cinco `set*` rodava.

As cinco consultas não têm o mesmo peso, e essa era a falha de desenho por trás
da falha técnica:

| Consulta | Se falhar, o que se perde |
|---|---|
| `activities` | **a tela inteira** |
| `phases` | o agrupamento por fase |
| `profiles` | nomes viram id |
| `workflow_stages` | a coluna de estágio |
| `activity_assignees` | a coluna de responsável |

Quatro das cinco custam uma coluna. Uma custa a página. Tratá-las como um bloco
só fazia a mais barata poder derrubar a mais cara.

### 2. O `error` do PostgREST era descartado

```ts
const { data: acts } = await actsQ;   // `error` não é lido
setActivities(acts || []);            // recusa da RLS vira lista vazia
```

Mesma família já varrida em 30/08 (`docs/` sobre erro do banco chegando como
silêncio): a RLS recusa, `data` volta `null`, o `|| []` transforma a recusa em
"não há nada". É o padrão que o CLAUDE.md chama de fallback silencioso.

### 3. Nenhum projeto visível zerava tudo e voltava calado

```ts
if (scopedProjectIds.length === 0) {
  setActivities([]); setDeps([]); setPhases([]); setStages([]);
  return;                              // sem uma palavra
}
```

Duas causas possíveis, com **ações opostas** para o usuário:

- `allProjects` veio vazio → não há projeto ativo; não há o que fazer.
- `filterProjects` filtrou tudo → os projetos existem e a permissão não alcança;
  a saída é pedir acesso — e ninguém pede o que não sabe que existe.

Este é o caminho mais provável do relato, porque não depende de nada quebrar.

### 4. Exceção antes das consultas não tinha rede

A leitura de `projects` e a chamada de `filterProjects` rodam antes das cinco.
Lançando ali, o efeito é o mesmo — e o `allSettled` não alcança, porque nem
chega a ser atingido.

## O que foi feito

1. `Promise.allSettled` com um colhedor que trata as **duas** formas de falhar
   (promise rejeitada e `error` do PostgREST).
2. Essencial × acessória: `activities` falhando vira faixa e para; as outras
   quatro falhando viram ausência daquele pedaço.
3. O caminho "nenhum projeto visível" passa a distinguir ausência de permissão.
4. `try/catch` em volta do carregamento inteiro, como última rede.
5. Faixa de erro na tela, em português (via `mensagemDeErro`), com
   **Tentar de novo** — falha de rede é o caso comum e exigir F5 é castigo
   desproporcional.
6. O vazio legítimo também passa a ser específico: *"Nenhuma atividade
   corresponde aos filtros"* com a contagem do que está escondido, contra
   *"Este projeto ainda não tem atividades no cronograma"*.

## O que NÃO foi feito, e por quê

**Não foi identificado qual dos quatro caminhos produziu o relato do dia 31.**
Não dá para medir daqui: a chave anônima devolve 401 desta máquina
(`docs/` sobre banco só pelo host público), então não é possível reproduzir a
sessão do usuário nem ver o que a RLS dele devolve.

O que dá para afirmar, sem tocar em dado: `activity_assignees` **existe** em
produção — conferido pelo esquema OpenAPI, via `scripts/metadado-da-coluna.cjs`,
que não lê nem escreve linha nenhuma. Então a hipótese "tabela ausente derrubou
o `Promise.all`" está descartada, e a hipótese 3 (permissão) é a mais provável
das restantes.

O conserto não depende dessa identificação: as quatro vias de silêncio eram
defeitos por si mesmas. **E a próxima ocorrência vai chegar com o motivo escrito
na tela**, que é o que muda daqui para a frente.

## Trava

`scripts/verificar-cronograma-nao-cala.cjs` — 16 asserções, uma por via de
silêncio, mais as de comportamento da faixa e do vazio. Todas leem o arquivo com
os comentários removidos, para que citar uma regra não a satisfaça.
