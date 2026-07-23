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
  Target,
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

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const allNavItems = [
  { path: "/", label: "Visão Geral", icon: Home, minRole: "user" as const, moduleKey: "overview" },
  { path: "/projects", label: "Projetos", icon: FolderKanban, minRole: "user" as const, moduleKey: "projects" },
  // Módulo Portfólio em standby — mantido no código mas oculto da navegação
  // { path: "/portfolio", label: "Portfólio", icon: Briefcase, minRole: "gestor" as const, moduleKey: "portfolio" },
  { path: "/qualidade", label: "Gestão da Qualidade", icon: ShieldCheck, minRole: "qualidade" as const, moduleKey: "qualidade" },
  { path: "/team", label: "Equipe", icon: Users, minRole: "user" as const, moduleKey: "team" },
  { path: "/timeline", label: "Cronograma", icon: GanttChart, minRole: "user" as const, moduleKey: "timeline" },
  { path: "/blocked-projects", label: "Bloqueios", icon: AlertTriangle, minRole: "user" as const, moduleKey: "blocked" },
  { path: "/investments", label: "Gestão Financeira", icon: DollarSign, minRole: "gestor" as const, moduleKey: "investments" },
  // Visível a todos: qualquer um acompanha as demandas e edita as próprias
  // solicitações. Priorizar e mover estágio continuam restritos a gestor,
  // pelas ações dentro da página.
  { path: "/roadmap", label: "Roadmap", icon: Map, minRole: "user" as const, moduleKey: "roadmap" },
  { path: "/calendario", label: "Calendário", icon: Calendar, minRole: "user" as const, moduleKey: "calendario" },
  { path: "/agent", label: "Agente de IA", icon: Bot, minRole: "user" as const, moduleKey: "agent" },
  { path: "/reports", label: "Relatórios", icon: BarChart3, minRole: "gestor" as const, moduleKey: "reports" },
  { path: "/indicadores-lab", label: "Indicadores LAB", icon: Briefcase, minRole: "gestor" as const, moduleKey: "reports" },
  { path: "/csc", label: "CSC", icon: Layers, minRole: "gestor" as const, moduleKey: "csc" },
  { path: "/trash", label: "Arquivo", icon: Trash2, minRole: "gestor" as const, moduleKey: "projects" },
  { path: "/settings", label: "Configurações", icon: Settings, minRole: "admin" as const, moduleKey: "settings" },
];

const DEFAULT_MODULES = ["overview", "projects", "team", "timeline", "blocked", "agent"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, canManage, user, profile } = useAuth();
  const userSector = profile?.sector?.toLowerCase() || "";
  const isQualidade = userSector === "qualidade";
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null);

  useEffect(() => {
    if (!user?.id || canManage) return;
    const fetchModules = async () => {
      const { data } = await supabase
        .from("user_module_permissions")
        .select("allowed_modules")
        .eq("user_id", user.id)
        .maybeSingle();
      setAllowedModules(data?.allowed_modules || DEFAULT_MODULES);
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
  }, [user?.id, canManage]);

  const navItems = allNavItems.filter(item => {
    // Settings is always admin-only
    if (item.minRole === "admin") return isAdmin;

    // Admin/Gestor always see everything their role allows
    if (canManage) {
      if (item.minRole === "qualidade") return true;
      if (item.minRole === "gestor") return true;
      if (item.minRole === "user") return true;
      return false;
    }

    // For regular users, check module permissions
    if (item.minRole === "qualidade") {
      if (allowedModules && !allowedModules.includes(item.moduleKey)) return false;
      return true;
    }

    if (item.minRole === "user") {
      // Usuários do setor qualidade não veem "Projetos"
      if (item.path === "/projects" && isQualidade) return false;
      // Roadmap fica fora do controle por módulo: é onde o usuário acompanha e
      // edita as próprias solicitações, então quem tem allowedModules
      // configurado ficaria sem acesso aos próprios pedidos.
      if (item.path === "/roadmap") return true;
      // Check module permissions
      if (allowedModules && !allowedModules.includes(item.moduleKey)) return false;
      return true;
    }

    return false;
  });

  return (
    <Sidebar side="left" collapsible="icon">
      <div className={`py-3 ${collapsed ? "px-2" : "px-3"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2"}`}>
          <SidebarTrigger className="h-9 w-9 border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground hover:border-sidebar-primary transition-colors shrink-0" />
          {!collapsed && <BrandLogo size={28} showLabel labelClassName="text-lg font-bold text-sidebar-foreground" />}
        </div>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild tooltip={collapsed ? item.label : undefined}>
                    <NavLink
                      href={item.path}
                      end
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-semibold hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="ml-2">{item.label}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
