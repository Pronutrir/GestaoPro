# 🎯 Plano de Execução — 32 Testes de Permissões
## GestãoPro | Para execução por agente externo
## 10 de setembro de 2026

---

## 📌 BRIEFING EXECUTIVO

**Objetivo**: Validar 32 testes de permissões em GestãoPro (sistema de gerenciamento de projetos).

**Resultado esperado**: 
- ✅ 20 testes PASSAM (62.5%)
- ❌ 12 testes FALHAM (37.5%) — **isso é ESPERADO e CORRETO**

As 12 falhas confirmam 4 achados críticos de segurança já documentados.

**Tempo estimado**: 45–90 minutos (32 testes × ~2 min cada)

**Formato**: Manual navegação + resposta S/N (não automação)

---

## 🔐 CREDENCIAIS & AMBIENTE

### Acesso
- **URL**: https://gestaopro.pronutrir.com.br
- **Projeto**: cbca8b9c-279b-4aba-adc8-e6fb5cfedef0
- **Tipo de login**: Direto (sem e-mail). Tela de senha.

### Senha Única (Todas as 7 Contas)
```
E2eTeste!2026#Acesso
```

### Contas de Teste (7 ao todo)

| # | Conta | Email | Perfil | Responsável por | Usar em Testes |
|---|-------|-------|--------|---|---|
| 1 | `e2e-resp` | e2e-resp@e2e.local | Editar minhas (can_edit_own) | P1, P2.1, Subat. A | L.1.1, L.1.2, L.2, L.3, L.7 |
| 2 | `e2e-del` | e2e-del@e2e.local | Criar e excluir | P2 | L.1.4, L.2.3, L.5, L.6.1 |
| 3 | `e2e-tudo` | e2e-tudo@e2e.local | Editar tudo | Atividade Solta | L.1.4, L.2.3, L.3.3, L.6.3 |
| 4 | `e2e-ver` | e2e-ver@e2e.local | Visualizar e comentar | — | L.1.5, L.2.4, L.3.4, L.6.4, L.7.3 |
| 5 | `e2e-part` | e2e-part@e2e.local | Participante (não responsável) | Subat. B (part) | L.3.2 (opcional) |
| 6 | `e2e-fora` | e2e-fora@e2e.local | Fora da equipe | — | — (opcional, não enxerga projeto) |
| 7 | `e2e-pendente` | e2e-pendente@e2e.local | Convite Pendente (NEW) | N/A | L.1.6, L.4, L.5 |

---

## 📍 IDs DE ATIVIDADES

Copie esses links para abrir rapidamente:

| Atividade | ID | Link Direto |
|-----------|-----|-----|
| P1 | `53c268f6-27a9-4a02-b783-ffb2350a6879` | https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/53c268f6-27a9-4a02-b783-ffb2350a6879 |
| P1.1 | `7002e389-1c18-433b-b4a0-2fb397da653e` | https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/7002e389-1c18-433b-b4a0-2fb397da653e |
| P2 | `9ef6d99c-8e3d-4908-8b57-57cdc3670d57` | https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/9ef6d99c-8e3d-4908-8b57-57cdc3670d57 |
| P2.1 | `7f6728e2-08a2-4d63-9d74-730f4b227ea5` | https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/7f6728e2-08a2-4d63-9d74-730f4b227ea5 |
| Subatividade B | `4772bf00-f125-4a83-abc6-d06b6d16610d` | https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/4772bf00-f125-4a83-abc6-d06b6d16610d |

---

## 🧪 PLANO DE TESTE (32 Itens em 7 Blocos)

### **BLOCO L.1: Backlog Menu ⋯ (Controle de Permissão) — 6 testes**

