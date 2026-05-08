'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { X, User } from 'lucide-react';
import { UserSelectionDialog } from '@/components/UserSelectionDialog';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role_title: string | null;
  sector: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

interface UserAssignmentFieldProps {
  value?: string; // userId
  onChange: (userId: string | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function UserAssignmentField({
  value,
  onChange,
  label = 'Atribuir Usuário',
  placeholder = 'Selecionar usuário',
  disabled = false,
}: UserAssignmentFieldProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  const handleSelectUser = (user: Profile) => {
    setSelectedUser(user);
    onChange(user.id);
    setIsDialogOpen(false);
  };

  const handleClear = () => {
    setSelectedUser(null);
    onChange(null);
  };

  const initials = (selectedUser?.full_name ?? 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}

      <div className="flex items-center gap-2">
        {selectedUser ? (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-accent flex-1">
            <Avatar className="h-8 w-8">
              <AvatarImage src={selectedUser.avatar_url || undefined} alt={selectedUser.full_name || ''} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedUser.full_name}</p>
              {selectedUser.email && <p className="text-xs text-muted-foreground truncate">{selectedUser.email}</p>}
            </div>

            {selectedUser.role_title && (
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {selectedUser.role_title}
              </Badge>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              disabled={disabled}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsDialogOpen(true)}
            disabled={disabled}
            className="w-full justify-start text-muted-foreground"
          >
            <User className="h-4 w-4 mr-2" />
            {placeholder}
          </Button>
        )}
      </div>

      <UserSelectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSelect={handleSelectUser}
        selectedUserId={selectedUser?.id}
        title={label}
      />
    </div>
  );
}
