# Relatório da fila — 26/08/2026

**Nada aqui está publicado.** A fila inteira foi executada numa máquina **sem Docker**, que
por definição não consegue gerar imagem nem publicar. "Pronto" e "no ar" são coisas
diferentes, e este relatório mantém a distinção em todas as linhas.

| Etapa | Estado | O que o Raphael vai ver |
|---|---|---|
| 0 — publicação | **feito** | nada na tela: é documento |
| 1 — build | **feito** (publicar: **impossível aqui**) | 8 correções, depois de publicado |
| 2 — fase 09 nas telas | **feito em parte** — 2 trocas barradas pela medição | horas do pai vindas do servidor; progresso do Cronograma corrigido |
| 3 — tela do backlog | **feito** | a tela muda de cara |
| 4 — tela da atividade | **feito em parte** | marco limpo; "Líder" vira "Responsável" |
| 5 — migrar 284 leituras | **TRAVADO** — e a migration que destrava está escrita | nada ainda |
| 6 — feed agregado | **feito no banco**, sem tela | nada até alguém consumir |
| 7 — P00 | **não aplicada, por instrução** | nada |

**10 commits · 315 verificações automáticas, todas passando · 3 migrations novas, nenhuma
aplicada.**

> **Houve uma SEGUNDA RODADA depois desta** — homônimos, progresso e responsáveis. Está no
> fim do documento, a partir de *"Segunda rodada — 26/08/2026"*. Dois pontos que esta primeira
> parte deixou em aberto foram resolvidos lá:
>
> - a **troca do progresso**, que aqui aparece como *BARRADO*, foi feita — invertendo o
>   trabalho: o servidor aprendeu a régua da tela, com **zero barra mudando de valor**;
> - a **etapa 5**, que aqui aparece como *TRAVADO*, destravou: os três triggers de sincronia
>   estão escritos e as duas primeiras telas já leem por identificador.
>
> Totais atualizados: **14 commits · 367 verificações · 5 migrations, nenhuma aplicada.**

---

## ETAPA 0 — publicação · **FEITO**

Escrito: **`docs/DEPLOY.md`** · commit `783e259`

**Não existe automação nenhuma.** `.github/` tem só `copilot-instructions.md` — nenhum
workflow. Sem `.gitlab-ci.yml`, `Jenkinsfile`, `vercel.json`, `netlify.toml`, `fly.toml`,
`Procfile`. **`git push` não publica nada.**

São cinco passos manuais: push → `scripts/build-prod.sh <versão>` → `docker push` →
`docker compose -f docker-compose.prod.yml up -d app` na VM → `apply-*.sh` para as migrations.

### O commit em produção hoje: **não é determinável pelo código**

A página servida é renderizada no servidor e não expõe `buildId`; a resposta HTTP não traz o
label da imagem.

| | |
|---|---|
| Último deploy documentado | 20/08/2026, commit `71e2689`, imagem `2026-08-20-01` |
| Commits desde então | **72** (mais os 10 desta fila) |
| `APP_VERSION` no `.env` local | `v2026-07-21-00` — de julho, sem relação com a VM |

### Depende de uma pessoa

1. **Qual `APP_VERSION` roda agora?** Só `docker compose -f docker-compose.prod.yml ps` na VM
   responde. Sem isso não se sabe quais dos 72 commits já estão no ar.
2. **Em qual máquina o build roda?** O runbook de 20/08 diz "onde houver Docker" e registra
   que **não é a de desenvolvimento** — mas não diz qual é. **Sem essa resposta ninguém
   publica**, e ela bloqueia tudo o mais deste relatório.
3. **Quem tem credencial** do registry `pronutrir/gestaopro` e acesso SSH a `20.65.208.119`?
4. **Docker Hub ou registry privado?** Muda o `docker login`.
5. **Existe homologação?** Nada no repositório sugere que sim. Se não existe, toda mudança
   estreia em produção.

---

## ETAPA 1 — build · **FEITO**

```
✓ Compiled successfully
✓ Checking validity of types
✓ Generating static pages (50/50)
```

Único aviso: `caniuse-lite` com 14 meses — cosmético.

**Publicar não foi possível, e não é falta de tentativa:** `docker` não existe nesta máquina.

### As oito correções que aparecem na tela depois de publicado

Código puro — valem assim que a imagem subir, sem depender de migration.

