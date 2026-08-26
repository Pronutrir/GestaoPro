# Atividade v2 - kit de execucao

> **LEIA PRIMEIRO:** `DIVERGENCIAS.md`. Quatro premissas do kit nao batem com este
> repositorio - a principal e que **`lider_id` nao existe** (o que existe e `assigned_to`
> + `participants`). As fases 02, 03 e 05 foram anotadas com a correcao.

```
docs/atividade-v2/
|- CLAUDE.md            -> copiado para a raiz do repositorio
|- DIVERGENCIAS.md      -> o que o kit assume e o repositorio contradiz
|- tokens.css           -> ainda NAO consumido; ver fase 10
|- matriz-acesso.json   -> fixture do teste da fase 03 (108 casos)
|- matriz-acesso.csv    -> a mesma matriz para ler no Excel
|- gerar-matriz.cjs     -> regera as duas quando a regra mudar (Node)
|- gerar-matriz.py      -> a versao original, de referencia (nao roda aqui)
|- fases/               -> um arquivo por fase, na ordem de execucao
```

## Como usar

Abra o Claude Code na raiz do repositorio e rode **uma fase por sessao**, na ordem dos
arquivos. Cada arquivo tem o prompt pronto para colar, o criterio de pronto e o que nao fazer.

Nao pule a fase 01. Tudo aqui descreve o alvo; o repositorio e a verdade, e a fase 01 existe
para achar a diferenca antes que ela vire bug.

## A ordem, e por que

| # | Fase | Por que aqui | Estado |
|---|---|---|---|
| 00 | Visualizar nao edita | Entrega separada, ja conferida | **3 de 4 passos feitos** |
| 01 | Inventario | Nada se escreve antes de confirmar o que existe | a fazer |
| 02 | Dados e RLS | A regra tem que existir no banco antes de existir tela | **rever premissa** |
| 03 | Camada de acesso | Todas as fases seguintes consultam as capacidades daqui | a fazer |
| 04 | Kanban de trabalho | O problema que mais doi hoje | **rever mecanismo** |
| 05 | Responsaveis na UI | A mudanca que se ve | **rever premissa** |
| 06 | Backlog e Kanban enxutos | Fecha a limpeza que a 04 comecou | a fazer |
| 07 | Tela unica | A maior; pode esperar sem travar as outras | a fazer |
| 08 | Feed com sino | Depende da tela da 07 | a fazer |
| 09 | Regras pai/filha | **O melhor achado do kit** - derivacao no servidor | a fazer |
| 10 | Tokens visuais | Pode correr em paralelo desde o comeco | a fazer |

## O que ainda e decisao sua

1. **A tabela `activity_assignees` vale o custo?** O modelo-alvo (1 responsavel + N
   participantes) **ja esta implementado** em `assigned_to` + `participants`, com 284
   leituras no codigo. Pesquisa em 7 produtos recomenda manter duas colunas.
   Ver `DIVERGENCIAS.md` item 1.
2. **O campo `estagio` deve existir?** A decisao de 20/08 foi que essa regra vive no codigo,
   depois de duas tentativas falhas de leva-la ao banco. Ver `DIVERGENCIAS.md` item 2.
3. **Visualizador comenta?** O fixture esta com `canComment = false`, seguindo o
   `canWrite = false` de hoje. Se a intencao for outra, mude o fixture **antes** da fase 03.
4. **Equipe pode promover do backlog?** A chave por projeto nasce desligada. A recomendacao e
   deixar assim e liberar o *assumir* em vez do *promover*.
