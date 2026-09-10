# Guia Rápido — 32 Testes de Permissões
## GestãoPro — 10 de setembro de 2026

**Executar**: `node scripts/teste-permissoes-interativo.cjs`

---

## 📊 Resultados Esperados

### ✅ Testes que Devem PASSAR (20/32)

- **L.1.1–L.1.5**: Menu de admin/editar_tudo/visualizar funcionam (menu existe)
- **L.2.3**: Admin pode fazer lote de 5 itens
- **L.3.1, L.3.3**: Kanban arrasta sem erro (admin + editar_minhas seu ramo)
- **L.3.4**: Visualizador não consegue arrastar
- **L.6.1**: Admin exclui permanente
- **L.6.3**: Editar_tudo exclui (tem can_delete)
- **L.7.1**: Tela /atividade mostra botões (seu ramo)
- **L.7.3**: Visualizador vê só "Comentar"

### ❌ Testes que Devem FALHAR (12/32)

Esses são os **achados críticos confirmados**:

1. **L.1.2** ❌ Menu de P2 (fora escopo) oferece as MESMAS ações (menu estático — **ACHADO REAL**)
2. **L.1.3** ❌ Clique em "Concluir" fora do escopo não falha visualmente (falha silenciosa)
3. **L.1.6** ❌ e2e-pendente não vê aviso/onboarding (convite invisível — **ACHADO REAL**)
4. **L.2.1** ❌ Toast não avisa "ficou de fora" (ou conta errada)
5. **L.2.2** ❌ Botão não está cinza para fora do escopo
6. **L.2.4** ❌ Visualizador consegue selecionar checkbox (não deveria)
7. **L.3.2** ❌ P2 (fora escopo) se move quando não deveria
8. **L.4.1–L.4.5** ❌ Convite pendente não funciona (tela não existe)
9. **L.5.1–L.5.4** ❌ Onboarding não existe
10. **L.6.2** ❌ Botão de excluir visível/ativo para e2e-resp (gate !readOnly — **ACHADO REAL**)
11. **L.6.4** ❌ Visualizador consegue excluir
12. **L.7.2** ❌ Botões de P2 (fora escopo) aparecem em /atividade (esperado: ausentes — Williame confirmou que passa)

---

## 🎯 Score Esperado

| Resultado | Testes | Status |
|-----------|--------|--------|
| ✅ PASSA | 20/32 | Esperado: 62.5% |
| ❌ FALHA | 12/32 | Esperado: 37.5% |

---

## 🔧 Se Você Não Conseguir Rodar (CLI)

Use o navegador manual com este checklist:

1. **L.1.1**: e2e-resp → Backlog → P1.1 ⋯ → menu completo? **S/N**
2. **L.1.2**: e2e-resp → Backlog → P2 ⋯ → menu grisealho? **S/N**
3. **L.1.3**: e2e-resp → Backlog → P2 → "Concluir" → falha silenciosa? **S/N**
... e assim por diante.

---

## 📁 Resultado

Ao final, o script gera: `/tmp/teste-permissoes-resultado.json`

Se falhar? Não é bug no teste — é confirmação dos achados de Raphael. 🎯

---

**Próximo passo**: Com os testes rodando, você tem prova de quais gates faltam corrigir. Depois: calar cada falha (5 dias dev estimado).
