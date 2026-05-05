'use client';

import { useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Sparkles, Wrench, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export default function AiTestPage() {
  const [input, setInput] = useState('');
  const { isAdmin, user, loading } = useAuth();
  const [authTimedOut, setAuthTimedOut] = useState(false);

  // Safety: nunca prender a UI por mais de 3s no estado "loading"
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setAuthTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, [loading]);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/test',
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  });

  const isBusy = status === 'submitted' || status === 'streaming';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput('');
  };

  // Enquanto carrega (com fallback de 3s), mostra spinner
  if (loading && !authTimedOut) {
    return (
      <div className="container mx-auto max-w-3xl py-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Verificando permissões…
      </div>
    );
  }

  // Bloqueia apenas se temos certeza que NÃO é admin (user resolvido + sem role admin)
  if (user && !isAdmin) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <Card className="p-8 text-center space-y-3">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Esta página de teste do agente IA está disponível apenas para administradores.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl py-8 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Smoke Test — OpenRouter</h1>
        <Badge variant="outline">{process.env.NEXT_PUBLIC_OPENROUTER_LABEL ?? 'IA'}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Página de validação da integração com OpenRouter via Vercel AI SDK.
        Tente: <em>&quot;Que horas são?&quot;</em>, <em>&quot;Quanto é 17 + 25?&quot;</em>, ou
        <em> &quot;Conte uma piada de programador&quot;</em>.
      </p>

      <Card className="p-4 min-h-[400px] max-h-[60vh] overflow-y-auto space-y-3 bg-muted/30">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            Envie uma mensagem para começar.
          </p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-md text-sm ${
              m.role === 'user'
                ? 'bg-primary/10 ml-8'
                : 'bg-background border mr-8'
            }`}
          >
            <div className="font-semibold text-xs uppercase opacity-60 mb-1">
              {m.role === 'user' ? 'Você' : 'Assistente'}
            </div>
            {m.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <p key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                );
              }
              if (part.type.startsWith('tool-')) {
                const toolName = part.type.replace('tool-', '');
                const anyPart = part as any;
                return (
                  <div
                    key={i}
                    className="my-2 p-2 rounded border border-dashed bg-muted/50 text-xs"
                  >
                    <div className="flex items-center gap-1 font-mono text-muted-foreground mb-1">
                      <Wrench className="h-3 w-3" />
                      <span>{toolName}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {anyPart.state ?? 'call'}
                      </Badge>
                    </div>
                    {anyPart.input && (
                      <pre className="whitespace-pre-wrap break-all opacity-70">
                        input: {JSON.stringify(anyPart.input)}
                      </pre>
                    )}
                    {anyPart.output && (
                      <pre className="whitespace-pre-wrap break-all">
                        output: {JSON.stringify(anyPart.output)}
                      </pre>
                    )}
                    {anyPart.errorText && (
                      <pre className="whitespace-pre-wrap break-all text-destructive">
                        error: {anyPart.errorText}
                      </pre>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}

        {isBusy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            {status === 'submitted' ? 'Enviando…' : 'Pensando…'}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            Erro: {error.message}
          </div>
        )}
      </Card>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte algo…"
          disabled={isBusy}
        />
        <Button type="submit" disabled={isBusy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
