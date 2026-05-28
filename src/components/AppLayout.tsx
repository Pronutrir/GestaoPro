'use client';
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { StickyNotes } from "@/components/StickyNotes";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

function getInitials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase().slice(0, 2) || "?";
}

function normalizeAvatarUrl(value?: string | null) {
  if (!value) return undefined;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function getReadableTextColor(hexColor: string) {
  const match = hexColor.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return "#0f172a";
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

export const AppLayout = ({ children, title }: { children: ReactNode; title?: string }) => {
  const router = useRouter();
  const { signOut, profile, isAdmin, canManage } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const name = profile?.full_name || profile?.email || "Usuário";
  const email = profile?.email || "";
  const sector = profile?.sector || profile?.setor || null;
  const initials = getInitials(profile?.full_name, profile?.email);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | undefined>(normalizeAvatarUrl(profile?.avatar_url));
  const [avatarColor, setAvatarColor] = useState<string>("#2563eb");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarRemovalPending, setAvatarRemovalPending] = useState(false);

  const avatarColorOptions = useMemo(
    () => [
      "#2563eb",
      "#0f766e",
      "#16a34a",
      "#ca8a04",
      "#ea580c",
      "#dc2626",
      "#9333ea",
      "#475569",
    ],
    []
  );

  useEffect(() => {
    const nextProfileAvatar = normalizeAvatarUrl(profile?.avatar_url);

    // Evita reidratar URL antiga do perfil enquanto aguardamos a remoção propagar.
    if (avatarRemovalPending) {
      if (!nextProfileAvatar) {
        setAvatarRemovalPending(false);
        setLocalAvatarUrl(undefined);
      }
      return;
    }

    setLocalAvatarUrl(nextProfileAvatar);
  }, [profile?.avatar_url, avatarRemovalPending]);

  useEffect(() => {
    if (!profile?.id) return;
    const saved = window.localStorage.getItem(`avatar-color:${profile.id}`);
    if (saved && avatarColorOptions.includes(saved)) {
      setAvatarColor(saved);
      return;
    }
    setAvatarColor("#2563eb");
  }, [profile?.id, avatarColorOptions]);

  const avatarUrl = normalizeAvatarUrl(localAvatarUrl);
  const effectiveAvatarColor = avatarColorOptions.includes(avatarColor) ? avatarColor : "#2563eb";
  const avatarTextColor = getReadableTextColor(effectiveAvatarColor);

  const roleLabel = isAdmin ? "Master" : canManage ? "Gestor" : "Usuário";
  const roleClass = isAdmin
    ? "bg-primary/10 text-primary border-primary/20"
    : canManage
      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
      : "bg-muted text-muted-foreground border-border";

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  const handlePickAvatar = () => fileInputRef.current?.click();

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile?.id) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Use um arquivo de até 5MB.", variant: "destructive" });
      return;
    }

    try {
      setAvatarSaving(true);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${profile.id}/${Date.now()}.${safeExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);
      if (updateError) throw updateError;

      setAvatarRemovalPending(false);
      setLocalAvatarUrl(normalizeAvatarUrl(publicUrl));
      toast({ title: "Foto atualizada" });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar foto", description: error?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile?.id) return;
    try {
      setAvatarSaving(true);
      setAvatarRemovalPending(true);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", profile.id);
      if (error) throw error;
      setLocalAvatarUrl(undefined);
      toast({ title: "Foto removida" });
    } catch (error: any) {
      setAvatarRemovalPending(false);
      toast({ title: "Erro ao remover foto", description: error?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleAvatarColorChange = (color: string) => {
    const nextColor = avatarColorOptions.includes(color) ? color : "#2563eb";
    setAvatarColor(nextColor);
    if (profile?.id) {
      window.localStorage.setItem(`avatar-color:${profile.id}`, nextColor);
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
            <div className="relative px-4 py-1.5 flex items-center justify-between">
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
                <BrandLogo size={28} showLabel />
              </div>
              <div className="flex items-center gap-3">
                {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
              </div>
              <div className="flex items-center gap-3">
                <ThemeToggle />
                <NotificationBell />
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted/60 transition-colors"
                      aria-label="Abrir menu do usuário"
                    >
                      <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                        {avatarUrl && (
                          <AvatarImage
                            src={avatarUrl}
                            alt={name}
                            onLoadingStatusChange={(status) => {
                              if (status === "error") setLocalAvatarUrl(undefined);
                            }}
                          />
                        )}
                        <AvatarFallback style={{ backgroundColor: effectiveAvatarColor, color: avatarTextColor }} className="text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="end" className="w-64 p-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <div className="p-3 border-b border-border flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {avatarUrl && (
                          <AvatarImage
                            src={avatarUrl}
                            alt={name}
                            onLoadingStatusChange={(status) => {
                              if (status === "error") setLocalAvatarUrl(undefined);
                            }}
                          />
                        )}
                        <AvatarFallback style={{ backgroundColor: effectiveAvatarColor, color: avatarTextColor }} className="text-sm font-semibold">
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
                    <div className="p-3 border-b border-border space-y-2">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handlePickAvatar} disabled={avatarSaving} className="h-8">
                          <Upload className="h-3.5 w-3.5 mr-1.5" /> Foto
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveAvatar}
                          disabled={avatarSaving || !avatarUrl}
                          className="h-8"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
                        </Button>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1.5">Cor do avatar</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {avatarColorOptions.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => handleAvatarColorChange(color)}
                              className={`h-5 w-5 rounded-full border transition-all ${avatarColor === color ? "ring-2 ring-primary ring-offset-1" : ""}`}
                              style={{ backgroundColor: color }}
                              title={`Cor ${color}`}
                            />
                          ))}
                        </div>
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
                        onClick={handleSignOut}
                        className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sair
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <StickyNotes />
        </div>
      </div>
    </SidebarProvider>
  );
};
