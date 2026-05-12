'use client';

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Plus, Pencil, Trash2, Search, Shield } from "lucide-react";

interface Entry {
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

const TABLE_LABEL: Record<string, string> = {
  activities: "Atividade",
  phases: "Fase",
  projects: "Projeto",
  meetings: "Reunião",
  risks: "Risco",
  assumptions: "Premissa",
  lessons_learned: "Lição",
  delivery_packages: "Pacote",
  project_documents: "Documento",
  project_members: "Membro",
  change_requests: "Mudança",
};

const opIcon = { INSERT: Plus, UPDATE: Pencil, DELETE: Trash2 };
const opLabel = { INSERT: "Criou", UPDATE: "Alterou", DELETE: "Excluiu" };
const opTone: Record<string, string> = {
  INSERT: "bg-success/15 text-success border-success/40",
  UPDATE: "bg-primary/15 text-primary border-primary/40",
  DELETE: "bg-destructive/15 text-destructive border-destructive/40",
};

interface Props { projectId: string; }

export const ProjectAuditTimeline = ({ projectId }: Props) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [opFilter, setOpFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // 1) registros diretos do projeto
      const { data: directs } = await (supabase as any)
        .from("audit_log")
        .select("*")
        .eq("table_name", "projects")
        .eq("record_id", projectId)
        .order("created_at", { ascending: false })
        .limit(300);

      // 2) ids filhos (atividades/fases/etc que pertencem ao projeto)
      const childTables = [
        "activities", "phases", "meetings", "risks", "assumptions",
        "lessons_learned", "delivery_packages", "project_documents",
        "project_members", "change_requests",
      ];
      const childIdsByTable: Record<string, string[]> = {};
      await Promise.all(childTables.map(async (t) => {
        const { data } = await (supabase as any).from(t).select("id").eq("project_id", projectId);
        childIdsByTable[t] = (data || []).map((r: any) => r.id);
      }));

      // 3) consultar audit_log para cada conjunto
      const childResults: Entry[][] = await Promise.all(
        childTables.map(async (t) => {
          const ids = childIdsByTable[t];
          if (!ids.length) return [];
          const { data } = await (supabase as any)
            .from("audit_log")
            .select("*")
            .eq("table_name", t)
            .in("record_id", ids)
            .order("created_at", { ascending: false })
            .limit(500);
          return data || [];
        }),
      );

      const all: Entry[] = [...(directs || []), ...childResults.flat()]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 500);

      setEntries(all);
      setLoading(false);
    })();
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (tableFilter !== "all" && e.table_name !== tableFilter) return false;
      if (opFilter !== "all" && e.operation !== opFilter) return false;
      if (q) {
        const hay = `${e.changed_by_email || ""} ${JSON.stringify(e.new_data || {})} ${JSON.stringify(e.old_data || {})}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, tableFilter, opFilter]);

  const stats = useMemo(() => {
    const byOp = { INSERT: 0, UPDATE: 0, DELETE: 0 };
    const users = new Set<string>();
    entries.forEach((e) => {
      byOp[e.operation]++;
      if (e.changed_by_email) users.add(e.changed_by_email);
    });
    return { ...byOp, users: users.size, total: entries.length };
  }, [entries]);

  const tablesFound = useMemo(() => {
    const set = new Set(entries.map((e) => e.table_name));
    return Array.from(set);
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Eventos</span>
          </div>
          <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Criações</span>
          <p className="text-2xl font-bold text-success tabular-nums">{stats.INSERT}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Alterações</span>
          <p className="text-2xl font-bold text-primary tabular-nums">{stats.UPDATE}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Exclusões</span>
          <p className="text-2xl font-bold text-destructive tabular-nums">{stats.DELETE}</p>
        </Card>
        <Card className="p-4">
          <span className="text-xs text-muted-foreground">Usuários ativos</span>
          <p className="text-2xl font-bold tabular-nums">{stats.users}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuário, campo ou valor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={tableFilter} onValueChange={setTableFilter}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {tablesFound.map((t) => (
                <SelectItem key={t} value={t}>{TABLE_LABEL[t] || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={opFilter} onValueChange={setOpFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as ações</SelectItem>
              <SelectItem value="INSERT">Criações</SelectItem>
              <SelectItem value="UPDATE">Alterações</SelectItem>
              <SelectItem value="DELETE">Exclusões</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground p-6 text-center">Carregando histórico…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <History className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">Nenhum evento encontrado.</p>
          </div>
        ) : (
          <ScrollArea className="h-[520px] pr-3">
            <div className="space-y-2">
              {filtered.map((e) => {
                const Icon = opIcon[e.operation];
                const label = TABLE_LABEL[e.table_name] || e.table_name;
                const title = e.new_data?.title || e.old_data?.title || e.new_data?.name || "";
                return (
                  <div key={e.id} className="border border-border rounded-md p-3 bg-card hover:border-primary/40 transition">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <Badge variant="outline" className={opTone[e.operation]}>
                        <Icon className="w-3 h-3 mr-1" />
                        {opLabel[e.operation]} {label.toLowerCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(e.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                      {e.changed_by_email && (
                        <span className="text-xs font-medium text-foreground">{e.changed_by_email}</span>
                      )}
                      {title && <span className="text-xs text-muted-foreground truncate">· {title}</span>}
                    </div>
                    {e.operation === "UPDATE" && e.changed_fields && e.changed_fields.length > 0 && (
                      <div className="space-y-1 mt-2 pl-2 border-l-2 border-border">
                        {e.changed_fields.slice(0, 6).map((f) => {
                          const fmt = (v: any) =>
                            v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80);
                          return (
                            <div key={f} className="text-xs">
                              <span className="font-medium text-foreground">{f}:</span>{" "}
                              <span className="text-muted-foreground line-through">{fmt(e.old_data?.[f])}</span>{" "}
                              → <span className="text-foreground">{fmt(e.new_data?.[f])}</span>
                            </div>
                          );
                        })}
                        {e.changed_fields.length > 6 && (
                          <div className="text-[10px] text-muted-foreground">+{e.changed_fields.length - 6} campos</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
};
