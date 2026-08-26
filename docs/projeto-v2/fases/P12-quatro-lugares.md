# P12 · Quatro lugares, e duas abas saem do menu

**Onda 3** · a arrumação, depois que as ligações existem

Faça isto **por último**. Reagrupar antes de ligar só muda onde as ilhas ficam.

## Prompt

```
Reorganize as visualizações do projeto em quatro lugares, cada um com suas
abas internas:

  Plano      TAP · Cronograma · EAP
  Execução   Backlog · Kanban
  Controle   Financeiro · Riscos · Mudanças
  Memória    Documentos · Reuniões · Lições

DEPENDÊNCIAS sai do menu: vira filtro do Cronograma ("mostrar só itens com
vínculo"). O vínculo já é propriedade da atividade. E o texto de ajuda que
explica o reagendamento em cascata sai da aba e vira comportamento visível
no Gantt — quando uma predecessora se move, mostre as sucessoras se movendo.

REGISTROS sai do menu: vira o feed dentro de cada objeto — atividade, risco,
mudança, TAP. A visão do projeto inteiro fica na Memória, com filtro por
tipo e por autor.

Vocabulário: dependência se chama Predecessora, Sucessora, Bloqueio, Em
espera e Vinculada em toda a interface. FS/SS/FF/SF é detalhe interno do
cronograma. "Tarefas vinculadas" e "vínculo" saem dos textos de tela.

A barra de lugares nunca precisa de rolagem horizontal — são quatro.

ATENÇÃO A `user_tab_permissions.allowed_tabs`: ela guarda as abas por
usuário, "kanban" é sempre forçada, e há alias legado (docpages → documents).
Ao trocar doze abas por quatro lugares, os valores gravados deixam de casar —
migre-os, ou o menu de quem tinha restrição some inteiro.

E note: essa permissão é SÓ DO FRONT. Os dados das abas ocultas continuam
legíveis pela API. Isso não muda aqui, mas não piore — e se for tratar,
trate como a P00 trata a visibilidade: na policy, não na tela.
```

## Pronto quando

Quatro lugares no topo, sem rolagem. Dependências e Registros somem do menu e nada se perde.
E uma busca por "vínculo" ou "FS" na interface não retorna nada.

## Não faça

- Não rode antes da P09. Sem as ligações, isso é só mudança de lugar.
- Não deixe `allowed_tabs` para trás. Quem tinha restrição fica sem menu.
