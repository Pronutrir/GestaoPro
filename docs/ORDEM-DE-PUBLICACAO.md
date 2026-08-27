# Ordem de publicação — as entregas pendentes

> **Este arquivo diz o que publicar, em que ordem, e como voltar atrás.**
> O registro do que **já foi** publicado é outro: [deploys.md](deploys.md).
> O procedimento de build e push é o terceiro: [DEPLOY.md](DEPLOY.md).
>
> Estado em **27/08/2026**. Nada abaixo está no ar.

---

## 🔒 PASSO OBRIGATÓRIO — toda migration nova roda no CLONE antes de qualquer publicação

Antes de publicar qualquer coisa que dependa de uma migration nova, a migration
é aplicada **duas vezes** num CLONE de produção (dump `--schema=public` restaurado
em `migtest_db`), com `-v ON_ERROR_STOP=1`. Nenhum teste de código substitui isso:

- as 7+ suítes de verificação e o `tsc` **nunca aplicam migration** — não veem
  trigger de projeto concluído, violação de CHECK, bug de cast de enum, nem drift
  de policy. Tudo isso já apareceu **só** contra o Postgres real;
- caso concreto (27/08): o clone pegou que `20260827130000_congelar_item_type`
  gravava vocabulário de EXIBIÇÃO (`EapKind`) na coluna de ARMAZENAMENTO
  (`item_type`), violando a CHECK — o que 7 suítes verdes e o `tsc` não pegaram.

Regra: **migration nova → clone-teste (2 passadas) → só então publicar.**

---

## ⚠ O PAR ACOPLADO — leia antes de qualquer coisa

**A entrega 3 tem uma migration que precisa ser aplicada ANTES ou JUNTO com o
build. Nunca depois.**

```
   ✅  migration 20260827130000  →  build com a leitura de item_type
   ✅  os dois na mesma janela, migration primeiro
   ❌  build primeiro, migration depois     ← 1.591 itens viram Fase na tela
   ❌  migration e o build fica para depois  ← o "+ Subatividade" quebra o pai
```

O acoplamento é **nos dois sentidos**, e o segundo é mais silencioso: com a
migration aplicada e o build antigo, o banco aceita subatividade sob atividade,
mas a tela transforma o pai em faixa ao ganhar a primeira filha. Quem testar o
recurso novo vai ver o cartão do pai sumir do quadro.

### Por que, em uma frase

O código passou a **ler** `item_type` em vez de deduzir. O banco ainda tem o
lixo da importação: 1.591 linhas gravadas como `'fase'` que nunca foram fase —
são atividades comuns que receberam esse rótulo porque `fase`/`atividade` eram
os únicos dois valores disponíveis na importação da EAP.

Enquanto o código deduzia, esse lixo era inofensivo: `hasChildren` corrigia na
hora de exibir. Com a leitura pura, **o lixo vai direto para a tela**.

### O que o usuário veria, se alguém publicar fora de ordem

- **1.591 atividades exibidas como Fase** no Backlog, no Kanban e no Cronograma.
- Como Fase é agrupador, elas **somem do Kanban** — agrupador não vira cartão.
  Quem procurar a própria tarefa não a encontra.
- O Backlog passa a mostrar faixas de grupo onde havia linhas de trabalho.

Não corrompe dado — é só exibição, e some assim que a migration rodar. Mas por
algumas horas o sistema fica inutilizável para quem trabalha no quadro.

### A ordem segura

```bash
# 1º  a migration
PGPASSWORD=... ./scripts/apply-congelar-item-type.sh

# 2º  só então o build
./scripts/build-prod.sh 2026-08-27-01
docker push pronutrir/gestaopro:2026-08-27-01
APP_VERSION=2026-08-27-01 docker compose -f docker-compose.prod.yml up -d app
```

O inverso — migration depois do build — é o único erro que não dá para
corrigir "deixando quieto": tem de rodar a migration ou reverter o build.

---

## Estado das migrations

Conferido pelo **esquema**, não pela tabela de controle
(`node scripts/conferir-migrations.cjs` + sonda por coluna, 27/08):

| | |
|---|---|
| já aplicadas | tudo até `20260826190000` — incluindo fase 02, 04, 05, 08, 09, homônimos, progresso e a **P00** |
| **pendentes** | **três**, e são exatamente as três das entregas abaixo |

