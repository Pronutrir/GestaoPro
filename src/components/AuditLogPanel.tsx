import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Plus, Pencil, Trash2 } from "lucide-react";

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  operation: "INSERT" | "UPDATE" | "DELETE";
  old_data: any;
  new_data: any;
  changed_fields: string[] | null;
  changed_by_email: string | null;
  created_at: string;
}

interface Props { recordId: string; tableName: string; }

const opIcon = { INSERT: Plus, UPDATE: Pencil, DELETE: Trash2 };
const opColor: Record<string, string> = {
  INSERT: "bg-success/15 text-success border-success/40",
  UPDATE: "bg-primary/15 text-primary border-primary/40",
  DELETE: "bg-destructive/15 text-destructive border-destructive/40",
};

export const AuditLogPanel = ({ recordId, tableName }: Props) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("audit_log")
        .select("*")
        .eq("table_name", tableName)
        .eq("record_id", recordId)
        .order("created_at", { ascending: false })
        .limit(50);
      setEntries(data || []);
      setLoading(false);
    })();
  }, [recordId, tableName]);

  if (loading) return <div className="text-xs text-muted-foreground p-4">Carregando histórico…</div>;
  if (entries.length === 0) return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <History className="w-10 h-10 mb-2 opacity-30" />
      <p className="text-sm">Sem histórico de alterações</p>
    </div>
  );

  return (
    <ScrollArea className="h-[400px] pr-3">
      <div className="space-y-2">
        {entries.map(e => {
          const Icon = opIcon[e.operation];
          return (
            <div key={e.id} className="border border-border rounded-md p-3 bg-card">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className={opColor[e.operation]}>
                  <Icon className="w-3 h-3 mr-1" />
                  {e.operation === "INSERT" ? "Criado" : e.operation === "UPDATE" ? "Alterado" : "Excluído"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(e.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                {e.changed_by_email && <span className="text-xs text-muted-foreground">por {e.changed_by_email}</span>}
              </div>
              {e.operation === "UPDATE" && e.changed_fields && (
                <div className="space-y-2 mt-2">
                  {e.changed_fields.map(f => {
                    const oldVal = e.old_data?.[f];
                    const newVal = e.new_data?.[f];
                    const fmt = (v: any) => {
                      if (v === null || v === undefined || v === "") return "—";
                      if (Array.isArray(v)) return v.length === 0 ? "—" : v.join(", ");
                      if (typeof v === "object") return JSON.stringify(v);
                      return String(v);
                    };
                    return (
                      <div key={f} className="text-xs bg-muted/30 rounded p-2 space-y-1">
                        <div className="font-semibold text-foreground">{f}</div>
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] uppercase font-bold text-destructive min-w-[40px]">antes</span>
                          <span className="text-destructive line-through break-words flex-1">{fmt(oldVal)}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] uppercase font-bold text-success min-w-[40px]">depois</span>
                          <span className="text-success break-words flex-1">{fmt(newVal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {e.operation === "INSERT" && e.new_data?.title && (
                <div className="text-xs text-muted-foreground mt-1">
                  Atividade criada: <span className="font-medium text-foreground">"{e.new_data.title}"</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
};
