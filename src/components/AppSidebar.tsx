import {
  LayoutDashboard,
  Home,
  Users,
  BarChart3,
  AlertTriangle,
  FolderKanban,
  Settings,
  LogOut,
  GanttChart,
  Map,
  DollarSign,
  Layers,
  ShieldCheck,
  Target,
  Calendar,
  Trash2,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const allNavItems = [
  { path: "/", label: "Visão Geral", icon: Home, minRole: "user" as const, moduleKey: "overview" },
  { path: "/projects", label: "Projetos", icon: FolderKanban, minRole: "user" as const, moduleKey: "projects" },
  { path: "/qualidade", label: "Gestão da Qualidade", icon: ShieldCheck, minRole: "qualidade" as const, moduleKey: "qualidade" },
  { path: "/team", label: "Equipe", icon: Users, minRole: "user" as const, moduleKey: "team" },
  { path: "/timeline", label: "Cronograma", icon: GanttChart, minRole: "user" as const, moduleKey: "timeline" },
  { path: "/blocked-projects", label: "Bloqueios", icon: AlertTriangle, minRole: "user" as const, moduleKey: "blocked" },
  { path: "/investments", label: "Gestão Financeira", icon: DollarSign, minRole: "gestor" as const, moduleKey: "investments" },
  { path: "/roadmap", label: "Roadmap", icon: Map, minRole: "gestor" as const, moduleKey: "roadmap" },
  { path: "/calendario", label: "Calendário", icon: Calendar, minRole: "user" as const, moduleKey: "calendario" },
  { path: "/reports", label: "Relatórios", icon: BarChart3, minRole: "gestor" as const, moduleKey: "reports" },
  { path: "/csc", label: "CSC", icon: Layers, minRole: "gestor" as const, moduleKey: "csc" },
  { path: "/trash", label: "Lixeira", icon: Trash2, minRole: "gestor" as const, moduleKey: "projects" },
  { path: "/settings", label: "Configurações", icon: Settings, minRole: "admin" as const, moduleKey: "settings" },
];

const DEFAULT_MODULES = ["overview", "projects", "team", "timeline", "blocked"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, isAdmin, canManage, user } = useAuth();
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
      if (!isQualidade) return false;
      if (allowedModules && !allowedModules.includes(item.moduleKey)) return false;
      return true;
    }

    if (item.minRole === "user") {
      // Usuários do setor qualidade não veem "Projetos"
      if (item.path === "/projects" && isQualidade) return false;
      // Check module permissions
      if (allowedModules && !allowedModules.includes(item.moduleKey)) return false;
      return true;
    }

    return false;
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && <span className="font-bold text-foreground text-sm">GestãoPro</span>}
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
                      to={item.path}
                      end
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary text-primary-foreground font-medium"
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

      <div className="mt-auto p-4 border-t border-border">
        {!collapsed && profile && (
          <p className="text-xs text-muted-foreground mb-2 truncate">
            {profile.full_name || profile.email}
          </p>
        )}
        <SidebarMenuButton
          onClick={handleSignOut}
          tooltip={collapsed ? "Sair" : undefined}
          className="w-full hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </SidebarMenuButton>
      </div>
    </Sidebar>
  );
}
