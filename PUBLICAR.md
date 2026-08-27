# Para publicar — 27/08/2026

> Um comando, numa máquina com Docker. Tudo o mais já está pronto e enviado.

---

## O comando

```bash
git pull
PGPASSWORD=<a senha do banco> ./scripts/publicar-com-migrations.sh 2026-08-27-03
```

**Commit a publicar:** `ed8cfc8` (ou mais recente em `fix/correcoes_2`)

O script faz, nesta ordem, e **para sozinho** se algo reprovar:

```
1. aplica 20260827150000  (não-lido do feed)     → confere o EFEITO → para se reprovar
2. aplica 20260827160000  (incluir e atribuir)   → confere o EFEITO → para se reprovar
3. build + push + subir na VM
4. mostra a data no ar, pela MAIOR entre os chunks
5. imprime a linha pronta para colar em docs/deploys.md
```

---

## As três travas, e por que existem

**1 · A conferência pergunta o EFEITO, não o artefato.**

O congelamento *"rodou"* e parou no meio: criou a coluna sombra e não escreveu o
backfill. Ninguém percebeu por dias, porque toda conferência perguntava *"a
coluna existe?"* — e ela existia.

Agora a pergunta é *"existe linha com `item_type='entrega'`?"*. Zero denuncia.

**2 · A data vem da maior entre os chunks, nunca do webpack.**

O chunk do webpack é estável entre builds: se o conteúdo não muda, ele conserva
o mtime do build **anterior**. Quem olhasse só para ele concluiria que nada
subiu, num deploy que subiu.

**3 · O registro em `deploys.md` vem antes do aviso.**

A data se descobre de fora pelo ETag. O **commit**, não — só o que estiver
escrito. Sem essa linha, em uma semana ninguém sabe o que está no ar.

---

## `PULAR_BARREIRA=1` — necessário, e a razão

A barreira exige o backfill do congelamento, que **não rodou** (estado B). Ela
está certa em barrar.

Nada desta leva depende dele: o que sobe é código mais as duas migrations
acima. **Anote no `deploys.md` que a barreira foi pulada e por quê** — senão a
próxima pessoa a ver isso no histórico não saberá se foi decisão ou descuido.

---

## O que vai ao ar

| | |
|---|---|
| **Fase C** | a tela da atividade: feed ligado, descrição rica (lista de conferência, link, @menção), rota de criar com "Criar e continuar criando", lição aprendida, incluir-e-atribuir |
| **Fase E2** | a dedução por nível saiu — **67 folhas presas viram cartão** |
| **Fase A** | os 68 (já aplicada no banco; foi a E2 que a fez valer na tela) |
| **Fase B** | coluna Situação, chip "No quadro", faixa "N de M", rodapé corrigido |

**460 asserções, 0 falhas.** `tsc` limpo. `next build` compila.

---

## Depois de publicar

As **sete conferências** de [`docs/ORDEM-DE-PUBLICACAO.md`](docs/ORDEM-DE-PUBLICACAO.md),
com uma segunda pessoa que **não** seja administrador — metade destas mudanças
é sobre o que cada um enxerga, e uma conta de administrador vê tudo.

Duas mudaram de expectativa nesta leva e agora **devem passar**:

- a **2** (fase e pacote são faixa) — a dedução por nível saiu;
- a **6** (criar subatividade) — não depende mais do backfill.

---

## O que continua fora

- **a congelar retomável** — o banco está no estado B; o requisito está em
  [`docs/FILA-DE-TRABALHO.md`](docs/FILA-DE-TRABALHO.md) §3.0, e o comando pede
  para parar antes de aplicar;
- **os 771** — decisão pendente, medida e registrada;
- **a Fase F** (segunda onda) — só depois da validação de A–D no ar.
