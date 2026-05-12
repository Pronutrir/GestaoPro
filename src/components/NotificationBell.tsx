'use client';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bell, Check, Trash2, AlertTriangle, Clock, Info, BellRing, X, Ban, UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  project_id: string | null;
  activity_id: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  target_user_id: string | null;
}

export const NotificationBell = () => {
  const { user, isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

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
    const uid = user?.id;
    let query = supabase
      .from("notifications")
      .select("*, activities:activity_id(assigned_to, participants)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (uid) query = query.or(`target_user_id.is.null,target_user_id.eq.${uid}`);
    const { data } = await query;
    if (!data) { setNotifications([]); return; }

    // Admin vê tudo
    if (isAdmin) { setNotifications(data as any); return; }

    // Filtra: somente notificações de atividades em que o usuário está cadastrado
    // (líder via assigned_to ou na lista de participants), ou direcionadas a ele.
    const myNames = [profile?.full_name, (profile as any)?.email, user?.email]
      .filter(Boolean)
      .map((s: string) => s.toLowerCase());

    const filtered = (data as any[]).filter((n) => {
      if (n.target_user_id && n.target_user_id === uid) return true;
      // Sem atividade vinculada e sem alvo específico → não exibe para usuários comuns
      if (!n.activity_id) return false;
      const a = n.activities;
      if (!a) return false;
      const assigned = (a.assigned_to || "").toLowerCase();
      if (assigned && myNames.includes(assigned)) return true;
      const parts: string[] = Array.isArray(a.participants) ? a.participants : [];
      if (parts.some((p) => myNames.includes((p || "").toLowerCase()))) return true;
      return false;
    });
    setNotifications(filtered as any);
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
      case "blocked":
        return {
          icon: <Ban className="w-4 h-4" />,
          color: "text-orange-600",
          bg: "bg-orange-500/10 border-orange-500/30",
          pulse: true,
        };
      case "project_invite":
        return {
          icon: <UserPlus className="w-4 h-4" />,
          color: "text-primary",
          bg: "bg-primary/10 border-primary/30",
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

  const acceptInvite = async (n: Notification) => {
    if (!user?.id || !n.project_id) return;
    const { error } = await supabase
      .from("project_members")
      .update({ invitation_status: "accepted", responded_at: new Date().toISOString(), decline_reason: null })
      .eq("project_id", n.project_id)
      .eq("user_id", user.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    toast({ title: "Convite aceito!" });
    fetchNotifications();
  };

  const declineInvite = async (n: Notification) => {
    if (!user?.id || !n.project_id) return;
    const { error } = await supabase
      .from("project_members")
      .update({ invitation_status: "declined", responded_at: new Date().toISOString(), decline_reason: declineReason || null })
      .eq("project_id", n.project_id)
      .eq("user_id", user.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    setDeclineFor(null);
    setDeclineReason("");
    toast({ title: "Convite recusado" });
    fetchNotifications();
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

                    {n.type === "project_invite" && (
                      <div className="mt-2 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {declineFor === n.id ? (
                          <div className="flex flex-col gap-1.5">
                            <input
                              autoFocus
                              value={declineReason}
                              onChange={(e) => setDeclineReason(e.target.value)}
                              placeholder="Motivo (opcional)"
                              className="w-full text-xs h-7 px-2 rounded border border-border bg-background"
                            />
                            <div className="flex gap-1">
                              <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2 flex-1" onClick={() => declineInvite(n)}>
                                Confirmar recusa
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => { setDeclineFor(null); setDeclineReason(""); }}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1.5">
                            <Button size="sm" className="h-7 text-[11px] flex-1 bg-success hover:bg-success/90" onClick={() => acceptInvite(n)}>
                              <Check className="w-3 h-3 mr-1" /> Aceitar
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] flex-1" onClick={() => setDeclineFor(n.id)}>
                              <X className="w-3 h-3 mr-1" /> Recusar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
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
