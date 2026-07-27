'use client';

import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, ShieldCheck, User, Mail, Building2, Briefcase,
  Key, Shield, Ban, CheckCircle2, Trash2, Camera, Users,
  ChevronLeft, ChevronRight, Settings2, SlidersHorizontal, X,
  Blocks, LayoutGrid, Lock,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
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
import { ACCESS_LEVELS, accessLevelKey, roleFromAccessKey, accessLabelForRole } from "@/lib/accessLevels";
import { SectorSelect } from "@/components/settings/SectorSelect";
import { TaxonomyManager } from "@/components/settings/TaxonomyManager";

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
type GroupBy = "sector" | "role_title" | "none";

/**
 * Escala tipográfica da tela — FONTE ÚNICA. Em vez de dezenas de tamanhos
 * "quase iguais" espalhados, 5 degraus com propósito claro (evita o mosaico
 * de 10/10.5/11/11.5/12/12.5/13… que se acumulou nas iterações).
 */
const TYPO = {
  title: "text-[15px] font-semibold",      // nome da pessoa
  section: "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", // eyebrow de seção
  label: "text-xs font-medium text-muted-foreground", // rótulo de campo
  body: "text-[13px]",                      // conteúdo / itens
  meta: "text-[11px] text-muted-foreground", // metadados / descrições
  badge: "text-[10px] font-semibold uppercase tracking-wide", // pílulas
} as const;

const STATE_FILTERS: { key: StateFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "pending", label: "Pendentes" },
  { key: "inactive", label: "Inativos" },
];

const GROUP_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "sector", label: "Setor" },
  { key: "role_title", label: "Cargo" },
  { key: "none", label: "Nenhum" },
];

/**
 * Campo de NÍVEL DE ACESSO — um Select com os níveis (Direção…Externo) e um
 * interruptor "Administrador" (acesso total). Quando admin está ligado, o nível
 * fica desabilitado (o acesso total prevalece). Fonte única: lib/accessLevels.
 */
