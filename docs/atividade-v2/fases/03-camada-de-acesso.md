# 03 - Camada de acesso  (era Fase 2)

**Objetivo:** uma unica funcao que responde "o que esta pessoa pode fazer nesta atividade",
com teste cobrindo a matriz inteira.

**O fixture ja existe:** `matriz-acesso.json` - 108 casos, com o passo que decidiu cada um.
Regerar com `node docs/atividade-v2/gerar-matriz.cjs`.

> **O que ja existe:** `src/lib/activityAccess.ts` (commit `dd045f1`) e a fonte unica de
> `podeMutarAtividade`, criada ao unificar SEIS copias divergentes da mesma regra. Ela ja
> implementa os passos 1, 3, 4 e 5 e ja le `can_edit_own`.
>
> **O que falta:** (a) o passo 2 - perfil Visualizador - que hoje e aplicado por fora, na
> pagina (`canEdit = canWrite && ...`); (b) as capacidades nomeadas no lugar de um booleano;
> (c) o `escopoDeLeitura`.
>
> Esta fase **estende** esse arquivo. Nao comece do zero, e nao reintroduza copias.

## Prompt

```
Estenda lib/activityAccess.ts para a ordem de decisao completa:
admin -> perfil Visualizador (so leitura, encerra) -> dono/gestor do projeto
-> papel na equipe -> responsavel ou participante -> sem acesso.

O passo 2 hoje vive fora da funcao, na pagina do projeto. Traga-o para
dentro: e a unica forma de a funcao responder sozinha, e hoje quem chama a
funcao sem multiplicar por canWrite obtem a resposta errada.

Exponha capacidades nomeadas em vez de um booleano: canView, canComment,
canEditExecucao (status, datas reais, horas, anexos), canEditPlanejamento
(previsto, GUT, custo, posicao na EAP), canAssign, canPromover, canAssumir,
canDelete, canManageTeam. Exponha tambem escopoDeLeitura:
'projeto' | 'atividade_e_trilha' | 'nenhum'.

MANTENHA `podeMutarAtividade` funcionando durante a transicao - ela tem 27
testes em scripts/verificar-acesso-atividade.cjs e e chamada pelo Kanban e
pela pagina do projeto. Implemente-a em termos das capacidades novas
(canEditExecucao || canEditPlanejamento), nao ao contrario.

O escopo 'atividade_e_trilha' alcanca a propria atividade, TODA A SUBARVORE
abaixo dela (quem responde por 1.1.2 enxerga 1.1.2.1 - o trabalho esta nas
filhas), e os ancestrais apenas como contexto de leitura: codigo, nome e
tipo. Nunca as irmas, nunca custo, nunca contador que revele quantas irmas
existem.

A entrada do papel de equipe sao as CINCO COLUNAS BOOLEANAS do membro
(can_create, can_edit, can_delete, can_move, can_edit_own), nao um enum.
`papelDePermissoes` em projectRoles.ts converte colunas -> nome, e avisa no
proprio codigo que a conversao e LOSSY (2^5 combinacoes, 4 presets). A
camada de acesso deve consumir as COLUNAS, nunca o nome derivado.

canDelete NAO segue a via do ator: a policy de DELETE aceita so admin,
lider/gestor e can_member_action('delete'). Quem e so responsavel edita e
nao exclui - e o teste tem de cobrir isso.

canAssign so e verdadeiro para admin, dono/gestor do projeto, e equipe com
"Editar tudo" ou "Editar e excluir". Para "Editar apenas as minhas",
canAssign so vale em atividades onde a pessoa ja e responsavel.

canPromover segue canEditPlanejamento. canAssumir basta ter papel de escrita
na equipe, inclusive "Editar apenas as minhas".

Escreva os testes a partir de matriz-acesso.json, que traz os 108 casos e o
passo esperado. Cada assercao deve conferir tambem o passoQueDecidiu.
Inclua tres casos explicitos:
(a) responsavel sem papel de equipe nao consegue listar as irmas, mas
    consegue listar as proprias subatividades;
(b) papel "Visualizar e comentar" COM vinculo de responsavel resulta em
    canEditExecucao = false - e o caso que trava a regressao do
    can_edit_own quando a RLS for reescrita;
(c) a trilha devolvida nao traz contador, soma, pessoa, data nem custo.

Depois compare o resultado da camada com o da RLS nos mesmos 108 casos.
Onde divergir, a RLS esta certa - reporte antes de mudar qualquer uma.
```

## Pronto quando

Os 108 casos passam, **e** os 27 testes existentes continuam passando, **e** os dois batem
com a RLS.

## Nao faca

- Nao corte o teste de comparacao com a RLS por prazo. Duas copias da mesma regra sempre
  divergem, e e esse teste que segura. Esta base ja teve SEIS copias da mesma pergunta.
- Nao invente um setimo passo. Se um caso nao cabe nos seis, o modelo esta errado - pare e avise.
- Nao quebre `podeMutarAtividade` nem apague `scripts/verificar-acesso-atividade.cjs`.

## Decisao pendente

No fixture, perfil **Visualizador** esta com `canComment = false` (o `canWrite = false` de hoje
anula tudo). Se a intencao for que ele comente, mude no fixture **antes** de escrever o codigo.
