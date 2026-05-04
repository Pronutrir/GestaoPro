'use client';
import { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from 'sonner';
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const initialSetupEnabled = process.env.NEXT_PUBLIC_ENABLE_INITIAL_SETUP === "true";

const Setup = () => {
  const router = useRouter();
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });

  useEffect(() => {
    if (!initialSetupEnabled) {
      router.replace("/login");
      return;
    }

    supabase.from("user_roles").select("id").eq("role", "admin").limit(1).then(({ data }) => {
      setHasAdmin(data && data.length > 0);
    });
  }, [router]);

  useEffect(() => {
    if (hasAdmin === true) router.push("/login");
  }, [hasAdmin, router]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialSetupEnabled) return;
    if (!form.email || !form.password || !form.full_name) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/initial-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Erro ao criar admin");
      if (data?.error) throw new Error(data.error);

      toast.success("Admin criado com sucesso!");
      router.push("/login");
    } catch (error: any) {
      toast.error("Erro");
    }
    setIsLoading(false);
  };

  if (!initialSetupEnabled || hasAdmin === null) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 shadow-lg border-border">
        <div className="flex flex-col items-center space-y-6">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-md">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Configuração Inicial</h1>
            <p className="text-sm text-muted-foreground">Crie a conta de administrador do sistema</p>
          </div>
          <form onSubmit={handleSetup} className="w-full space-y-4">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Seu nome" required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@empresa.com" required />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" required />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Criando..." : "Criar Conta Admin"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
};

export default Setup;
