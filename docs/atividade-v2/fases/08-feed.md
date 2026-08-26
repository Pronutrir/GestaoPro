# 08 - Feed de atividade com sino  (era Fase 5)

**Objetivo:** um fluxo unico no lugar de um chat.

**Depende de:** 07 (o feed vive na tela unica).

## Prompt

```
Transforme o painel lateral num feed unico, ordenado por tempo, com abas
Tudo / Conversa / Historico e um sino com o numero de eventos novos desde a
ultima visita do usuario aquela atividade.

O feed agrega quatro origens:
1. Comentarios e mencoes da propria atividade.
2. Mudancas de campo da propria atividade, com nome legivel do campo e os
   valores de origem e destino - nunca UUID, nunca enum em ingles, e o autor
   pelo nome com avatar.
3. Eventos das subatividades, prefixados com o codigo EAP da filha e
   clicaveis para abrir a filha.
4. Eventos de dependencia: predecessora concluida, predecessora atrasada,
   bloqueio criado ou liberado.

Persista a ultima leitura por usuario e atividade. Filtro por tipo de evento
e busca no texto. Agrupe eventos do mesmo autor no mesmo minuto.

Comece corrigindo o rendering do historico existente: hoje ele mostra
"Etapa: <uuid> -> <uuid>" e "Status: pending -> completed". Resolva os
rotulos na ORIGEM (quem grava o evento), nao com um de-para no componente -
o de-para so conserta a tela que o tem, e o proximo consumidor volta a
mostrar UUID.

RESPEITE A VISIBILIDADE. O feed agrega eventos de subatividades, e quem
chega por atribuicao nao enxerga as irmas. O feed nao pode ser a porta dos
fundos: filtre os eventos pelo mesmo escopoDeLeitura da fase 03, no BANCO,
nao no cliente. Um evento de irma invisivel nao pode aparecer nem como
"alguem alterou algo".

Ao paginar, cuidado com o teto: o filtro de permissao tem de vir ANTES do
limite, senao o contador conta o que a pessoa nao ve. Este projeto ja teve
esse defeito nas notificacoes (commit bd00832).
```

## Pronto quando

Concluir uma subatividade gera uma linha legivel no feed da atividade pai, o sino zera ao
abrir, e um usuario restrito nao ve no feed nenhuma linha de atividade que ele nao enxerga.

## Atencao

Uma fase com 30 filhas gera muito evento. O agrupamento por autor/minuto nao e enfeite -
sem ele o feed vira ruido no primeiro projeto grande.

---

## ESTADO EM 26/08/2026 — o que subiu, e o que NÃO subiu

### Subiu: o contador, sobre o que já existe

O sino conta duas fontes reais, sem tabela nova:

- `activity_comments` — a conversa da atividade
- `audit_log` — o histórico de mudanças

Com as três decisões que evitam o ruído: não conta o que a própria pessoa escreveu, devolve
zero quando nunca houve visita, e marca a visita ao **sair**, não ao entrar. 11 verificações
em `scripts/verificar-sino-do-feed.cjs`.

Também subiu o item que era defeito: o histórico parou de mostrar `Etapa: <uuid> → <uuid>` e
`Status: pending → completed` (commit `07bb759`).

### NÃO subiu: o item 3 — o feed que junta pai e filhas

**Isto não é um extra que ficou de fora.** Foi pedido textualmente na primeira conversa:

> *"todo o histórico da atividade e as regras entrelaçadas entre a atividade principal e suas
> subatividades"*

E os canvas de mockup mostraram isso. Então fica como **pendência declarada**, não como algo
que sumiu da lista.

**O que falta, concretamente:** agregar no feed do pai os eventos das subatividades,
prefixados com o código EAP da filha e clicáveis. Hoje o Registro lê só a própria atividade
(`activityId`), e a agregação exigiria consultar a subárvore.

**Por que pede uma tabela.** As duas fontes atuais não servem para agregar:

- `audit_log` guarda `record_id` por linha — dá para consultar por lista de ids, mas a lista
  cresce com a subárvore e esbarra no teto de ~3,7 KB da URL do proxy (usar `chunkedIn`);
- não há um lugar único que responda "o que aconteceu nesta subárvore, em ordem de tempo",
  com tipo de evento e autor já resolvidos.

Uma tabela `activity_events` — que **não existe** (conferido: zero ocorrências em `src/` e nas
210 migrations) — resolveria as duas coisas, e é o desenho que o prompt original pressupõe.

**E a restrição que ela precisa respeitar:** o feed agregado é uma porta de leitura. Quem entra
por atribuição não enxerga as irmãs, e o feed não pode ser o caminho lateral — nem como "alguém
alterou algo". O filtro tem de ser no **banco**, pelo mesmo `escopoDeLeitura` da P00. É a mesma
razão pela qual a `activity_breadcrumb` não carrega feed.

### Ao anunciar

Diga as duas metades: **"contador de conversa e histórico"** — que é verdade e funciona — e
**"o feed que junta pai e filhas ainda não"**. Anunciar só a primeira deixaria a impressão de
que o pedido foi atendido.
