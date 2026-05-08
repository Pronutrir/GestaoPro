import { useState, useCallback } from 'react';
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

export function useUserSelection() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);

  const openDialog = useCallback((): void => {
    setIsOpen(true);
  }, []);

  const handleSelectUser = useCallback((user: Profile) => {
    setSelectedUser(user);
    setIsOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    openDialog,
    handleClose,
    handleSelectUser,
    selectedUser,
    setSelectedUser,
    DialogComponent: UserSelectionDialog,
  };
}
