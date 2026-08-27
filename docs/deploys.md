# Registro de deploys

> Uma linha por publicação. **Anote no momento em que publicar** — é a única
> coisa que responde "qual commit está no ar" depois, e nenhuma investigação
> técnica substitui.
>
> A **data** dá para descobrir de fora a qualquer momento
> (`node scripts/data-do-build-no-ar.cjs`, que decodifica o ETag). O **commit**,
> não: só o que estiver escrito aqui.

| data/hora (Fortaleza) | APP_VERSION | commit | quem publicou | o que entrou |
|---|---|---|---|---|
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
