import {
  LayoutDashboard,
  Home,
  Users,
  BarChart3,
  AlertTriangle,
  FolderKanban,
  Settings,
  LogOut,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

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
  { path: "/", label: "Visão Geral", icon: Home, adminOnly: false },
  { path: "/projects", label: "Projetos", icon: FolderKanban, adminOnly: false },
  { path: "/team", label: "Equipe", icon: Users, adminOnly: false },
  { path: "/reports", label: "Relatórios", icon: BarChart3, adminOnly: true },
  { path: "/blocked-projects", label: "Bloqueios", icon: AlertTriangle, adminOnly: true },
  { path: "/settings", label: "Configurações", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, profile, isAdmin } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="offcanvas">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
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
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.path}
                      end
                      className="hover:bg-muted/50"
                      activeClassName="bg-primary text-primary-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.label}</span>}
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
        <SidebarMenuButton onClick={handleSignOut} className="w-full hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </div>
    </Sidebar>
  );
}
