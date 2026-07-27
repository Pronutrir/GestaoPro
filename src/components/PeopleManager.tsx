'use client';

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, ChevronRight, ShieldCheck, User, Mail, Building2, Briefcase,
  Key, Shield, Ban, CheckCircle2, Trash2, Camera, Users,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ALL_MODULES, ALL_MODULE_KEYS, DEFAULT_MODULES } from "@/lib/modules";
import { ALL_PROJECT_TABS, ALL_TAB_VALUES, normalizeProjectTabs } from "@/lib/projectTabs";
import { RoleTitleSelect, type JobTitleOption } from "@/components/settings/RoleTitleSelect";
import { ORG_LEVELS } from "@/lib/orgLevels";
import { SectorSelect } from "@/components/settings/SectorSelect";

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

type StateFilter = "all" | "active" | "pending" | "inactive";
type DetailTab = "profile" | "modules" | "tabs";

const STATE_FILTERS: { key: StateFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "pending", label: "Pendentes" },
  { key: "inactive", label: "Inativos" },
];

const STATE_META = {
  active:   { label: "Ativo",    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  pending:  { label: "Pendente", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  inactive: { label: "Inativo",  cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
} as const;

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "profile", label: "Perfil & Acesso" },
  { key: "modules", label: "Módulos" },
  { key: "tabs", label: "Abas do projeto" },
];

// Cache compartilhado do fetch (copiado do UserManagement).
const PEOPLE_MGMT_CACHE_TTL_MS = 60_000;
let peopleManagerCache:
  | {
      timestamp: number;
      profiles: Profile[];
      roles: UserRole[];
      sectors: Sector[];
      permissions: Record<string, string[]>;
    }
  | null = null;

export function PeopleManager() {
  const { toast } = useToast();
  const { isAdmin, user: currentUser } = useAuth();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [titles, setTitles] = useState<JobTitleOption[]>([]);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");

  const [createOpen, setCreateOpen] = useState(false);
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
    if (!force && peopleManagerCache && now - peopleManagerCache.timestamp < PEOPLE_MGMT_CACHE_TTL_MS) {
      setProfiles(peopleManagerCache.profiles);
      setRoles(peopleManagerCache.roles);
      setSectors(peopleManagerCache.sectors);
      setPermissions(peopleManagerCache.permissions);
      setLoading(false);
      return;
    }

    const [{ data: profilesData }, { data: rolesData }, { data: sectorsData }, { data: permsData }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, sector, role_title, avatar_url, created_at, is_active, provider, last_login_at")
          .order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("sectors").select("id, name").order("name"),
        supabase.from("user_module_permissions").select("user_id, allowed_modules"),
      ]);

    const nextProfiles = (profilesData as unknown as Profile[] | null) || [];
    const nextRoles = (rolesData as UserRole[]) || [];
    const nextSectors = sectorsData || [];
    const permsMap: Record<string, string[]> = {};
    (permsData || []).forEach((p: any) => { permsMap[p.user_id] = p.allowed_modules; });

    setProfiles(nextProfiles);
    setRoles(nextRoles);
    setSectors(nextSectors);
    setPermissions(permsMap);
    setLoading(false);

    peopleManagerCache = {
      timestamp: now,
      profiles: nextProfiles,
      roles: nextRoles,
      sectors: nextSectors,
      permissions: permsMap,
    };
  };

  useEffect(() => { fetchData(); }, []);

  // Cargos/níveis: da tabela job_titles. Tolerante — se a tabela ainda não
  // existe (migration pendente), cai nos 5 níveis padrão de ORG_LEVELS.
  useEffect(() => {
    (supabase.from("job_titles" as any).select("id, name").order("name") as any).then(({ data, error }: any) => {
      if (!error && Array.isArray(data) && data.length > 0) {
        setTitles(data as JobTitleOption[]);
      } else {
        setTitles(ORG_LEVELS.map((l) => ({ id: l.value, name: l.value })));
      }
    });
  }, []);

  const getUserRole = (userId: string) => roles.find((r) => r.user_id === userId)?.role || "user";
  const isAdminUser = (userId: string) => getUserRole(userId) === "admin";
  const isGestorUser = (userId: string) => getUserRole(userId) === "gestor";

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";

  // Usuário Azure (OAuth) que nunca foi aprovado por um admin.
  const isOAuthPending = (p: Profile) =>
    p.is_active === false && !!p.provider && p.provider !== "email" && !p.last_login_at;

  // Estado da pessoa: Pendente = inativo por OAuth ainda não aprovado; senão Inativo.
  const userState = (p: Profile): "active" | "pending" | "inactive" => {
    if (p.is_active) return "active";
    const oauthPending = !!p.provider && p.provider !== "email" && !p.last_login_at;
    return oauthPending ? "pending" : "inactive";
  };

  const getUserModules = (userId: string): string[] => permissions[userId] || DEFAULT_MODULES;

  const setUserModules = async (userId: string, updated: string[], previous: string[]) => {
    setPermissions((prev) => ({ ...prev, [userId]: updated }));
    const { error } = await supabase
      .from("user_module_permissions")
      .upsert(
        { user_id: userId, allowed_modules: updated, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setPermissions((prev) => ({ ...prev, [userId]: previous }));
    } else if (peopleManagerCache) {
      peopleManagerCache.permissions = { ...peopleManagerCache.permissions, [userId]: updated };
    }
  };

  const toggleModule = (userId: string, moduleKey: string) => {
    const current = getUserModules(userId);
    const updated = current.includes(moduleKey)
      ? current.filter((m) => m !== moduleKey)
      : [...current, moduleKey];
    setUserModules(userId, updated, current);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (stateFilter !== "all" && userState(p) !== stateFilter) return false;
      if (!q) return true;
      return (
        p.full_name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.sector?.toLowerCase().includes(q) ||
        p.role_title?.toLowerCase().includes(q)
      );
    });
  }, [profiles, search, stateFilter, roles]);

  const pendingCount = useMemo(
    () => profiles.filter((p) => userState(p) === "pending").length,
    [profiles],
  );

  // Ao expandir: preencher o form de edição e carregar (lazy) as abas do projeto.
  const openUserDetail = async (profile: Profile) => {
    setEditForm({
      full_name: profile.full_name || "",
      email: profile.email || "",
      sector: profile.sector || "",
      role_title: profile.role_title || "",
      role: getUserRole(profile.id),
      new_password: "",
    });
    setDetailTab("profile");

    const cachedTabs = tabsByUserId[profile.id];
    if (cachedTabs) {
      setUserAllowedTabs(normalizeProjectTabs(cachedTabs));
      return;
    }

    const { data } = await supabase
      .from("user_tab_permissions")
      .select("allowed_tabs")
      .eq("user_id", profile.id)
      .maybeSingle();
    const normalizedTabs = normalizeProjectTabs(data?.allowed_tabs);
    setTabsByUserId((prev) => ({ ...prev, [profile.id]: normalizedTabs }));
    setUserAllowedTabs(normalizeProjectTabs(normalizedTabs));
  };

  const handleToggleExpand = (profile: Profile) => {
    if (expandedId === profile.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(profile.id);
    openUserDetail(profile);
  };

  const handleSaveTabPermissions = async (userId: string, tabs: string[]) => {
    const normalizedTabs = normalizeProjectTabs(tabs);
    const { data: existing } = await supabase
      .from("user_tab_permissions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("user_tab_permissions")
        .update({ allowed_tabs: normalizedTabs, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    } else {
      await supabase.from("user_tab_permissions").insert({ user_id: userId, allowed_tabs: normalizedTabs } as any);
    }
    setTabsByUserId((prev) => ({ ...prev, [userId]: normalizedTabs }));
  };

  const toggleTab = (tabValue: string) => {
    if (tabValue === "kanban") return;
    setUserAllowedTabs((prev) => {
      if (prev.includes(tabValue)) {
        return normalizeProjectTabs(prev.filter((t) => t !== tabValue));
      }
      return normalizeProjectTabs([...prev, tabValue]);
    });
  };

  const toggleAllTabs = (enabled: boolean) => {
    setUserAllowedTabs(enabled ? normalizeProjectTabs([...ALL_TAB_VALUES]) : ["kanban"]);
  };

  const handleCreate = async () => {
    if (!form.email || !form.full_name) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setIsSaving(true);
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
        title: "Pessoa criada!",
        description: temporaryPassword
          ? `${form.full_name} foi adicionado. Senha temporária: ${temporaryPassword}`
          : `${form.full_name} foi adicionado.`,
      });
      setForm({ email: "", password: "", full_name: "", sector: "", role_title: "", role: "user" });
      setCreateOpen(false);
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro ao criar pessoa", description: error.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleUpdate = async (profile: Profile) => {
    setIsSaving(true);
    try {
      const body: any = {
        target_user_id: profile.id,
        full_name: editForm.full_name,
        sector: editForm.sector,
        role_title: editForm.role_title,
        role: editForm.role,
      };
      if (editForm.email.trim() && editForm.email !== profile.email) body.new_email = editForm.email;
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
      await handleSaveTabPermissions(profile.id, userAllowedTabs);
      toast({ title: "Pessoa atualizada!" });
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleAvatarUpload = async (profile: Profile, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/avatar.${ext}`;

    setIsSaving(true);
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
        body: JSON.stringify({ target_user_id: profile.id, avatar_url: avatarUrl }),
      });
      if (!avatarRes.ok) { const d = await avatarRes.json(); throw new Error(d.error ?? "Erro ao atualizar avatar"); }

      toast({ title: "Foto atualizada!" });
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleAction = async (userId: string, action: "ban" | "unban" | "delete") => {
    setIsSaving(true);
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
        ban: "Pessoa inativada!",
        unban: "Pessoa reativada!",
        delete: "Pessoa excluída!",
      };
      toast({ title: messages[action] });
      setDeleteConfirm(null);
      setBanConfirm(null);
      if (action === "delete") setExpandedId(null);
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  if (!isAdmin) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4" />
                Pessoas
              </CardTitle>
              <CardDescription className="text-[13px] mt-1">
                Uma pessoa, um lugar: perfil, acesso, módulos e abas do projeto. Clique numa pessoa para abrir tudo dela.
              </CardDescription>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 h-9 shrink-0"><Plus className="w-4 h-4" /> Nova pessoa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Criar nova pessoa</DialogTitle></DialogHeader>
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
                      <SectorSelect value={form.sector} onValueChange={(v) => setForm({ ...form, sector: v })} sectors={sectors} onSectorsChange={setSectors} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Cargo / Nível</Label>
                      <RoleTitleSelect value={form.role_title} onValueChange={(v) => setForm({ ...form, role_title: v })} titles={titles} onTitlesChange={setTitles} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Perfil de Acesso</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="user">Membro</SelectItem>
                        <SelectItem value="visualizador">Visualizador (só leitura)</SelectItem>
                        <SelectItem value="convidado">Convidado (externo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} disabled={isSaving}>{isSaving ? "Criando..." : "Criar pessoa"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Toolbar: busca + filtro por estado */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
              {STATE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStateFilter(f.key)}
                  className={cn(
                    "text-[13px] px-3 py-1.5 rounded-md transition-colors",
                    stateFilter === f.key ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {stateFilter !== "pending" && pendingCount > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span><b className="text-amber-700 dark:text-amber-400 font-medium">{pendingCount} pendente(s)</b> — dá para pré-configurar tudo antes da aprovação.</span>
            </p>
          )}

          {/* Lista densa */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma pessoa encontrada.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Cabeçalho de colunas */}
              <div className="hidden sm:grid grid-cols-[1fr_84px_120px_28px] gap-3 items-center px-4 py-2 bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Pessoa</span>
                <span>Estado</span>
                <span>Módulos</span>
                <span />
              </div>

              {filtered.map((profile) => {
                const st = userState(profile);
                const admin = isAdminUser(profile.id);
                const gestor = isGestorUser(profile.id);
                const modules = getUserModules(profile.id);
                const isOpen = expandedId === profile.id;
                const isSelf = profile.id === currentUser?.id;
                const subtitle = [profile.role_title, gestor ? "Gestor" : null].filter(Boolean).join(" · ")
                  || (st === "pending" ? "aguardando aprovação" : profile.email);

                return (
                  <div key={profile.id} className="border-t border-border first:border-t-0">
                    {/* Linha compacta */}
                    <button
                      type="button"
                      onClick={() => handleToggleExpand(profile)}
                      className={cn(
                        "w-full grid grid-cols-[1fr_84px_120px_28px] gap-3 items-center px-4 py-2.5 text-left transition-colors",
                        "hover:bg-muted/40 cursor-pointer",
                        isOpen && "bg-muted/40",
                      )}
                    >
                      {/* Pessoa */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={profile.avatar_url || undefined} className={st !== "active" ? "grayscale" : ""} />
                          <AvatarFallback className="text-[10px]">{getInitials(profile.full_name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className={cn("text-[13px] font-medium truncate", st !== "active" && "line-through text-muted-foreground")}>
                            {profile.full_name || "Sem nome"}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground truncate">{subtitle}</div>
                        </div>
                      </div>
                      {/* Estado */}
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full justify-self-start", STATE_META[st].cls)}>
                        {STATE_META[st].label}
                      </span>
                      {/* Módulos (visão rápida) */}
                      {admin ? (
                        <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Total
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="flex gap-[2px]">
                            {ALL_MODULE_KEYS.map((k) => (
                              <span
                                key={k}
                                className={cn("w-[7px] h-[7px] rounded-[2px]", modules.includes(k) ? "bg-primary" : "bg-border")}
                              />
                            ))}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {modules.length}/{ALL_MODULES.length}
                          </span>
                        </span>
                      )}
                      {/* Chevron */}
                      <ChevronRight className={cn("w-4 h-4 text-muted-foreground justify-self-center transition-transform", isOpen && "rotate-90")} />
                    </button>

                    {/* Painel expandido — detalhe inline com subtabs */}
                    {isOpen && (
                      <div className="px-4 pt-3 pb-4 bg-background border-t border-border">
                        {/* Subtabs leves */}
                        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5 w-fit mb-4">
                          {DETAIL_TABS.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setDetailTab(t.key)}
                              className={cn(
                                "text-[12.5px] px-3 py-1 rounded-md transition-colors",
                                detailTab === t.key ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        {/* ── Perfil & Acesso ── */}
                        {detailTab === "profile" && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="relative group shrink-0">
                                <Avatar className="h-14 w-14">
                                  <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name || ""} />
                                  <AvatarFallback className="bg-primary/15 text-primary">{getInitials(profile.full_name)}</AvatarFallback>
                                </Avatar>
                                <button
                                  type="button"
                                  className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => avatarInputRef.current?.click()}
                                >
                                  <Camera className="w-4 h-4 text-white" />
                                </button>
                                <input
                                  ref={avatarInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => handleAvatarUpload(profile, e)}
                                />
                              </div>
                              <div className="text-[11px] text-muted-foreground space-y-0.5">
                                <p>Cadastrado em: {new Date(profile.created_at).toLocaleDateString("pt-BR")}</p>
                                <p>ID: {profile.id.substring(0, 8)}…</p>
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><User className="w-3.5 h-3.5" /> Nome Completo</Label>
                              <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
                            </div>

                            <div className="grid gap-2">
                              <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Mail className="w-3.5 h-3.5" /> E-mail</Label>
                              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="email@empresa.com" />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div className="grid gap-2">
                                <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Building2 className="w-3.5 h-3.5" /> Setor</Label>
                                <SectorSelect value={editForm.sector} onValueChange={(v) => setEditForm({ ...editForm, sector: v })} sectors={sectors} onSectorsChange={setSectors} />
                              </div>
                              <div className="grid gap-2">
                                <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Briefcase className="w-3.5 h-3.5" /> Cargo / Nível</Label>
                                <RoleTitleSelect value={editForm.role_title} onValueChange={(v) => setEditForm({ ...editForm, role_title: v })} titles={titles} onTitlesChange={setTitles} />
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Shield className="w-3.5 h-3.5" /> Perfil de Acesso</Label>
                              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Administrador</SelectItem>
                                  <SelectItem value="gestor">Gestor</SelectItem>
                                  <SelectItem value="user">Membro</SelectItem>
                                  <SelectItem value="visualizador">Visualizador (só leitura)</SelectItem>
                                  <SelectItem value="convidado">Convidado (externo)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid gap-2">
                              <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Key className="w-3.5 h-3.5" /> Redefinir Senha</Label>
                              <Input
                                type="password"
                                value={editForm.new_password}
                                onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
                                placeholder="Deixe vazio para não alterar"
                              />
                            </div>

                            <div className="space-y-2 border-t border-border pt-4">
                              <Button className="w-full" onClick={() => handleUpdate(profile)} disabled={isSaving}>
                                {isSaving ? "Salvando..." : "Salvar"}
                              </Button>

                              {!isSelf && (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                                  {profile.is_active === false ? (
                                    <Button
                                      variant="outline"
                                      className="gap-1"
                                      onClick={() => setBanConfirm({ profile, action: "unban" })}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" /> {isOAuthPending(profile) ? "Aprovar" : "Reativar"}
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      className="gap-1"
                                      onClick={() => setBanConfirm({ profile, action: "ban" })}
                                    >
                                      <Ban className="w-3.5 h-3.5" /> Desativar
                                    </Button>
                                  )}
                                  <Button variant="destructive" size="icon" onClick={() => setDeleteConfirm(profile)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Módulos ── */}
                        {detailTab === "modules" && (
                          admin ? (
                            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
                              <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                              <p className="text-[12.5px] text-foreground">
                                Admin tem acesso completo a todos os módulos.
                              </p>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-2 mb-2.5">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Módulos liberados</span>
                                <div className="ml-auto flex items-center gap-2 text-[11px]">
                                  <button type="button" className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [...ALL_MODULE_KEYS], modules)}>Marcar todos</button>
                                  <span className="text-muted-foreground/40">·</span>
                                  <button type="button" className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [], modules)}>Limpar</button>
                                  <span className="text-muted-foreground/40">·</span>
                                  <button type="button" className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [...DEFAULT_MODULES], modules)}>Padrão</button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                                {ALL_MODULES.map((mod) => (
                                  <label key={mod.key} className="flex items-center gap-2 cursor-pointer">
                                    <Switch
                                      checked={modules.includes(mod.key)}
                                      onCheckedChange={() => toggleModule(profile.id, mod.key)}
                                      className="scale-90"
                                    />
                                    <span className="text-[12.5px] text-foreground">{mod.label}</span>
                                  </label>
                                ))}
                              </div>
                              {gestor && (
                                <p className="text-[11px] text-muted-foreground mt-3">
                                  Gestor: a restrição de módulos passa a valer no menu lateral.
                                </p>
                              )}
                              {st === "pending" && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-3">
                                  Pré-configurado — os módulos passam a valer assim que a pessoa for aprovada.
                                </p>
                              )}
                            </div>
                          )
                        )}

                        {/* ── Abas do projeto ── */}
                        {detailTab === "tabs" && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Abas visíveis no projeto</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">Todas</span>
                                <Switch
                                  checked={userAllowedTabs.length === ALL_TAB_VALUES.length}
                                  onCheckedChange={toggleAllTabs}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {ALL_PROJECT_TABS.map((tab) => (
                                <div key={tab.value} className="flex items-center justify-between p-2 rounded-lg border border-border">
                                  <span className="text-[12.5px] font-medium text-foreground">{tab.label}</span>
                                  <Switch
                                    checked={userAllowedTabs.includes(tab.value)}
                                    disabled={tab.value === "kanban"}
                                    onCheckedChange={() => toggleTab(tab.value)}
                                  />
                                </div>
                              ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              As abas são salvas junto com o botão “Salvar” em Perfil &amp; Acesso.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Pessoa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm?.full_name}</strong>? Esta ação é irreversível e removerá todos os dados da pessoa.
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
            <AlertDialogTitle>{banConfirm?.action === "ban" ? "Desativar" : "Reativar"} Pessoa</AlertDialogTitle>
            <AlertDialogDescription>
              {banConfirm?.action === "ban"
                ? `${banConfirm?.profile.full_name} não poderá mais fazer login no sistema.`
                : `${banConfirm?.profile.full_name} poderá fazer login novamente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => banConfirm && handleAction(banConfirm.profile.id, banConfirm.action)}>
              {banConfirm?.action === "ban" ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