```
20260826200000  conversão nome → identificador     (entrega 1)
20260827120000  marco não tem responsável nem GUT  (entrega 2)
20260827130000  congelar item_type                 (entrega 3)  ← acoplada
```

---

# A sequência

> **Há um script que conduz as três na ordem:**
> `PGPASSWORD=... ./scripts/publicar-as-tres.sh`
> Ele confere o estado pelo esquema, mostra o que cada entrega faz, chama o
> apply certo e **pergunta entre uma e outra**. Não publica o build — esse passo
> é manual, de quem tem Docker, e o script para e diz isso.

Uma por vez. **Cada entrega é publicada e observada antes da seguinte** — são
três mudanças de dado em três dias, e publicar as três juntas torna impossível
saber qual causou um problema.

---

## 1 · Conversão nome → identificador

**Migration:** `20260826200000_conversao_nome_para_identificador.sql`
**Acoplada?** Não. A migration pode ir sozinha, e o código funciona com ela ou
sem ela — as leituras aceitam os dois formatos de propósito.

### O que muda na tela

Quase nada, e é intencional. A coluna `assigned_to` (texto com o nome) **não é
apagada** — ganha ao lado uma `assigned_to_id`. Quem já aparecia como
responsável continua aparecendo.

O que muda de verdade é invisível: **permissão deixa de ser decidida por nome**.
Hoje dois perfis chamados "Williame Correia de Lima" são a mesma pessoa para o
sistema, e um enxerga as atividades do outro.

### O que fica pendente de propósito

Os registros **ambíguos** — os que casam com mais de um perfil — ficam com
`assigned_to_id` nulo e o nome intacto. São ~450 atividades dos dois Williames.
O script de resolução em massa está escrito e **não roda sozinho**: alguém
precisa dizer qual perfil é o certo.

### Como reverter

Não há flag — o apply imprime estes dois comandos no fim:

```bash
docker cp supabase/migrations/20260826200001_conversao_rollback.sql supabase-db-1:/tmp/rb.sql
docker exec -e PGPASSWORD=... -i supabase-db-1 psql -U supabase_admin -d postgres -f /tmp/rb.sql
```

Derruba `assigned_to_id`. O nome nunca saiu, então não há o que restaurar.

---

## 2 · Marco não tem responsável nem GUT

**Migration:** `20260827120000_marco_nao_tem_pessoa_nem_gut.sql`
**Acoplada?** Não. A tela já parou de oferecer esses campos no commit `6ace54d`,
que já está no ar. Esta migration limpa o que ficou e impede que volte.

### O que muda na tela

**60 marcos** perdem o responsável; **3** perdem o GUT.

- **11 são vivos** — alguém pode notar que o nome sumiu do marco.
- **49 estão na lixeira**, e entram de propósito: restaurar um deles devolveria
  o dado sujo.

Se alguém usava o responsável do marco como "quem confirma", esse nome
**não se perde** — vai para a coluna sombra `marco_limpeza_backup`, e continua
consultável.

### O que trava depois

Duas `CHECK` constraints. Marco passa a **recusar** responsável e GUT em
qualquer via de escrita — tela, importação, API. É a mesma proteção que
`wbs_code` tem desde 11/08, e que hoje mostra zero registros sujos.

### Como reverter

```bash
PGPASSWORD=... ./scripts/apply-marco-sem-pessoa.sh --rollback
```
Derruba as duas constraints **primeiro** (restaurar com elas de pé falharia em
cada linha), devolve os valores pela sombra, e derruba a sombra.

---

## 3 · Congelar `item_type` + a leitura pura ⚠ ACOPLADA

**Migration:** `20260827130000_congelar_item_type.sql`
**Build:** o commit `4676374` e tudo acima dele.
**Acoplada?** **SIM, e nos dois sentidos.** Ver o aviso no topo.

Esta entrega cresceu depois que o documento foi escrito: ela carrega junto o
**item 4 da Fase 1** — a leitura pura do tipo, `eap_is_group` virando exceção
(só marco é folha) e a unificação de `eapCanMoveInto` com a regra do banco.
São a mesma entrega porque **não funcionam separadas**:

| se publicar | o que quebra |
|---|---|
| **build sem a migration** | 1.591 itens viram Fase na tela e somem do Kanban; e a tela oferece "atividade" como destino enquanto o banco recusa |
| **migration sem o build** | o banco aceita subatividade sob atividade, mas a tela continua transformando o pai em faixa ao ganhar a primeira filha |

