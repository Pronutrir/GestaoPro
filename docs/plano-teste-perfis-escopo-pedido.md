# Plano de teste — coerência dos quatro perfis

Escopo: **só** o que foi pedido na solicitação sobre "Editar apenas as minhas" e a
coerência entre os quatro perfis. Os outros oito pontos da auditoria de 10/09
(confiabilidade do 204, convite pendente, EAP órfã, padronização de avisos, tarefa
sem dono, auto-remoção, "+" da coluna, textos diversos) **não entram aqui**.

Ambiente: `https://gestaopro.pronutrir.com.br` — testar em **produção**, que é onde
a regra vale. Se o build no ar não tiver as correções, o plano inteiro mede código
velho: conferir isso no passo 0 antes de qualquer coisa.

Projeto: `cbca8b9c-279b-4aba-adc8-e6fb5cfedef0`
Senha de todas as contas: `E2eTeste!2026#Acesso`

| Conta | Perfil | Vínculo no fixture |
|---|---|---|
| `e2e-del@e2e.local` | Editar e excluir | responsável de P2 |
| `e2e-tudo@e2e.local` | Editar tudo | responsável de "Atividade Solta" |
| `e2e-resp@e2e.local` | Editar apenas as minhas | responsável de **P1**, **P2.1** e "Subatividade A" |
| `e2e-ver@e2e.local` | Visualizar e comentar | nenhum |

Estrutura: `P1` › `P1.1` (filha, sem responsável próprio) · `P2` › `P2.1` ·
`Fase de Teste` › `Subatividade A` › `Subatividade A.1`, `Subatividade B`,
`Atividade Solta`.

O par que importa: **P1.1** é o caso de herança (ele manda porque é responsável do
pai) e **Subatividade B** é o caso de fora do escopo.

---

## Regras de execução

1. **Nunca aceitar a tela como prova.** Toda ação que deveria gravar tem de ser
   confirmada relendo a linha no banco. Um `PATCH` que não casa linha nenhuma volta
   **204**, igual a um que gravou.
2. **Todo negativo precisa de um positivo ao lado**, na mesma sessão e no mesmo
   minuto. Sem isso não dá para separar "a regra bloqueou" de "meu teste falhou".
3. **Igualar a situação antes de comparar.** Exemplo real: o botão "Mover para o
   quadro" some tanto para agrupador quanto para quem já está no quadro — só dá
   para testar o gate com os dois itens no mesmo estado de partida.
4. **Toast some.** Ler a mensagem enquanto ela existe, não depois da ação assentar.
5. Restaurar o fixture ao fim de cada bloco.

---

## Passo 0 — o ambiente é o certo?

Antes de tudo: confirmar que produção serve o código corrigido. Abrir o Backlog
(não só o projeto — o chunk do Backlog só baixa quando a aba abre) e procurar no
bundle a string `Você não tem permissão para adicionar subitens`.

Se estiver ausente, **parar**: o build no ar é antigo e o resto do plano não vale.

---

## Bloco A — herança do escopo (Editar apenas as minhas)

Tudo como `e2e-resp`.

**A1 · Responsável do pai edita a filha**
Abrir P1.1, mudar o título, salvar.
Esperado: grava. Confirmar o título novo no banco.

**A2 · Responsável do pai cria dentro da filha**
Em P1.1, "adicionar subatividade".
Esperado: cria, com `created_by` = e2e-resp.

**A3 · Responsável do pai move a filha**
No menu ⋯ de P1.1, "Mover para dentro de…".
Esperado: item **ativo** e a movimentação grava.

**A4 · Responsável do pai arquiva a filha**
No menu ⋯ de P1.1, "Arquivar".
Esperado: ativo, grava `is_trashed = true` **e** `trashed_at`.

**A5 · Responsável só da subatividade**
Repetir A1 a A4 em **P2.1** — onde ele é responsável direto da filha e não tem
vínculo nenhum com o pai P2.
Esperado: tudo funciona. É o que separa esta cláusula da anterior.

**A6 · Fora do escopo (negativo)**
Em **Subatividade B** e em **P2**: abrir o menu ⋯.
Esperado: os seis itens **cinza**. Clicar num deles não gera requisição e não muda
nada no banco.

---

## Bloco B — Kanban

