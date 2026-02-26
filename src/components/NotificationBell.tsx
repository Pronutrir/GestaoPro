import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2, AlertTriangle, Clock, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

interface Notification {
  id: string;
  project_id: string | null;
  activity_id: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export const NotificationBell = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) setNotifications(data);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    fetchNotifications();
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    fetchNotifications();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "overdue": return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "deadline": return <Clock className="w-4 h-4 text-warning" />;
      default: return <Info className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h4 className="font-semibold text-sm text-foreground">Notificações</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem notificações</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-3 border-b border-border last:border-0 hover:bg-accent/30 transition-colors ${
                  !n.is_read ? "bg-primary/5" : ""
                }`}
              >
                <div className="mt-0.5">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!n.is_read ? "font-semibold" : ""} text-foreground`}>{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex gap-0.5">
                  {!n.is_read && (
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => markAsRead(n.id)}>
                      <Check className="w-3 h-3" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteNotification(n.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
