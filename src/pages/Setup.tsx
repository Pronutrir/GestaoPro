import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Setup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });

  useEffect(() => {
    // Check if any admin exists
    supabase.from("user_roles").select("id").eq("role", "admin").limit(1).then(({ data }) => {
      setHasAdmin(data && data.length > 0);
    });
  }, []);

  useEffect(() => {
    if (hasAdmin === true) navigate("/login");
  }, [hasAdmin, navigate]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.full_name) return;
    setIsLoading(true);

    // Sign up the first user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.full_name } },
    });

    if (signUpError) {
      toast({ title: "Erro", description: signUpError.message, variant: "destructive" });
      setIsLoading(false);
      return;
    }

    if (signUpData.user) {
      // Create profile and admin role
      await supabase.from("profiles").insert({
        id: signUpData.user.id,
        email: form.email,
        full_name: form.full_name,
      });
      await supabase.from("user_roles").insert({
        user_id: signUpData.user.id,
        role: "admin",
      });

      toast({ title: "Admin criado com sucesso!", description: "Faça login para continuar." });
      await supabase.auth.signOut();
      navigate("/login");
    }
    setIsLoading(false);
  };

  if (hasAdmin === null) return null;

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
