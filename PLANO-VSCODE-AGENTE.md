# 🎯 PLANO DE EXECUÇÃO — 32 Testes GestãoPro
## Para Agente Externo Executar no VSCode

**Objetivo**: Validar 32 testes de permissões em GestãoPro  
**Resultado Esperado**: 20 passam, 12 falham (ESPERADO — confirma achados)  
**Tempo**: 45–90 minutos  
**Formato**: Manual navegação + tabela de resultados

---

## 📌 SETUP INICIAL (5 min)

### 1. Abra estes arquivos no VSCode

```
/opt/data/Develop/Gestão_Pro/
├── PLANO-EXECUTACAO-AGENTE.md      ← ESTE ARQUIVO (leia enquanto testa)
├── AUDITORIA-RECONCILIACAO-10-09-2026.md  ← Contexto dos achados
└── STATUS-EXECUCAO.md              ← Se precisar de help
```

### 2. Abra navegador em aba separada

```
https://gestaopro.pronutrir.com.br
```

### 3. Copie esta tabela de resultados para um arquivo local

```
teste,conta,resultado_s_ou_n,notas
L.1.1,e2e-resp,?,
L.1.2,e2e-resp,?,
L.1.3,e2e-resp,?,
L.1.4,e2e-tudo,?,
L.1.5,e2e-ver,?,
L.1.6,e2e-pendente,?,
L.2.1,e2e-resp,?,
L.2.2,e2e-resp,?,
L.2.3,e2e-tudo,?,
L.2.4,e2e-ver,?,
L.3.1,e2e-resp,?,
L.3.2,e2e-resp,?,
L.3.3,e2e-tudo,?,
L.3.4,e2e-ver,?,
L.4.1,e2e-pendente,?,
L.4.2,e2e-pendente,?,
L.4.3,e2e-pendente,?,
L.4.4,e2e-pendente,?,
L.4.5,e2e-pendente,?,
L.5.1,e2e-pendente,?,
L.5.2,e2e-pendente,?,
L.5.3,e2e-pendente,?,
L.5.4,e2e-pendente,?,
L.6.1,e2e-del,?,
L.6.2,e2e-resp,?,
L.6.3,e2e-tudo,?,
L.6.4,e2e-ver,?,
L.7.1,e2e-resp,?,
L.7.2,e2e-resp,?,
L.7.3,e2e-ver,?,
L.7.4,e2e-pendente,?,
```

---

## 🔐 CREDENCIAIS

### Senha Única (Todas as Contas)
```
E2eTeste!2026#Acesso
```

### Contas de Teste
```
e2e-resp@e2e.local       → Editar minhas (can_edit_own)
e2e-del@e2e.local        → Criar e excluir
e2e-tudo@e2e.local       → Editar tudo
e2e-ver@e2e.local        → Visualizar e comentar
e2e-pendente@e2e.local   → Convite Pendente (NEW)
```

### IDs de Atividades (Copie-Cola no Navegador)

```
P1.1:   https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/7002e389-1c18-433b-b4a0-2fb397da653e
P2:     https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/9ef6d99c-8e3d-4908-8b57-57cdc3670d57
P2.1:   https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/7f6728e2-08a2-4d63-9d74-730f4b227ea5
Subat B: https://gestaopro.pronutrir.com.br/project/cbca8b9c-279b-4aba-adc8-e6fb5cfedef0/atividade/4772bf00-f125-4a83-abc6-d06b6d16610d
```

---

## 🧪 BLOCO L.1: Backlog Menu ⋯ (6 Testes)

### L.1.1
- **Conta**: `e2e-resp@e2e.local` + `E2eTeste!2026#Acesso`
- **Ação**: 
  1. Logout (se necessário)
  2. Login
  3. Abra Backlog
  4. Localize P1.1 (seu ramo)
  5. Clique ⋯ (três pontos na linha)
- **Esperado**: Menu oferece: Concluir · Adicionar · Editar · Abrir · Mover · Arquivar (nenhum grisealho)
- **Registre**: `S` (passou) ou `N` (falhou)

### L.1.2
- **Conta**: e2e-resp (mesma sessão)
- **Ação**:
  1. Abra Backlog
  2. Localize P2 (fora do seu ramo)
  3. Clique ⋯
- **Esperado**: Arquivar e Mover aparecem **grisealhos/desabilitados** OU ações diferentes
- **Registre**: S/N
- **Nota**: ❌ **ESPERA FALHAR** — Menu é estático, não respeita escopo

### L.1.3
- **Conta**: e2e-resp
- **Ação**:
  1. Em P2 (fora escopo), clique "Concluir tarefa"
