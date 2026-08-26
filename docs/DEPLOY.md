# Como o código chega em produção

> Levantado em **26/08/2026** varrendo o repositório inteiro: `Dockerfile`,
> `docker-compose*.yml`, `.github/`, `scripts/`, `package.json`, `README.md`.
>
> **Isto descreve o que está no repositório, não o que acontece de fato.** Ninguém
> confirmou este roteiro; ele foi reconstruído a partir dos arquivos e de um runbook de
> 20/08. As perguntas que só uma pessoa responde estão no fim, e são as que importam.

---

## O resumo

**Publicação é manual, do começo ao fim. Não existe automação.**

- **Não há CI/CD.** `.github/` contém **só** `copilot-instructions.md` — nenhum workflow.
  Não há `.gitlab-ci.yml`, `Jenkinsfile`, `vercel.json`, `netlify.toml`, `Procfile`,
  `fly.toml`. Nada observa a branch, nada dispara com push ou merge.
- **`git push` não publica nada.** Enviar código ao remoto e pôr no ar são dois atos
  separados, e o segundo é sempre alguém digitando comandos.
- **A máquina de desenvolvimento não tem Docker** — reconfirmado em 26/08. Quem
  desenvolve **não consegue** gerar a imagem. O build roda em outro lugar.

---

## Os cinco passos

### 1. Enviar o código

```bash
git push origin fix/correcoes_2
```

Separado de propósito: neste projeto o push só acontece quando pedido. O runbook de 20/08
registra o custo de esquecer — o `git pull` do build traria a EAP com o defeito de 6.000px
porque dois commits tinham ficado só na máquina local.

### 2. Construir a imagem — onde houver Docker

```bash
git pull
./scripts/build-prod.sh 2026-08-26-01     # a versao vai EXPLICITA
```

`scripts/build-prod.sh` lê `.env.prod` (fora do git) e roda `docker build` com
`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` como build args.

**Duas armadilhas, as duas já com defesa no script:**

- **As `NEXT_PUBLIC_*` são embutidas no bundle durante o build**, não lidas em runtime.
  Erradas aqui, o sintoma em produção é tela branca. O `Dockerfile` **falha de propósito**
  se vierem vazias.
- **Sempre passe a versão.** O padrão embutido é `2026-07-12-01`, de julho. Rodar sem
  argumento sobrescreve uma imagem antiga com conteúdo novo, e `APP_VERSION` deixa de
  dizer o que está no ar.

### 3. Publicar a imagem

```bash
docker push pronutrir/gestaopro:2026-08-26-01
```

### 4. Trocar o contêiner na VM

```bash
# na VM — 20.65.208.119, conforme o runbook de 20/08
export APP_VERSION=2026-08-26-01
docker compose -f docker-compose.prod.yml pull app
docker compose -f docker-compose.prod.yml up -d app
docker compose -f docker-compose.prod.yml ps     # confirmar a versao no label
```

`docker-compose.prod.yml` **não constrói** — só puxa `pronutrir/gestaopro:${APP_VERSION}`.
Sobem dois serviços: `app` (Next.js standalone, porta 8080) e `proxy` (nginx). A rede
`gestaopro-net` é externa e compartilhada com o stack do Supabase — precisa existir antes
(`docker network create gestaopro-net`).

### 5. As migrations, à parte

**Migrations não vão junto com a imagem.** São scripts `scripts/apply-*.sh` rodados à mão
na VM, com `PGPASSWORD` exportado, cada um via `docker exec` no contêiner `supabase-db-1`.

Ordem importa. Cada script imprime números **antes**, pede confirmação, e imprime **depois**.

### Voltar atrás

```bash
export APP_VERSION=<versao anterior>
docker compose -f docker-compose.prod.yml up -d app
```

A imagem volta. **As migrations não.** A reversão de cada uma está no cabeçalho do `.sql`
— quando existe; algumas não têm.

---

## O que está no ar hoje

**Não foi possível determinar pelo código.** A página servida é renderizada no servidor e
não expõe `buildId` nem versão; a resposta HTTP não traz o label da imagem. Quem sabe é
`docker compose -f docker-compose.prod.yml ps` **na VM**.

O que dá para afirmar do repositório:

| | |
|---|---|
| Último deploy documentado | **20/08/2026**, commit `71e2689`, imagem `2026-08-20-01` |
| Commits desde então | **72** |
| `APP_VERSION` no `.env` local | `v2026-07-21-00` — de julho, **provavelmente desatualizado** e sem relação com o que roda na VM |

Se `71e2689` for mesmo o que está no ar, **72 commits nunca foram publicados** — entre eles
tudo o que esta sessão produziu.

---

## As duas camadas, e por que confundi-las custa caro

| | Como muda | Efeito de errar |
|---|---|---|
| **Aplicação** | imagem nova + `up -d` | volta trocando `APP_VERSION` |
| **Banco** | `apply-*.sh` na VM, à mão | pode não ter volta |

Um `✓` no repositório significa *"o código existe"*. **Nunca** *"está no ar"*.

---

## Perguntas que só uma pessoa responde

1. **Qual `APP_VERSION` está rodando agora?** Só `docker compose ps` na VM diz. Sem isso,
   não se sabe quais dos 72 commits os usuários já veem.
2. **Em qual máquina o build roda?** O runbook diz "onde houver Docker" e registra que não
   é a de desenvolvimento — mas não diz qual é. Sem essa resposta, ninguém consegue publicar.
3. **Quem tem acesso à VM e ao registry?** O `docker push` exige credencial de
   `pronutrir/gestaopro`; o passo 4 exige acesso SSH a 20.65.208.119.
4. **`pronutrir/gestaopro` é Docker Hub ou registry privado?** Muda o `docker login`.
5. **Existe ambiente de homologação?** Nada no repositório sugere que sim. Se não existe,
   toda mudança estreia em produção — e é o contexto que torna o passo 5 de verificação a
   única rede de proteção.
6. **Quem confirma que subiu?** O runbook de 20/08 lista verificações na tela e nomeia
   quem testa (o Guilherme edita uma atividade). Não há monitoramento automático.
