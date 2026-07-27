import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Search, LayoutGrid, ChevronRight, ShieldCheck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { ALL_MODULES, ALL_MODULE_KEYS, DEFAULT_MODULES } from "@/lib/modules";

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  provider: string | null;
  last_login_at: string | null;
  role_title: string | null;
}

interface UserRole {
  user_id: string;
  role: string;
}

type StateFilter = "all" | "active" | "pending" | "inactive";

const STATE_FILTERS: { key: StateFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "pending", label: "Pendentes" },
  { key: "inactive", label: "Inativos" },
];

export function ModulePermissions() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [{ data: profilesData }, { data: rolesData }, { data: permsData }] = await Promise.all([
      supabase.from("profiles")
        .select("id, email, full_name, avatar_url, is_active, provider, last_login_at, role_title")
        .order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_module_permissions").select("user_id, allowed_modules"),
    ]);
    setProfiles((profilesData as unknown as Profile[]) || []);
    setRoles(rolesData || []);
    const permsMap: Record<string, string[]> = {};
    (permsData || []).forEach((p: any) => { permsMap[p.user_id] = p.allowed_modules; });
    setPermissions(permsMap);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  if (!isAdmin) return null;

  const getUserRole = (userId: string) => roles.find((r) => r.user_id === userId)?.role || "user";
  const isAdminUser = (userId: string) => getUserRole(userId) === "admin";
  const isGestorUser = (userId: string) => getUserRole(userId) === "gestor";

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
      return (p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q));
    });
  }, [profiles, search, stateFilter, roles]);

  const pendingCount = useMemo(
    () => profiles.filter((p) => userState(p) === "pending").length,
    [profiles],
  );

  const getInitials = (name: string | null) =>
    name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";

  const STATE_META = {
    active:   { label: "Ativo",    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    pending:  { label: "Pendente", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    inactive: { label: "Inativo",  cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  } as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutGrid className="w-4 h-4" />
          Permissões de Módulos
        </CardTitle>
        <CardDescription className="text-[13px]">
          Controle quais módulos do menu cada pessoa acessa. Admins têm acesso completo; gestores podem ser ajustados.
        </CardDescription>
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
            <span><b className="text-amber-700 dark:text-amber-400 font-medium">{pendingCount} pendente(s)</b> — dá para pré-configurar os módulos antes da aprovação.</span>
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
              const isOpen = expandedId === profile.id && !admin;
              const subtitle = [profile.role_title, gestor ? "Gestor" : null].filter(Boolean).join(" · ")
                || (st === "pending" ? "aguardando aprovação" : profile.email);

              return (
                <div key={profile.id} className="border-t border-border first:border-t-0">
                  {/* Linha compacta */}
                  <button
                    type="button"
                    onClick={() => !admin && setExpandedId(isOpen ? null : profile.id)}
                    className={cn(
                      "w-full grid grid-cols-[1fr_84px_120px_28px] gap-3 items-center px-4 py-2.5 text-left transition-colors",
                      !admin && "hover:bg-muted/40 cursor-pointer",
                      admin && "cursor-default",
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
                    {admin ? (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground/40 justify-self-center" />
                    ) : (
                      <ChevronRight className={cn("w-4 h-4 text-muted-foreground justify-self-center transition-transform", isOpen && "rotate-90")} />
                    )}
                  </button>

                  {/* Painel expandido — só de quem está aberto */}
                  {isOpen && (
                    <div className="px-4 pt-2 pb-4 bg-background border-t border-border">
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Módulos liberados</span>
                        <div className="ml-auto flex items-center gap-2 text-[11px]">
                          <button className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [...ALL_MODULE_KEYS], modules)}>Marcar todos</button>
                          <span className="text-muted-foreground/40">·</span>
                          <button className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [], modules)}>Limpar</button>
                          <span className="text-muted-foreground/40">·</span>
                          <button className="text-primary hover:underline" onClick={() => setUserModules(profile.id, [...DEFAULT_MODULES], modules)}>Padrão</button>
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
