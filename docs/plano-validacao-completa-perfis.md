# Validação completa — coerência dos quatro perfis

Cobre **tudo** o que a auditoria de 10/09/2026 levanta dentro do pedido sobre
"Editar apenas as minhas" e a coerência entre os quatro perfis. As oito tarefas
fora desse pedido (204 como sucesso, convite pendente, EAP órfã, padronização de
avisos, tarefa sem dono, auto-remoção, "+" da coluna, textos diversos) **não estão
aqui** — estão listadas no fim só para não se confundirem com este escopo.

Ambiente: produção. Projeto `cbca8b9c-279b-4aba-adc8-e6fb5cfedef0`.
Senha de todas as contas: `E2eTeste!2026#Acesso`.

Contas: `e2e-del` (Editar e excluir) · `e2e-tudo` (Editar tudo) ·
`e2e-resp` (Editar apenas as minhas) · `e2e-ver` (Visualizar e comentar).

---

## Por que este plano é maior que o anterior

O anterior tinha 16 testes e validou o esqueleto da regra. Relendo a auditoria com
cuidado, nove coisas ficaram de fora — e cinco delas são casos que só aparecem se
o teste for montado de propósito.

1. **As formas de "fora do escopo" não são uma só.** A auditoria testou em `1.2.6`
   (sem responsável, **criada pelo dono**) e em `1.1.1` (**do Admin**). São células
   diferentes: o escopo real inclui `created_by`, então "sem responsável criada por
   mim" é editável e "sem responsável criada por outro" não é. Testar só o segundo
   caso esconde metade da regra.
2. **A matriz tem 14 linhas × 4 perfis.** Dez linhas são do pedido: 40 células. O
   plano anterior exercitou cerca de um terço.
3. **"Mover para dentro de…" para o "Editar tudo"** — a matriz marca ✕. Nunca
   executei essa célula; medi só se o item aparecia no menu.
4. **"Concluir / reabrir" para "Apenas as minhas"** — a matriz marca ○ (bloqueado
   corretamente), e as minhas medições mostram o item **ativo** dentro do escopo.
   Um dos dois está errado e isso precisa ser decidido, não medido de novo.
5. **Os oito controles do Backlog** que a auditoria lista para o perfil de leitura:
   menu ⋯, "+ Tarefa" nas fases, "+ Sem responsável", a barra de lote inteira e o
   "Restaurar" da Lixeira. Conferi o menu e as caixinhas; os outros, não.
6. **O cadeado na alça do Kanban** no perfil de leitura. Medi *ausência* de alça —
   a auditoria descreve a alça *virando cadeado*. Não é a mesma coisa.
7. **O banner da tela da atividade** no perfil de leitura: "Você acompanha esta
   atividade. Pode comentar; não pode alterar." Nunca verifiquei que existe.
8. **As 16 ações do "Editar e excluir"** que a auditoria exerceu. Testei quatro.
9. **Atribuir responsável e incluir segundo responsável** — são formas de editar, e
   entram no "edita" do pedido.

---

## Regras de execução

1. Nunca aceitar a tela como prova: reler a linha no banco. `PATCH` sem linha casada
   volta **204**, igual ao que gravou.
2. Todo negativo precisa de um positivo ao lado, na mesma sessão.
3. Igualar a situação antes de comparar — um controle some por mais de um motivo.
4. Ler o toast enquanto ele existe.
5. Botão só de ícone não se acha por texto: procurar por `title`/`aria-label`.
6. Restaurar o fixture ao fim de cada bloco.

---

## Passo 0 — o ambiente é o certo?

Confirmar que produção serve o código a testar. **Marcador tem que ser ASCII**: o
minificador escapa acentos e a busca literal dá falso negativo. Abrir a aba Backlog
antes de varrer — o chunk dela só baixa então. Na dúvida, medir pelo comportamento.

---

## Bloco A — as quatro formas de "minha" e de "não minha"

O ponto cego do plano anterior. Preparar quatro atividades e rodar cada perfil
contra as quatro.

| Alvo | Como preparar | Para `e2e-resp` é… |
|---|---|---|
| **A-própria** | responsável = e2e-resp | dentro (responsabilidade) |
| **A-herdada** | filha de uma atividade cujo responsável é e2e-resp | dentro (herança) |
| **A-criada** | criada por e2e-resp, **sem responsável** | dentro (autoria) |
| **A-alheia** | sem responsável, criada por **outra pessoa** | **fora** |

A quarta é a que a auditoria usou e eu nunca montei. A-criada e A-alheia são
idênticas na tela — mesma ausência de responsável — e opostas na permissão. É a
prova da tarefa 10.

