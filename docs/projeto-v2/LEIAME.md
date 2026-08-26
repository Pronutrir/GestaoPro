# Projeto v2 — kit de execução

Segunda onda. **Rode depois do Atividade v2**, ou pelo menos depois da fase 03 dele
(camada de acesso) — várias fases daqui consultam as capacidades de lá.

> **ANTES DE TUDO, LEIA:** `docs/projeto-v2/DIVERGENCIAS.md`. O furo de visibilidade que este
> kit levanta na fase 03 do kit anterior **foi confirmado no código** — e é maior do que o
> texto do kit sugere. Não é só a consulta de Pendências: a própria policy do banco concede
> o projeto inteiro a quem entra por atribuição.

```
docs/projeto-v2/
├── CONTEXTO.md      → anexado ao CLAUDE.md da raiz
├── DIVERGENCIAS.md  → o que foi conferido no código
├── LEIAME.md        → este arquivo
└── fases/           → P01 a P13, na ordem de execução
```

## As três ondas

| Onda | Fases | Prazo | Risco | O que muda no dia seguinte |
|---|---|---|---|---|
| **1 · Parar de mentir** | P01–P04 | dias | baixo | O cronograma para de contar fase duplicada e o painel para de dizer que está tudo em ordem |
| **2 · Passar a medir** | P05–P08 | semanas | médio | Margem por projeto passa a existir; atraso deixa de ser opinião |
| **3 · Ligar e repetir** | P09–P13 | trimestre | médio | Projeto novo começa em minutos; o trabalho para de nascer no WhatsApp |

Cada onda entrega sozinha. Se parar depois da primeira, o que foi feito continua servindo.

## Antes de começar

1. **O furo de visibilidade é P00, não um item da P01.** Ver `DIVERGENCIAS.md` — a correção
   passa por migration, não só por ajuste de consulta.
2. **Não pule a P01.** Ela só lê. Tudo aqui descreve o alvo; o repositório é a verdade.
3. **As migrations do Atividade v2 ainda não foram aplicadas.** Quatro scripts pendentes na
   VM (ver `docs/atividade-v2/LEIAME.md`). Várias fases daqui dependem delas — sobretudo a
   P05 e a P06, que copiam a derivação no servidor da fase 09.

## O que ainda é decisão sua

1. **Projetos em andamento nascem sem linha de base?** A recomendação é sim: mostram
   "sem base" até alguém aprovar o TAP. Aprovar retroativamente cria um compromisso que
   ninguém decidiu.
2. **Qual a taxa por pessoa?** Por pessoa, por papel, ou por projeto. A P05 assume por
   pessoa com sobrescrita por projeto — confirme antes.
3. **Relatórios e Indicadores Lab ficam?** Ficaram sem resposta. Se saírem, entram na P04.