| # | Conta | Ação | Resultado Esperado | S/N | Notas |
|---|-------|------|---|---|---|
| **L.1.1** | e2e-resp | Abra Backlog. Localize P1.1 (seu ramo). Clique ⋯ (três pontos). | Menu oferece: Concluir · Adicionar · Editar · Abrir · Mover · Arquivar **nenhum grisealho** | ? | Se falhar: menu oferece ações mesmo dentro do escopo? |
| **L.1.2** | e2e-resp | Abra Backlog. Localize P2 (fora do seu ramo). Clique ⋯. | Menu oferece **Arquivar e Mover grisealhos/desabilitados** ou ações diferentes | ? | **ESPERA FALHAR** — menu é estático, não respeita escopo |
| **L.1.3** | e2e-resp | Clique "Concluir tarefa" em P2 (fora escopo). | Zero requisições, zero mensagem, nada muda no banco | ? | Clique aparece, mas falha silenciosamente → UI quebrada, segurança ok |
| **L.1.4** | e2e-tudo | Logout. Logue como e2e-tudo. Abra Backlog. Clique ⋯ em qualquer atividade. | Menu completo, **nenhuma ação grisealha** | ? | Admin consegue tudo |
| **L.1.5** | e2e-ver | Logout. Logue como e2e-ver. Abra Backlog. Clique ⋯. | Menu vazio ou só "Comentar" (sem Concluir, Editar, Mover, Arquivar) | ? | Visualizador só comenta |
| **L.1.6** | e2e-pendente | Logout. Tente logar como e2e-pendente. | Redireciona para onboarding OU exibe "Convite pendente — clique para aceitar" | ? | **ESPERA FALHAR** — convite invisível hoje |

---

### **BLOCO L.2: Backlog Lote com Permissão — 4 testes**

| # | Conta | Ação | Resultado Esperado | S/N | Notas |
|---|-------|------|---|---|---|
| **L.2.1** | e2e-resp | Abra Backlog. Marque checkbox P1.1 (seu) + P2 (fora). Clique "Mudar Status". | Toast: **"1 atualizada · 1 ficou de fora — sem permissão"** (P2 rejeitada silenciosamente) | ? | **ESPERA FALHAR** — lote oferece ação mesmo sem permissão |
| **L.2.2** | e2e-resp | Marque checkbox Atividade Solta (resp=e2e-tudo). Tente "Arquivar". | Bloqueado: botão cinza/ausente OU toast "Sem permissão sobre seleção" | ? | Resp não consegue arquivar atividade de outro |
| **L.2.3** | e2e-tudo | Logout. Logue como e2e-tudo. Marque todas as atividades (lote). Clique "Arquivar". | Toast: **"5 atualizadas"** (todas arquivadas) | ? | Admin consegue arquivar tudo |
| **L.2.4** | e2e-ver | Logout. Logue como e2e-ver. Tente marcar checkbox em qualquer atividade. | Checkboxes não aparecem ou estão desabilitados | ? | Visualizador não seleciona |

---

### **BLOCO L.3: Kanban Arrasto com Permissão — 4 testes**

| # | Conta | Ação | Resultado Esperado | S/N | Notas |
|---|-------|------|---|---|---|
| **L.3.1** | e2e-resp | Logout. Logue como e2e-resp. Abra Kanban. Arraste card P1.1 entre colunas. | Move sem erro. Pai (P1) acompanha coluna. Toast "Movida para...". | ? | Resp consegue mover seu card |
| **L.3.2** | e2e-resp | Tente arrastar P2 (fora escopo) entre colunas. | Bloqueado (animação de rejeição) OU move + reverte automaticamente | ? | **ESPERA FALHAR OU PASSAR** — depende de gate no drag handler |
| **L.3.3** | e2e-tudo | Logout. Logue como e2e-tudo. Arraste qualquer card entre colunas. | Move livremente | ? | Admin consegue tudo |
| **L.3.4** | e2e-ver | Logout. Logue como e2e-ver. Tente arrastar qualquer card. | Cards não são draggable. Cursor não muda. Arrasto não funciona. | ? | Visualizador não arrasta |

---

### **BLOCO L.4: Convite Pendente (Estado Novo) — 5 testes**