**B1 · Arrastar card do escopo**
Como `e2e-resp`, arrastar P1 e P1.1 entre colunas.
Esperado: alça presente, sem cadeado, sem aviso de permissão, coluna muda no banco.
Soltar no **vazio da coluna**, não sobre outro card.

**B2 · Card fora do escopo**
No mesmo quadro, olhar Subatividade B e P2.
Esperado: **sem alça**.

**B3 · Entrega não é promovível** *(fronteira — só por causa de "ou entrega")*
Colocar uma **Fase/Entrega** e uma **Atividade** as duas no Backlog. Abrir as duas.
Esperado: "Mover para o quadro" aparece só na Atividade.
Nota: agrupador nunca vira card por desenho. Se a intenção for que vire, isso é
mudança de modelo e sai deste plano.

---

## Bloco C — os outros três perfis

**C1 · Editar e excluir** (`e2e-del`)
Abrir Subatividade B, com a qual ele não tem vínculo. Editar, arquivar, restaurar.
Esperado: tudo grava.

**C2 · Editar tudo** (`e2e-tudo`)
Na mesma Subatividade B: editar e mover → devem gravar. Arquivar → **não pode**.
Conferir nos **dois caminhos**: menu ⋯ e rodapé do modal.
Esperado: edição grava; "Arquivar" cinza no menu e **ausente** no rodapé.

**C3 · Visualizar e comentar** (`e2e-ver`)
Abrir qualquer atividade.
Esperado: nenhum botão de criar, editar, mover ou excluir. Comentar funciona e fica
gravado com o nome dele.

---

## Bloco D — a mesma ação por dois caminhos

**D1 · Arquivar: menu ⋯ × rodapé do modal**
Para os quatro perfis, na mesma atividade, comparar os dois caminhos.
Esperado: **concordam sempre**. Era aqui que discordavam.

**D2 · Duplicar** (é criação, não edição)
Mesma comparação. `e2e-tudo` não tem `can_create` no fixture.
Esperado: ausente para quem não pode criar; nunca oferecido e depois recusado.

---

## Bloco E — o banco, não a tela

Com o token real de cada conta, `PATCH` direto na API, contornando a interface.
É o que prova que a regra vive no banco.

**E1 · Arquivar** — `{"is_trashed": true}` em atividade fora do vínculo.
Esperado: `e2e-del` grava · `e2e-tudo` **403** · `e2e-resp` recusa fora do escopo e
grava na própria subárvore · `e2e-ver` recusa.

**E2 · Edição comum** — `{"description": "..."}`.
Esperado: não pode ter quebrado. `e2e-tudo` grava em qualquer uma.

**E3 · Restaurar** — `{"is_trashed": false}`.
Nota: hoje restaurar exige permissão de **editar**, não de excluir. Se a decisão for
outra, é mudança de regra e não um defeito.

---

## Bloco F — lote

**F1 · Seleção mista**
Como `e2e-resp`, pôr P1.1 (dentro) e Subatividade B (fora) **na mesma coluna de
partida**, selecionar as duas e aplicar "Mudar status".
Esperado: só P1.1 muda, e a mensagem diz quantas ficaram de fora e por quê.
Ler o toast enquanto ele está na tela.

---

## Bloco G — texto

**G1 · O texto do perfil bate com o comportamento?**
Ler a descrição de "Editar apenas as minhas" na seção Equipe do Projeto.
Conferir duas coisas: menciona que o escopo inclui **o que a pessoa criou**, e deixa
claro que "excluir" aqui é **arquivar** (reversível), não apagar de vez.

**G2 · Mensagem de recusa do Concluir** *(fronteira)*
Provocar a recusa no perfil de leitura.
Esperado: a mensagem culpa o **perfil**, não o vínculo com a atividade.

---

## Formato do relatório

Uma linha por teste:

```
A1  passou   título gravado no banco
A6  passou   6 itens cinza; clique sem requisição; banco intacto
C2  falhou   "Arquivar" ativo no rodapé para e2e-tudo
```

E, no fim, três listas curtas:

- **Corrigido e confirmado** — com a evidência (código HTTP, linha do banco).
- **Ainda falha** — com o que foi feito, o que se esperava e o que aconteceu.
- **Engano de medição** — teste que deu falso alarme e foi corrigido no caminho.
  Registrar isso importa tanto quanto o resto: sem esse hábito já reportei três
  defeitos que não existiam.

Fechar com o estado do fixture: o que foi restaurado e o que ficou de pé de
propósito.
