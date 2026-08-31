# "Sem permissão para incluir na equipe" — 31/08/2026

> Pergunta do Raphael, com captura na entrega **1.2.1.5**, onde ele **é** o
> responsável: *"o responsável da atividade/grupo que pode editar suas
> atividades de acordo com a permissão da equipe do projeto, não pode incluir?"*

## A resposta curta

**Não pode, e isso está correto.** Mas a tela pediu a coisa errada, e depois
relatou mal o não que recebeu. É isso que foi consertado.

## Por que a recusa está certa

`incluir_e_atribuir` exige `can_manage`. E `can_manage` é uma **coluna própria**
em `project_members`, ao lado de `can_edit`, `can_create`, `can_delete` e
`can_move` — não é derivada de nenhuma delas. Foram desenhadas como permissões
distintas.

O CLAUDE.md nomeia isso como a decisão que organiza o modelo inteiro:

> *"Atribuir alguém a uma atividade nunca dá a essa pessoa acesso que ela não
> tinha ao projeto. Quem atribui alguém de fora da equipe recebe a proposta de
> adicioná-la à equipe — e isso é ato de quem gerencia equipe. Essa checagem
> vive no banco, não na interface."*

Se `can_edit` bastasse para incluir alguém na equipe, atribuir viraria uma porta
lateral de entrada no projeto: bastaria atribuir uma pessoa qualquer a uma
atividade para lhe dar acesso. Os dois eixos — **quem pode mexer** e **quem faz
o quê** — deixariam de ser separados.

## O que estava errado: a tela pedia a coisa errada

O fluxo tenta o insert direto e, se falhar, cai na RPC:

```ts
const { error: eDireto } = await tabelaSemTipo("activity_assignees").insert({...});
if (eDireto) {
  const { error: eRpc } = await supabase.rpc("incluir_e_atribuir", {...});
  if (eRpc) { toast({ description: eRpc.message }); return; }
}
```

O desenho é bom. O defeito é que `if (eDireto)` **não olha por que** falhou — e
há duas causas com significados opostos:

| origem da recusa | o que ela quer dizer | a RPC ajuda? |
|---|---|---|
| trigger `trg_assignee_exige_equipe` | o **atribuído** está fora da equipe | **sim** — é exatamente o caso dela |
| policy `Assignees write` | **quem atribui** não pode mexer nesta atividade | **não** — vai recusar por outro motivo |

No segundo caso a RPC troca um *"você não pode editar esta atividade"* por um
*"você não pode gerenciar a equipe"*. A pessoa lê a segunda frase e vai pedir a
permissão errada — que não resolveria o problema dela.

O gatilho tem mensagem própria (*"nao esta na equipe do projeto"*), e é por ela
que os dois casos passam a ser separados.

## O conserto

1. **A recusa da policy não chama mais a RPC.** Vira mensagem traduzida do erro
   real, em vez de uma frase sobre equipe que não tem relação com a causa.
2. **Quando a RPC recusa de verdade** — a pessoa está fora da equipe *e* quem
   atribui não gerencia equipe — a frase passa a dizer o que fazer:

   > *"Essa pessoa não está na equipe do projeto. Só quem gerencia a equipe pode
   > incluir alguém novo. Peça ao gestor do projeto para adicioná-la — depois
   > você consegue atribuir."*

   O motivo importa menos que a saída.

**A regra do banco não foi afrouxada**, e há asserção travando isso: `can_manage`
continua exigido, e a checagem continua **antes** de qualquer escrita — sem ela,
`SECURITY DEFINER` seria poder concedido em vez de emprestado.

## Se a intenção for outra

Se você quiser que quem responde por uma entrega **também possa incluir gente na
equipe**, isso é uma **decisão de desenho**, não um defeito — e mexeria na regra
citada acima. Precisa ser pedida explicitamente, porque significa aceitar que
atribuir passe a conceder acesso ao projeto.

O caminho intermediário, se for o caso, seria a atribuição gerar um **pedido** ao
gestor em vez de recusar — mas isso é funcionalidade nova, não conserto.

## Trava

`scripts/verificar-qual-nao-o-banco-deu.cjs` — 8 asserções: a distinção das duas
recusas, a policy não caindo na RPC, a frase acionável, e as duas que impedem o
afrouxamento da regra no banco.
