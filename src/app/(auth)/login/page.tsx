'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';

function LoginErrorToast() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const err = searchParams.get('error');
    if (err) toast.error(decodeURIComponent(err));
  }, [searchParams]);
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [azureLoading, setAzureLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(
          error.message === 'Invalid login credentials'
            ? 'Email ou senha incorretos.'
            : error.message
        );
        return;
      }

      toast.success('Login realizado com sucesso!');
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Erro de rede no login:', err);
      toast.error('Falha de conexão com o servidor de autenticação (CORS/rede).');
    } finally {
      setLoading(false);
    }
  }

  async function handleAzureLogin() {
    setAzureLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'openid profile email',
        },
      });
      if (error) {
        toast.error(error.message);
        setAzureLoading(false);
      }
      // Em sucesso, o navegador é redirecionado para o Microsoft.
    } catch (err) {
      console.error('Erro ao iniciar login Azure:', err);
      toast.error('Falha ao iniciar login com Microsoft.');
      setAzureLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Suspense fallback={null}>
        <LoginErrorToast />
      </Suspense>
      <Card className="w-full max-w-md p-8 shadow-lg border-border">
        <div className="flex flex-col items-center space-y-6">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-md">
            <LayoutDashboard className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Pipeline de Gestão de Projetos</h1>
            <p className="text-sm text-muted-foreground">Por favor, faça login para continuar</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleAzureLogin}
            disabled={azureLoading || loading}
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
              <rect x="1"  y="1"  width="9" height="9" fill="#f25022" />
              <rect x="11" y="1"  width="9" height="9" fill="#7fba00" />
              <rect x="1"  y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {azureLoading ? 'Redirecionando...' : 'Entrar com Microsoft'}
          </Button>

          <div className="w-full flex items-center gap-3">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs uppercase text-muted-foreground">ou</span>
            <div className="h-px bg-border flex-1" />
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || azureLoading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
