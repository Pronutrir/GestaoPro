# 00 - Visualizar nao edita  (entrega separada, roda antes)

> **ESTADO EM 25/08/2026: 3 dos 4 passos FEITOS.**
>
> | | O que | Estado |
> |---|---|---|
> | V1 | Medir quem perde acesso | **pendente** - a API do banco nao respondeu |
> | V2 | Os rotulos do dialogo | **feito** - commit `81494c1` |
> | V3 | O front respeita `can_edit_own` | **feito** - commit `acb5307` |
> | V4 | A RLS respeita `can_edit_own` | **escrito, nao aplicado** - migration 20260825150000 |
>
> Para aplicar o V4 na VM: `./scripts/apply-visualizar-nao-edita.sh`
> (o script lista nome a nome quem perde acesso e pede confirmacao).
>
> Ha outra migration pendente antes dela: `20260825140000`, por
> `./scripts/apply-gestor-do-projeto-na-via-da-equipe.sh`.

Esta entrega **nao faz parte** do Atividade v2 - ela ja foi conferida noutro documento
("Antes de executar") e cabe em quatro passos. Esta aqui porque **roda primeiro** e porque
toca dois arquivos que as fases seguintes tambem tocam.

## Por que antes

- Ja esta conferida, e dois dos quatro passos nao dependem do banco.
- Conserta uma promessa quebrada: hoje o gestor escolhe "Visualizar e comentar" e o sistema
  nao obedece - a pessoa continua editando onde e responsavel.
- Estabelece em pequeno o padrao que a fase 03 vai generalizar: regra numa fonte so,
  front mais restritivo que o banco, nunca o contrario.

Nada ali e trabalho jogado fora: o rotulo **"Participantes da atividade"** ja esta na tela, e
`can_edit_own` ja e uma entrada de `podeMutarAtividade`.

## O ponto de colisao

A fase **02 (dados e RLS)** reescreve a via do ator dentro das policies `Activities access v2` -
a mesma funcao que o V4 altera (`can_update_activity_v2`).

**A fase 02 tem que preservar o `can_edit_own` nessa reescrita.** Se apagar a leitura da coluna
sem perceber, "Visualizar" volta a nao significar nada e ninguem nota ate alguem reclamar.

Duas protecoes ja existem:
- A migration 20260825150000 tem um bloco `DO $$` que **falha alto** se
  `is_activity_actor_v2` passar a citar `can_edit_own` (gatear ali tiraria comentario e leitura).
- `scripts/verificar-acesso-atividade.cjs` tem 27 casos, 4 deles cobrindo exatamente isto.
  Conferido que a suite falha quando a regra e removida.

O teste da fase 03 amplia isso para os 108 casos da matriz.

---

## V1 — MEDIDO EM 25/08/2026, com dados reais

Sondado por `https://gestaopro.pronutrir.com.br` (o IP interno do `.env` não responde de fora
da VM — ver a memória *banco-só-pelo-host-público*).

| Medida | Valor |
|---|---|
| Membros de projeto no total | **95** |
| Com as 4 colunas de escrita em `false` (só leitura) | **7** |
| Com `can_edit_own = false` | **0** |

**Ninguém perde acesso quando a migration `20260825150000` for aplicada.** Os 7 membros
só-leitura estão todos com `can_edit_own = true`, ou seja, nenhum é "Visualizar e comentar"
de verdade — todos são "Editar apenas as minhas".

A regra passa a valer **daqui pra frente**: quando alguém escolher "Visualizar e comentar" no
seletor, a escolha finalmente terá efeito.

### Estado das migrations no banco

| Migration | Registrada | Conferida |
|---|---|---|
| `20260825140000` — Gestor do Projeto na via da equipe | **sim** | `can_member_action` responde `true` para ação válida e `false` para inválida |
| `20260825150000` — Visualizar não edita | **não** | pendente de aplicar |

**Ressalva sobre a 140000:** não consegui isolar o caminho do gestor com dados reais. Os 7
projetos com `manager` definido têm todos o gestor **também** como admin ou membro com
`can_edit`, então qualquer sonda passa por outra via antes de chegar à do gestor. O corpo da
função foi conferido na escrita, e a migration tem um bloco `DO $$` que falha alto se não
citar `is_project_leader_v2` — mas a prova empírica de ponta a ponta não existe.
