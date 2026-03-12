import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Check, Trash2, AlertTriangle, Clock, Info, BellRing, X } from "lucide-react";
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
      .limit(30);

    if (data) setNotifications(data);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const overdueCount = notifications.filter((n) => !n.is_read && n.type === "overdue").length;

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

  const getTypeConfig = (type: string) => {
    switch (type) {
      case "overdue":
        return {
          icon: <AlertTriangle className="w-4 h-4" />,
          color: "text-destructive",
          bg: "bg-destructive/10 border-destructive/30",
          pulse: true,
        };
      case "deadline":
        return {
          icon: <Clock className="w-4 h-4" />,
          color: "text-warning",
          bg: "bg-warning/10 border-warning/30",
          pulse: true,
        };
      default:
        return {
          icon: <Info className="w-4 h-4" />,
          color: "text-primary",
          bg: "bg-primary/10 border-primary/30",
          pulse: false,
        };
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}m atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(hours / 24);
    return `${days}d atrás`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative ${unreadCount > 0 ? "hover:bg-destructive/10" : ""}`}
        >
          {unreadCount > 0 ? (
            <BellRing className="w-5 h-5 animate-[wiggle_1s_ease-in-out_infinite] text-destructive" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center font-bold animate-pulse shadow-lg shadow-destructive/40">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          {overdueCount > 0 && (
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-destructive animate-ping" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 shadow-xl border-border" align="end">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-foreground" />
            <h4 className="font-semibold text-sm text-foreground">Notificações</h4>
            {unreadCount > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                {unreadCount} nova{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-primary hover:text-primary"
                onClick={markAllAsRead}
              >
                <Check className="w-3 h-3 mr-1" />
                Ler todas
              </Button>
            )}
          </div>
        </div>

        {/* Notification List */}
        <div className="max-h-[400px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bell className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">Tudo tranquilo por aqui</p>
              <p className="text-xs mt-0.5">Sem notificações no momento</p>
            </div>
          ) : (
            notifications.map((n) => {
              const config = getTypeConfig(n.type);
              return (
                <div
                  key={n.id}
                  className={`
                    relative flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0
                    transition-all duration-200 cursor-pointer group
                    ${!n.is_read
                      ? `${config.bg} border-l-[3px] hover:brightness-95`
                      : "hover:bg-muted/30 border-l-[3px] border-l-transparent"
                    }
                    ${!n.is_read && config.pulse ? "animate-pulse-slow" : ""}
                  `}
                  onClick={() => !n.is_read && markAsRead(n.id)}
                >
                  {/* Icon */}
                  <div className={`mt-0.5 p-1.5 rounded-lg ${!n.is_read ? config.bg : "bg-muted"} ${config.color} shrink-0`}>
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!n.is_read ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                          n.type === "overdue" ? "bg-destructive animate-ping" : "bg-primary animate-pulse"
                        }`} />
                      )}
                    </div>
                    {n.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {n.message}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-1 font-medium">
                      {getTimeAgo(n.created_at)}
                    </p>
                  </div>

                  {/* Actions (show on hover) */}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {!n.is_read && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 hover:bg-primary/10 hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                        title="Marcar como lida"
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                      title="Excluir"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
