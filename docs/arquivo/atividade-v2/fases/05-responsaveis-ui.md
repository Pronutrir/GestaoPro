# 05 - Responsaveis na interface  (era Fase 3)

**Objetivo:** o seletor de pessoas da atividade explica o que concede, e a checagem de equipe
aparece na tela.

> **PREMISSA ERRADA.** O prompt original comeca com *"Substitua o campo Lider por um seletor
> de Responsaveis"*. **Nao existe campo "Lider"** na atividade. O que existe:
>
> - **Responsavel** (`assigned_to`) - ja e um seletor de pessoa
> - **Participantes** (`participants`) - ja e um seletor multiplo, com painel de inclusao
>   e a opcao de herdar a equipe do agrupador pai
>
> E os rotulos **ja foram corrigidos** no commit `81494c1`: o campo dizia "Equipe do
> Projeto" (enganoso) e passou a dizer "Participantes da atividade", com a linha
> *"Trabalham junto nesta atividade e tambem podem edita-la"*.
>
> **O que sobra desta fase**, e vale: a checagem de equipe na tela, os avatares empilhados,
> o campo de observadores, e as restricoes por perfil.
>
> Ver `DIVERGENCIAS.md` item 1 e `06-responsaveis-mercado.md`.

## Prompt (o que resta)

```
No seletor de pessoas da atividade (Responsavel e Participantes):

- Ao buscar alguem que nao esta na equipe do projeto: mostrar o resultado
  DESABILITADO com "nao esta na equipe do projeto". Se quem esta agindo tem
  canManageTeam, oferecer "adicionar a equipe como Editar apenas as minhas"
  no mesmo gesto. Se nao tem, explicar quem pode fazer isso.
  (A checagem correspondente no banco vem da fase 02, item 5. A interface
  apenas explica - nunca e a unica barreira.)

- Perfil Visualizador nunca aparece como opcao; explique o motivo no lugar
  de apenas omitir. Motivo: canWrite=false anula qualquer papel de projeto,
  entao atribui-lo criaria uma atividade sem dono efetivo.

- Perfil Externo pode ser participante, nunca responsavel, e nao ve custo.

- Quem nao tem canAssign ve os avatares como leitura, sem o botao - nao um
  controle desabilitado.

- Mostra avatares empilhados no card do Kanban, na tabela de subatividades
  e no cabecalho da atividade.

Adicione observadores como campo separado, SEM qualquer efeito em permissao,
com adicao automatica de criador, atribuidos, quem comenta e quem e
mencionado. A tabela vem da fase 02, item 2 (activity_watchers).
E o unico dos tres campos de pessoa que nao concede nada - deixe isso
explicito no rotulo, do mesmo jeito que "Participantes da atividade" diz que
concede.
```

## Pronto quando

Duas pessoas numa atividade, o Kanban mostra as duas, e um colaborador com "editar so as
minhas" **nao** consegue se atribuir a uma atividade alheia - nem pela tela, nem pela API.

## Nao faca

- Nao deixe a checagem "tem que estar na equipe" so no front. Sem a fase 02 item 5, ela e
  decoracao: qualquer chamada direta a API passa.
- Nao funda Responsavel e Participantes num campo so. Ver `06-responsaveis-mercado.md`:
  pesquisa em 7 produtos, e os tres mais proximos deste sistema mantem os dois separados.
