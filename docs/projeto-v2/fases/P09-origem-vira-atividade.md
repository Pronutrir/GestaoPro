# P09 · Risco, mudança e reunião geram atividade

**Onda 3** · a ligação que faz o Kanban ser o único lugar de trabalho

Hoje risco, mudança e reunião funcionam como caderno: registram e não produzem nada.
O trabalho continua nascendo e morrendo no WhatsApp.

## Prompt

```
Crie o campo ORIGEM na atividade: aponta para um risco, uma requisição de
mudança, uma reunião — ou nada, quando nasceu no backlog. Aparece na tela
da atividade como um cartão pequeno, clicável, com o tipo e o nome.

Depois, três geradores:

1. RISCO com resposta planejada gera atividade no backlog, com origem =
   risco. E a matriz de risco passa a marcar visualmente o risco que NÃO
   tem nenhuma atividade tratando dele — é a informação que importa e hoje
   não existe.

2. REUNIÃO ganha encaminhamentos na ata: texto, responsável, prazo. Cada
   encaminhamento vira atividade no backlog, com origem = a reunião.
   Acaba a digitação dupla.

3. MUDANÇA aprovada que cria trabalho gera atividade, com origem = a
   requisição.

Em todos: a atividade nasce no BACKLOG, não no quadro. Promover continua
sendo decisão de quem planeja, e continua exigindo responsável.

O RESPONSÁVEL da atividade gerada tem de estar na EQUIPE do projeto — a
trigger `trg_assignee_exige_equipe` (fase 02) recusa o contrário, e ela é
que garante a regra inviolável: atribuir alguém nunca dá acesso que a
pessoa não tinha. Se o responsável do encaminhamento não estiver na equipe,
a atividade nasce SEM responsável e avisa quem precisa adicioná-lo.

Do outro lado: cada risco, reunião e mudança mostra a lista de atividades
que gerou, com o status de cada uma.
```

## Pronto quando

Registrar um risco com resposta cria atividade no backlog, e o risco mostra o status dela.
E a matriz marca o risco sem tratamento.

## Não faça

- Não crie a atividade direto no quadro. Escopo é decisão de quem planeja.
- Não atribua a quem está fora da equipe. O banco recusa, e a tela deve explicar antes.