| # | O que muda | Onde conferir |
|---|---|---|
| 1 | **A lixeira parou de mentir.** Não checava permissão nem lia a resposta; a RLS recusava e a tela dizia *"excluída permanentemente!"* | Com alguém que **não** gerencia o projeto: lixeira → excluir permanentemente. Deve dizer **"Sem permissão"** |
| 2 | **O marco não volta ao Kanban.** Apareciam recuados sob a fase, travados. Foi o defeito que abriu a sessão | Projeto com marcos (NF-e de prefeitura): **nenhum** no quadro |
| 3 | **O histórico parou de mostrar UUID** | Mova de coluna → aba **Histórico**: `Etapa: Não iniciado → Em Andamento` |
| 4 | **Participantes diz o que concede** | Atividade → **Participantes**: *"…também podem editá-la"*. Quem não é da equipe aparece **desabilitado com o motivo** |
| 5 | **GUT mostra o número, colore só de 60** | Kanban: 1–125. <60 cinza, 60–99 âmbar, 100+ vermelho |
| 6 | **Quem criou consegue mover** | Crie sem se pôr como responsável e mova em lote |
| 7 | **O sino no Registro** | Contador que não conta o que você mesmo escreveu |
| 8 | **A rota da atividade** | `/project/<id>/atividade/<id>` — F5 mantém, voltar fecha |

---

## ETAPA 2 — fase 09 nas telas · **FEITO EM PARTE**

### O gatilho, testado em dado real

Não por leitura de código: por dados. **11 pais que têm ao mesmo tempo filha viva e filha na
lixeira** — os únicos casos em que o filtro tem o que fazer. `derived_children` conta só as
vivas em todos (2 e não 7, 8 e não 9). A linha decisiva é a única em que as horas diferem:
**11h vivas, 12h totais, `derived_hours` = 11**.

| caminho | como foi conferido |
|---|---|
| lixeira / restaurar | **11 pais reais**, acima |
| inserir / alterar horas | lista de colunas da trigger |
| **trocar o pai** | recalcula os **dois** pais (`NEW` e `OLD`) — é o que mais escapa |
| cascata neto→pai→avô | **20 de 20 avós** batem |

### A tabela "antes" — e o que ela não diz

**581 pais, 581 iguais, zero divergências.** `docs/medicoes/antes-da-fase09-26-08-2026.md`

Mas *zero divergências* **não** é *os cálculos concordam*. A tela não exclui marco do rollup e
o servidor exclui. Não diverge porque **não existe marco com horas na base** (0 registros) — e
a trigger `tg_marco_sem_esforco` passa a recusar. A diferença existe no código; nenhum dado a
exercita.

### Trocado: as horas · commit `0c020e3`

O planejado do pai vem de `derived_hours`. **Sem fallback silencioso:** derivado nulo vira
`planned: null` e o card mostra **"—"**. O ramo que caía em `activity.hours` passou a exigir
ausência de `hoursStat` — antes, um pai sem derivação mostraria as horas **próprias** dele
como se fossem o total da subárvore.

### **BARRADO: o progresso** · commit `5a92184`

Medi antes de trocar, e a medição impediu: **82 pais mudariam, 74 barras CAIRIAM**, até 66
pontos percentuais, várias de 50% para 0%.

Não é troca de fonte, é **troca de régua**. A tela dá crédito parcial pela posição na coluna
(filha em "Em Revisão" vale 75); o servidor é binário (`completed ? 100 : 0`). As duas
afirmações são verdadeiras sobre perguntas diferentes.

Junto se perderiam quatro coisas que `derived_progress` não faz: **pausada**, **filha
cancelada fora da média**, o rótulo **"concluída com N em aberto"**, e o **marco binário**.

> **Depende de uma decisão de produto, não de código:** *o progresso do pai deve dar crédito
> parcial a filha em andamento?* Se sim, `derived_progress` precisa aprender a régua por
> coluna. Se não, a queda de 74 barras é intencional — e precisa ser **avisada antes**, não
> descoberta.

### `descendantSummaryById` — **não tem para onde ir**

Conta concluídas × pendentes na subárvore. O servidor tem `derived_children` (filhas diretas
vivas), que não separa concluída de pendente nem desce na árvore. **Não existe coluna
equivalente.** Trocar exigiria derivar `derived_completed`/`derived_pending` — trabalho novo,
não fiação.

