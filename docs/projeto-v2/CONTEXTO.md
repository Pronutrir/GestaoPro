## Projeto v2 — os quatro lugares

Segunda onda, depois do Atividade v2. Reorganiza os módulos de projeto e liga o que hoje são ilhas.

### A tese

Existem 25 lugares para guardar informação de projeto e nenhuma ligação entre eles. Não se
constrói módulo novo: **liga-se o que existe e desliga-se o que ninguém usa.**

Quatro lugares, no lugar de doze abas:

| Lugar | O que reúne | Para quê |
|---|---|---|
| **Plano** | TAP · Cronograma · EAP | decidir e congelar a linha de base |
| **Execução** | Backlog · Kanban | o único lugar onde se trabalha |
| **Controle** | Financeiro · Riscos · Mudanças | quanto saiu da linha de base, e por quê |
| **Memória** | Documentos · Reuniões · Lições | o que ficou registrado |

### A regra que organiza tudo

**A linha de base existe uma vez só.** Aprovar o TAP cria a linha de base de prazo **e** de
custo. Prazo, custo e escopo passam a ser medidos contra ela. Mudança aprovada não edita a
base — cria a v2, e a v1 fica no histórico.

Hoje o Financeiro tem linha de base e o Cronograma não. Enquanto for assim, atraso é opinião:
qualquer reprogramação apaga o atraso junto com o prazo antigo.

### Tudo que os outros produzem chega como atividade

Risco com resposta, mudança aprovada e encaminhamento de reunião **geram atividade no
backlog**, com o campo `origem` apontando para onde nasceram. É o que faz o Kanban ser o único
lugar de trabalho.

### Um vocabulário só

Dependência se chama **Predecessora, Sucessora, Bloqueio, Em espera, Vinculada** — o do modal
da atividade, que explica o efeito. FS/SS/FF/SF são detalhe interno do cronograma, não
vocabulário de usuário. "Tarefas vinculadas" e "vínculo" morrem como termos de interface.

### Zero vazio não é zero

O sistema precisa distinguir **está tudo certo** de **ninguém preencheu**. "0 atrasadas" só
pode aparecer quando existem datas; sem datas, mostra "5 sem data". Vale no painel do projeto
e na Visão Geral.

### Toda lista que atravessa projetos respeita o escopo

Pendências, Cronograma global, Visão Geral e qualquer relatório consomem a **mesma** camada de
acesso e o **mesmo** escopo de leitura da atividade. Não existe consulta "de fora" que ignore
a regra — senão vira porta lateral.

> **ESTADO EM 26/08/2026: a regra acima NÃO vale hoje, e a causa é a policy, não a consulta.**
> `can_view_project_work_v2` concede o projeto inteiro a quem tem qualquer atividade nele —
> então quem entra por atribuição enxerga as irmãs. Ver `docs/projeto-v2/DIVERGENCIAS.md`
> item 1 e a fase P00. A correção é migration, e sai junto com as outras pendentes.

### Saem do menu

Agente de IA, CSC, Gestão da Qualidade e Calendário (decisão tomada). E, no projeto,
Dependências (vira filtro do Cronograma) e Registros (vira o feed dentro de cada objeto).
**Nenhum recurso é perdido** — o que eles faziam passa a viver onde é útil.
