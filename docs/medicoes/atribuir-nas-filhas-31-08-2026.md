# Atribuir nas filhas — por que o conserto da manhã não apareceu

> Relato reaberto, com captura da atividade **1.2.1.5.1**: *"observe que o
> responsável ainda não consegue destinar responsável para os filhos."*

## O que a captura já dizia

A faixa no topo — **"Você acompanha esta atividade. Pode comentar; não pode
alterar."** — era o diagnóstico, e eu não a li na primeira vez.

Essa faixa só aparece quando `canEditExecucao` **e** `canEditPlanejamento` são
falsos. Ou seja: o problema nunca foi apenas o campo Responsáveis. A tela
inteira estava em modo leitura para alguém com permissão de escrita no projeto.
Se fosse só a regra de atribuição, os outros campos estariam editáveis e a
faixa não existiria.

## Dois defeitos, um encobrindo o outro

### 1. A tela montava o ator pela metade

`capacidadesNaAtividade` decide em seis passos. O passo 4 — *"está na equipe? o
papel manda"* — depende de `naEquipe`, `canEdit`, `canMove`, `canCreate`,
`canDelete` e `canEditOwn`.

A tela da atividade não passava **nenhum** deles:

```ts
capacidadesNaAtividade(atividade as never, projeto as never, {
  id, profileId, fullName, email, isAdmin,
  ehVisualizador: false,
} as never)          // ← o cast que escondeu o objeto incompleto
```

Para a função, quem abrisse essa tela não era da equipe. Medido:

| | passo que decidiu | canAssign |
|---|---|---|
| como a tela chamava | `6-sem-acesso` | false |
| com o ator completo | `4-equipe-editar-apenas-as-minhas` | **true** |

O `as never` é o que permitiu isso compilar. Ele desliga a checagem de forma —
o TypeScript teria recusado o objeto incompleto sem ele. Foi removido.

A correção carrega a linha de `project_members` do usuário, a **mesma fonte**
que a página do projeto usa em `loadAccess`. Duas fontes de permissão divergem,
e isso já produziu aqui o botão que aparece numa tela e não na outra.

### 2. O `ator &&` anulava a própria regra do pai

Escrito de manhã:

```ts
canAssign: ator && (
  matchesIdentity(atividade?.assigned_to, candidatos)
  || matchesIdentity(atividade?.responsavel_do_pai, candidatos)
)
```

`ator` é sobre a **própria** atividade (`ehAtividadeDaPessoa`). Na filha do
relato, quem responde pelo pai não é ator dela: não é responsável — o campo está
vazio, que é a premissa inteira do caso — nem participante. A captura confirma:
*Responsáveis: sem responsável* · *Participantes: ninguém*.

Então o `&&` zerava exatamente o caso que a segunda metade da expressão existia
para atender. Responder pelo pai é via **própria**, não um refinamento da via de
ator:

```ts
canAssign:
  (ator && matchesIdentity(atividade?.assigned_to, candidatos))
  || matchesIdentity(atividade?.responsavel_do_pai, candidatos),
```

## Por que o teste da manhã não pegou

Ele montava a filha assim:

```ts
const filha = { assigned_to: null, participants: [EU], responsavel_do_pai: EU };
```

`participants: [EU]` — e participante **é** ator. O `ator &&` ficava satisfeito
por acidente, e o teste passava com a expressão quebrada.

O cenário não era o do relato. Na captura, Participantes diz "ninguém". O teste
confirmava a expressão que eu tinha escrito, não o comportamento que o usuário
descreveu — que é a forma mais cara de teste verde.

Corrigido para `participants: []`, e acrescentada uma asserção sobre o **passo
que decidiu**, não só sobre o booleano: travar o passo é o que impede a tela de
voltar a chamar a função com o ator pela metade.

## O que continua verdadeiro depois do conserto

Na filha do relato, `canEditPlanejamento` **segue falso** e a faixa "você
acompanha" **continua aparecendo**. Isso não é defeito residual: quem responde
pelo pai ganha o direito de *distribuir o trabalho* das filhas, não o de
reescrever o plano delas. É a regra do CLAUDE.md — permissão e trabalho são
eixos separados.

O que muda na tela é o campo **Responsáveis**, que deixa de ser texto e vira
editável.

Se a intenção for que o responsável pela entrega também edite datas, GUT e custo
das filhas, isso é **outra decisão** — de escopo, não de defeito — e precisa ser
pedida explicitamente.

## Travas

`scripts/verificar-relatos-31-08.cjs` — 19 asserções. As novas cobrem os dois
lados: a regra (com o cenário fiel à captura e o passo que decidiu) e a tela
(cada campo de equipe repassado, a ausência do `as never`, e a origem em
`project_members`).

Os 108 casos da matriz de acesso continuam batendo — a mudança em `canAssign`
não regrediu nenhum.
