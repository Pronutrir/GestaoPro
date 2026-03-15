import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandSearch } from "@/components/CommandSearch";

export const AppLayout = ({ children, title }: { children: ReactNode; title?: string }) => {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
            <div className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
              </div>
              <div className="flex items-center gap-3">
                <CommandSearch />
                <NotificationBell />
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};
