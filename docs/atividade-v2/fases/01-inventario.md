# 01 - Inventario  (era Fase 0)

**Objetivo:** confirmar como o codigo esta hoje. Nada das fases seguintes deve ser escrito
antes disto.

**Nao altere nenhum arquivo nesta fase.**

> **O item 2 mudou.** O kit original pedia "todos os lugares que leem `lider_id`". Essa coluna
> **nao existe** (0 ocorrencias). O que existe e `assigned_to` (TEXT, 284 leituras) e
> `participants` (text[]). Ver `DIVERGENCIAS.md` item 1. O item 2 abaixo ja vem corrigido.

## Prompt

```
Leia lib/activityAccess.ts, lib/projectRoles.ts, lib/accessLevels.ts,
hooks/useProjectAccess.ts e lib/projectManage.ts, e as migrations das
policies "Activities access v2".

Devolva, sem alterar nada, um documento em docs/atividade-v2/inventario.md com:

1. A ordem exata de decisao de acesso a uma atividade, no cliente e na RLS,
   e onde as duas divergem. Inclua onde o passo 2 (perfil Visualizador) e
   aplicado hoje - ele NAO esta dentro de podeMutarAtividade, e sim por fora,
   na pagina do projeto (canEdit = canWrite && ...).

2. Todos os lugares que leem assigned_to e participants (componentes,
   queries, relatorios, Gantt, Kanban, exportacoes, funcoes da RLS).
   Separe: quais assumem UM responsavel e quebrariam com N.

3. Como o papel de equipe "Editar apenas as minhas" resolve hoje o que e
   "minha" atividade.

4. Onde ficam hoje as regras de rolagem de horas e custo dos subitens, e
   se ALGUMA delas roda no cliente. Este item alimenta a fase 09 e e o
   mais importante do inventario.

5. Que tabelas e colunas existem para comentarios e para o historico da
   atividade, e por que o historico grava UUID em vez de rotulo.

6. Como a consulta do Kanban decide o que vira card, e o que exatamente a
   acao de mover do backlog para o Kanban altera no banco - a atividade,
   os ancestrais ou a subarvore. Considere que a separacao backlog/quadro
   hoje e por COLUNA DE WORKFLOW (ehBacklog, colunasDoQuadro em
   components/kanban/shared.ts), nao por um campo na atividade.

7. Todos os filtros que existem hoje nas paginas de Backlog e Kanban, e
   quais deles algum codigo realmente consome.

8. O mapa exato entre as CINCO COLUNAS BOOLEANAS de um membro da equipe e
   os quatro nomes de papel exibidos na interface. O papel nao e um campo
   com quatro valores: sao cinco colunas por membro (can_create, can_edit,
   can_delete, can_move, can_edit_own), e a leitura acontece em
   papelDePermissoes (projectRoles.ts), que e LOSSY - 2^5 combinacoes para
   4 presets. Quero a tabela e os casos que nao casam com preset nenhum.

Ao final, liste os arquivos que a fase seguinte vai precisar tocar.
```

## Pronto quando

`docs/atividade-v2/inventario.md` existe com as oito respostas e a lista de arquivos.

## Atencao

O item 8 corrige uma suposicao errada do plano: ele assumia um enum de quatro valores. Sao
**cinco** colunas booleanas, e `papelDePermissoes` avisa no proprio codigo que a conversao e
lossy e nunca deve ser gravada de volta sem escolha explicita do usuario.

O item 6 e a causa provavel do Kanban puxar a hierarquia inteira. Se a consulta seleciona
nos de EAP em vez de itens do tipo Atividade, esta confirmada a hipotese e a fase 04 resolve -
**sem** precisar do campo `estagio`.
