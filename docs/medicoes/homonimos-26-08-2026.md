# Dois perfis, um nome — levantamento de 26/08/2026

> **Nada foi fundido e ninguém foi desativado.** Este documento existe para uma decisão de
> pessoa: **qual dos dois perfis é o certo.** O código já parou de conceder permissão pelo
> nome (migration `20260826180000`), então o furo está fechado — mas a duplicidade continua,
> e ela é um problema de cadastro, não de código.

---

## O furo que a duplicidade abria

Medido chamando as próprias funções de permissão, com a service key:

```
is_activity_actor_v2(<atividade do Williame>, b0b64edb…) = true
is_activity_actor_v2(<atividade do Williame>, 149e6c4a…) = true
```

…enquanto `activity_assignees` diz que o responsável é **um só** (`149e6c4a`).

E no nível de projeto a concessão é maior:

```
is_project_leader_v2(<Guia Jornada do Paciente>, b0b64edb…) = true
is_project_leader_v2(<Guia Jornada do Paciente>, 149e6c4a…) = true
```

`projects.owner` guarda o **nome**. Os dois viravam dono — e dono manda em tudo dentro do
projeto.

**Alcance:** 450 atividades com o nome em `assigned_to`, 6 com ele em `participants`, e
**2 projetos** com ele em `owner`.

---

## Os dois perfis, lado a lado

| | **A** — hotmail | **B** — corporativo |
|---|---|---|
| `id` | `b0b64edb-09e2-48b6-85aa-5c533dc886ff` | `149e6c4a-c496-4765-af2c-52eff5cb8919` |
| e-mail | `williame_lima@hotmail.com` | `williame.correia@pronutrir.com.br` |
| entrou por | `email` (senha) | `azure` (SSO corporativo) |
| criado em | **04/05/2026, 19:43** | 05/05/2026, 02:37 — **7 h depois** |
| `last_login_at` | **nunca registrado** | 05/05/2026 |
| cargo | Analista de sistemas | Desenvolvedor |
| setor | TI | TI (mesmo `sector_id`) |
| avatar | não tem | tem |
| ativo | sim | sim |

### O que cada um acumulou — contado por **identificador**, não por nome

| | **A** — hotmail | **B** — corporativo |
|---|---|---|
| responsável (`activity_assignees`) | **0** | **460** |
| participante | 6 | 4 |
| atividades que criou | 41 | **364** |
| membro de projetos | **1** | **18** |
| escritas no `audit_log` | **3.280** | 3.068 |
| comentários | 0 | 2 |
| primeira escrita | 05/05/2026 | 05/05/2026 |
| **última escrita** | **14/08/2026** | **24/08/2026** |

---

## O que os números dizem

**Os dois estão vivos.** Esta é a parte que impede a decisão óbvia: o perfil A não é um
cadastro morto que sobrou. Ele tem **3.280 escritas** — mais que o B — e escreveu pela última
vez em **14/08/2026**, doze dias antes desta medição.

**Os dois trabalham no MESMO projeto.** É o sinal mais forte de que se trata de **uma pessoa
com dois logins**, não de duas pessoas homônimas:

| projeto | escritas de **A** | escritas de **B** |
|---|---|---|
| Guia Jornada do Paciente — Onboard — Desenvolvimento | 249 | 172 |
| Guia Jornada do Paciente — Onboard | 183 | 1 |
| Gestão e Execução de Atividades de TI | 8 | — |

**B é quem carrega o trabalho formal.** 460 atribuições como responsável contra **zero** de A;
18 projetos contra 1; 364 atividades criadas contra 41. Toda a estrutura de responsabilidade
aponta para o corporativo.

**A é quem editou mais.** 3.280 escritas contra 3.068. Ou seja: **a pessoa trabalhava logada
como A e recebia tarefa como B** — o que só funcionava porque a comparação por nome deixava os
dois passarem. É exatamente o furo, sendo usado como se fosse recurso.

> **Consequência prática de fechar o furo, e ela é imediata:** logado como **A**, a pessoa
> deixa de enxergar como sua as 450 atividades atribuídas a "Williame Correia de Lima". Ela
> não perde o projeto (A é membro do "Guia Jornada do Paciente" por `user_id`, e continua
> editando lá), mas perde o vínculo com as atividades atribuídas ao nome.
>
> **Se a pessoa usa o login do hotmail no dia a dia, ela vai notar na primeira abertura.**
> Vale avisar antes de publicar.

---

## A recomendação, e o que ela não decide

Pelos números, **B (corporativo) é o perfil a manter**: SSO da empresa, avatar, 460
atribuições, 18 projetos, `last_login_at` registrado, e a última escrita mais recente.

Mas **isto não é decisão de código**, e há um detalhe que só uma pessoa resolve: A foi criado
**7 horas antes** de B, com senha, e é por ele que a pessoa parece trabalhar. Trocar o login
de alguém sem avisar é pior que a duplicidade.

### As perguntas

1. **O Williame usa qual login para entrar?** Se for o hotmail, fechar o furo muda o dia dele.
2. **Os 3.280 registros do perfil A devem migrar para o B?** É `UPDATE audit_log SET changed_by`
   — reescreve histórico, e por isso não foi feito aqui.
3. **Desativar A, ou deixar os dois?** Com a permissão por identificador, os dois convivendo
   não é mais furo — só confusão de cadastro.

### O que NÃO fazer sem responder as três

- **Não desative A** antes de confirmar por qual login a pessoa entra: ela pode ficar sem
  acesso na segunda-feira.
- **Não apague A.** As 41 atividades criadas por ele têm `created_by = A`, e apagar o perfil
  levaria a autoria junto (`ON DELETE SET NULL`).
- **Não renomeie um dos dois** para desambiguar. Resolve a comparação por nome e quebra o
  reconhecimento humano — e a comparação por nome já não decide permissão.

---

## O que o código já fez

`20260826180000` — **ambiguidade não concede.** Quando um nome pertence a mais de um perfil, a
via do nome não vale para ninguém; decidem as vias por identificador (`created_by`,
`activity_assignees`, `project_members`).

Vale para `is_activity_actor_v2` (atividade) e `is_project_leader_v2` (dono/gestor do projeto),
e o mesmo teste existe na tela (`lib/identityMatch`, `definirNomesAmbiguos`).

**Ninguém fica sem acesso por causa disso** — conferido antes de escrever: nos 2 projetos
afetados **os dois Williames já são membros** com `can_edit` e `can_move`, por `user_id`. A
perda de "dono pelo nome" não tira trabalho de ninguém. A rede de segurança da migration não
insere nada nesta base; fica para bases onde isso não valha.

**Método:** `scripts/medicoes/levantar-homonimos.cjs`, só `SELECT`.
