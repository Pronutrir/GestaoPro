# 👥 Sistema de Seleção de Usuários

Um sistema completo e moderno para buscar e atribuir usuários na aplicação.

## Componentes

### 1. `UserSelectionDialog`

Modal/Dialog para buscar e selecionar um usuário.

**Props:**
```typescript
interface UserSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: Profile) => void;
  selectedUserId?: string;
  title?: string;
  description?: string;
}
```

**Uso:**
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserSelectionDialog } from '@/components/UserSelectionDialog';

export function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>();

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Selecionar Usuário</Button>

      <UserSelectionDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(user) => {
          setSelectedUserId(user.id);
          setIsOpen(false);
        }}
        selectedUserId={selectedUserId}
        title="Atribuir Tarefa"
        description="Escolha a pessoa responsável"
      />
    </>
  );
}
```

### 2. `UserAssignmentField`

Campo de formulário completo com busca integrada.

**Props:**
```typescript
interface UserAssignmentFieldProps {
  value?: string; // userId
  onChange: (userId: string | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}
```

**Uso:**
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserAssignmentField } from '@/components/UserAssignmentField';

export function CreateTaskForm() {
  const [assignedUserId, setAssignedUserId] = useState<string>();

  return (
    <form>
      <UserAssignmentField
        value={assignedUserId}
        onChange={setAssignedUserId}
        label="Responsável"
        placeholder="Selecionar responsável"
      />

      <Button type="submit">Criar Tarefa</Button>
    </form>
  );
}
```

### 3. `useUserSelection` Hook

Hook customizado para gerenciar seleção de usuários.

**Uso:**
```tsx
'use client';

import { useUserSelection } from '@/hooks/useUserSelection';
import { UserSelectionDialog } from '@/components/UserSelectionDialog';
import { Button } from '@/components/ui/button';

export function MyComponent() {
  const {
    isOpen,
    selectedUser,
    openDialog,
    handleClose,
    handleSelectUser,
  } = useUserSelection();

  return (
    <>
      <Button onClick={openDialog}>Abrir Seletor</Button>

      {selectedUser && (
        <p>Selecionado: {selectedUser.full_name} ({selectedUser.email})</p>
      )}

      <UserSelectionDialog
        isOpen={isOpen}
        onClose={handleClose}
        onSelect={handleSelectUser}
        selectedUserId={selectedUser?.id}
      />
    </>
  );
}
```

## Agent Integration

O agente agora tem a ferramenta `listUsers` que lista usuários disponíveis.

### Fluxo de atribuição no agente:

1. Usuário diz: "Criar tarefa e atribuir a Fulano"
2. Agente chama:
   - `listProjects` → retorna opções de projetos
   - `listWorkflowStages` → retorna opções de colunas
   - `listUsers` (com busca "Fulano") → retorna opções de usuários
3. Usuário clica nas opções
4. Agente cria a tarefa com as informações

### System Prompt Rules:

- Quando precisar atribuir um usuário: chame `listUsers`
- Copie o `formatted_response` exatamente como resposta
- Ofereça sempre o usuário logado como primeira opção: `[${userName}] | [Outro]`
- Se escolher "Outro", chame `listUsers` para listar todos

## Features

✅ Busca por nome ou email (debounce 300ms)
✅ Avatar com fallback
✅ Informações: cargo, setor, email
✅ Apenas usuários ativos são listados
✅ Loading skeleton
✅ Estados: vazio, erro, carregando
✅ Seleção visual com checkmark
✅ Limpeza de seleção
✅ Acessibilidade: Enter, ESC, Tab

## Database Table

```sql
profiles {
  id: UUID
  full_name: string
  email: string
  avatar_url: string
  role_title: string
  sector: string
  is_active: boolean
}
```

## Next Steps

- Integrar `UserAssignmentField` em formulários de criação de tarefa/projeto
- Adicionar filtro de setor/departamento
- Adicionar multi-select de usuários (para participantes)
- Cache de usuários no client
