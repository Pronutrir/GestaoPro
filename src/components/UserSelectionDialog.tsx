'use client';

import { useState, useEffect } from 'react';
import { Search, User, Mail, Building2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role_title: string | null;
  sector: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

interface UserSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: Profile) => void;
  selectedUserId?: string;
  title?: string;
  description?: string;
}

export function UserSelectionDialog({
  isOpen,
  onClose,
  onSelect,
  selectedUserId,
  title = 'Selecionar Usuário',
  description = 'Busque e selecione um usuário',
}: UserSelectionDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Buscar usuários quando dialog abre ou searchQuery muda
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('profiles')
          .select('id, full_name, email, role_title, sector, avatar_url, is_active')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
        }

        const { data, error: err } = await query.limit(20);

        if (err) throw err;
        setUsers(data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao buscar usuários';
        setError(message);
        console.error('Error fetching users:', err);
      } finally {
        setLoading(false);
      }
    };

    // Debounce para não fazer request a cada keystroke
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [isOpen, searchQuery]);

  const handleSelect = (user: Profile) => {
    onSelect(user);
    onClose();
    setSearchQuery('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Users List */}
          <ScrollArea className="h-[300px] border rounded-lg p-2">
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-sm text-destructive">
                {error}
              </div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-sm text-muted-foreground">
                <User className="h-8 w-8 mb-2 opacity-50" />
                <p>{searchQuery ? 'Nenhum usuário encontrado' : 'Nenhum usuário disponível'}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelect(user)}
                    className={`w-full text-left p-2 rounded-lg hover:bg-accent transition-colors group relative ${
                      selectedUserId === user.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || ''} />
                        <AvatarFallback className="text-xs">
                          {(user.full_name ?? 'U')
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{user.full_name || 'Usuário'}</p>
                          {selectedUserId === user.id && (
                            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                          {user.email && (
                            <>
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{user.email}</span>
                            </>
                          )}
                        </div>
                        {user.sector && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <Building2 className="h-3 w-3" />
                            <span className="truncate">{user.sector}</span>
                          </div>
                        )}
                      </div>

                      {user.role_title && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {user.role_title}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
