import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import {
  LayoutDashboard,
  Home,
  Users,
  BarChart3,
  AlertTriangle,
  FolderKanban,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "Visão Geral", icon: Home },
  { path: "/projects", label: "Projetos", icon: FolderKanban },
  { path: "/team", label: "Equipe", icon: Users },
  { path: "/reports", label: "Relatórios", icon: BarChart3 },
  { path: "/blocked-projects", label: "Bloqueios", icon: AlertTriangle },
];

export const AppLayout = ({ children, title }: { children: ReactNode; title?: string }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-card flex flex-col sticky top-0 h-screen shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground text-sm">GestãoPro</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {title && (
          <header className="border-b border-border bg-card sticky top-0 z-10">
            <div className="px-6 py-4 flex items-center justify-between">
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <NotificationBell />
            </div>
          </header>
        )}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};
