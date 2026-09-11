# Validação da base de produção — regra dos quatro perfis

Escrito do zero em 11/09/2026, depois de reler a auditoria de 10/09 procurando o
que os planos anteriores não testaram. Valida **a base de produção** contra o
requisito sobre "Editar apenas as minhas" e a coerência dos quatro perfis.

Não cobre as oito tarefas da auditoria fora desse requisito.

---

## Por que existe um terceiro plano

Os dois anteriores validaram o comportamento e passaram. Relendo a auditoria, nove
coisas continuam sem teste — e as três primeiras são estruturais.

1. **Medi afordância, não gravação.** O símbolo ● da matriz dele significa "gravou
   no banco". Na maior parte das minhas células eu medi se o botão estava ativo.
   Botão ativo que grava e botão ativo que falha em silêncio são a mesma coisa na
   tela e coisas opostas no resultado.
2. **A profundidade parou em dois níveis.** O requisito diz "pai ou filha". Nunca
   testei se o responsável de `1.1` alcança `1.1.1.1` — três degraus abaixo. A
   subárvore é recursiva no banco; na tela, ninguém verificou.
3. **Faltam formas que o fixture não tem.** Árvore de três degraus, atividade com
   dois responsáveis, responsáveis em conflito, uma Entrega parada no backlog. São
   estados que nenhum teste anterior precisou e que ninguém criou.

4. **Dois responsáveis na mesma atividade.** O sistema permite; o teto de um só saiu
   em 01/09. Nunca exercitado.
5. **Responsáveis em conflito** — X responsável do pai, Y responsável da filha. O
   que cada um pode na filha? A regra da subárvore diz que os dois alcançam.
6. **O participante.** `e2e-part` existe e o CLAUDE.md diz "participante → execução
   apenas". Nunca testado contra a matriz.
7. **O teto do sistema.** O passo 2 da ordem de acesso diz que o perfil Visualizador
   anula qualquer papel de projeto. Nunca verificado.
8. **F5.** O método da auditoria foi "ação na tela + conferência após F5". Eu confirmei
   pelo banco. São garantias diferentes: o banco prova que gravou, o F5 prova que a
   tela não mente depois de recarregar.
9. **O menu do card no Kanban.** Testei o arrasto; as ações do ⋯ do card, não.

---

## Fixture — acrescentar ao projeto que já existe

**Não criar projeto novo.** O `cbca8b9c` é o projeto de teste em produção, com as
contas e as policies reais — é exatamente a base a validar. Um projeto limpo
testaria um estado idealizado, não o que está no ar.

O que falta não é limpeza: são FORMAS. Acrescentar ao que já existe, cada linha
respondendo a uma pergunta que hoje não tem resposta:

```
já existe:
  Fase de Teste › Subatividade A (resp = RESP) › Subatividade A.1
  A-CRIADA   sem resp, criada por RESP      autoria pura
  Subatividade B  sem resp, criada por outro  alheia pura

acrescentar:
  A.1.1      sob Subatividade A.1, sem resp      herança, 2 degraus
  A.1.1.1    sob A.1.1, sem resp                 herança, 3 degraus  ← lacuna 2
  B-DOIS     resp = RESP + DEL                   dois responsáveis   ← lacuna 4
  C-PAI      resp = DEL
   └ C-FILHA resp = RESP                         conflito            ← lacuna 5
  D-PART     participante = PART, sem resp                           ← lacuna 6
  H-ENTREGA  item_type entrega, no backlog                           ← ponto 5
```

`A-CRIADA` e `Subatividade B` já são o par controlado — irmãs, as duas sem
responsável, diferindo só em quem criou.

Tudo criado com marcador no título, para a limpeza no fim ser inequívoca.

## Como cada teste se registra

Cada célula recebe **um** símbolo, com a evidência ao lado:

- **●** a ação gravou — confirmado relendo a linha **e** após F5
- **○** bloqueada, com a tela dizendo por quê
- **▲** oferecida, mas o clique não faz nada e nada explica
- **✕** falha de permissão: fez o que não devia

