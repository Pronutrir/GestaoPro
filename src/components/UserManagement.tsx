import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Plus, Shield, User, Pencil, Trash2, Ban, CheckCircle2,
  Camera, Mail, Building2, Briefcase, Key, Search, MoreVertical, LayoutGrid,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ALL_PROJECT_TABS, ALL_TAB_VALUES, normalizeProjectTabs } from "@/lib/projectTabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  sector: string | null;
  role_title: string | null;
  avatar_url: string | null;
  created_at: string;
  is_active?: boolean;
  provider?: string | null;
  last_login_at?: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

interface Sector {
  id: string;
  name: string;
}

const USER_MGMT_CACHE_TTL_MS = 60_000;
let userManagementCache:
  | {
      timestamp: number;
      profiles: Profile[];
      roles: UserRole[];
      sectors: Sector[];
    }
  | null = null;

export const UserManagement = () => {
  const { toast } = useToast();
  const { isAdmin, user: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<Profile | null>(null);
  const [banConfirm, setBanConfirm] = useState<{ profile: Profile; action: "ban" | "unban" } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    email: "", password: "", full_name: "", sector: "", role_title: "", role: "user",
  });
  const [editForm, setEditForm] = useState({
    full_name: "", email: "", sector: "", role_title: "", role: "user", new_password: "",
  });
  const [userAllowedTabs, setUserAllowedTabs] = useState<string[]>(normalizeProjectTabs(ALL_TAB_VALUES));
  const [tabsByUserId, setTabsByUserId] = useState<Record<string, string[]>>({});

  const fetchData = async ({ force = false }: { force?: boolean } = {}) => {
    const now = Date.now();
    if (!force && userManagementCache && now - userManagementCache.timestamp < USER_MGMT_CACHE_TTL_MS) {
      setProfiles(userManagementCache.profiles);
      setRoles(userManagementCache.roles);
      setSectors(userManagementCache.sectors);
      return;
    }

    const [{ data: profilesData }, { data: rolesData }, { data: sectorsData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, sector, role_title, avatar_url, created_at, is_active, provider, last_login_at")
        .order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("sectors").select("id, name").order("name"),
    ]);

    const nextProfiles = profilesData || [];
    const nextRoles = (rolesData as UserRole[]) || [];
    const nextSectors = sectorsData || [];

    setProfiles(nextProfiles);
    setRoles(nextRoles);
    setSectors(nextSectors);

    userManagementCache = {
      timestamp: now,
      profiles: nextProfiles,
      roles: nextRoles,
      sectors: nextSectors,
    };
  };

  useEffect(() => { fetchData(); }, []);

  const getUserRole = (userId: string) => {
    const r = roles.find((r) => r.user_id === userId);
    return r?.role || "user";
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  // Usuário Azure (OAuth) que nunca foi aprovado por um admin.
  const isOAuthPending = (p: Profile) =>
    p.is_active === false && !!p.provider && p.provider !== "email" && !p.last_login_at;

  const handleCreate = async () => {
    if (!form.email || !form.full_name) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar usuário");
      if (data?.error) throw new Error(data.error);
      const temporaryPassword = typeof data?.temporary_password === "string" ? data.temporary_password : null;
      toast({
        title: "Usuário criado!",
        description: temporaryPassword
          ? `${form.full_name} foi adicionado. Senha temporária: ${temporaryPassword}`
          : `${form.full_name} foi adicionado.`,
      });
      setForm({ email: "", password: "", full_name: "", sector: "", role_title: "", role: "user" });
      setCreateOpen(false);
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro ao criar usuário", description: error.message, variant: "destructive" });
    }
    setIsLoading(false);
  };

  const handleUpdate = async () => {
    if (!selectedUser) return;
    setIsLoading(true);
    try {
      const body: any = {
        target_user_id: selectedUser.id,
        full_name: editForm.full_name,
        sector: editForm.sector,
        role_title: editForm.role_title,
        role: editForm.role,
      };
      if (editForm.email.trim() && editForm.email !== selectedUser.email) body.new_email = editForm.email;
      if (editForm.new_password.trim()) body.new_password = editForm.new_password;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao atualizar usuário");
      if (data?.error) throw new Error(data.error);
      await handleSaveTabPermissions(selectedUser.id, userAllowedTabs);
      toast({ title: "Usuário atualizado!" });
      setSelectedUser(null);
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
    setIsLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedUser || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const ext = file.name.split(".").pop();
    const path = `${selectedUser.id}/avatar.${ext}`;

    setIsLoading(true);
    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { data: { session } } = await supabase.auth.getSession();
      const avatarRes = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ target_user_id: selectedUser.id, avatar_url: avatarUrl }),
      });
      if (!avatarRes.ok) { const d = await avatarRes.json(); throw new Error(d.error ?? "Erro ao atualizar avatar"); }

      toast({ title: "Foto atualizada!" });
      await fetchData({ force: true });
      setSelectedUser(prev => prev ? { ...prev, avatar_url: avatarUrl } : null);
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    }
    setIsLoading(false);
  };

  const handleAction = async (userId: string, action: "ban" | "unban" | "delete") => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ target_user_id: userId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao executar ação");
      if (data?.error) throw new Error(data.error);
      const messages = {
        ban: "Usuário inativado!",
        unban: "Usuário reativado!",
        delete: "Usuário excluído!",
      };
      toast({ title: messages[action] });
      setDeleteConfirm(null);
      setBanConfirm(null);
      setSelectedUser(null);
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setIsLoading(false);
  };

  const openUserDetail = async (profile: Profile) => {
    setSelectedUser(profile);
    setEditForm({
      full_name: profile.full_name || "",
      email: profile.email || "",
      sector: profile.sector || "",
      role_title: profile.role_title || "",
      role: getUserRole(profile.id),
      new_password: "",
    });
    const cachedTabs = tabsByUserId[profile.id];
    if (cachedTabs) {
      setUserAllowedTabs(normalizeProjectTabs(cachedTabs));
      return;
    }

    // Fetch tab permissions
    const { data } = await supabase
      .from("user_tab_permissions")
      .select("allowed_tabs")
      .eq("user_id", profile.id)
      .maybeSingle();
    const normalizedTabs = normalizeProjectTabs(data?.allowed_tabs);
    setTabsByUserId(prev => ({ ...prev, [profile.id]: normalizedTabs }));
    setUserAllowedTabs(normalizeProjectTabs(normalizedTabs));
  };

  const handleSaveTabPermissions = async (userId: string, tabs: string[]) => {
    const normalizedTabs = normalizeProjectTabs(tabs);
    const { data: existing } = await supabase
      .from("user_tab_permissions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      await supabase.from("user_tab_permissions").update({ allowed_tabs: normalizedTabs, updated_at: new Date().toISOString() }).eq("user_id", userId);
    } else {
      await supabase.from("user_tab_permissions").insert({ user_id: userId, allowed_tabs: normalizedTabs } as any);
    }
    setTabsByUserId(prev => ({ ...prev, [userId]: normalizedTabs }));
  };

  const toggleTab = (tabValue: string) => {
    if (tabValue === "kanban") return;

    setUserAllowedTabs(prev => {
      if (prev.includes(tabValue)) {
        return normalizeProjectTabs(prev.filter(t => t !== tabValue));
      }
      return normalizeProjectTabs([...prev, tabValue]);
    });
  };

  const toggleAllTabs = (enabled: boolean) => {
    setUserAllowedTabs(enabled ? normalizeProjectTabs([...ALL_TAB_VALUES]) : ["kanban"]);
  };

  const filteredProfiles = profiles.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(term) ||
      p.email?.toLowerCase().includes(term) ||
      p.sector?.toLowerCase().includes(term) ||
      p.role_title?.toLowerCase().includes(term)
    );
  });

  if (!isAdmin) return null;

  const SectorSelect = ({ value, onValueChange }: { value: string; onValueChange: (v: string) => void }) => (
    <Select value={value || "_none"} onValueChange={(v) => onValueChange(v === "_none" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="_none">Nenhum</SelectItem>
        {sectors.map((s) => (
          <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" /> Usuários
              </CardTitle>
              <CardDescription>{profiles.length} usuário(s) cadastrado(s)</CardDescription>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-1"><Plus className="w-4 h-4" /> Novo Usuário</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Criar Novo Usuário</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Nome Completo *</Label>
                    <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="João Silva" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Email *</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="joao@empresa.com" />
                  </div>
                  <div className="grid gap-2">
                    <Label>Senha <span className="text-muted-foreground text-xs">(opcional — gerada automaticamente se vazio)</span></Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Deixe vazio para gerar automaticamente" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Setor</Label>
                      <SectorSelect value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Cargo</Label>
                      <Input value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} placeholder="Gerente" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Perfil de Acesso</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="user">Usuário</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} disabled={isLoading}>{isLoading ? "Criando..." : "Criar Usuário"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, setor ou cargo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* User Grid */}
          {filteredProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum usuário encontrado.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredProfiles.map((p) => {
                const role = getUserRole(p.id);
                const isSelf = p.id === currentUser?.id;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group ${
                      p.is_active === false
                        ? "border-destructive/30 bg-destructive/5 opacity-60"
                        : "border-border hover:border-primary/30 hover:bg-accent/10"
                    }`}
                    onClick={() => openUserDetail(p)}
                  >
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={p.avatar_url || undefined} alt={p.full_name || ""} className={p.is_active === false ? "grayscale" : ""} />
                      <AvatarFallback className={
                        p.is_active === false ? "bg-muted text-muted-foreground" :
                        role === "admin" ? "bg-primary/15 text-primary" :
                        role === "gestor" ? "bg-amber-100 text-amber-700" :
                        "bg-muted text-muted-foreground"
                      }>
                        {getInitials(p.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm truncate ${p.is_active === false ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {p.full_name || "Sem nome"}
                        </span>
                        {isSelf && <Badge variant="outline" className="text-[9px] h-4">Você</Badge>}
                        {p.is_active === false && (
                          isOAuthPending(p) ? (
                            <Badge variant="outline" className="text-[9px] h-4 gap-0.5 border-amber-300 bg-amber-50 text-amber-700">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Pendente
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[9px] h-4 gap-0.5">
                              <Ban className="w-2.5 h-2.5" /> Inativo
                            </Badge>
                          )
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {p.role_title && <span className="text-[10px] text-muted-foreground">{p.role_title}</span>}
                        {p.sector && <Badge variant="outline" className="text-[9px] h-4">{p.sector}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={role === "admin" ? "default" : "secondary"}
                        className={`text-[10px] ${role === "gestor" ? "bg-amber-100 text-amber-800 border-amber-200" : ""}`}
                      >
                        {role === "admin" ? "Admin" : role === "gestor" ? "Gestor" : "Usuário"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => openUserDetail(p)}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Editar
                          </DropdownMenuItem>
                          {!isSelf && (
                            <>
                              <DropdownMenuSeparator />
                              {p.is_active === false ? (
                                <DropdownMenuItem onClick={() => setBanConfirm({ profile: p, action: "unban" })}>
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> {isOAuthPending(p) ? "Aprovar" : "Reativar"}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setBanConfirm({ profile: p, action: "ban" })}>
                                  <Ban className="w-3.5 h-3.5 mr-2" /> Inativar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm(p)}>
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <DialogContent className="w-[96vw] max-w-[1100px] p-0 overflow-hidden">
          {selectedUser && (
            <div className="flex max-h-[88vh] flex-col">
              <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
                <DialogTitle className="text-lg">Editar Usuário</DialogTitle>
              </DialogHeader>

              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="border-b border-border bg-muted/20 p-5 lg:border-b-0 lg:border-r lg:p-6">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative group">
                      <Avatar className="h-24 w-24">
                        <AvatarImage src={selectedUser.avatar_url || undefined} alt={selectedUser.full_name || ""} />
                        <AvatarFallback className="text-xl bg-primary/15 text-primary">
                          {getInitials(selectedUser.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <button
                        className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <Camera className="w-5 h-5 text-white" />
                      </button>
                      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-foreground">{selectedUser.full_name || "Sem nome"}</p>
                      <p className="text-sm text-muted-foreground break-all">{selectedUser.email}</p>
                    </div>
                    <Badge
                      variant={getUserRole(selectedUser.id) === "admin" ? "default" : "secondary"}
                      className={getUserRole(selectedUser.id) === "gestor" ? "bg-amber-100 text-amber-800 border-amber-200" : ""}
                    >
                      {getUserRole(selectedUser.id) === "admin" ? "Administrador" : getUserRole(selectedUser.id) === "gestor" ? "Gestor" : "Usuário"}
                    </Badge>
                    {selectedUser.is_active === false && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <Ban className="w-3 h-3" /> Inativo
                      </Badge>
                    )}
                  </div>

                  <div className="mt-6 text-xs text-muted-foreground space-y-1 border-t border-border pt-4">
                    <p>Cadastrado em: {new Date(selectedUser.created_at).toLocaleDateString("pt-BR")}</p>
                    <p>ID: {selectedUser.id.substring(0, 8)}…</p>
                  </div>
                </aside>

                <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Nome Completo</Label>
                        <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
                      </div>

                      <div className="grid gap-2">
                        <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</Label>
                        <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="email@empresa.com" />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Setor</Label>
                          <SectorSelect value={editForm.sector} onValueChange={(v) => setEditForm({ ...editForm, sector: v })} />
                        </div>
                        <div className="grid gap-2">
                          <Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Cargo</Label>
                          <Input value={editForm.role_title} onChange={(e) => setEditForm({ ...editForm, role_title: e.target.value })} />
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Perfil de Acesso</Label>
                        <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="gestor">Gestor</SelectItem>
                            <SelectItem value="user">Usuário</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-2">
                        <Label className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5" /> Redefinir Senha</Label>
                        <Input
                          type="password"
                          value={editForm.new_password}
                          onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
                          placeholder="Deixe vazio para não alterar"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-border pt-4">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Abas Visíveis no Projeto</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Todas</span>
                          <Switch
                            checked={userAllowedTabs.length === ALL_TAB_VALUES.length}
                            onCheckedChange={toggleAllTabs}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {ALL_PROJECT_TABS.map(tab => (
                          <div key={tab.value} className="flex items-center justify-between p-2 rounded-lg border border-border">
                            <span className="text-xs font-medium text-foreground">{tab.label}</span>
                            <Switch
                              checked={userAllowedTabs.includes(tab.value)}
                              disabled={tab.value === "kanban"}
                              onCheckedChange={() => toggleTab(tab.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-border pt-4">
                      <Button className="w-full" onClick={handleUpdate} disabled={isLoading}>
                        {isLoading ? "Salvando..." : "Salvar Alterações"}
                      </Button>

                      {selectedUser.id !== currentUser?.id && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <Button
                            variant="outline"
                            className="gap-1"
                            onClick={() => setBanConfirm({ profile: selectedUser, action: "ban" })}
                          >
                            <Ban className="w-3.5 h-3.5" /> Inativar
                          </Button>
                          <Button
                            variant="outline"
                            className="gap-1"
                            onClick={() => setBanConfirm({ profile: selectedUser, action: "unban" })}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Reativar
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => setDeleteConfirm(selectedUser)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm?.full_name}</strong>? Esta ação é irreversível e removerá todos os dados do usuário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleAction(deleteConfirm.id, "delete")}
            >
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ban/Unban Confirmation */}
      <AlertDialog open={!!banConfirm} onOpenChange={() => setBanConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{banConfirm?.action === "ban" ? "Inativar" : "Reativar"} Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              {banConfirm?.action === "ban"
                ? `O usuário ${banConfirm?.profile.full_name} não poderá mais fazer login no sistema.`
                : `O usuário ${banConfirm?.profile.full_name} poderá fazer login novamente.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => banConfirm && handleAction(banConfirm.profile.id, banConfirm.action)}>
              {banConfirm?.action === "ban" ? "Inativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