### O que muda na tela

**14 itens** trocam de rótulo: Entrega → **Atividade**. Sete estão vivos, todos
em projetos de teste ou piloto; sete estão na lixeira. A lista com id, projeto e
título está em
[os-14-que-mudam-de-rotulo-27-08-2026.md](medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md).

**Mais nada muda de aparência** — medido nas 8.199 linhas, não numa amostra.

O campo é reescrito em **2.604 linhas**, e ninguém vê: o valor gravado passa a
ser o que a tela já mostrava.

### O que passa a funcionar — e não funcionava

**Subatividade dentro de atividade.** Hoje o banco proíbe, e por isso existem
**zero** na base inteira. É o corpo da tela nova, o "+ Subatividade", o total
derivado das filhas — e era o primeiro pedido do Raphael.

**5.382 atividades** ganham a capacidade. Nenhuma linha muda: é permissão
futura, não migração de dado.

### O que isso conserta

O tipo de um item **parava de mudar sozinho**. Antes, criar a primeira
subatividade transformava uma Atividade em Entrega sem ninguém ter decidido —
e uma Entrega que perdesse a última filha voltava a ser Atividade. Agora o tipo
só muda quando alguém o muda.

### ⚠ O teste de fumaça de escrita — obrigatório antes de liberar

O apply roda um terceiro passo, depois do congelamento e da prova de ponto
fixo: ele **tenta escrever de verdade** — inserir filha, mover item, trocar
tipo, virar marco — uma vez para cada tipo que o congelamento produz. Tudo
dentro de uma transação que termina em `ROLLBACK`; nada fica gravado.

**Por que ele existe:** um teste que só lê nunca vai ver trigger. Foi
exatamente ali que o defeito do `eap_is_group` se escondeu — 1.272 pais que o
trigger passaria a recusar, invisíveis para o ponto fixo, porque o trigger só
dispara em escrita e o backfill não insere nem move nada. Passou pelas duas
execuções, pelo `tsc` e por 139 asserções sem levantar nada.

Compare a saída com o que a **tela** oferece:

| a tela oferece | o banco deveria |
|---|---|
| fase/entrega/atividade como destino do "Dentro de" | aceitar filha e mover |
| marco como destino | **recusar** |
| trocar para qualquer um dos 4 papéis | aceitar |
| virar Marco tendo filhas | **recusar** |

Onde divergir, é a mesma família do `eap_is_group`: duas listas de regra que
ninguém amarrou. **Não publique com divergência em aberto** — anote e resolva.

### Como reverter

**Os dois lados, ou nenhum.**

```bash
# 1º  o código  — voltar o build anterior
APP_VERSION=<versao-anterior> docker compose -f docker-compose.prod.yml up -d app

# 2º  o banco
PGPASSWORD=... ./scripts/rollback-congelar-item-type.sh
```

Reverter só o banco é **pior que não reverter**: o código continuaria lendo um
campo que voltou a ser lixo de importação — o cenário dos 1.591 descrito no topo.

O rollback recusa rodar se a coluna sombra estiver incompleta, e avisa disso na
saída.

---

# Depois de publicar

1. **Anote em [deploys.md](deploys.md)** — data, `APP_VERSION`, commit
   (`git rev-parse --short HEAD`) e quem publicou. É a única coisa que responde
   "o que está no ar" depois; a data se descobre pelo ETag
   (`node scripts/data-do-build-no-ar.cjs`), o commit não.
2. **Confira o esquema:** `node scripts/conferir-migrations.cjs`.
3. **Observe antes da entrega seguinte.**

---

# As sete conferências do dia seguinte

**Duas pessoas, em contas diferentes** — o Raphael e mais alguém. A segunda
conta não é formalidade: metade destas mudanças é sobre **permissão** e sobre o
que cada um enxerga, e uma conta de administrador vê tudo, então nunca
reproduziria o problema. A segunda pessoa deve ser alguém que **não** seja
administrador do sistema.

Faça na ordem. Cada uma diz o que fazer, o que tem de acontecer e **o que fazer
se falhar** — porque descobrir um defeito sem saber o passo seguinte é o que
transforma um problema pequeno num dia perdido.

