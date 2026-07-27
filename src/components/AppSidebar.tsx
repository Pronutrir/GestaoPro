'use client';
import {
  Home,
  Users,
  BarChart3,
  AlertTriangle,
  FolderKanban,
  Settings,
  GanttChart,
  Map,
  DollarSign,
  Layers,
  ShieldCheck,
  Calendar,
  Trash2,
  Briefcase,
  Bot,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { DEFAULT_MODULES } from "@/lib/modules";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

// Navegação organizada em SEÇÕES (Trabalho · Gestão · Sistema) para escanear
// mais rápido. Cada item mantém minRole (barreira de papel) e moduleKey
// (barreira de módulo). Rótulos enxutos e ícones distintos entre si.
type NavItem = {
  path: string; label: string; icon: typeof Home;
  minRole: "user" | "gestor" | "qualidade" | "admin"; moduleKey: string;
};
type NavSection = { title: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Trabalho",
    items: [
      { path: "/", label: "Visão Geral", icon: Home, minRole: "user", moduleKey: "overview" },
      { path: "/projects", label: "Projetos", icon: FolderKanban, minRole: "user", moduleKey: "projects" },
      { path: "/timeline", label: "Cronograma", icon: GanttChart, minRole: "user", moduleKey: "timeline" },
      { path: "/roadmap", label: "Roadmap", icon: Map, minRole: "user", moduleKey: "roadmap" },
      { path: "/team", label: "Equipe", icon: Users, minRole: "user", moduleKey: "team" },
      { path: "/calendario", label: "Calendário", icon: Calendar, minRole: "user", moduleKey: "calendario" },
      { path: "/blocked-projects", label: "Bloqueios", icon: AlertTriangle, minRole: "user", moduleKey: "blocked" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { path: "/investments", label: "Financeiro", icon: DollarSign, minRole: "gestor", moduleKey: "investments" },
      { path: "/reports", label: "Relatórios", icon: BarChart3, minRole: "gestor", moduleKey: "reports" },
      { path: "/indicadores-lab", label: "Indicadores LAB", icon: Briefcase, minRole: "gestor", moduleKey: "reports" },
      { path: "/qualidade", label: "Qualidade", icon: ShieldCheck, minRole: "qualidade", moduleKey: "qualidade" },
      { path: "/csc", label: "CSC", icon: Layers, minRole: "gestor", moduleKey: "csc" },
      { path: "/trash", label: "Arquivo", icon: Trash2, minRole: "gestor", moduleKey: "projects" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { path: "/agent", label: "Agente de IA", icon: Bot, minRole: "user", moduleKey: "agent" },
      { path: "/settings", label: "Configurações", icon: Settings, minRole: "admin", moduleKey: "settings" },
    ],
  },
];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, isGestor, canManage, user, profile } = useAuth();
  const userSector = profile?.sector?.toLowerCase() || "";
  const isQualidade = userSector === "qualidade";
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null);

  useEffect(() => {
    // Admin sempre tem acesso total → não precisa buscar módulos.
    // Gestor e usuário comum respeitam allowedModules SE houver linha gravada.
    if (!user?.id || isAdmin) return;
    const fetchModules = async () => {
      const { data } = await supabase
        .from("user_module_permissions")
        .select("allowed_modules")
        .eq("user_id", user.id)
        .maybeSingle();
      // Sem linha configurada:
      //  - Gestor → null (sem restrição; preserva o "vê tudo" atual até o
      //    admin configurar explicitamente).
      //  - Usuário comum → DEFAULT_MODULES (conjunto essencial).
      const fallback = isGestor ? null : DEFAULT_MODULES;
      setAllowedModules(data?.allowed_modules ?? fallback);
    };
    fetchModules();

    const channel = supabase
      .channel(`module-perms-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "user_module_permissions",
        filter: `user_id=eq.${user.id}`,
      }, () => fetchModules())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, isGestor]);

  // Papel permite ver este item? (independente de módulo)
  const roleAllows = (minRole: string) => {
    if (minRole === "admin") return isAdmin;
    if (minRole === "gestor" || minRole === "qualidade") return canManage;
    return true; // "user": qualquer autenticado
  };

  const canSeeItem = (item: NavItem) => {
    // 1) Barreira de PAPEL.
    if (!roleAllows(item.minRole)) return false;
    // 2) Admin sempre vê tudo que o papel permite (sem checar módulos).
    if (isAdmin) return true;
    // 3) Regras específicas por rota (independem de módulo).
    // Usuários do setor qualidade não veem "Projetos".
    if (item.path === "/projects" && isQualidade) return false;
    // Roadmap é onde o usuário acompanha/edita as próprias solicitações —
    // fica fora do controle por módulo para não bloquear os próprios pedidos.
    if (item.path === "/roadmap") return true;
    // 4) Barreira de MÓDULO (aplica a gestor E usuário comum agora).
    if (allowedModules && !allowedModules.includes(item.moduleKey)) return false;
    return true;
  };

  // Seções com pelo menos um item visível (evita rótulo de seção vazia).
  const visibleSections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter(canSeeItem) }))
    .filter((s) => s.items.length > 0);

  return (
    <Sidebar side="left" collapsible="icon">
      <div className={`py-3 ${collapsed ? "px-2" : "px-3"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
          <SidebarTrigger className="h-9 w-9 border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground hover:border-sidebar-primary transition-colors shrink-0" />
          {!collapsed && <BrandLogo size={28} showLabel labelClassName="text-lg font-bold text-sidebar-foreground" />}
        </div>
      </div>

      <SidebarContent>
        {visibleSections.map((section) => (
          <SidebarGroup key={section.title} className="py-1">
            {!collapsed && (
              <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                {section.title}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild tooltip={collapsed ? item.label : undefined} className="h-9">
                      <NavLink
                        href={item.path}
                        end
                        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-[13.5px]"
                        activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-semibold hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && <span className="ml-2.5">{item.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