| # | Conta | Ação | Resultado Esperado | S/N | Notas |
|---|-------|------|---|---|---|
| **L.4.1** | e2e-pendente | Logout. Tente logar como e2e-pendente. | Redireciona para tela de onboarding OU exibe aviso "Você foi convidado para Projeto X — [Aceitar] [Recusar]" | ? | **ESPERA FALHAR** — tela de onboarding não existe |
| **L.4.2** | e2e-pendente | Se houver botão "Aceitar", clique nele. | Aceita convite, redireciona para dashboard, login completo (consegue ver projeto) | ? | **ESPERA FALHAR** — fluxo não implementado |
| **L.4.3** | e2e-pendente | Se não aceitou, tente acessar diretamente /project/cbca8b9c (copie URL de outra aba). | Bloqueado com HTTP 403 OU redireciona para tela de convite | ? | Sem aceitar = sem acesso |
| **L.4.4** | e2e-pendente | (Se conseguir acessar Backlog) Abra Backlog. | Menu vazio OU aviso "Convite pendente" | ? | Convite pendente não trabalha |
| **L.4.5** | e2e-pendente | (Se conseguir acessar Kanban) Abra Kanban. | Sem cards visíveis OU aviso "Convite pendente" | ? | Convite pendente não trabalha |

---

### **BLOCO L.5: Onboarding (Aceitar/Recusar Convite) — 4 testes**

| # | Conta | Ação | Resultado Esperado | S/N | Notas |
|---|-------|------|---|---|---|
| **L.5.1** | e2e-pendente | (Continuando de L.4.1) Tela de convite deve exibir. | Nome do projeto, descrição curta, [Aceitar] [Recusar] dois botões | ? | **ESPERA FALHAR** — tela não existe |
| **L.5.2** | e2e-pendente | Clique em "Aceitar". | Redireciona para dashboard/projeto. Sessão atualizada. | ? | **ESPERA FALHAR** |
| **L.5.3** | e2e-pendente | Atualize página (F5). | Continua logado (sessão persistida). Não volta para convite. | ? | **ESPERA FALHAR** |
| **L.5.4** | e2e-pendente | Clique "Recusar" (ou logout + re-convidar). | Logout do convite. Usuário fica bloqueado ou removido da equipe. | ? | **ESPERA FALHAR** |

---

### **BLOCO L.6: Lixeira Excluir Permanente (Permissão) — 4 testes**

| # | Conta | Ação | Resultado Esperado | S/N | Notas |
|---|-------|------|---|---|---|
| **L.6.1** | e2e-del | Logout. Logue como e2e-del. Abra Lixeira. Localize um item. Clique "Excluir permanente". | Item excluído do banco permanentemente (não aparece mais) | ? | Admin consegue excluir |
| **L.6.2** | e2e-resp | Logout. Logue como e2e-resp. Abra Lixeira. Procure botão "Excluir permanente". | Botão ausente, cinza ou desabilitado (não consegue excluir) | ? | **ESPERA FALHAR** — gate é !readOnly, não can_delete |
| **L.6.3** | e2e-tudo | Logout. Logue como e2e-tudo. Abra Lixeira. | Botão "Excluir permanente" visível e ativo (consegue excluir) | ? | Editar_tudo = pode excluir? Verificar. |
| **L.6.4** | e2e-ver | Logout. Logue como e2e-ver. Abra Lixeira. | Sem botão de excluir (visualizador só vê, não age) | ? | Visualizador não exclui |

---

### **BLOCO L.7: Tela /atividade/:id (Validação Anterior) — 4 testes**

| # | Conta | Ação | Resultado Esperado | S/N | Notas |
|---|-------|------|---|---|---|
| **L.7.1** | e2e-resp | Logout. Logue como e2e-resp. Abra Backlog. Clique em P1.1 (seu ramo). | Tela /atividade exibe botões: Editar, Concluir, Mover, Arquivar (todos habilitados) | ? | **ESPERA PASSAR** — validado antes |
| **L.7.2** | e2e-resp | Volte ao Backlog. Clique em P2 (fora do seu ramo). | Tela /atividade: botões Editar, Concluir, Mover, Arquivar **ausentes (ocultos)** | ? | **ESPERA PASSAR** — gates corretos aqui |
| **L.7.3** | e2e-ver | Logout. Logue como e2e-ver. Abra Backlog. Clique em qualquer atividade. | Tela /atividade: botão "Comentar" visível, demais botões ausentes | ? | **ESPERA PASSAR** |
| **L.7.4** | e2e-pendente | Logout. Logue como e2e-pendente. Tente acessar /atividade/:id diretamente (copie URL de P1.1). | Bloqueado 403 OU redireciona para convite | ? | **ESPERA FALHAR** |