| # | o quê | por que está na lista |
|---|---|---|
| 1 | Pendências → Minhas mostra tarefas | a conversão nome → id (entrega 1) |
| 2 | fase e pacote são faixa, não cartão | a leitura do tipo (entrega 3) |
| 3 | arrastar uma atividade move só ela | a regra do quadro |
| 4 | os números da faixa do backlog batem | o agregado derivado |
| 5 | ninguém relata nome mudado além dos 14 | o congelamento |
| 6 | criar subatividade dentro de atividade | `eap_is_group` virou exceção |
| 7 | o que a tela oferece o banco aceita | as duas listas unificadas |

---

## 1 · Pendências → Minhas mostra tarefas

**Onde:** `/pendencias`, aba **Minhas**.
**Quem:** as duas pessoas, cada uma na própria conta.

**Tem de acontecer:** a lista mostra as tarefas de quem está logado — não vazia,
se a pessoa tem tarefas atribuídas.

**Por que importa:** a entrega 1 trocou a decisão de "quem é o dono" de **nome**
para **identificador**. Se a conversão errou, esta é a primeira tela onde
aparece — ou some tudo, ou aparecem tarefas de outra pessoa.

**Atenção especial aos dois Williames.** Eles têm dois perfis com o mesmo nome, e
~450 atividades ficaram **pendentes de propósito** (nome intacto,
`assigned_to_id` nulo). É esperado que algumas tarefas deles ainda não apareçam
em "Minhas". **Não é defeito** — é a decisão de não chutar. O que seria defeito:
um Williame ver as tarefas do outro.

**Se falhar:** reverta só a entrega 1 (comandos na seção dela). Ela não está
acoplada a build nenhum.

---

## 2 · No quadro, fase e pacote são faixa — não cartão

**Onde:** o Kanban de um projeto com EAP montada. `Revitalização Tasy` serve.

**Tem de acontecer:**

- fases, entregas e pacotes aparecem como **faixa horizontal** sobre os cartões;
- **não existe cartão** de fase, entrega ou pacote em coluna nenhuma;
- marco não aparece no quadro (ele vive no Cronograma).

**Por que importa:** é o teste direto de que o build e a migration estão em
sincronia. Se a migration não rodou e o build sim, o oposto acontece: ~1.591
atividades comuns aparecem como Fase e **somem do quadro**.

**O sinal de alarme:** alguém não encontra a própria tarefa no Kanban. Se isso
for relatado, pare e rode `node scripts/conferir-migrations.cjs` antes de
qualquer outra coisa.

**Se falhar:** é o cenário do par acoplado. Rode a migration — **não** reverta o
build. Ver o aviso no topo deste documento.

---

## 3 · Arrastar uma atividade move só ela

**Onde:** o mesmo Kanban.

**Faça:** arraste um cartão de "Não iniciado" para "Em andamento". Depois
arraste de volta. **Repita 3 ou 4 vezes** — o defeito antigo só aparecia depois
de algumas idas e voltas.

**Tem de acontecer:**

- **só aquele cartão** mudou de coluna;
- nenhum irmão se moveu;
- **a faixa do pai não mudou de lugar** e continua desenhada;
- ao voltar, o quadro fica **idêntico** ao estado inicial.

**Por que importa:** é o bug do vaivém — "move o pacote e a fase inteira vai
junto; move de volta e parte fica, parte volta". Vinha de dois caminhos de
escrita que mexiam em quem ninguém tinha movido.

**Se falhar:** anote **qual item** se moveu sem ter sido arrastado. É a
informação que identifica qual dos dois caminhos voltou.

---

## 4 · Os números da faixa do backlog batem

**Onde:** `/projects/<id>` → Backlog, num projeto com fases e subitens.

**Faça:** compare o que a faixa de um grupo anuncia com o que está dentro dele.
Recolha e expanda o grupo.

**Tem de acontecer:**

- a contagem da faixa é igual ao número de linhas dentro dela;
- **o número não muda ao recolher** — recolher é visual;
- o total do rodapé acompanha o recorte ativo (os chips de filtro);
- horas e custo do pai são a **soma dos filhos**, não um número próprio.

**Por que importa:** houve duas escritas implícitas que gravavam o total do pai a
partir do que o cliente tinha carregado. Como a lista passa pela RLS, quem
enxergava 1 de 8 filhas **persistia o total daquela única filha** — o pai
encolhia de verdade, no banco.

**Confira com as duas contas.** É justamente onde uma pessoa com visão parcial
produzia o estrago, e o administrador nunca via.

**Se falhar:** anote o projeto e o item. Um número errado na tela é chato; um
número **gravado** errado precisa ser sabido rápido.

