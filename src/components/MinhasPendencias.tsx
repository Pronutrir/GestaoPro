'use client';
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FileSignature, Send, Inbox, Clock } from "lucide-react";

/**
 * "Aguardando você" — o que depende de mim agora.
 *
 * O Dashboard Geral mostra atrasos de TODOS os projetos acessíveis, sem filtrar
 * por pessoa: não havia tela que respondesse "o que trava por minha causa".
 * Documento, página ou TAP esperando assinatura só era descoberto se a pessoa
 * abrisse a aba do projeto por conta própria.
 *
 * Usa document_participants(user_id, status) — índice que já existia no banco e
 * nenhuma tela consumia.
 *
 * Degrada com elegância: sem a migration do fluxo, o bloco some.
 */

interface Pendencia {
  flowId: string;
  projectId: string | null;
  title: string;
  kind: string;
  dueDate: string | null;
  isCharter: boolean;
}

const KIND_LABEL: Record<string, string> = {
  assinatura: "Assinar",
  aprovacao: "Aprovar",
  ciencia: "Dar ciência",
};

export const MinhasPendencias = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [aguardando, setAguardando] = useState<Pendencia[]>([]);
  const [enviados, setEnviados] = useState<Pendencia[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    // O que espera por mim: minha participação ainda não resolvida.
    const { data: parts, error } = await supabase
      .from("document_participants" as any)
      .select("flow_id, status")
      .eq("user_id", user.id)
      .not("status", "in", '("concluido","recusado")');

    if (error) { setUnavailable(true); setLoading(false); return; }
    setUnavailable(false);

    const flowIds = Array.from(new Set(((parts as any[]) || []).map((p) => p.flow_id)));

    const toPendencia = (f: any): Pendencia => ({
      flowId: f.id,
      projectId: f.project_id,
      title: f.title || "Documento",
      kind: f.kind || "ciencia",
      dueDate: f.due_date,
      isCharter: !!f.charter_project_id,
    });

    if (flowIds.length > 0) {
      const { data: flows } = await supabase
        .from("document_flows" as any)
        .select("id, project_id, title, kind, due_date, charter_project_id, status")
        .in("id", flowIds)
        .eq("status", "circulando");
      setAguardando(((flows as any[]) || []).map(toPendencia));
    } else {
      setAguardando([]);
    }

    // O que eu enviei e está parado em alguém — a pergunta de quem cobra.
    const { data: meus } = await supabase
      .from("document_flows" as any)
      .select("id, project_id, title, kind, due_date, charter_project_id")
      .eq("created_by", user.id)
      .eq("status", "circulando")
      .order("created_at", { ascending: false })
      .limit(10);
    setEnviados(((meus as any[]) || []).map(toPendencia));

    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (unavailable || loading) return null;
  if (aguardando.length === 0 && enviados.length === 0) return null;

  const abrir = (p: Pendencia) => {
    if (!p.projectId) return;
    // Deep-link para a aba certa: sem isto a pessoa cai na visão geral do
    // projeto e ainda precisa caçar onde estava o pedido.
    router.push(`/project/${p.projectId}?tab=${p.isCharter ? "tap" : "documents"}`);
  };

  const atrasado = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());

  const Linha = ({ p }: { p: Pendencia }) => (
    <button
      type="button"
      onClick={() => abrir(p)}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors rounded-md"
    >
      <span className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0",
        p.isCharter ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}>
        <FileSignature className="w-3.5 h-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate">{p.title}</span>
        <span className="block text-[11px] text-muted-foreground">
          {KIND_LABEL[p.kind] || "Responder"}
          {p.isCharter ? " · TAP" : ""}
        </span>
      </span>
      {p.dueDate && (
        <span className={cn(
          "shrink-0 inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border",
          atrasado(p.dueDate)
            ? "text-destructive border-destructive/30 bg-destructive/10"
            : "text-muted-foreground border-border",
        )}>
          <Clock className="w-3 h-3" />
          {new Date(p.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </span>
      )}
    </button>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {aguardando.length > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              Aguardando você
              <span className="ml-auto text-[11px] font-normal text-muted-foreground tabular-nums">
                {aguardando.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-0.5">
            {aguardando.map((p) => <Linha key={p.flowId} p={p} />)}
          </CardContent>
        </Card>
      )}

      {enviados.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-muted-foreground" />
              Enviados por você
              <span className="ml-auto text-[11px] font-normal text-muted-foreground tabular-nums">
                {enviados.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-0.5">
            {enviados.map((p) => <Linha key={p.flowId} p={p} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
