# Relatório da fila — 26/08/2026

Estado de cada etapa. **"Pronto" e "no ar" são coisas diferentes**, e este relatório
mantém a distinção em todas as linhas. Nada aqui está publicado: a fila inteira foi
executada numa máquina **sem Docker**, que por definição não consegue publicar.

| Etapa | Estado |
|---|---|
| 0 — publicação | **feito** |
| 1 — build e pendentes | **feito** |
| 2 — fase 09 nas telas | *em andamento* |
| 3 — tela do backlog (fase 06) | *não iniciada* |
| 4 — tela da atividade (fase 07) | *não iniciada* |
| 5 — fase 05, `activity_assignees` | *não iniciada* |
| 6 — fase 08, eventos no feed | *não iniciada* |
| 7 — P00 | *não aplicar, por instrução* |

---

## ETAPA 0 — publicação · **FEITO**

Escrito: **`docs/DEPLOY.md`**. Commit `783e259`.

**O achado:** não existe automação nenhuma. `.github/` tem só
`copilot-instructions.md` — nenhum workflow. Sem `.gitlab-ci.yml`, `Jenkinsfile`,
`vercel.json`, `netlify.toml`, `fly.toml`, `Procfile`. **`git push` não publica nada.**

Publicar são cinco passos manuais: push → `scripts/build-prod.sh <versão>` → `docker push`
→ `docker compose -f docker-compose.prod.yml up -d app` na VM → `apply-*.sh` para as
migrations.

**O que o Raphael vai ver:** nada na tela. É documento.

### Commit em produção hoje

**Não é determinável pelo código** — e isso é um problema por si. A página servida é
renderizada no servidor e não expõe `buildId`; a resposta HTTP não traz o label da imagem.

| | |
|---|---|
| Último deploy documentado | 20/08/2026, commit `71e2689`, imagem `2026-08-20-01` |
| Commits desde então | **72** |
| `APP_VERSION` no `.env` local | `v2026-07-21-00` — de julho, sem relação com a VM |

### Depende de uma pessoa

1. **Qual `APP_VERSION` roda agora?** Só `docker compose -f docker-compose.prod.yml ps` na
   VM responde. Sem isso não se sabe quais dos 72 commits já estão no ar.
2. **Em qual máquina o build roda?** O runbook diz "onde houver Docker" e registra que
   **não é a de desenvolvimento** — mas não diz qual é. Sem essa resposta ninguém publica.
3. **Quem tem credencial** do registry `pronutrir/gestaopro` e acesso SSH a
   `20.65.208.119`?
4. **`pronutrir/gestaopro` é Docker Hub ou registry privado?** Muda o `docker login`.
5. **Existe homologação?** Nada no repositório sugere que sim. Se não existe, toda mudança
   estreia em produção.

---

## ETAPA 1 — build · **FEITO**

```
✓ Compiled successfully in 12.4s
✓ Checking validity of types
✓ Generating static pages (50/50)
```

Sem erro, sem type error. Único aviso: `caniuse-lite` com 14 meses — cosmético, não afeta
o bundle.

**Publicar não foi possível, e não é falta de tentativa:** `docker` não existe nesta
máquina (conferido). Os passos 2 a 4 do `docs/DEPLOY.md` precisam rodar onde há Docker.

### As oito correções que aparecem na tela depois de publicado

Estas são de **código puro** — valem assim que a imagem subir, sem depender de migration.

| # | O que muda | Onde conferir |
|---|---|---|
| 1 | **A lixeira parou de mentir.** "Excluir permanentemente" não checava permissão nem lia a resposta do banco; a RLS recusava e a tela dizia *"excluída permanentemente!"* | Entre com alguém que **não** gerencia o projeto → lixeira do backlog → excluir permanentemente. Deve dizer **"Sem permissão"**. |
| 2 | **O marco não volta ao Kanban.** Apareciam recuados sob a fase, travados, com selo de coluna. Foi o defeito que abriu a sessão. | Projeto com marcos (as NF-e de prefeitura). No quadro **nenhum marco** aparece — nem como card, nem aninhado. Seguem no Backlog e no Cronograma. |
| 3 | **O histórico parou de mostrar UUID.** Era `Etapa: 4533f517-… → 983f39d9-…` | Mova uma atividade de coluna → aba **Histórico**. Deve dizer `Etapa: Não iniciado → Em Andamento`. UUID desconhecido vira `—`. |
| 4 | **O campo de participantes diz o que concede.** A aba se chamava "Equipe" e o campo "Equipe do Projeto" — nenhum dizia que participante **edita**. | Atividade → aba **Participantes**. Diz *"Trabalham junto nesta atividade e também podem editá-la"*. Quem não é da equipe aparece **desabilitado com o motivo**, não some. |
| 5 | **O GUT mostra o número e só colore a partir de 60.** Antes só o rótulo, colorido em toda faixa. | Kanban: o selo mostra 1–125. Abaixo de 60 cinza, 60–99 âmbar, 100+ vermelho. Sem avaliação: *"Prioridade não avaliada"*. |
| 6 | **Quem criou a atividade consegue movê-la.** O front recusava enquanto o banco aceitava — front mais restritivo que o banco. | Crie uma atividade sem se pôr como responsável e mova em lote no backlog. Deve funcionar. |
| 7 | **O sino no Registro.** | Peça um comentário numa atividade sua. A aba **Conversa** mostra contador — que **não** conta o que você mesmo escreveu, e não aparece na primeira visita. |
| 8 | **A rota da atividade.** | `/project/<id>/atividade/<id>` abre a atividade sobre a visão do projeto. F5 mantém, voltar fecha. |