---

## 5 · Ninguém relata item que mudou de nome além dos 14

**Onde:** em qualquer lugar. É conferência de escuta, não de clique.

**Tem de acontecer:** ninguém estranha que um item mudou de tipo — **exceto** os
14 já registrados em
[os-14-que-mudam-de-rotulo-27-08-2026.md](medicoes/os-14-que-mudam-de-rotulo-27-08-2026.md),
sete deles vivos, todos em projetos de teste ou piloto.

**Por que importa:** a promessa do congelamento é que **ninguém vê nada mudar**.
Foi medido nas 8.199 linhas — mas medição é sobre o que eu sei olhar. Se alguém
relatar um item fora da lista, a medição tinha um ponto cego, e é melhor achá-lo
por um relato no dia seguinte do que por um número errado meses depois.

**O que perguntar a quem relatar:** o código EAP e o nome do item. Com os dois dá
para comparar contra a coluna sombra `item_type_antes_congelar`, que guarda o
valor anterior de **todas** as linhas.

**Se falhar:** não reverta por causa de um item. Anote e traga — a sombra existe
exatamente para responder "o que havia aqui antes?".

---

## 6 · Criar uma subatividade dentro de uma atividade funciona

**Onde:** a tela de uma atividade, ou o "+ Subatividade" do backlog.

**Faça:** escolha uma **atividade** (não fase, não pacote) e crie uma
subatividade dentro dela.

**Tem de acontecer:**

- a criação **funciona** — hoje o banco recusa, e existem **zero** na base;
- a atividade-pai **continua sendo cartão** no quadro, no lugar onde estava;
- ela **continua arrastável**;
- ela **não vira faixa**;
- o cartão dela passa a mostrar o contador de subatividades;
- a subatividade **não vira cartão sozinha** — só se alguém a promover.

**Por que importa:** é o recurso que a entrega 3 destrava, e era o primeiro
pedido do Raphael. É também a mais importante das sete: as outras seis verificam
que algo **continua** funcionando; esta verifica que algo **passou a** funcionar.

**Como distinguir as duas falhas possíveis:**

| sintoma | causa |
|---|---|
| erro do banco ao criar | a migration não rodou |
| a atividade-pai some do quadro ou vira faixa | o build não subiu |

---

## 7 · Mover um item para dentro de outro: o que a tela oferece, o banco aceita

**Onde:** o campo **"Dentro de"** na edição da atividade, ou o menu de mover do
backlog.

**Faça:** abra a lista de destinos e tente mover para **cada tipo** que ela
oferecer — fase, entrega, pacote e **atividade**.

**Tem de acontecer:**

- **todo destino oferecido pela lista funciona**;
- nenhum devolve erro do banco;
- **marco não aparece** na lista de destinos.

**Por que importa:** as duas regras de "quem pode ter filhas" viviam em lugares
diferentes e **divergiam**. A tela dizia "escolha uma fase, entrega ou
atividade" e o banco recusava atividade. Ninguém tinha esbarrado porque não havia
como criar a situação — mas a divergência era real, e o usuário a descobriria no
clique, com um erro cru do trigger.

**A regra agora é uma só:** todo item pode ter filhas, **menos marco**.

**Se falhar:** anote **qual destino** a lista ofereceu e qual foi o erro. Um
destino oferecido que o banco recusa é a assinatura de as duas listas terem
voltado a divergir.

---

## Se as sete passarem

Anote em [deploys.md](deploys.md) que as conferências foram feitas, por quem e
quando.

**O item 5 da Fase 1** (recálculo da EAP ao mover) volta à fila depois de
**24 horas de uso real sem incidente** — não depois das sete conferências.

A diferença importa: as conferências provam que o caminho feliz funciona; as 24
horas provam que o resto do sistema não tropeçou em algo que ninguém pensou em
conferir.

---

## O que NÃO entra nesta leva

- **Fase 1, item 5** (recálculo da EAP na subárvore ao mover) — volta à fila
  depois de 24 horas de uso real sem incidente. O **item 4 entrou** e viaja
  dentro da entrega 3.
- **Fases 2, 3 e 4** do comando de construção — não começadas.
- **A resolução dos dois Williames** — depende de decisão humana sobre qual
  perfil é o correto.
- **A conversa sobre a P00**, que já está valendo e concede o projeto inteiro a
  quem entra por atribuição. Não é publicação, é decisão pendente.