**A1–A4** · Em cada uma das quatro, como `e2e-resp`: editar título, criar subitem,
mover na EAP, arquivar. Esperado: as três primeiras permitem tudo; a quarta, nada.
Confirmar cada gravação no banco.

---

## Bloco B — a matriz, célula por célula

Dez linhas × quatro perfis = 40 células. Para cada uma registrar um dos quatro
símbolos da auditoria: **●** gravou · **○** bloqueado corretamente ·
**▲** oferecido mas o clique não faz nada · **✕** falha de permissão.

Linhas: editar título e prazo (própria) · editar atividade de outra pessoa ·
atribuir responsável · incluir segundo responsável · criar atividade ·
criar subatividade · mudar coluna no Kanban · arquivar pelo menu ⋯ ·
arquivar pelo rodapé do modal · mover para dentro de… (EAP).

**A leitura que importa:** as duas linhas de arquivar têm de bater em todos os
perfis. Era onde discordavam.

---

## Bloco C — Kanban, no detalhe

**C1** Arrastar card do escopo (própria e herdada) — grava e muda de coluna.
**C2** Card fora do escopo — sem alça.
**C3** Perfil de leitura: a auditoria diz que a alça **vira cadeado**. Verificar se
é cadeado visível ou simples ausência — e se a diferença importa para o usuário.
**C4** Executar "Mover para dentro de…" como `e2e-tudo` (`can_move = true`). A
matriz marca ✕; confirmar se ainda procede.

---

## Bloco D — "Visualizar e comentar", nos dois lugares

**D1** Tela da atividade: nenhum controle de escrita, e o banner "Você acompanha
esta atividade. Pode comentar; não pode alterar." presente.
**D2** Backlog, os oito controles que a auditoria lista: menu ⋯, "+ Tarefa" nas
fases, "+ Sem responsável", barra de lote, "Restaurar" da Lixeira.
Esperado: nenhum oferecido, ou todos explicando por que não dá. Nenhum mudo.
**D3** Comentar funciona e grava com o nome dele.

---

## Bloco E — "Editar e excluir" age em qualquer atividade

A auditoria exerceu 16 ações. Repetir contra uma atividade **sem vínculo nenhum**
com `e2e-del`: responsável, prazo, GUT, descrição, criar atividade, criar
subatividade, concluir, reabrir, arquivar, restaurar, lote e mover na EAP.
Esperado: todas gravam.

---

## Bloco F — o banco, contornando a tela

`PATCH` direto na API com o token de cada conta.

**F1** arquivar (`is_trashed: true`) fora do vínculo e na própria subárvore.
**F2** edição comum — não pode ter quebrado.
**F3** restaurar (`is_trashed: false`).
**F4** criar (`POST`) — separa "cria" de "edita".

É o que prova que a regra vive no banco, e não só no botão.

---

## Bloco G — lote

**G1** Seleção mista (um dentro, um fora), ambos na **mesma coluna de partida**.
Esperado: aplica só no permitido **e** a mensagem diz quantos ficaram de fora.
Se a mensagem vier sem a segunda metade, conferir antes se o item de fora chegou a
entrar na seleção — a caixinha dele pode já vir desabilitada, e aí não há nada a
reportar.

---

## Bloco H — o texto bate com o comportamento?

**H1** A descrição de "Editar apenas as minhas" menciona a autoria e distingue
arquivar de excluir em definitivo?
**H2** "Concluir / reabrir" para esse perfil: a matriz da auditoria marca bloqueado,
minhas medições mostram ativo dentro do escopo. **Decidir qual é a regra** antes de
testar de novo — o pedido não menciona concluir, então isso é definição, não defeito.

---

## Formato do relatório

Uma linha por teste: `id · resultado · evidência`. Depois três listas:
**corrigido e confirmado** (com código HTTP ou linha do banco), **ainda falha** (o
que foi feito, o que se esperava, o que aconteceu) e **engano de medição** (teste que
deu falso alarme e foi corrigido). A terceira não é opcional: sem ela, três defeitos
inexistentes teriam sido reportados na validação anterior.

Fechar com o estado do fixture.

---

## Fora deste plano, de propósito

Tarefas 2, 5, 6, 7, 8, 9, 11b e 12 da auditoria. E, da seção item-a-item: Ctrl+Enter
no comentário, Lixeira, EAP, concluir/reabrir como tela, Kanban (filtros/duplicar/
WIP) e Cronograma. Nenhuma delas trata da regra dos perfis.