- **Esperado**: 
  - Zero requisições ao servidor (DevTools: aba Network vazia)
  - Zero mensagem no navegador
  - Nada muda no banco
- **Registre**: S/N
- **Nota**: Clique parece funcionar, mas falha silenciosamente → UI quebrada, segurança ok

### L.1.4
- **Conta**: e2e-tudo@e2e.local + senha
- **Ação**:
  1. Logout
  2. Login como e2e-tudo
  3. Abra Backlog
  4. Clique ⋯ em qualquer atividade
- **Esperado**: Menu completo, **nenhuma ação grisealha**
- **Registre**: S/N

### L.1.5
- **Conta**: e2e-ver@e2e.local + senha
- **Ação**:
  1. Logout
  2. Login como e2e-ver
  3. Abra Backlog
  4. Clique ⋯
- **Esperado**: Menu vazio OU só "Comentar" (sem Concluir, Editar, Mover, Arquivar)
- **Registre**: S/N

### L.1.6
- **Conta**: e2e-pendente@e2e.local + senha
- **Ação**:
  1. Logout
  2. Tente login como e2e-pendente
- **Esperado**: 
  - Redireciona para onboarding OU
  - Exibe "Convite pendente — clique para aceitar"
- **Registre**: S/N
- **Nota**: ❌ **ESPERA FALHAR** — Convite invisível hoje

---

## 🧪 BLOCO L.2: Backlog Lote com Permissão (4 Testes)

### L.2.1
- **Conta**: e2e-resp
- **Ação**:
  1. Logout + re-login e2e-resp
  2. Abra Backlog
  3. Marque checkbox em P1.1 (seu ramo)
  4. Marque checkbox em P2 (fora do ramo)
  5. Clique "Mudar Status"
- **Esperado**: Toast: **"1 atualizada · 1 ficou de fora — sem permissão"**
- **Registre**: S/N
- **Nota**: ❌ **ESPERA FALHAR** — Lote oferece ação mesmo sem permissão

### L.2.2
- **Conta**: e2e-resp
- **Ação**:
  1. Marque checkbox em Atividade Solta (resp=e2e-tudo)
  2. Tente clicar "Arquivar"
- **Esperado**: Bloqueado → botão cinza/ausente OU toast "Sem permissão sobre seleção"
- **Registre**: S/N

### L.2.3
- **Conta**: e2e-tudo
- **Ação**:
  1. Logout + login e2e-tudo
  2. Abra Backlog
  3. Marque todas as atividades (lote)
  4. Clique "Arquivar"
- **Esperado**: Toast: **"5 atualizadas"** (todas arquivadas)
- **Registre**: S/N

### L.2.4
- **Conta**: e2e-ver
- **Ação**:
  1. Logout + login e2e-ver
  2. Abra Backlog
  3. Tente marcar checkbox em qualquer atividade
- **Esperado**: Checkboxes não aparecem OU desabilitados
- **Registre**: S/N

---

## 🧪 BLOCO L.3: Kanban Arrasto com Permissão (4 Testes)

### L.3.1
- **Conta**: e2e-resp
- **Ação**:
  1. Logout + login e2e-resp
  2. Abra Kanban
  3. Arraste card P1.1 entre colunas (ex: "Não iniciado" → "Em andamento")
- **Esperado**: 
  - Move sem erro
  - Toast "Movida para..."
  - Pai (P1) acompanha coluna
- **Registre**: S/N

### L.3.2
- **Conta**: e2e-resp
- **Ação**:
  1. Tente arrastar P2 (fora escopo) entre colunas
- **Esperado**: Bloqueado (animação de rejeição) OU move + reverte automaticamente
- **Registre**: S/N

### L.3.3
- **Conta**: e2e-tudo
- **Ação**:
  1. Logout + login e2e-tudo
  2. Abra Kanban
  3. Arraste qualquer card entre colunas
- **Esperado**: Move livremente
- **Registre**: S/N

### L.3.4
- **Conta**: e2e-ver
- **Ação**:
  1. Logout + login e2e-ver
  2. Abra Kanban
  3. Tente arrastar qualquer card
- **Esperado**: Cards não são draggable (cursor não muda)
- **Registre**: S/N

---

## 🧪 BLOCO L.4: Convite Pendente (5 Testes)

### L.4.1–L.4.5
- **Conta**: e2e-pendente
- **Ações**: Ver L.1.6 + tentar acessar Backlog/Kanban se conseguir entrar
- **Esperado**: Tudo bloqueado, redireciona para onboarding
- **Registre**: S/N para cada
- **Nota**: ❌ **ESPERA FALHAR** — Tela não existe

---

## 🧪 BLOCO L.5: Onboarding (4 Testes)