---

## 📊 CONTAGEM ESPERADA

| Bloco | Total | Espera Passar | Espera Falhar |
|-------|-------|---|---|
| L.1 | 6 | 4 | 2 |
| L.2 | 4 | 2 | 2 |
| L.3 | 4 | 3 | 1 |
| L.4 | 5 | 0 | 5 |
| L.5 | 4 | 0 | 4 |
| L.6 | 4 | 2 | 2 |
| L.7 | 4 | 4 | 0 |
| **TOTAL** | **32** | **20** | **12** |

**Percentual**: 62.5% passa, 37.5% falha (ESPERADO — confirma achados)

---

## 📋 COMO REGISTRAR RESULTADOS

### Opção A: Aqui Mesmo (Preencha a Coluna S/N)

Para cada teste acima, escreva:
- `S` = Passou conforme esperado
- `N` = Falhou (inesperado)
- `?` = Não conseguiu rodar

### Opção B: Arquivo JSON

Após executar, gere JSON:
```json
{
  "data": "2026-09-10",
  "totalTests": 32,
  "passed": 20,
  "failed": 12,
  "testes": [
    { "id": "L.1.1", "resultado": "S" },
    { "id": "L.1.2", "resultado": "N" },
    ...
  ]
}
```

### Opção C: Simplesmente Conte

"20 passaram, 12 falharam" — já é o suficiente.

---

## ⚠️ ERROS COMUNS & SOLUTIONS

| Problema | Solução |
|----------|---------|
| "Usuário não encontrado" | Verifique email (sem espaços, tudo minúsculo: `e2e-resp@e2e.local`) |
| "Senha incorreta" | Use exatamente: `E2eTeste!2026#Acesso` |
| "Projeto não existe" | Verifique ID: `cbca8b9c-279b-4aba-adc8-e6fb5cfedef0` |
| Cookie de outra conta ativa | Abra aba anônima (Ctrl+Shift+P) ou limpe cookies |
| Menu ⋯ não aparece em Backlog | Clique na atividade, depois em ⋯ (linha direita). Se não aparecer, é bug (L.1 falha) |
| "Você não tem acesso a este projeto" | Você está logado como conta errada ou convite pendente. Logout e re-logue. |
| Lixeira vazia | Arquive uma atividade primeiro (ação reversal: Concluir + Arquivar) |

---

## 📞 SAÍDA ESPERADA

Ao terminar, responda com:

```
Resultado dos 32 Testes de Permissão — GestãoPro
Executado por: [seu nome/agente]
Data: 2026-09-10

Total de testes: 32
✅ Passaram: [número] (esperado 20)
❌ Falharam: [número] (esperado 12)

Testes que passaram inesperadamente (se houver):
- [lista]

Testes que falharam inesperadamente (se houver):
- [lista]

Bloqueadores encontrados:
- [lista, se houver]

Ambiente:
- Navegador: [Chrome/Firefox/Safari]
- OS: [Windows/Mac/Linux]
- Data/hora: [quando rodou]
- Duração: [quanto tempo levou]
```

---

## 🎯 RESUMO

**Você vai**:
1. Ler instrução de cada teste
2. Navegar em https://gestaopro.pronutrir.com.br
3. Executar ação (logout, login, clique, etc)
4. Registrar S/N (passou/falhou)
5. Enviar resultado

**Tempo**: 45–90 minutos  
**Complexidade**: Baixa (só navegação, sem código)  
**Critério de sucesso**: 20/32 passa, 12/32 falha (isso prova achados)

---

**Pronto! Pode começar. Qualquer dúvida, retorne para esclarecimento.**
