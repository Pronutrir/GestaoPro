# Commitado e não publicado — 28/08/2026

> A lista para quem publica. Conferida contra o banco e o repositório.

---

## Os dois pontos

| | |
|---|---|
| **no ar** (build 27/08 15:55) | `a46e25e` |
| **HEAD** hoje | `c6d9646` |
| commits entre os dois | **16** |

---

## O que cada commit muda na tela

Em ordem. Os `docs(...)` não mudam nada visível e estão marcados.

| # | commit | o que muda na tela |
|---|---|---|
| 1 | `af065d7` | **a atividade ganha trilha** `1 › 1.1 › 1.1.1`, as subatividades aparecem no corpo, responsáveis no **plural**, e Previsto/Realizado lado a lado. "Conversa da atividade" vira **"O que andou"** |
| 2 | `bf45818` | *(medição — nada na tela)* |
| 3 | `2516fac` | **67 itens presos passam a aparecer como cartão** no quadro. É o maior efeito visível da leva |
| 4 | `dd58c9b` | *(varredura — nada na tela)* |
| 5 | `ad38feb` | *(migration escrita, depois descartada — nada na tela)* |
| 6 | `508d537` | *(documento — nada na tela)* |
| 7 | `adcc828` | **a tela da atividade em rota própria**: descrição com lista de conferência/link/@menção, rota de criar com "Criar e continuar criando", lição aprendida |
| 8 | `a4c2b8d` | o feed passa a ler a view que já existia — **eventos das subatividades aparecem no feed do pai** |
| 9 | `ed8cfc8` | *(script de publicação — nada na tela)* |
| 10 | `208eefe` | *(documento — nada na tela)* |
| 11 | `c6617af` | **erro do banco em português**: `"usuario 0eb3047e-…"` vira *"Fulano não está na equipe de X. Inclua na equipe para poder atribuir."* Mais o diálogo **Incluir e atribuir** |
| 12 | `1c45c04` | *(diagnóstico — nada na tela)* |
| 13 | `ac24f7d` | *(correção de medição — nada na tela)* |
| 14 | `6f2883c` | *(documento — nada na tela)* |
| 15 | `e127ce4` | **a fase para de aparecer duas vezes no Cronograma** — 60 duplicatas somem em 10 projetos |
| 16 | `c6d9646` | *(prova da desduplicação — nada na tela)* |

**Seis commits mudam a tela:** 1, 3, 7, 8, 11 e 15.

---

## As duas migrations, e elas vêm ANTES do build

Conferido pelo **esquema**, não pela tabela de controle:

```
activity_feed_visitas   (20260827150000)  →  HTTP 404   NÃO aplicada
incluir_e_atribuir      (20260827160000)  →  PGRST202   NÃO existe
```

Sem elas, dois recursos do commit 11 quebram: o contador de não-lidos do sino e
o diálogo "Incluir e atribuir".

---

## O comando

```bash
git pull
PGPASSWORD=<senha> ./scripts/publicar-com-migrations.sh 2026-08-28-01
```

O script aplica as duas migrations **uma a uma**, confere o **efeito** entre
elas, e **para sozinho** se alguma reprovar. Só então o build.

Detalhes e as três travas em [`PUBLICAR.md`](../PUBLICAR.md).

---

## O que NÃO entra

- **a congelar retomável** — o banco está no estado B; o requisito está em
  [`FILA-DE-TRABALHO.md`](FILA-DE-TRABALHO.md) §3.0;
- **os 771** — decisão pendente, medida e registrada;
- **a cor por data** — acabou de entrar na fila (§7);
- **as 178 folhas gravadas como `fase`** — ver abaixo.

### As 178, e por que não são urgentes

São folhas com `item_type='fase'` que **nunca estiveram no quadro**. Como não
foram promovidas, não somem de lugar nenhum — aparecem como Fase no backlog, o
que é impreciso mas não esconde trabalho.

Os 68 do grupo B eram diferentes: estavam **no quadro**, e ali o rótulo errado
significava não virar cartão. Por isso foram alvo, e as 178 não.
