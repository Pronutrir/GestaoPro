'use client';
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
  Briefcase,
  Bot,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  // Módulo Portfólio em standby — mantido no código mas oculto da navegação
  // { path: "/portfolio", label: "Portfólio", icon: Briefcase, minRole: "gestor" as const, moduleKey: "portfolio" },
  { path: "/qualidade", label: "Gestão da Qualidade", icon: ShieldCheck, minRole: "qualidade" as const, moduleKey: "qualidade" },
  { path: "/team", label: "Equipe", icon: Users, minRole: "user" as const, moduleKey: "team" },
  { path: "/timeline", label: "Cronograma", icon: GanttChart, minRole: "user" as const, moduleKey: "timeline" },
  { path: "/blocked-projects", label: "Bloqueios", icon: AlertTriangle, minRole: "user" as const, moduleKey: "blocked" },
  { path: "/investments", label: "Gestão Financeira", icon: DollarSign, minRole: "gestor" as const, moduleKey: "investments" },
  { path: "/roadmap", label: "Roadmap", icon: Map, minRole: "gestor" as const, moduleKey: "roadmap" },
  { path: "/calendario", label: "Calendário", icon: Calendar, minRole: "user" as const, moduleKey: "calendario" },
  { path: "/agent", label: "Agente de IA", icon: Bot, minRole: "user" as const, moduleKey: "agent" },
  { path: "/reports", label: "Relatórios", icon: BarChart3, minRole: "gestor" as const, moduleKey: "reports" },
  { path: "/csc", label: "CSC", icon: Layers, minRole: "gestor" as const, moduleKey: "csc" },
  { path: "/trash", label: "Arquivo", icon: Trash2, minRole: "gestor" as const, moduleKey: "projects" },
  { path: "/settings", label: "Configurações", icon: Settings, minRole: "admin" as const, moduleKey: "settings" },
];

const DEFAULT_MODULES = ["overview", "projects", "team", "timeline", "blocked", "agent"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const router = useRouter();
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
    router.push("/login");
  };

  return (
    <Sidebar collapsible="icon">
      <div className={`py-4 border-b border-border ${collapsed ? "px-2 flex justify-center" : "px-4"}`}>
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
                      href={item.path}
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

      <div className="mt-auto p-3 border-t border-border">
        <UserMenu
          collapsed={collapsed}
          profile={profile}
          isAdmin={isAdmin}
          isGestor={canManage && !isAdmin}
          onSignOut={handleSignOut}
        />
      </div>
    </Sidebar>
  );
}

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase().slice(0, 2) || "?";
}

function UserMenu({
  collapsed,
  profile,
  isAdmin,
  isGestor,
  onSignOut,
}: {
  collapsed: boolean;
  profile: any;
  isAdmin: boolean;
  isGestor: boolean;
  onSignOut: () => void;
}) {
  const name = profile?.full_name || profile?.email || "Usuário";
  const email = profile?.email || "";
  const sector = profile?.sector || profile?.setor || null;
  const initials = getInitials(profile?.full_name, profile?.email);
  const avatarUrl = profile?.avatar_url || undefined;

  const roleLabel = isAdmin ? "Master" : isGestor ? "Gestor" : "Usuário";
  const roleClass = isAdmin
    ? "bg-primary/10 text-primary border-primary/20"
    : isGestor
      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
      : "bg-muted text-muted-foreground border-border";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full flex items-center gap-2 rounded-md p-2 hover:bg-muted/60 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
          aria-label="Abrir menu do usuário"
        >
          <Avatar className="h-8 w-8 ring-2 ring-primary/20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium truncate">{name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{roleLabel}</p>
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-0">
        <div className="p-3 border-b border-border flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{name}</p>
            {email && (
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            )}
          </div>
        </div>
        <div className="p-3 space-y-2 border-b border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Papel</span>
            <Badge variant="outline" className={`text-[10px] ${roleClass}`}>
              {roleLabel}
            </Badge>
          </div>
          {sector && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Setor</span>
              <span className="text-xs font-medium truncate max-w-[140px]">
                {sector}
              </span>
            </div>
          )}
        </div>
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
