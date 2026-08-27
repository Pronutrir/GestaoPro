# Registro de deploys

> Uma linha por publicação. **Anote no momento em que publicar** — é a única
> coisa que responde "qual commit está no ar" depois, e nenhuma investigação
> técnica substitui.
>
> A **data** dá para descobrir de fora a qualquer momento
> (`node scripts/data-do-build-no-ar.cjs`, que decodifica o ETag). O **commit**,
> não: só o que estiver escrito aqui.

> **O que ainda NAO foi publicado, e em que ordem publicar:**
> [ORDEM-DE-PUBLICACAO.md](ORDEM-DE-PUBLICACAO.md). Ha um par acoplado ali —
> uma migration que precisa ir ANTES do build, sob pena de 1.591 itens
> aparecerem como Fase na tela.

| data/hora (Fortaleza) | APP_VERSION | commit | quem publicou | o que entrou |
|---|---|---|---|---|
| **27/08/2026 12:08:31** | *desconhecida* | *desconhecido* | **a descobrir** | **INCIDENTE** — leitura de item_type sem o backfill; ver abaixo |
| 26/08/2026 18:01:08 | *desconhecida* | *desconhecido* | **a descobrir** | migrations da leva + código até ~17:33 |
| 25/08/2026 17:57 | *desconhecida* | *desconhecido* | *desconhecido* | — |

## O que sabemos do deploy de 26/08 18:01

- **A data é certa:** ETag de oito assets, todos com o mesmo mtime
  (`0x1a03fe06e20` = 26/08/2026 21:01:08 UTC = 18:01:08 em Fortaleza).
- **Funcionou**, e a migration foi antes do código.
- **Oito migrations** estão no esquema, entre elas a **P00** — que não deveria
  ter ido ainda (ver `DEPLOY.md`).
- O commit é **desconhecido**, e não dá para deduzir: o hash dos chunks depende
  do Node do ambiente de build (`node:22-alpine` no Docker × node 24 na máquina
  de desenvolvimento), então comparar com build local não identifica nada.

## Quem publicou?

**É a pergunta travada, e a mais barata de responder:** essa pessoa tem Docker
e já rodou os passos uma vez.

O pedido a fazer:

> Rode `./scripts/build-prod.sh 2026-08-27-01`, depois
> `docker push pronutrir/gestaopro:2026-08-27-01`, e na VM
> `APP_VERSION=2026-08-27-01 docker compose -f docker-compose.prod.yml up -d app`.
> Me devolva a versão e o commit (`git rev-parse --short HEAD`) para eu
> registrar aqui.

**Se ninguém souber quem foi:** o caminho curto é pedir ao responsável pelo
servidor um acesso onde o Docker rode. Enquanto publicar depender de encontrar
uma pessoa por vez, toda entrega para exatamente aqui — e foi o que aconteceu
com esta.

## Pendente de publicar

| commit | o que muda na tela |
|---|---|
| `b910b65` · `11f03ac` | **quadro**: fase e pacote viram faixa, não cartão; arrastar não leva a hierarquia. 992 itens → 850 cartões |
| `689caac` | **backlog**: total fixo no rodapé, densidade em dois níveis |
| `948905f` · `f732e6b` | homônimos marcados com e-mail; leituras perigosas por identificador |
| `7059dc6` | documentação (não muda tela) |

**Avisar a equipe antes**: o quadro muda de cara. Nada foi apagado — os
agrupadores viram faixa sobre os cartões das filhas.

Nenhuma migration precisa ir antes: nada aqui lê coluna nova.

---

# INCIDENTE — 27/08/2026, 12:08 · build sem o backfill do congelamento

> **Estado: build ainda no ar no momento em que este registro foi escrito.**
> A reversão depende de quem tem Docker — ver "O que trava a reversão".

## O que subiu

| | |
|---|---|
| build no ar | **27/08/2026 12:08:31** (Fortaleza), decodificado do ETag |
| build anterior | 26/08/2026 18:01:08 — `APP_VERSION` **desconhecida** |
| o que o build contém | a leitura pura de `item_type` (commit `7c9fde6` e acima) |
| quem publicou | **desconhecido** |
| qual comando | **desconhecido** — presumivelmente `build-prod.sh`, o caminho normal |

## O que quebrou

Itens de **nível 3** gravados como `item_type='fase'` passaram a ser lidos como
**Entrega**. Como Entrega é agrupador, eles:

- **sumiram do Kanban** — agrupador não vira cartão;
- **recusaram arrasto em silêncio** — relato do Raphael: *"arrasta e nada acontece"*.

Confirmado na tela em `1.1.1`, `1.1.2` e `1.1.3` do projeto de teste, todos
folhas sem filhas, exibidos como Entrega.

**Não houve corrupção de dado.** É exibição: some assim que o backfill rodar.

## A causa — e ela não é a que o relato do incidente supôs

O relato dizia "subiu **sem** a migration". O banco diz outra coisa:

```
item_type_antes_congelar ... existe, preenchida nas 8.199 linhas
distribuição de item_type ... atividade 5.622 · fase 2.577   ← estado PRÉ-congelamento
```

Se o backfill tivesse rodado, haveria 2.205 `entrega`, 370 `fase`, 220 `marco`,
22 `projeto`. Então:

> **A migration rodou pela metade.** Criou a coluna sombra, copiou os valores
> antigos para dentro dela, e **não escreveu o backfill**.

