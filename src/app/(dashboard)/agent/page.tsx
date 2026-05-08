'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Send, Bot, Trash2, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AgentMessageRenderer } from '@/components/AgentMessageRenderer';

const STORAGE_KEY = 'agent-chat-messages';

type QuickReplyKind = 'confirm' | 'adjust' | 'cancel' | 'default';

type QuickReplyOption = {
  label: string;
  kind: QuickReplyKind;
};

function getQuickReplyKind(label: string): QuickReplyKind {
  const normalized = label.trim().toLowerCase();

  if (/(^confirmar$|^sim$|^sim,|^pode |^criar$|^atualizar$|^mover$)/.test(normalized)) {
    return 'confirm';
  }

  if (/(ajustar|editar|revisar|quero ajustar)/.test(normalized)) {
    return 'adjust';
  }

  if (/(cancelar|cancel|não|nao)/.test(normalized)) {
    return 'cancel';
  }

  return 'default';
}

function getQuickReplyClassName(kind: QuickReplyKind): string {
  if (kind === 'confirm') {
    return 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-500/60';
  }

  if (kind === 'adjust') {
    return 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 hover:border-amber-500/60';
  }

  if (kind === 'cancel') {
    return 'border-destructive/40 bg-destructive/10 hover:bg-destructive/15 hover:border-destructive/60';
  }

  return 'border-border bg-card hover:bg-accent hover:border-primary/50';
}

function looksLikeMutatingIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return /(criar|cadastrar|atualizar|editar|mover|movimentar|backfill|vincular)/.test(normalized);
}

const SUGGESTIONS = [
  'Liste meus projetos',
  'Crie um projeto de aplicativo com tarefas e subtarefas',
  'Liste as tarefas do projeto [cole o ID aqui]',
  'Crie uma tarefa no projeto [ID]: implementar login',
];