### Commit separado: o Cronograma · `982ba60`

Aqui a medição **autorizou**. Havia uma **quarta** fórmula de progresso que **achatava a
árvore**: somava todo descendente no mesmo saco, neto pesando igual a filho. Em **"Execução"**
— 8 filhas, **129 netos** — as filhas valiam 6% do número.

**42 dos 582 pais mudam (16 sobem, 26 caem), e todos os 42 têm netos** — o que confirma a
causa. As quedas são correção: "Execução" de 42% para 19% é a média das 8 frentes reais.

> **Vale avisar quem acompanha esses pais: o número muda sem o trabalho ter mudado.**

**Ressalva de método, registrada:** a primeira medição **acusou uma queda que não existia**
("Diagnóstico" caindo para 0%). O erro era da minha reimplementação — o código real passa
`subActivities` e faz melhor; o mesmo caso na verdade **sobe para 100%**. Conferir um caso
concreto no banco foi o que pegou.

---

## ETAPA 3 — a tela do backlog · **FEITO** · commit `94e1ee7`

As regras já existiam testadas em `lib/mesaDePlanejamento` (42 verificações). Faltava a tela
**consumir** em vez de reimplementar.

| decisão | antes | agora |
|---|---|---|
| 1 | badge "Atividade" em toda linha | **sai** — marco mantém o losango |
| 2 | pílula de status colorida | **ponto de 7px** |
| 3 | rótulo ("Alta"), colorido em toda faixa | **o número 1–125**, cinza abaixo de 60 |
| 4 | número à esquerda | **à direita, `tabular-nums`** |
| 5 | "Sem responsável", "—" | **"a definir"**; no marco, célula **vazia** |
| 6 | (já não havia zebra) | faixa de grupo |
| 7 | faixa só com contagem | **+ horas somadas e janela** |

Esforço e custo do pai vêm de `derived_hours`/`derived_cost`. Pai sem derivação mostra **"—"**,
nunca as horas próprias dele no lugar do total.

### Promover não arrasta mais a hierarquia

`descendentesDe` valia para **qualquer** linha, então marcar uma atividade com subatividades
mudava o status das filhas **sem pedir**. Agora só agrupador leva a família — que é o defeito
relatado em 13/08, resolvido a favor dele em `DIVERGENCIAS.md` item 7.

**Medido: 184 atividades param de arrastar 666 subatividades.** Os 398 agrupadores seguem iguais.

---

## ETAPA 4 — a tela da atividade · **FEITO EM PARTE** · commit `6ace54d`

### Feito

**Marco.** Horas, custo e código EAP já sumiam; **GUT e responsável não**. Agora somem também.

E a **prontidão** tinha o mesmo defeito com consequência pior: cobrava responsável e prioridade
do marco, então a pendência **nunca fechava**. **Medido: dos 53 marcos vivos, 42 estavam sem
responsável** e eram contados como incompletos por isso. Agora o marco deve **só a data** — que
ele tem, e que é o campo dele.

**"Líder" virou "Responsável".** O campo sempre gravou `assigned_to`; `lider_id` nunca existiu
(`DIVERGENCIAS.md` item 1). Era um terceiro nome para a mesma coisa. O "Líder" que sobra em
`AddProjectDialog`/`EditProjectDialog` é **outro eixo** — papel de projeto, corretamente nomeado.

**Já existiam** e foram conferidos: rota própria, datas previstas × reais lado a lado,
subatividades abaixo do resumo, "transformar em lição aprendida".

### Não feito, e por quê

**A unificação painel + modal.** `EditActivityDialog.tsx` tem **3.696 linhas** e é o caminho de
edição de todas as telas. Reescrever a renderização sem poder abrir o navegador produz código
que passa no `tsc` e pode estar quebrado de dez maneiras que nenhuma ferramenta detecta — é o
risco que a `VALIDACAO.md` já registrava. **Com a aplicação de pé, é uma sessão.**

---

## ETAPA 5 — migrar as 284 leituras · **TRAVADO** · commit `905d1ba`

**Motivo: `activity_assignees` não acompanha escrita.**

A fase 02 diz, no próprio cabeçalho, que a tabela nasce *"sincronizada por trigger nos dois
sentidos"*. A tabela nasceu, o backfill rodou — **o trigger não existe**. O único sobre ela
valida permissão.