Sem evidência, não há símbolo. "Botão ativo" não é ●.

---

## Bloco 1 — profundidade da herança

Como **RESP**, em `A1`, `A2` e `A3` — um, dois e três degraus abaixo da atividade
de que ele é responsável. Em cada uma: editar título · criar subitem · mover · arquivar.

Esperado: as quatro ações em todos os degraus. Se falhar em algum, a regra da
subárvore tem limite de profundidade e ninguém sabia.

---

## Bloco 2 — as quatro formas de "minha"

Como **RESP**, em `A` (própria), `A1` (herdada), `E` (criada por ele) e `G` (alheia).
Mesmas quatro ações. Confirmar a assimetria já medida: autoria dá editar e não dá
arquivar — e o campo bloqueado diz o motivo, não some.

---

## Bloco 3 — responsáveis múltiplos e em conflito

**3a** Em `B`, com dois responsáveis: cada um consegue as quatro ações? Um consegue
remover o outro?
**3b** Em `C1`, onde DEL é responsável do pai e RESP da filha: o que cada um pode na
filha, e o que RESP pode no pai `C`?

Esperado pela regra da subárvore: os dois alcançam a filha; só DEL alcança o pai.

---

## Bloco 4 — o participante

Como **PART**, em `D`, onde ele é participante e não responsável. O CLAUDE.md diz
"execução apenas". Medir o que isso significa na prática: o que aparece, o que grava.

---

## Bloco 5 — a matriz, por gravação

Doze ações × quatro perfis, contra uma atividade **sem vínculo** com nenhum deles.
Cada célula exercida de verdade e conferida.

Editar título · editar prazo · editar GUT · editar descrição · atribuir responsável ·
incluir segundo responsável · criar atividade · criar subatividade · concluir ·
arquivar pelo menu ⋯ · arquivar pelo rodapé do modal · mover na EAP.

As duas linhas de arquivar têm de bater em todos os perfis.

---

## Bloco 6 — Kanban

**6a** Arrastar, dentro e fora do escopo, nos quatro perfis.
**6b** O menu ⋯ **do card** — nunca testado. As mesmas ações do menu do Backlog
aparecem ali? Concordam?
**6c** A Entrega `H`: com ela e uma Atividade **ambas no backlog**, o botão "Mover
para o quadro" só pode aparecer na Atividade.

---

## Bloco 7 — o teto do sistema

Se houver conta com perfil Visualizador **de sistema**, confirmar que ela não escreve
nada mesmo tendo papel amplo no projeto. É o passo 2 da ordem de acesso, e nenhum
teste até hoje o exercitou. Se não houver conta assim, registrar como não coberto —
não inventar resultado.

---

## Bloco 8 — o banco, contornando a tela

`PATCH` e `POST` diretos na API com o token de cada perfil, contra os mesmos alvos.
Arquivar · editar · restaurar · criar.

É a única prova de que a regra vive no banco. Um botão escondido não protege de quem
abre o console.

---

## Bloco 9 — F5

Depois de cada gravação bem-sucedida, recarregar e reler na tela. O banco prova que
gravou; o F5 prova que a tela concorda. Foi assim que a auditoria trabalhou, e é o
que pega divergência entre estado salvo e estado exibido.

---

## Regras de execução

1. Nenhuma célula recebe símbolo sem evidência.
2. Todo negativo precisa de um positivo ao lado, na mesma sessão.
3. Igualar a situação antes de comparar — um controle some por mais de um motivo.
4. Ler o toast enquanto existe.
5. Botão só de ícone não se acha por texto: procurar por `title`.
6. Marcador de deploy tem que ser ASCII — acento vira escape na minificação.
7. Restaurar o fixture ao fim de cada bloco.

---

## Relatório

Uma linha por célula com símbolo e evidência. Depois: **confirmado**, **ainda falha**
e **engano de medição**. A terceira lista não é opcional — sem ela, cinco defeitos
inexistentes teriam sido reportados nesta validação.

Fechar dizendo o que do fixture foi destruído e o que ficou.