### L.5.1–L.5.4
- **Continuação de L.4**: Se conseguir acessar tela de convite
- **Esperado**: Botões [Aceitar] [Recusar], fluxo completo
- **Registre**: S/N para cada
- **Nota**: ❌ **ESPERA FALHAR** — Fluxo não implementado

---

## 🧪 BLOCO L.6: Lixeira Excluir Permanente (4 Testes)

### L.6.1
- **Conta**: e2e-del
- **Ação**:
  1. Logout + login e2e-del
  2. Abra Backlog → Lixeira (aba)
  3. Localize um item arquivado
  4. Clique "Excluir permanente" (botão com X vermelho)
- **Esperado**: Item excluído permanentemente (não aparece mais)
- **Registre**: S/N

### L.6.2
- **Conta**: e2e-resp
- **Ação**:
  1. Logout + login e2e-resp
  2. Abra Lixeira
  3. Procure botão "Excluir permanente"
- **Esperado**: Botão ausente, cinza OU desabilitado
- **Registre**: S/N
- **Nota**: ❌ **ESPERA FALHAR** — Gate é `!readOnly`, não `can_delete`

### L.6.3
- **Conta**: e2e-tudo
- **Ação**:
  1. Logout + login e2e-tudo
  2. Abra Lixeira
- **Esperado**: Botão "Excluir permanente" visível e ativo
- **Registre**: S/N

### L.6.4
- **Conta**: e2e-ver
- **Ação**:
  1. Logout + login e2e-ver
  2. Abra Lixeira
- **Esperado**: Sem botão de excluir (visualizador só vê)
- **Registre**: S/N

---

## 🧪 BLOCO L.7: Tela /atividade/:id (4 Testes)

### L.7.1
- **Conta**: e2e-resp
- **Ação**:
  1. Logout + login e2e-resp
  2. Abra Backlog
  3. Clique em P1.1 (seu ramo) → abre tela /atividade
- **Esperado**: Botões Editar, Concluir, Mover, Arquivar (todos visíveis)
- **Registre**: S/N
- **Nota**: ✅ **ESPERA PASSAR** — Gates corretos

### L.7.2
- **Conta**: e2e-resp
- **Ação**:
  1. Volte ao Backlog
  2. Clique em P2 (fora do ramo)
- **Esperado**: Botões Editar, Concluir, Mover, Arquivar **ausentes (ocultos)**
- **Registre**: S/N
- **Nota**: ✅ **ESPERA PASSAR** — Gates diferem do Backlog

### L.7.3
- **Conta**: e2e-ver
- **Ação**:
  1. Logout + login e2e-ver
  2. Abra Backlog
  3. Clique em qualquer atividade
- **Esperado**: Botão "Comentar" visível, demais botões ausentes
- **Registre**: S/N

### L.7.4
- **Conta**: e2e-pendente
- **Ação**:
  1. Logout + login e2e-pendente
  2. Tente acessar diretamente: copie URL de P1.1 do navegador
- **Esperado**: Bloqueado 403 OU redireciona para convite
- **Registre**: S/N

---

## 📊 SCORE ESPERADO

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

---

## 📋 COMO REGISTRAR RESULTADO

### Opção A: Arquivo CSV
Preencha a tabela que você copiou:
```
L.1.1,e2e-resp,S,Menu completo passado
L.1.2,e2e-resp,N,Menu oferece mesmas ações fora do escopo
...
```

### Opção B: JSON
```json
{
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

### Opção C: Texto Simples
```
Teste Concluído!
Total: 32 testes
Passaram: 20 (esperado)
Falharam: 12 (esperado)
```

---

## ⚠️ ERROS COMUNS

| Erro | Solução |
|------|---------|
| "Usuário não encontrado" | Email minúsculo, sem espaços: `e2e-resp@e2e.local` |
| "Senha incorreta" | Use exatamente: `E2eTeste!2026#Acesso` |
| Sessão de outra conta ativa | Abra aba anônima (Ctrl+Shift+P) ou limpe cookies |
| Menu ⋯ não aparece | Clique na atividade, depois ⋯ na linha direita |
| "Você não tem acesso" | Re-login com conta correta |

---

## 📞 RESULTADO ESPERADO

Quando terminar, responda com:

```
✅ Testes GestãoPro — RESULTADO FINAL

Total de testes: 32
Passaram: [número] (esperado 20)
Falharam: [número] (esperado 12)

Achados:
- [lista de testes que falharam inesperadamente, se houver]

Duração: [quanto tempo levou]
Navegador: [Chrome/Firefox/Safari]
Notas: [qualquer coisa relevante]
```

---

**Pronto para começar!** Abra o navegador em https://gestaopro.pronutrir.com.br e siga os testes acima. ✅