### CORREÇÃO — apurado depois, e muda o conserto

A primeira versão deste registro parou aí. Investigando o passo seguinte,
apareceu algo que desmente parte dele: a sombra e o `item_type` atual **divergem
em 785 linhas**. Isso parecia prova de que o backfill escreveu alguma coisa.

**Não é.** Os pares são `atividade → fase` (767), `fase → atividade` (14) e
`historia_usuario → fase` (4). O congelamento não produz nenhum deles — ele
produziria `fase → entrega` (1.591) e `atividade → marco` (220).

A origem é a migration **`20260824130000_pacote_e_posicao`**, que faz
`atividade → fase` em itens com código de exatamente 3 níveis, e que **rodou
depois de a sombra ter sido preenchida**.

Ou seja:

1. **o backfill do congelamento nunca rodou** — nem parcialmente;
2. o que quebrou a tela foi a combinação da leitura pura com o
   `pacote_e_posicao`: ele gravou `'fase'` em `1.1.1`, `1.1.2` e `1.1.3`, e
   `resolveEapKind` sem o OR devolve `entrega` para nível 3 **por posição**;
3. e a sombra guarda o estado de **antes do `pacote_e_posicao`** — o que a torna
   mais valiosa, não menos: é o único registro de que aqueles 767 itens eram
   `atividade`.

A distinção muda o conserto: não é "esqueceram de rodar", nem "rodou pela
metade" — é **"rodou o primeiro passo, e outra migration escreveu por cima antes
de o segundo acontecer"**. Uma migration **retomável** é o que resolve; ver
[FILA-DE-TRABALHO.md](FILA-DE-TRABALHO.md) §3.0.

> **E é por isso que aplicar a congelar como conserto rápido seria pior que o
> incidente.** Ela pularia o passo da sombra e gravaria o "antes" de hoje por
> cima — os 767 `atividade` originais virariam `fase` no registro, e o rollback
> da entrega 3 passaria a devolver um estado que nunca existiu.

## Por que a barreira não barrou

**Porque nunca houve barreira.** `publicar-as-tres.sh` existia desde as **09:48**
daquele dia — duas horas antes do build. Ele não falhou nem foi contornado:

Os comandos de build viviam dentro de um `cat <<'TXT'`, isto é, eram **texto
impresso** para um humano ler. E `build-prod.sh` — o caminho normal e
documentado de publicar — não consultava nada sobre migrations.

Quem publicou pelo caminho normal passou por fora sem contorcer nada.

> Escrevi um documento e chamei de barreira. **Uma barreira que depende de
> alguém ler é uma placa.**

### A armadilha que fez ninguém perceber

Havia uma segunda falha, minha, e mais insidiosa: **as conferências que escrevi
olhavam o artefato, não o efeito.** `conferir-migrations.cjs` e as sondas por
coluna perguntavam *"a coluna `item_type_antes_congelar` existe?"*.

Existia. Então **toda conferência respondia "APLICADA"** — inclusive as minhas,
nesta mesma sessão — enquanto o backfill não tinha escrito uma linha.

## O conserto

`scripts/barreira-de-acoplamento.cjs`, chamado **de dentro** do `build-prod.sh`,
com `exit 1`. Duas mudanças de fundo:

1. **Roda no caminho que as pessoas usam**, não num script que alguém precisa
   lembrar de escolher.
2. **Confere o EFEITO, não o artefato.** A regra do congelamento pergunta
   *"existe alguma linha com `item_type='entrega'`?"* — que é zero enquanto o
   backfill não rodar, por mais que a coluna exista.

Testado contra o estado quebrado de agora: **recusa o build, com exit 1**, e
nomeia a consequência e o comando que resolve. Para forçar é preciso escrever
`PULAR_BARREIRA=1` — explícito, visível no histórico, e não acontece por
distração.

## O que trava a reversão

**Ninguém sabe a `APP_VERSION` de 26/08 18:01.** É a pergunta aberta desde o
início: a data se descobre pelo ETag, o commit e a tag não. Quem tiver acesso à
VM precisa lê-la de lá:

```bash
docker ps --format '{{.Image}}'                                       # a que roda agora
docker images pronutrir/gestaopro --format '{{.Tag}}\t{{.CreatedAt}}' # as anteriores
APP_VERSION=<tag-de-26/08> docker compose -f docker-compose.prod.yml up -d app
```

**Não aplicar a migration de congelamento como conserto rápido** (decisão do
Raphael, e concordo). Dois motivos:

1. a reescrita via `eapToPersisted` não terminou e ela não passou o clone-teste;
2. **a sombra já está preenchida** — reaplicar encontraria
   `item_type_antes_congelar IS NULL` em lugar nenhum, pularia o passo da
   sombra, e faria o backfill a partir do estado atual. O registro do "antes"
   ficaria sendo o de hoje, não o original.

Aplicar migration inacabada sob pressão troca um defeito de tela por um
problema de dado.

## O que este incidente muda no processo

- **Toda conferência de migration passa a olhar o efeito.** "A coluna existe"
  nunca mais é resposta para "a migration foi aplicada".
- **Barreira que não executa não conta.** Se não roda no caminho normal e não
  derruba o processo, é documentação — útil, mas não é controle.
- **`deploys.md` precisa da `APP_VERSION` anotada no momento da publicação.**
  Este incidente custou a reversão imediata por causa de uma linha que ninguém
  escreveu em 26/08.