Então ela é um **retrato do backfill**, e envelhece uma linha por atribuição nova. **Medido:
667 atividades com `assigned_to`, 663 com linha, 4 já divergiam** — todas atribuídas depois do
backfill.

Migrar as leituras agora faria a tela mostrar **responsável vencido**, e o sintoma ("sumiu o
responsável de algumas tarefas") não se parece com uma troca de fonte de leitura.

### O achado que mudou a migration

**450 das 667 atividades estão atribuídas a "Williame Correia de Lima" — e existem DOIS perfis
ativos com esse nome** (`williame_lima@hotmail.com` e `williame.correia@pronutrir.com.br`).
Os dois editam: o audit_log tem escrita do hotmail.

O backfill da fase 02 escolheu um por `DISTINCT ON` — **arbitrário**, e ficou. A função nova
devolve NULL para nome ambíguo de propósito (gravar o profile errado é pior que não gravar),
mas **NULL não pode virar "apague a linha"**: seria trocar um palpite antigo por nada, em 450
linhas. Os triggers só mexem quando o texto **resolve** ou quando o campo foi **esvaziado**.

**Escrito e pronto:** migration + rollback + `scripts/apply-fase05-sincronia-responsaveis.sh`,
com a lista de nomes repetidos na sonda.

> **Depende de uma pessoa:** a duplicidade do Williame é um problema à parte, e **anterior** a
> esta fase — toda comparação da RLS é por nome. Enquanto os dois perfis existirem, "quem é o
> responsável" dessas 450 é ambíguo no dado, não só no código.

**Ordem:** aplicar a migration → confirmar com um teste vivo (atribuir pela tela e ver a linha
aparecer) → **só então** migrar as leituras.

---

## ETAPA 6 — o feed agregado · **FEITO NO BANCO** · commit `d3348f7`

**Sem tabela nova, e a decisão é deliberada.** A fase 08 previa `activity_events`. Ao conferir
a base, tabela nova seria um **terceiro** lugar guardando o que já está em dois: `audit_log`
(22.557 linhas de activities) e `activity_comments`. Exigiria caminho de escrita novo em cada
ponto que grava hoje — e **todo ponto esquecido vira evento que nunca aparece, sem erro
nenhum**. Pior: os eventos **antigos** não existiriam nela, e o feed nasceria vazio.

A view resolve o que a tabela resolveria: um lugar único que responde *"o que aconteceu nesta
subárvore, em ordem de tempo"*, e a recursão roda no banco — **sem lista de ids na URL**, então
não esbarra no teto de ~3,7 KB do proxy.

**`security_invoker = true`, ao contrário das views da fase 02.** A breadcrumb precisa furar a
RLS: é fresta controlada, só código/nome/tipo. Esta carrega **texto de comentário** — se
rodasse como owner, quem entra por atribuição leria a conversa das irmãs invisíveis: o furo da
P00 reaberto por outra porta. A migration **falha alto** se alguém recriar a view sem isso, e
recusa `SECURITY DEFINER` nas duas funções.

**Falta a tela.** Nenhum componente chama `feed_da_subarvore` ainda — depende de aplicar a
migration primeiro.

---

## ETAPA 7 — P00 · **NÃO APLICADA, POR INSTRUÇÃO**

Confirmado no banco: `pode_ler_atividade_v2` **não existe**. O script segue pronto
(`scripts/apply-p00-escopo-de-leitura.sh`), com a sonda de cinco perguntas e o rollback.

> **Depende de falar com o Bruno e o Williame antes.**
>
> A sonda deu **verde preliminar**: 6 pessoas, 107 pares atividade-pessoa deixam de ser
> visíveis, e **nenhuma delas mexeu em nenhuma dessas atividades em 90 dias**.
>
> Mas a sonda mede **edição, não leitura** — o `audit_log` não registra visualização, e quem lê
> o cronograma da fase para se situar não deixa rastro nenhum ali.
>
> O caso do Bruno é o que impede o verde definitivo: **55 → 1 não é ajuste, é a tela virando
> outra coisa**. Uma pergunta resolve o que nenhuma query resolve:
>
> *"Você usa a lista de atividades do projeto para se situar, ou só a sua atividade?"*

---

## O que está pendente de aplicar no banco

**Nenhuma das três migrations desta fila foi aplicada.** Ordem:

```bash
./scripts/apply-fase05-sincronia-responsaveis.sh   # 20260826160000
./scripts/apply-fase08-feed-da-subarvore.sh        # 20260826170000
./scripts/apply-p00-escopo-de-leitura.sh           # 20260826150000 ← só depois da conversa
```

Já aplicadas (conferido em 26/08): `20260825120000`, `…130000`, `…140000`, `…150000`,
`20260826120000` (fase 02), `20260826130000` (fase 09), `20260826140000` (fase 04).

---

## As verificações automáticas — 315

Rodam sem banco e sem navegador, sobre o **código real** compilado na hora.

```bash
node scripts/verificar-matriz-acesso.cjs            # 108
node scripts/verificar-mesa-de-planejamento.cjs     #  42
node scripts/verificar-tela-da-atividade.cjs        #  37
node scripts/verificar-acesso-atividade.cjs         #  30
node scripts/verificar-agregado-do-pai.cjs          #  24
node scripts/verificar-backlog-sete-decisoes.cjs    #  17  ← novo
node scripts/verificar-prontidao-do-marco.cjs       #  16  ← novo
node scripts/verificar-rotulos-do-historico.cjs     #  13
node scripts/verificar-sino-do-feed.cjs             #  11
node scripts/verificar-sem-fallback-silencioso.cjs  #   9  ← novo
node scripts/verificar-rollup-nao-persiste.cjs      #   8
```

E as medições, reproduzíveis contra a base:

```bash
node scripts/medicoes/comparar-rollup-antes-fase09.cjs
node scripts/medicoes/comparar-progresso-fase09.cjs
node scripts/medicoes/comparar-progresso-cronograma.cjs
```

---

## Em resumo, o que depende de gente

1. **Em qual máquina o build roda** — bloqueia publicar, e portanto tudo o mais.
2. **Qual `APP_VERSION` está no ar** — sem isso não se sabe o que os usuários já veem.
3. **O progresso do pai deve dar crédito parcial a filha em andamento?** — destrava a última
   parte da fase 09.
4. **A conversa com o Bruno e o Williame** — destrava a P00.
5. **A duplicidade do Williame** — dois perfis, 450 atividades, e toda comparação da RLS é por
   nome.

E um aviso, para quando publicar: **42 pais mudam de percentual no Cronograma** sem que nada
tenha mudado no trabalho. O número novo está certo; o antigo diluía as filhas nos netos.

---
---

# Segunda rodada — 26/08/2026

Três itens, na ordem pedida. **Um commit para cada.** Nada publicado: a máquina continua sem
Docker.

| Item | Estado |
|---|---|
| 1 — homônimos | **feito** · commit `4da67c4` |
| 2 — progresso | **feito** · commit `6c60a67` |
| 3 — responsáveis | **feito em parte** · commit `a8ad50e` |

**367 verificações automáticas, todas passando** (eram 315).

---

## 1 · HOMÔNIMOS — a permissão parou de comparar por nome

### O furo, reproduzido chamando as próprias funções

```
is_activity_actor_v2(<atividade do Williame>, b0b64edb…) = true
is_activity_actor_v2(<atividade do Williame>, 149e6c4a…) = true
```

…enquanto `activity_assignees` diz que o responsável é **um só**.

No nível de projeto era pior, porque a concessão é maior:

```
is_project_leader_v2(<Guia Jornada do Paciente>, b0b64edb…) = true
is_project_leader_v2(<Guia Jornada do Paciente>, 149e6c4a…) = true
```

`projects.owner` guarda **nome**. Os dois viravam dono — e dono manda em tudo dentro do
projeto.

**Alcance:** 450 atividades, 6 participações, 2 projetos.

### A decisão

**Nome que pertence a mais de um perfil não concede a ninguém.** Decidem as vias por
identificador: `created_by`, `activity_assignees`, `project_members`.

Errar para "ninguém" é visível — a pessoa reclama que perdeu acesso. Errar para "os dois" é
invisível, e é escalação de privilégio.

**Ninguém fica sem acesso:** conferido antes de escrever, nos 2 projetos afetados os **dois**
Williames já são membros com `can_edit` e `can_move`, por `user_id`. A rede de segurança da
migration não insere nada nesta base.

### O achado que o próprio teste encontrou

No front a comparação é por **token**, então `williame_lima@hotmail.com` quebrava em
`[williame, lima, hotmail]` e casava com o nome *"Williame Correia de Lima"* do **outro**
perfil — o mesmo furo por outra porta, justamente onde havia informação para distinguir.
E-mail agora casa por igualdade exata e para aí.

A RLS já comparava e-mail por igualdade — esse lado nunca teve o defeito.

### O levantamento dos dois perfis

`docs/medicoes/homonimos-26-08-2026.md`. **Nada foi fundido, ninguém foi desativado.**

| | **A** — hotmail | **B** — corporativo |
|---|---|---|
| e-mail | `williame_lima@hotmail.com` | `williame.correia@pronutrir.com.br` |
| entrou por | senha | SSO (azure) |
| criado em | 04/05/2026 19:43 | 05/05/2026 02:37 (7 h depois) |
| último login | **nunca registrado** | 05/05/2026 |
| responsável por | **0** | **460** |
| criou | 41 atividades | **364** |
| membro de | **1** projeto | **18** |
| escritas | **3.280** | 3.068 |
| última escrita | **14/08/2026** | **24/08/2026** |

**Os dois estão vivos, e trabalham no MESMO projeto** — 249 e 172 escritas em "Guia Jornada
do Paciente". Isso sugere **uma pessoa com dois logins**, não duas pessoas homônimas: ela
trabalhava logada como **A** e recebia tarefa como **B**, o que só funcionava porque a
comparação por nome deixava os dois passarem. O furo estava sendo usado como se fosse
recurso.

> ### Depende do Raphael, e tem efeito imediato
>
> Logado como **A**, o Williame deixa de enxergar como suas as 450 atividades atribuídas ao
> nome. Ele **não perde o projeto** (é membro por `user_id`), mas perde o vínculo com as
> atividades. **Se ele usa o login do hotmail no dia a dia, vai notar na primeira abertura.**
>
> As três perguntas: por qual login ele entra? os 3.280 registros de A devem migrar para B?
> desativar A, ou deixar os dois?
>
> **Não desative A** antes de responder a primeira — ele pode ficar sem acesso na
> segunda-feira.

---

## 2 · PROGRESSO — o servidor aprendeu a régua da tela

Decisão respeitada: **mantém o crédito parcial por coluna.** Então o trabalho inverteu — em
vez de a tela adotar a régua binária do banco, `derivar_do_pai()` copiou os pesos da tela.

### O resultado exigido

**582 pais conferidos contra o código real compilado: ZERO barra muda de valor.**

A correção aparece só para quem enxerga uma **fatia** — que é o motivo da fase 09 existir: o
cliente nunca tem a árvore toda, só o que a RLS deixou passar.

### As duas diferenças que a conferência achou — as duas eram minhas

**1. Recursão.** Minha primeira versão usava o derivado da filha quando ela também era pai.
A tela não faz isso; `subAvanco` diz, com todas as letras: *"um nível é o que existe"* —
pontua a filha pela **coluna** dela mesmo quando ela tem filhas. Com recursão, **56 dos 582**
divergiam, um deles em **100 pontos**.

**2. Arredondamento.** Eu guardava 2 casas; `clampPercent` da tela é `Math.round`. 62,5 no
banco contra 63 na tela deixava **30 pais** divergindo por meio ponto.

Corrigidas as duas, o número fechou em zero.

### E um erro de diagnóstico, registrado no script

Investigando uma divergência, abri a atividade errada: **há nove atividades chamadas
"Cargas"**. Conclui que a conferência estava com defeito quando o número dela estava certo.
O id agora vai na saída, e a nota está no cabeçalho do script.

### O que a tela continua decidindo

`progressoDoPai()` roda a régua de sempre e troca **só o número**. `paused`, `label`, `subs` e
`divergente` continuam vindo da tela — o banco não tem esses estados. Derivado nulo vira
`percent: null`, nunca o número do cliente.

---

## 3 · RESPONSÁVEIS — sincronia escrita, leituras começadas

### Os três triggers

A fase 02 prometeu no próprio cabeçalho *"sincronizada por trigger nos dois sentidos"* e nunca
escreveu. Agora existem:

| trigger | o que espelha |
|---|---|
| `trg_assigned_to_para_tabela` | `assigned_to` → `papel='responsavel'` |
| `trg_participants_para_tabela` | `participants` → `papel='participante'` |
| `trg_tabela_para_assigned_to` | a tabela → **as duas** colunas de volta |

O backfill repara as **4 linhas** que já divergiam e os participantes que ficaram para trás.

Nome ambíguo **não apaga linha**: 450 atividades trazem o nome dos dois Williames, e resolver
para `NULL` não pode significar "tire essa pessoa". Os triggers só mexem quando o texto
**resolve** ou quando o campo foi **esvaziado**.

### O defeito que apareceu ao migrar as leituras

`lib/pendencias.ts` fazia `responsavelId: a.assigned_to` — mas essa coluna guarda **nome**, e
a aba "Minhas" compara com `user.id`.

> **Medido: das 667 atividades com responsável, 657 guardam NOME e 10 guardam uuid.**
> A aba "Minhas" de Pendências enxergava **1,5%** do que deveria.

Agora o id vem de `activity_assignees`. Nome nunca vira `responsavelId`, e sobrevive em
`responsavelTexto` para que "sem-dono" não conte como órfã uma atividade que tem dono.

### O que ficou de fora, e por quê

**Migradas: cronograma e pendências** — as duas primeiras da fila, como pedido.

**Não migradas: as demais.** Restam **301 usos** de `assigned_to` em `src/`, concentrados em:

| arquivo | usos |
|---|---|
| `MeetingsManager.tsx` | 24 |
| `EditActivityDialog.tsx` | 22 |
| `csc/page.tsx` | 20 |
| `team/page.tsx` | 17 |
| `BacklogSection.tsx` | 16 |
| `ActivityKanban.tsx` | 15 |

**Elas continuam corretas** enquanto os triggers mantiverem os dois lados iguais: quase todas
resolvem *nome para exibir*, e o nome continua sendo gravado na coluna. O ganho de migrá-las é
o mesmo de Pendências — deixar de confundir homônimo — e vale a pena, mas cada tela precisa
ser aberta para conferir, e isso pede a aplicação de pé.

`lib/responsaveisDaAtividade.ts` é a camada comum que elas devem consumir: a tabela ganha do
texto quando responde, o fallback **se declara** (`origem: tabela | texto | ausente`) e recusa
nome ambíguo, e uuid nunca vaza para a tela.

---

## As migrations pendentes — agora são cinco

**Nenhuma aplicada.** Ordem, e a razão de ser esta:

```bash
# 1. Fecha o furo do homônimo. Independente das outras.
./scripts/apply-homonimos.sh                       # 20260826180000

# 2. Sincronia dos responsáveis — ANTES de migrar mais leituras.
./scripts/apply-fase05-sincronia-responsaveis.sh   # 20260826160000

# 3. O progresso com crédito parcial.
#    supabase/migrations/20260826190000_progresso_credito_parcial_no_servidor.sql

# 4. O feed agregado. Nenhuma tela lê ainda; pode ir a qualquer momento.
./scripts/apply-fase08-feed-da-subarvore.sh        # 20260826170000

# 5. P00 — só depois de falar com o Bruno e o Williame.
./scripts/apply-p00-escopo-de-leitura.sh           # 20260826150000
```

> ### O par que não pode se separar
>
> A migration `20260826190000` e o commit `6c60a67` (front) são **um par**.
>
> - Migration **sem** o front: `derived_progress` muda, ninguém lê. Inofensivo.
> - Front **sem** a migration: as telas leem `derived_progress` com a régua **binária** ainda
>   no banco — **74 barras caem**, até 66 pontos.
>
> **A migration vai primeiro.**

Todas as cinco têm script de apply com sonda antes, confirmação e sonda depois. O dos
homônimos pergunta o que decide: **nesses projetos, os homônimos já são membros por
`user_id`?** Se sim para todos, ninguém perde acesso — a via de membro já cobre os dois.

---

## As perguntas que dependem de gente

1. **Em qual máquina o build roda?** Continua bloqueando tudo.
2. **Qual `APP_VERSION` está no ar?**
3. **Por qual login o Williame entra?** — decide se a mudança dos homônimos o afeta.
4. **A conversa com o Bruno e o Williame** — destrava a P00.
5. ~~O progresso deve dar crédito parcial?~~ **Respondida: sim.** Implementado, com zero
   mudança de número para quem enxerga o projeto inteiro.

E o aviso de sempre, para quando publicar: **42 pais mudam de percentual no Cronograma** sem
que nada tenha mudado no trabalho (commit `982ba60`, da primeira rodada). O número novo está
certo; o antigo diluía as filhas nos netos.
