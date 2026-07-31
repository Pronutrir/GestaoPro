'use client';
// HISTÓRICO DE VERSÕES — o que faltava para o documento ser confiável.
//
// Sem histórico, uma edição infeliz é permanente: o `undo` do editor se perde
// ao recarregar a página, e não havia mais nada. Num documento que circula para
// assinatura, isso é grave — não dava para responder "o que mudou desde que eu
// aprovei?".
//
// Restaurar NÃO apaga: cria uma versão nova com o conteúdo antigo. É a mesma
// razão pela qual a trilha de auditoria é append-only — histórico que pode ser
// reescrito não serve como histórico.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { History, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppConfirm } from "@/components/AppConfirmProvider";
import { cn } from "@/lib/utils";

// page_versions ainda fora dos tipos gerados (migration pendente na VM).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface Version {
  id: string;
  revision: number;
  title: string | null;
  // JSON do ProseMirror.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  author_name: string | null;
  origin: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pageId: string;
  currentRevision: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRestore: (content: any, title: string) => Promise<void>;
}

export function PageHistory({ open, onOpenChange, pageId, currentRevision, onRestore }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Version | null>(null);
  const appConfirm = useAppConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await sb
      .from("page_versions").select("*").eq("page_id", pageId)
      .order("revision", { ascending: false }).limit(50);
    setVersions((data ?? []) as Version[]);
    setLoading(false);
  }, [pageId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  /** Texto puro da versão, para a prévia — sem montar um segundo editor. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plainText = (content: any): string => {
    const parts: string[] = [];
    const walk = (n: any) => {
      if (!n) return;
      if (typeof n.text === "string") parts.push(n.text);
      (n.content ?? []).forEach(walk);
    };
    walk(content);
    return parts.join(" ").slice(0, 1200);
  };

  const restore = async (v: Version) => {
    const ok = await appConfirm({
      title: `Restaurar a versão ${v.revision}?`,
      description:
        "O conteúdo atual não se perde: a restauração vira uma versão nova, e a atual continua no histórico.",
      confirmText: "Restaurar",
    });
    if (!ok) return;
    await onRestore(v.content, v.title ?? "Documento sem título");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[18px]">
            <History className="w-4 h-4 text-primary" /> Histórico de versões
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            Restaurar não apaga nada — vira uma versão nova.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr] gap-4">
          <div className="overflow-y-auto border-r pr-3 space-y-1">
            {loading && (
              <p className="text-[13px] text-muted-foreground flex items-center gap-2 p-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> carregando…
              </p>
            )}
            {!loading && versions.length === 0 && (
              <p className="text-[13px] text-muted-foreground p-2">
                Ainda não há versões anteriores. A partir de agora, cada gravação
                guarda uma.
              </p>
            )}
            {versions.map((v) => (
              <button key={v.id} type="button" onClick={() => setPreview(v)}
                className={cn("w-full text-left rounded-md px-2.5 py-2 hover:bg-accent transition-colors",
                  preview?.id === v.id && "bg-accent")}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold">Versão {v.revision}</span>
                  {v.revision === currentRevision && (
                    <Badge variant="secondary" className="h-4 text-[9px] px-1.5">atual</Badge>
                  )}
                  {v.origin === "restauracao" && (
                    <Badge variant="outline" className="h-4 text-[9px] px-1.5">restaurada</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {v.author_name ?? "—"} · {new Date(v.created_at).toLocaleString("pt-BR", {
                    dateStyle: "short", timeStyle: "short",
                  })}
                </p>
              </button>
            ))}
          </div>

          <div className="overflow-y-auto min-w-0">
            {!preview ? (
              <p className="text-[13px] text-muted-foreground p-2">
                Escolha uma versão à esquerda para ver o conteúdo.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold">{preview.title}</span>
                  {preview.revision !== currentRevision && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs ml-auto"
                      onClick={() => restore(preview)}>
                      <RotateCcw className="w-3 h-3" /> Restaurar esta versão
                    </Button>
                  )}
                </div>
                <p className="text-[13px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {plainText(preview.content) || "(documento vazio)"}
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
