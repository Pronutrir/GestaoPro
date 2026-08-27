# O que falta — atualizado 27/08/2026, fim do dia

> Conferido no banco e no código. 431 asserções, 0 falhas. `next build` compila.

---

## O que fechou hoje, à noite

| fase | estado |
|---|---|
| **A** · destravar o quadro | ✅ os 68 viram cartão (68 de 68) |
| **B** · terminar o backlog | ✅ faixa, chip, derivação por coluna, rodapé |
| **E2** · dedução por nível | ✅ **aplicada** — foi ela que destravou a A |
| **E4** · promover agrupador | ✅ recusado, com a mensagem |
| **E5** · subCount + caronas | ✅ fora do menu; 13 + 6 leitores varridos |
| **D** · feed da atividade | ✅ escrito — migration **não aplicada** |

### A cirurgia do nível foi o que destravou tudo

A Fase A já estava aplicada no banco e **a prova falhava**: 1 de 68 virava
cartão. `resolveEapKind` decidia por posição antes de olhar o campo.

Removido o bloco, medido antes: 448 itens mudam de papel, **67 deixam de ser
agrupador**, e o risco estrutural é **zero** (nenhum pai vira folha). A prova
agora passa: **68 de 68**.

---

## O que falta

### 1 · Publicar — e agora há migration

Diferente das levas anteriores: a Fase D **tem migration**, e ela vem antes do
código que a lê.

```bash
# 1º  a migration do feed
docker cp supabase/migrations/20260827150000_feed_da_atividade.sql supabase-db-1:/tmp/f.sql
docker exec -e PGPASSWORD=... -i supabase-db-1 psql -U supabase_admin -d postgres -f /tmp/f.sql

# 2º  o build
git pull && ./scripts/publicar-2026-08-27-02.sh
```

### 2 · A tela da atividade — o que falta nela

- **o feed ligado à tabela nova** — o módulo de leitura existe; a coluna do sino
  ainda recebe `[]`;
- **descrição rica** — lista de conferência, link e @menção;
- **estado "criar"** acionado por rota;
- **incluir quem está fora da equipe** (seção 08);
- **lição aprendida** — formulário de 4 campos.

### 3 · A congelar retomável (E1)

O banco está no **estado B**. O requisito está em `FILA-DE-TRABALHO.md` §3.0.
**PARE antes de aplicar** — é o que o comando pede.

### 4 · Os 771 (E3)

Decisão pendente, medida e registrada. **Não fazer sem pedido.**

### 5 · Promover pacote traz as atividades (E4, versão boa)

Hoje **recusa**, com a mensagem — que era o exigido enquanto a versão boa não
existe.

### 6 · Fase F — a segunda onda

`docs/projeto-v2/`. **Não começar** antes de o Raphael validar A–D no ar.

---

## Esperando pessoas

- **quem publica** — a migration do feed e o build;
- **qual perfil do Williame** — ~450 atividades;
- **a conversa sobre a P00**;
- **as seções 05, 06 e 08** do desenho.
