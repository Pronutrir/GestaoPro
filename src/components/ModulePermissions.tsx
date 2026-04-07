import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

interface UserRole {
  user_id: string;
  role: string;
}

const ALL_MODULES = [
  { key: "overview", label: "Visão Geral" },
  { key: "projects", label: "Projetos" },
  { key: "team", label: "Equipe" },
  { key: "timeline", label: "Cronograma" },
  { key: "blocked", label: "Bloqueios" },
  { key: "investments", label: "Gestão Financeira" },
  { key: "roadmap", label: "Roadmap" },
  { key: "reports", label: "Relatórios" },
  { key: "csc", label: "CSC" },
  { key: "qualidade", label: "Gestão da Qualidade" },
] as const;

const DEFAULT_MODULES = ["overview", "projects", "team", "timeline", "blocked"];

export function ModulePermissions() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [{ data: profilesData }, { data: rolesData }, { data: permsData }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, avatar_url, is_active").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_module_permissions").select("user_id, allowed_modules"),
    ]);

    setProfiles(profilesData || []);
    setRoles(rolesData || []);

    const permsMap: Record<string, string[]> = {};
    (permsData || []).forEach((p: any) => {
      permsMap[p.user_id] = p.allowed_modules;
    });
    setPermissions(permsMap);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (!isAdmin) return null;

  const getUserRole = (userId: string) => {
    const r = roles.find(r => r.user_id === userId);
    return r?.role || "user";
  };

  const isManagerOrAdmin = (userId: string) => {
    const role = getUserRole(userId);
    return role === "admin" || role === "gestor";
  };

  const getUserModules = (userId: string): string[] => {
    return permissions[userId] || DEFAULT_MODULES;
  };

  const toggleModule = async (userId: string, moduleKey: string) => {
    const current = getUserModules(userId);
    const updated = current.includes(moduleKey)
      ? current.filter(m => m !== moduleKey)
      : [...current, moduleKey];

    // Optimistic update
    setPermissions(prev => ({ ...prev, [userId]: updated }));

    const { error } = await supabase
      .from("user_module_permissions")
      .upsert(
        { user_id: userId, allowed_modules: updated, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setPermissions(prev => ({ ...prev, [userId]: current }));
    }
  };

  const filteredProfiles = profiles.filter(p => {
    if (!p.is_active) return false;
    if (isManagerOrAdmin(p.id)) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
  });

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5" />
          Permissões de Módulos
        </CardTitle>
        <CardDescription>
          Controle quais módulos do menu lateral cada usuário pode acessar. Admins e Gestores sempre têm acesso completo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar usuário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : filteredProfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário comum encontrado.</p>
        ) : (
          <div className="space-y-4">
            {filteredProfiles.map(profile => {
              const modules = getUserModules(profile.id);
              return (
                <div key={profile.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">{getInitials(profile.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{profile.full_name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {modules.length}/{ALL_MODULES.length} módulos
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {ALL_MODULES.map(mod => (
                      <div key={mod.key} className="flex items-center gap-2">
                        <Switch
                          checked={modules.includes(mod.key)}
                          onCheckedChange={() => toggleModule(profile.id, mod.key)}
                          className="scale-75"
                        />
                        <span className="text-xs text-foreground">{mod.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