export default function AgentPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [input, setInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/agent',
      fetch: async (url, init) => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return fetch(url, {
          method: init?.method ?? 'POST',
          body: init?.body,
          signal: init?.signal,
          credentials: 'omit',
          headers,
        });
      },
    }),
  });

  // Restore from localStorage after mount (including tool calls)
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored) return;
    setRestored(true);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const all = JSON.parse(raw) as Array<Record<string, unknown>>;
      const safe = all.filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          Array.isArray(m.parts),
      );
      if (safe.length > 0) setMessages(safe as unknown as ReturnType<typeof useChat>['messages']);
    } catch {
      /* ignore malformed data */
    }
  }, [restored, setMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } catch {
        /* storage quota exceeded */
      }
    }
  }, [messages]);

  const isBusy = status === 'submitted' || status === 'streaming';

  // Extrai opções clicáveis da última mensagem do agente no formato [Opção]
  const quickReplies = useMemo(() => {
    if (isBusy || messages.length === 0) return [];
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return [];
    const text = last.parts
      .filter((p) => p.type === 'text')
      .map((p: any) => p.text)
      .join('');
    const seen = new Set<string>();
    const opts: QuickReplyOption[] = [];
    for (const m of text.matchAll(/\[([^\]]{1,60})\]/g)) {
      const label = m[1].trim();
      if (!seen.has(label)) {
        seen.add(label);
        opts.push({ label, kind: getQuickReplyKind(label) });
      }
    }
    return opts;
  }, [messages, isBusy]);

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;

    if (looksLikeMutatingIntent(text)) {
      setPendingText(text);
      setConfirmOpen(true);
      return;
    }

    sendMessage({ text });
    setInput('');
  };

  const handleConfirmSend = () => {
    if (!pendingText || isBusy) return;
    sendMessage({ text: pendingText });
    setInput('');
    setPendingText(null);
    setConfirmOpen(false);
  };

  const handleCancelSend = () => {
    setPendingText(null);
    setConfirmOpen(false);
  };

  const handleQuickReply = (option: QuickReplyOption) => {
    if (isBusy) return;

    if (option.kind === 'confirm' || option.kind === 'cancel' || option.kind === 'adjust') {
      sendMessage({ text: option.label });
      return;
    }

    if (looksLikeMutatingIntent(option.label)) {
      setPendingText(option.label);
      setConfirmOpen(true);
      return;
    }

    sendMessage({ text: option.label });
  };

  const handleOpenProject = (projectId: string) => {
    router.push(`/project/${projectId}`);
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-3xl py-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Faça login para usar o agente.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-4 h-[calc(100vh-80px)] flex flex-col">
      <div className="flex items-center gap-3 shrink-0 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Agente de Projetos</h1>
          <p className="text-xs text-muted-foreground">Crie projetos e tarefas com inteligência artificial</p>
        </div>
        <Badge variant="outline" className="ml-auto text-xs">
          {process.env.NEXT_PUBLIC_OPENROUTER_LABEL ?? 'IA'}
        </Badge>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            title="Limpar conversa"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <Card className="flex-1 p-6 overflow-y-auto space-y-6 bg-gradient-to-b from-background to-muted/5">
          {messages.length === 0 && (
            <div className="py-16 space-y-6 text-center flex flex-col items-center justify-center h-full">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-primary/10">
                  <MessageCircle className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground mb-2">Bem-vindo ao Agente de Projetos!</p>
                <p className="text-sm text-muted-foreground">Posso criar projetos e tarefas para você. Clique em uma sugestão ou digite seu comando.</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="flex items-center gap-3 text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 transition-all duration-200"
                  >
                    <span className="text-sm font-medium text-muted-foreground w-6">{idx + 1}</span>
                    <span className="font-medium text-sm">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const userText = m.parts[0] && typeof m.parts[0] === 'object' && 'text' in m.parts[0] ? (m.parts[0] as any).text : '';
            const role = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'assistant';
            return (
              <div key={m.id} className={`animate-in fade-in slide-in-from-bottom-2 ${m.role === 'user' ? 'flex justify-end' : ''}`}>
                {m.role === 'user' ? (
                  <div className="max-w-[70%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
                    <p className="whitespace-pre-wrap leading-relaxed break-words">{userText}</p>
                  </div>
                ) : (
                  <div className="max-w-full space-y-4 mr-0">
                    <AgentMessageRenderer 
                      parts={m.parts as any}
                      role={role}
                      onOpenProject={handleOpenProject}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {isBusy && (
            <div className="flex gap-3 animate-in fade-in">
              <div className="p-2 rounded-lg bg-muted shrink-0">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
                <span>{status === 'submitted' ? 'Enviando…' : 'Processando…'}</span>
              </div>
            </div>
          )}

          {error && (
            <Card className="p-4 bg-destructive/10 border-destructive/30">
              <div className="space-y-2">
                <p className="font-semibold text-destructive text-sm">⚠️ Erro ao comunicar com o agente</p>
                <p className="text-xs text-destructive/80">{error.message || 'Erro desconhecido — verifique o console do servidor.'}</p>
                <button
                  onClick={handleClear}
                  className="text-xs underline text-destructive hover:opacity-80 font-medium"
                >
                  Limpar conversa e tentar novamente
                </button>
              </div>
            </Card>
          )}

          {quickReplies.length > 0 && (
            <div className="mt-6 space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Opções disponíveis:</p>
              {quickReplies.map((opt, i) => (
                <button
                  key={`${i}-${opt.label}`}
                  onClick={() => handleQuickReply(opt)}
                  className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg border transition-all duration-200 ${getQuickReplyClassName(opt.kind)}`}
                >
                  <span className="text-sm font-medium text-muted-foreground w-6">{i + 1}</span>
                  <span className="font-medium text-sm">{opt.label}</span>
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </Card>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 shrink-0 mt-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Descreva o que você quer criar… (ex: nova tarefa, projeto, etc)"
          disabled={isBusy}
          autoFocus
          className="h-11 bg-card border-border text-base"
        />
        <Button type="submit" disabled={isBusy || !input.trim()} className="h-11 px-6 gap-2">
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ação no agente</AlertDialogTitle>
            <AlertDialogDescription>
              Essa mensagem parece uma ação de criação/edição/movimentação. Deseja enviar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingText && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground break-words">
              {pendingText}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelSend}>Ajustar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSend}>Confirmar envio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