function AccessLevelField({
  accessKey, admin, onAccessKeyChange, onAdminChange,
}: {
  accessKey: string;
  admin: boolean;
  onAccessKeyChange: (k: string) => void;
  onAdminChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2.5">
      <Select value={accessKey} onValueChange={onAccessKeyChange} disabled={admin}>
        <SelectTrigger className={admin ? "opacity-50" : undefined}>
          <SelectValue placeholder="Selecione o nível" />
        </SelectTrigger>
        <SelectContent>
          {ACCESS_LEVELS.map((l) => (
            <SelectItem key={accessLevelKey(l)} value={accessLevelKey(l)}>
              <span className="flex items-center gap-2">
                <span>{l.label}</span>
                <span className="text-[11px] text-muted-foreground">· {l.hint}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Administrador do sistema
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Acesso total a Configurações e a todos os módulos, independente do nível.
          </div>
        </div>
        <Switch checked={admin} onCheckedChange={onAdminChange} />
      </div>
    </div>
  );
}

const STATE_META = {
  active:   { label: "Ativo",    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  pending:  { label: "Pendente", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  inactive: { label: "Inativo",  cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
} as const;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("sector");
  const [manageListsDialog, setManageListsDialog] = useState<"sectors" | "job_titles" | null>(null);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [tabsOpen, setTabsOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Profile | null>(null);
  const [banConfirm, setBanConfirm] = useState<{ profile: Profile; action: "ban" | "unban" } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const searchParams = useSearchParams();
  const focusHandled = useRef(false);

  // accessKey = chave do nível exibido (ex.: "coordenador"); admin = interruptor
  // de acesso total. O app_role final é derivado no submit (roleFromForm).
  const [form, setForm] = useState({
    email: "", password: "", full_name: "", sector: "", role_title: "",
    accessKey: "colaborador", admin: false,
  });
  const [editForm, setEditForm] = useState({
    full_name: "", email: "", sector: "", role_title: "", new_password: "",
    accessKey: "colaborador", admin: false,
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
  // Gestão = gestor OU coordenador (acesso equivalente).
  const isGestorUser = (userId: string) => ["gestor", "coordenador"].includes(getUserRole(userId));

  // Converte um app_role gravado → estado do formulário (nível + admin).
  const roleToForm = (role: string) => {
    if (role === "admin") return { accessKey: "colaborador", admin: true };
    const level = ACCESS_LEVELS.find((l) => l.value === role);
    return { accessKey: level ? accessLevelKey(level) : "colaborador", admin: false };
  };
  // Deriva o app_role final a partir do formulário (admin vence).
  const roleFromForm = (f: { accessKey: string; admin: boolean }) =>
    f.admin ? "admin" : roleFromAccessKey(f.accessKey);

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

  // Agrupa a lista filtrada em raias por setor/cargo (ou uma raia única).
  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "", people: filtered }];
    }
    const buckets = new Map<string, Profile[]>();
    filtered.forEach((p) => {
      const raw = ((p[groupBy] as string) || "").trim();
      const label = raw || (groupBy === "sector" ? "Sem setor" : "Sem cargo");
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label)!.push(p);
    });
    // Ordena as raias por nome; "Sem …" sempre por último.
    const semLabel = groupBy === "sector" ? "Sem setor" : "Sem cargo";
    return Array.from(buckets.entries())
      .sort(([a], [b]) => {
        if (a === semLabel) return 1;
        if (b === semLabel) return -1;
        return a.localeCompare(b);
      })
      .map(([label, people]) => ({ key: label, label, people }));
  }, [filtered, groupBy]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) || null,
    [profiles, selectedId],
  );

  // Ao expandir: preencher o form de edição e carregar (lazy) as abas do projeto.
  const openUserDetail = async (profile: Profile) => {
    setEditForm({
      full_name: profile.full_name || "",
      email: profile.email || "",
      sector: profile.sector || "",
      role_title: profile.role_title || "",
      new_password: "",
      ...roleToForm(getUserRole(profile.id)),
    });

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

  // Seleciona uma pessoa (mostra a ficha na coluna direita).
  const handleSelect = (profile: Profile) => {
    setSelectedId(profile.id);
    setModulesOpen(false);
    setTabsOpen(false);
    openUserDetail(profile);
  };

  // Foco vindo de link externo (?focus=<id>) ou seleção inicial automática:
  // abre a pessoa e rola até ela na lista. Roda uma única vez após carregar.
  useEffect(() => {
    if (focusHandled.current || loading || profiles.length === 0) return;
    focusHandled.current = true;
    const focusId = searchParams.get("focus");
    const target = (focusId && profiles.find((p) => p.id === focusId)) || null;
    if (!target) return;
    setSelectedId(target.id);
    openUserDetail(target);
    setTimeout(() => {
      rowRefs.current[target.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [loading, profiles, searchParams]);

  // Atalho Ctrl/⌘K foca a busca da barra de comando.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          sector: form.sector,
          role_title: form.role_title,
          role: roleFromForm(form),
        }),
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
      setForm({ email: "", password: "", full_name: "", sector: "", role_title: "", accessKey: "colaborador", admin: false });
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
        role: roleFromForm(editForm),
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
      if (action === "delete") setSelectedId(null);
      await fetchData({ force: true });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  if (!isAdmin) return null;

  // Ficha completa da pessoa (coluna direita) — seções empilhadas, sem sub-abas.
  const renderDetail = (
    profile: Profile,
    { st, admin, gestor, modules, isSelf }: {
      st: "active" | "pending" | "inactive"; admin: boolean; gestor: boolean;
      modules: string[]; isSelf: boolean;
    },
  ) => (
    <div className="space-y-5">
      {/* Cabeçalho da ficha: avatar + nome + estado */}
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
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleAvatarUpload(profile, e)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn(TYPO.title, "truncate")}>{profile.full_name || "Sem nome"}</div>
          <div className={cn(TYPO.meta, "truncate")}>
            {profile.email} · desde {new Date(profile.created_at).toLocaleDateString("pt-BR")}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn(TYPO.badge, "px-2 py-0.5 rounded-full bg-primary/10 text-primary")}>
            {accessLabelForRole(getUserRole(profile.id))}
          </span>
          <span className={cn(TYPO.badge, "px-2 py-0.5 rounded-full", STATE_META[st].cls)}>
            {STATE_META[st].label}
          </span>
        </div>
      </div>

      {/* ── Identificação ── */}
      <section className="space-y-3">
        <h3 className={cn(TYPO.section, "border-b border-border pb-1.5")}>Identificação</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label className={cn("flex items-center gap-1.5", TYPO.label)}><User className="w-3.5 h-3.5" /> Nome completo</Label>
            <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label className={cn("flex items-center gap-1.5", TYPO.label)}><Mail className="w-3.5 h-3.5" /> E-mail</Label>
            <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="email@empresa.com" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label className={cn("flex items-center gap-1.5", TYPO.label)}><Key className="w-3.5 h-3.5" /> Redefinir senha</Label>
          <Input type="password" value={editForm.new_password} onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })} placeholder="Deixe vazio para não alterar" />
        </div>
      </section>

      {/* ── Organização ── */}
      <section className="space-y-3">
        <h3 className={cn(TYPO.section, "border-b border-border pb-1.5")}>Organização</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label className={cn("flex items-center gap-1.5", TYPO.label)}><Building2 className="w-3.5 h-3.5" /> Setor</Label>
            <SectorSelect value={editForm.sector} onValueChange={(v) => setEditForm({ ...editForm, sector: v })} sectors={sectors} onSectorsChange={setSectors} />
          </div>
          <div className="grid gap-2">
            <Label className={cn("flex items-center gap-1.5", TYPO.label)}><Briefcase className="w-3.5 h-3.5" /> Cargo <span className="normal-case text-muted-foreground/70">(descritivo, opcional)</span></Label>
            <RoleTitleSelect value={editForm.role_title} onValueChange={(v) => setEditForm({ ...editForm, role_title: v })} titles={titles} onTitlesChange={setTitles} />
          </div>
        </div>
      </section>

      {/* ── Acesso ── */}
      <section className="space-y-3">
        <h3 className={cn(TYPO.section, "border-b border-border pb-1.5")}>Acesso</h3>
        <div className="grid gap-2">
          <Label className={cn("flex items-center gap-1.5", TYPO.label)}><Shield className="w-3.5 h-3.5" /> Nível de acesso</Label>
          <AccessLevelField
            accessKey={editForm.accessKey}
            admin={editForm.admin}
            onAccessKeyChange={(k) => setEditForm({ ...editForm, accessKey: k })}
            onAdminChange={(v) => setEditForm({ ...editForm, admin: v })}
          />
        </div>

        {/* ── Módulos do sistema — resumo que expande ── */}
        {admin ? (
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p className="text-[13px] text-foreground">Admin tem acesso completo a todos os módulos e abas.</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setModulesOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", modulesOpen && "rotate-90")} />
                <span className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Blocks className="w-4 h-4 text-primary" /></span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", TYPO.body, "font-medium")}>Módulos do sistema</span>
                  <span className={cn("block", TYPO.meta)}>O que aparece no menu lateral</span>
                </span>
                <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5 tabular-nums shrink-0">
                  {modules.length} de {ALL_MODULES.length}
                </span>
              </button>
              {modulesOpen && (
                <div className="border-t border-border p-3 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2.5 text-[11px]">
                    <button type="button" className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [...ALL_MODULE_KEYS], modules)}>Todos</button>
                    <span className="text-muted-foreground/40">·</span>
                    <button type="button" className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [], modules)}>Nenhum</button>
                    <span className="text-muted-foreground/40">·</span>
                    <button type="button" className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [...DEFAULT_MODULES], modules)}>Padrão</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                    {ALL_MODULES.map((mod) => (
                      <label key={mod.key} className="flex items-center gap-2 cursor-pointer">
                        <Switch checked={modules.includes(mod.key)} onCheckedChange={() => toggleModule(profile.id, mod.key)} className="scale-90" />
                        <span className="text-[13px] text-foreground truncate">{mod.label}</span>
                      </label>
                    ))}
                  </div>
                  {gestor && <p className="text-[11px] text-muted-foreground mt-2.5">Gestor: a restrição de módulos passa a valer no menu lateral.</p>}
                  {st === "pending" && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2.5">Pré-configurado — passa a valer assim que a pessoa for aprovada.</p>}
                </div>
              )}
            </div>

            {/* ── Abas do projeto — resumo que expande ── */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setTabsOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", tabsOpen && "rotate-90")} />
                <span className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><LayoutGrid className="w-4 h-4 text-primary" /></span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block", TYPO.body, "font-medium")}>Abas do projeto</span>
                  <span className={cn("block", TYPO.meta)}>O que aparece dentro de cada projeto</span>
                </span>
                <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5 tabular-nums shrink-0">
                  {userAllowedTabs.length} de {ALL_TAB_VALUES.length}
                </span>
              </button>
              {tabsOpen && (
                <div className="border-t border-border p-3 bg-muted/20">
                  <div className="flex items-center gap-2 mb-2.5 text-[11px]">
                    <button type="button" className="text-primary hover:underline" onClick={() => toggleAllTabs(true)}>Todas</button>
                    <span className="text-muted-foreground/40">·</span>
                    <button type="button" className="text-primary hover:underline" onClick={() => toggleAllTabs(false)}>Nenhuma</button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {ALL_PROJECT_TABS.map((tab) => (
                      <div key={tab.value} className="flex items-center justify-between p-2 rounded-lg border border-border">
                        <span className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
                          {tab.value === "kanban" && <Lock className="w-3 h-3 text-muted-foreground" />}
                          {tab.label}
                        </span>
                        <Switch checked={userAllowedTabs.includes(tab.value)} disabled={tab.value === "kanban"} onCheckedChange={() => toggleTab(tab.value)} />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2.5">Kanban fica sempre ativo — é a visão base do projeto.</p>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Ações */}
      <div className="space-y-2 border-t border-border pt-4 sticky bottom-0 bg-card">
        <Button className="w-full" onClick={() => handleUpdate(profile)} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Salvar alterações"}
        </Button>
        {!isSelf && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            {profile.is_active === false ? (
              <Button variant="outline" className="gap-1" onClick={() => setBanConfirm({ profile, action: "unban" })}>
                <CheckCircle2 className="w-3.5 h-3.5" /> {isOAuthPending(profile) ? "Aprovar" : "Reativar"}
              </Button>
            ) : (
              <Button variant="outline" className="gap-1" onClick={() => setBanConfirm({ profile, action: "ban" })}>
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
  );

  return (
    <>
      {/* Diálogo controlado de criação (aberto pela toolbar) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
              <Label>Nível de acesso</Label>
              <AccessLevelField
                accessKey={form.accessKey}
                admin={form.admin}
                onAccessKeyChange={(k) => setForm({ ...form, accessKey: k })}
                onAdminChange={(v) => setForm({ ...form, admin: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={isSaving}>{isSaving ? "Criando..." : "Criar pessoa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ Tela única: toolbar + lista (master) | ficha (detail) ══ */}
      <Card className="overflow-hidden">
        {/* ── Barra: buscar · filtrar · nova pessoa ── */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Buscar pessoa…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-[13px] bg-muted/40 border-transparent focus-visible:bg-background"
            />
          </div>

          {/* Botão dividido único: [⚙️ | + Nova pessoa] — uma peça coesa */}
          <div className="inline-flex items-center h-9 shrink-0 rounded-md bg-primary text-primary-foreground overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setManageListsDialog("sectors")}
              title="Gerenciar setores e cargos"
              className="h-full px-2.5 flex items-center justify-center hover:bg-black/10 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <span className="w-px h-5 bg-primary-foreground/25" />
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-full pl-2.5 pr-3.5 flex items-center gap-1.5 text-[13px] font-medium hover:bg-black/10 transition-colors"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova pessoa</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr]">
          {/* ── MASTER: lista de pessoas ── */}
          <div className={cn("md:border-r border-border flex flex-col", selectedProfile && "hidden md:flex")}>
            {/* Cabeçalho da lista: contagem + chip de filtro ativo + Filtrar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <span className="text-[11px] font-medium text-foreground">{loading ? "…" : profiles.length} pessoa{profiles.length === 1 ? "" : "s"}</span>
              {pendingCount > 0 && (
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">
                  {pendingCount} pendente{pendingCount === 1 ? "" : "s"}
                </span>
              )}
              {stateFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setStateFilter("all")}
                  className="inline-flex items-center gap-1 text-[11px] text-primary bg-primary/10 rounded-full pl-2 pr-1.5 py-0.5"
                >
                  {STATE_FILTERS.find((f) => f.key === stateFilter)?.label}
                  <X className="w-3 h-3" />
                </button>
              )}
              <div className="flex-1" />
              {/* Filtrar — pertence à lista (é ela que ele filtra) */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border transition-colors",
                      stateFilter !== "all" || groupBy !== "sector"
                        ? "border-primary/30 text-primary bg-primary/5"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Filtrar
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3 space-y-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Estado</div>
                    <div className="flex flex-wrap gap-1">
                      {STATE_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setStateFilter(f.key)}
                          className={cn(
                            "text-[11px] px-2.5 py-1 rounded-md border transition-colors",
                            stateFilter === f.key
                              ? "bg-primary/10 border-primary/30 text-primary font-medium"
                              : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:bg-muted/50",
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Agrupar por</div>
                    <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
                      {GROUP_OPTIONS.map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => setGroupBy(g.key)}
                          className={cn(
                            "flex-1 text-[11px] px-2 py-1 rounded-md transition-colors",
                            groupBy === g.key ? "bg-background text-foreground font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Lista agrupada */}
            <div className="flex-1 overflow-y-auto max-h-[calc(100vh-16rem)] md:max-h-[68vh]">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Carregando…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma pessoa encontrada.</p>
              ) : (
                grouped.map((g) => (
                  <div key={g.key}>
                    {g.label && (
                      <div className="sticky top-0 z-[1] flex items-center gap-1.5 px-3 py-2 bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                        {groupBy === "sector" ? <Building2 className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                        <span className="truncate">{g.label}</span>
                        <span className="ml-auto tabular-nums bg-background rounded-full px-1.5 py-0.5">{g.people.length}</span>
                      </div>
                    )}
                    {g.people.map((profile) => {
                      const st = userState(profile);
                      const isSel = selectedId === profile.id;
                      const levelLabel = accessLabelForRole(getUserRole(profile.id));
                      const line2 = groupBy === "role_title"
                        ? (profile.sector || (st === "pending" ? "aguardando aprovação" : profile.email))
                        : (profile.role_title || (st === "pending" ? "aguardando aprovação" : profile.email));
                      return (
                        <button
                          key={profile.id}
                          ref={(el) => { rowRefs.current[profile.id] = el; }}
                          type="button"
                          onClick={() => handleSelect(profile)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-border/60 transition-colors scroll-mt-16",
                            isSel ? "bg-primary/10 shadow-[inset_3px_0_0] shadow-primary" : "hover:bg-muted/40",
                          )}
                        >
                          <span className="relative shrink-0">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={profile.avatar_url || undefined} className={st !== "active" ? "grayscale" : ""} />
                              <AvatarFallback className="text-[11px]">{getInitials(profile.full_name)}</AvatarFallback>
                            </Avatar>
                            <span
                              title={st === "active" ? "Ativa" : st === "pending" ? "Pendente de aprovação" : "Inativa"}
                              className={cn(
                                "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-card",
                                st === "active" ? "bg-emerald-500" : st === "pending" ? "bg-amber-500" : "bg-red-500",
                              )}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className={cn("text-[13px] truncate", isSel ? "font-semibold" : "font-medium", st !== "active" && "text-muted-foreground")}>
                              {profile.full_name || "Sem nome"}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">{line2}</div>
                          </div>
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 shrink-0",
                            levelLabel === "Administrador" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                          )}>
                            {levelLabel === "Administrador" ? "Admin" : levelLabel === "Colaborador" ? "Colab" : levelLabel === "Coordenador" ? "Coord" : levelLabel === "Visualizador" ? "Leitura" : levelLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── DETAIL: ficha da pessoa selecionada ── */}
          <div className={cn("min-h-[420px]", !selectedProfile && "hidden md:block")}>
            {!selectedProfile ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16 text-muted-foreground">
                <span className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 opacity-50" />
                </span>
                <p className="text-[14px] font-medium text-foreground">Nenhuma pessoa selecionada</p>
                <p className="text-[13px] mt-0.5">Escolha alguém à esquerda para ver e editar tudo dela.</p>
              </div>
            ) : (
              (() => {
                const profile = selectedProfile;
                const st = userState(profile);
                const admin = isAdminUser(profile.id);
                const gestor = isGestorUser(profile.id);
                const modules = getUserModules(profile.id);
                const isSelf = profile.id === currentUser?.id;
                return (
                  <div className="p-5">
                    {/* Voltar (mobile) */}
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="md:hidden inline-flex items-center gap-1 text-[13px] text-muted-foreground mb-3"
                    >
                      <ChevronLeft className="w-4 h-4" /> Voltar à lista
                    </button>
                    {/* Placeholder — a ficha completa é montada abaixo */}
                    {renderDetail(profile, { st, admin, gestor, modules, isSelf })}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </Card>

      {/* Diálogo: gerenciar listas mestras (Setores / Cargos) — enxuto, abas */}
      <Dialog open={!!manageListsDialog} onOpenChange={(o) => !o && setManageListsDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerenciar listas</DialogTitle>
            <DialogDescription className="text-[13px]">
              Setores e cargos usados para classificar as pessoas. Renomeie, exclua ou limpe os sem uso.
            </DialogDescription>
          </DialogHeader>
          {manageListsDialog && <TaxonomyManager defaultTab={manageListsDialog} />}
        </DialogContent>
      </Dialog>

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
