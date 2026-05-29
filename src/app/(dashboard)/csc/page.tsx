'use client';
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from 'sonner';
import {
  Plus, Clock, CheckCircle2, AlertTriangle, Timer, TrendingUp,
  BarChart3, Users, Briefcase, Filter, ArrowRight, Paperclip, X,
} from "lucide-react";
import { CscKanbanBoard } from "@/components/CscKanbanBoard";
import { buildAvatarLookupMap, getAvatarInitials, resolveAvatarFromLookup } from "@/lib/avatarLookup";

// ── Types ──────────────────────────────────────────
interface CscTicket {
  id: string;
  title: string;
  description: string | null;
  service_type: string;
  priority: string;
  requesting_area: string | null;
  requested_date: string | null;
  sla_deadline: string | null;
  status: string;
  department: string;
  assigned_to: string | null;
  project_id: string | null;
  activity_id: string | null;
  created_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SlaConfig {
  id: string;
  service_type: string;
  department: string;
  sla_hours: number;
  description: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  sector: string | null;
  avatar_url: string | null;
}

// ── Constants ──────────────────────────────────────

const STATUSES = [
  { value: "novo", label: "Novo", color: "bg-blue-100 text-blue-800", dot: "hsl(220, 90%, 56%)" },
  { value: "triagem", label: "Triagem", color: "bg-purple-100 text-purple-800", dot: "hsl(270, 70%, 55%)" },
  { value: "em_analise", label: "Em Análise", color: "bg-yellow-100 text-yellow-800", dot: "hsl(38, 92%, 50%)" },
  { value: "aprovacao", label: "Aprovação", color: "bg-orange-100 text-orange-800", dot: "hsl(25, 95%, 53%)" },
  { value: "em_execucao", label: "Em Execução", color: "bg-cyan-100 text-cyan-800", dot: "hsl(199, 89%, 48%)" },
  { value: "concluido", label: "Concluído", color: "bg-green-100 text-green-800", dot: "hsl(142, 76%, 36%)" },
  { value: "cancelado", label: "Cancelado", color: "bg-red-100 text-red-800", dot: "hsl(0, 84%, 60%)" },
];

const PRIORITIES = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];


// ── Helpers ────────────────────────────────────────
const getSlaStatus = (ticket: CscTicket): "green" | "yellow" | "red" => {
  if (!ticket.sla_deadline || ticket.status === "concluido" || ticket.status === "cancelado") return "green";
  const now = new Date();
  const deadline = new Date(ticket.sla_deadline);
  const remaining = deadline.getTime() - now.getTime();
  const totalSla = deadline.getTime() - new Date(ticket.created_at).getTime();
  if (remaining <= 0) return "red";
  if (remaining / totalSla < 0.25) return "yellow";
  return "green";
};

const formatTimeRemaining = (deadline: string | null): string => {
  if (!deadline) return "—";
  const now = new Date();
  const dl = new Date(deadline);
  const diff = dl.getTime() - now.getTime();
  if (diff <= 0) return "Expirado";
  const hours = Math.floor(diff / 3600000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${Math.floor((diff % 3600000) / 60000)}m`;
};

const getDeptLabel = (d: string) => d;
const getStatusObj = (s: string) => STATUSES.find((x) => x.value === s) || STATUSES[0];
const getPriorityLabel = (p: string) => PRIORITIES.find((x) => x.value === p)?.label || p;

// ── Component ──────────────────────────────────────
const CSC = () => {
  const { user, canManage } = useAuth();

  const [tickets, setTickets] = useState<CscTicket[]>([]);
  const [slaConfigs, setSlaConfigs] = useState<SlaConfig[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const openCreateDialog = () => {
    const cp = profiles.find(p => p.id === user?.id);
    setForm({
      title: "",
      description: "",
      service_type: "",
      priority: "medium",
      requesting_area: cp?.sector || "",
      department: "",
      assigned_to: cp?.full_name || "",
    });
    setAttachmentFile(null);
    setCreateOpen(true);
  };
  const [selectedTicket, setSelectedTicket] = useState<CscTicket | null>(null);
  const [activeTab, setActiveTab] = useState("kanban");
  const [filterDept, setFilterDept] = useState("all");
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    service_type: "",
    priority: "medium",
    requesting_area: "",
    department: "",
    assigned_to: "",
  });

  // ── Fetch ──────────────────────────────────────
  const fetchData = async () => {
    const [{ data: t }, { data: s }, { data: p }, { data: sec }] = await Promise.all([
      supabase.from("csc_tickets").select("*").order("created_at", { ascending: false }),
      supabase.from("csc_sla_configs").select("*"),
      supabase.from("profiles").select("id, full_name, email, sector, avatar_url").order("full_name"),
      supabase.from("sectors").select("id, name").order("name"),
    ]);
    if (t) setTickets(t as CscTicket[]);
    if (s) setSlaConfigs(s as SlaConfig[]);
    if (p) setProfiles(p);
    if (sec) setSectors(sec);
  };

  const currentProfile = useMemo(() => profiles.find(p => p.id === user?.id), [profiles, user]);
  const profileAvatarMap = useMemo(() => buildAvatarLookupMap(profiles), [profiles]);

  useEffect(() => {
    fetchData();
  }, []);

  // ── Service types for selected dept ────────────
  const serviceTypes = useMemo(
    () => slaConfigs.filter((c) => c.department === form.department),
    [slaConfigs, form.department]
  );

  // ── Filtered tickets ───────────────────────────
  const filteredTickets = useMemo(
    () => (filterDept === "all" ? tickets : tickets.filter((t) => t.department === filterDept)),
    [tickets, filterDept]
  );

  // ── Create ─────────────────────────────────────
  const handleCreate = async () => {
    if (!form.title || !form.department) {
      toast.error("Preencha os campos obrigatórios (Título e Setor de Destino)");
      return;
    }
    setIsLoading(true);

    // Upload attachment if present
    let attachmentUrl: string | null = null;
    if (attachmentFile) {
      const fileExt = attachmentFile.name.split('.').pop();
      const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("csc-attachments")
        .upload(filePath, attachmentFile);
      if (uploadError) {
        toast.error("Erro ao enviar anexo");
        setIsLoading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("csc-attachments").getPublicUrl(filePath);
      attachmentUrl = urlData.publicUrl;
    }

    const sla = slaConfigs.find((c) => c.service_type === form.service_type && c.department === form.department);
    const slaDeadline = sla ? new Date(Date.now() + sla.sla_hours * 3600000).toISOString() : null;

    const { error } = await supabase.from("csc_tickets").insert({
      title: form.title,
      description: form.description || null,
      service_type: form.service_type,
      priority: form.priority,
      requesting_area: form.requesting_area || null,
      department: form.department,
      assigned_to: form.assigned_to || null,
      attachment_url: attachmentUrl,
      sla_deadline: slaDeadline,
      created_by: user?.id || null,
    } as any);

    if (error) {
      toast.error("Erro ao criar solicitação");
    } else {
      toast.success("Solicitação criada com sucesso!");
      setForm({ title: "", description: "", service_type: "", priority: "medium", requesting_area: "", department: "", assigned_to: "" });
      setAttachmentFile(null);
      setCreateOpen(false);
      fetchData();
    }
    setIsLoading(false);
  };

  // ── Update status ──────────────────────────────
  const updateTicketStatus = async (ticketId: string, newStatus: string) => {
    const updates: Database['public']['Tables']['csc_tickets']['Update'] = { status: newStatus };
    if (newStatus === "concluido") updates.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("csc_tickets").update(updates).eq("id", ticketId);
    if (error) {
      toast.error("Erro");
    } else {
      fetchData();
    }
  };

  // ── Update ticket fields ───────────────────────
  const updateTicket = async (ticketId: string, updates: Database['public']['Tables']['csc_tickets']['Update']) => {
    const { error } = await supabase.from("csc_tickets").update(updates).eq("id", ticketId);
    if (error) {
      toast.error("Erro");
    } else {
      fetchData();
      setSelectedTicket(null);
    }
  };

  // ── Dashboard stats ────────────────────────────
  const stats = useMemo(() => {
    const resolved = filteredTickets.filter((t) => t.status === "concluido");
    const active = filteredTickets.filter((t) => !["concluido", "cancelado"].includes(t.status));
    const slaOk = resolved.filter((t) => {
      if (!t.sla_deadline || !t.resolved_at) return true;
      return new Date(t.resolved_at) <= new Date(t.sla_deadline);
    });
    const avgLeadTime = resolved.length > 0
      ? resolved.reduce((sum, t) => {
          const start = new Date(t.created_at).getTime();
          const end = new Date(t.resolved_at || t.updated_at).getTime();
          return sum + (end - start);
        }, 0) / resolved.length / 3600000
      : 0;
    const byDept = sectors.map((d) => ({
      value: d.name,
      label: d.name,
      total: tickets.filter((t) => t.department === d.name).length,
      active: tickets.filter((t) => t.department === d.name && !["concluido", "cancelado"].includes(t.status)).length,
    }));
    const overdue = active.filter((t) => getSlaStatus(t) === "red").length;
    const atRisk = active.filter((t) => getSlaStatus(t) === "yellow").length;

    return {
      total: filteredTickets.length,
      active: active.length,
      resolved: resolved.length,
      slaRate: resolved.length > 0 ? Math.round((slaOk.length / resolved.length) * 100) : 100,
      avgLeadTime: Math.round(avgLeadTime * 10) / 10,
      byDept,
      overdue,
      atRisk,
    };
  }, [filteredTickets, tickets, sectors]);

  // ── Kanban columns ─────────────────────────────
  const kanbanStatuses = STATUSES.filter((s) => s.value !== "cancelado");

  // ── SLA Badge Component ────────────────────────
  const SlaBadge = ({ ticket }: { ticket: CscTicket }) => {
    const status = getSlaStatus(ticket);
    const colors = {
      green: "bg-emerald-100 text-emerald-800 border-emerald-200",
      yellow: "bg-amber-100 text-amber-800 border-amber-200 animate-pulse",
      red: "bg-red-100 text-red-800 border-red-200 animate-pulse",
    };
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors[status]}`}>
        <Timer className="w-3 h-3" />
        {formatTimeRemaining(ticket.sla_deadline)}
      </span>
    );
  };

  // ── Priority Badge ─────────────────────────────
  const PriorityBadge = ({ priority }: { priority: string }) => {
    const colors: Record<string, string> = {
      low: "bg-slate-100 text-slate-700",
      medium: "bg-blue-100 text-blue-700",
      high: "bg-orange-100 text-orange-700",
      critical: "bg-red-100 text-red-700",
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[priority] || colors.medium}`}>
        {getPriorityLabel(priority)}
      </span>
    );
  };

  return (
          <div className="px-4 py-4 space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Portal de solicitações, gestão de SLA e workflows departamentais
          </p>
          <div className="flex items-center gap-2">
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-[160px]">
                <Filter className="w-4 h-4 mr-1" />
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {sectors.map((d) => (
                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
             <Button className="gap-1" onClick={openCreateDialog}>
                <Plus className="w-4 h-4" /> Nova Solicitação
              </Button>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent className="sm:max-w-[750px]">
                <DialogHeader>
                  <DialogTitle>Nova Solicitação CSC</DialogTitle>
                  <DialogDescription>
                    Preencha os detalhes da nova solicitação abaixo.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Título *</Label>
                      <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Resumo da solicitação" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Prioridade</Label>
                      <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Setor de Destino *</Label>
                      <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v, service_type: "" })}>
                        <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                        <SelectContent>
                          {sectors.map((d) => (
                            <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Tipo de Serviço *</Label>
                      <Input value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} placeholder="Digite o tipo de serviço" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Descrição</Label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes da solicitação..." rows={3} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Responsável</Label>
                      <Input value={form.assigned_to} readOnly className="bg-muted" />
                    </div>
                    <div className="grid gap-2">
                      <Label>Setor Solicitante</Label>
                      <Input value={form.requesting_area} readOnly className="bg-muted" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Anexo</Label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 flex items-center gap-2 h-10 px-3 border border-input rounded-md cursor-pointer hover:bg-accent transition-colors text-sm text-muted-foreground truncate">
                        <Paperclip className="w-4 h-4 shrink-0" />
                        <span className="truncate">{attachmentFile ? attachmentFile.name : "Selecionar arquivo (imagem, PDF, etc.)"}</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                          onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      {attachmentFile && (
                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setAttachmentFile(null)}>
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreate} disabled={isLoading}>{isLoading ? "Criando..." : "Criar Solicitação"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="kanban" className="gap-1"><Briefcase className="w-4 h-4" /> Kanban</TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1"><BarChart3 className="w-4 h-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="tickets" className="gap-1"><Clock className="w-4 h-4" /> Solicitações</TabsTrigger>
          </TabsList>

          {/* ── KANBAN ─────────────────────────── */}
          <TabsContent value="kanban">
            <CscKanbanBoard
              kanbanStatuses={kanbanStatuses}
              filteredTickets={filteredTickets}
              profileAvatarMap={profileAvatarMap}
              getSlaStatus={getSlaStatus}
              getDeptLabel={getDeptLabel}
              PriorityBadge={PriorityBadge}
              SlaBadge={SlaBadge}
              onSelectTicket={setSelectedTicket}
              onMoveTicket={updateTicketStatus}
            />
          </TabsContent>

          {/* ── DASHBOARD ──────────────────────── */}
          <TabsContent value="dashboard">
            <div className="grid gap-4">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-xs">Tempo Médio</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.avgLeadTime}h</p>
                    <p className="text-[10px] text-muted-foreground">Lead Time médio</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs">SLA Cumprido</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.slaRate}%</p>
                    <Progress value={stats.slaRate} className="mt-1 h-1.5" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-xs">Em Atraso</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
                    <p className="text-[10px] text-muted-foreground">{stats.atRisk} em risco</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Briefcase className="w-4 h-4" />
                      <span className="text-xs">Total</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                    <p className="text-[10px] text-muted-foreground">{stats.active} ativas</p>
                  </CardContent>
                </Card>
              </div>

              {/* Department Volume */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Volume por Departamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.byDept.map((d) => (
                      <div key={d.value} className="flex items-center gap-3">
                        <span className="text-sm font-medium w-24">{d.label}</span>
                        <div className="flex-1">
                          <Progress value={stats.total > 0 ? (d.total / Math.max(...stats.byDept.map(x => x.total), 1)) * 100 : 0} className="h-2" />
                        </div>
                        <span className="text-sm text-muted-foreground w-16 text-right">{d.total} total</span>
                        <Badge variant={d.active > 0 ? "default" : "secondary"} className="text-[10px]">{d.active} ativas</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Analyst Workload */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Carga de Trabalho - Analistas CSC
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const analysts = tickets
                      .filter((t) => t.assigned_to && !["concluido", "cancelado"].includes(t.status))
                      .reduce<Record<string, number>>((acc, t) => {
                        acc[t.assigned_to!] = (acc[t.assigned_to!] || 0) + 1;
                        return acc;
                      }, {});
                    const entries = Object.entries(analysts).sort((a, b) => b[1] - a[1]);
                    if (entries.length === 0) return <p className="text-sm text-muted-foreground">Nenhum analista com demandas ativas.</p>;
                    const maxCount = Math.max(...entries.map(([, c]) => c));
                    return (
                      <div className="space-y-2">
                        {entries.map(([name, count]) => (
                          <div key={name} className="flex items-center gap-3">
                            <Avatar className="h-7 w-7">
                              {(() => {
                                const avatar = resolveAvatarFromLookup(name, name, profileAvatarMap);
                                return avatar ? <AvatarImage src={avatar} alt={name} /> : null;
                              })()}
                              <AvatarFallback className="text-[10px]">{getAvatarInitials(name)}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm w-40 truncate">{name}</span>
                            <div className="flex-1"><Progress value={(count / maxCount) * 100} className="h-2" /></div>
                            <Badge variant="outline" className="text-xs">{count} demandas</Badge>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── TICKETS LIST ───────────────────── */}
          <TabsContent value="tickets">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Todas as Solicitações</CardTitle>
                <CardDescription>{filteredTickets.length} solicitação(ões)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredTickets.map((ticket) => {
                    const statusObj = getStatusObj(ticket.status);
                    return (
                      <div
                        key={ticket.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/5 cursor-pointer transition-colors"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{ticket.title}</p>
                            <Badge variant="outline" className="text-[9px] h-4 shrink-0">{getDeptLabel(ticket.department)}</Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString("pt-BR")}</span>
                            {ticket.requesting_area && <span className="text-xs text-muted-foreground">• {ticket.requesting_area}</span>}
                            {ticket.assigned_to && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground max-w-[220px]">
                                <Avatar className="h-4 w-4 shrink-0">
                                  {(() => {
                                    const avatar = resolveAvatarFromLookup(ticket.assigned_to, ticket.assigned_to, profileAvatarMap);
                                    return avatar ? <AvatarImage src={avatar} alt={ticket.assigned_to} /> : null;
                                  })()}
                                  <AvatarFallback className="text-[8px]">{getAvatarInitials(ticket.assigned_to)}</AvatarFallback>
                                </Avatar>
                                <span className="truncate">{ticket.assigned_to}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <PriorityBadge priority={ticket.priority} />
                        <SlaBadge ticket={ticket} />
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusObj.color}`}>{statusObj.label}</span>
                      </div>
                    );
                  })}
                  {filteredTickets.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhuma solicitação encontrada.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Ticket Detail Dialog ──────────────── */}
        <Dialog open={!!selectedTicket} onOpenChange={(open) => { if (!open) setSelectedTicket(null); }}>
          <DialogContent className="max-w-md">
            {selectedTicket && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base">{selectedTicket.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {selectedTicket.description && (
                    <p className="text-sm text-muted-foreground">{selectedTicket.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Departamento:</span> <strong>{getDeptLabel(selectedTicket.department)}</strong></div>
                    <div><span className="text-muted-foreground">Prioridade:</span> <PriorityBadge priority={selectedTicket.priority} /></div>
                    <div><span className="text-muted-foreground">Status:</span> <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusObj(selectedTicket.status).color}`}>{getStatusObj(selectedTicket.status).label}</span></div>
                    <div><span className="text-muted-foreground">SLA:</span> <SlaBadge ticket={selectedTicket} /></div>
                    {selectedTicket.assigned_to && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Responsável:</span>
                        <Avatar className="h-5 w-5">
                          {(() => {
                            const avatar = resolveAvatarFromLookup(selectedTicket.assigned_to, selectedTicket.assigned_to, profileAvatarMap);
                            return avatar ? <AvatarImage src={avatar} alt={selectedTicket.assigned_to} /> : null;
                          })()}
                          <AvatarFallback className="text-[8px]">{getAvatarInitials(selectedTicket.assigned_to)}</AvatarFallback>
                        </Avatar>
                        <strong className="truncate">{selectedTicket.assigned_to}</strong>
                      </div>
                    )}
                    
                    {selectedTicket.requesting_area && <div><span className="text-muted-foreground">Área:</span> <strong>{selectedTicket.requesting_area}</strong></div>}
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <Label className="text-xs">Mover para</Label>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.filter((s) => s.value !== selectedTicket.status).map((s) => (
                        <Button
                          key={s.value}
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 gap-1"
                          onClick={() => {
                            updateTicketStatus(selectedTicket.id, s.value);
                            setSelectedTicket({ ...selectedTicket, status: s.value });
                          }}
                        >
                          <ArrowRight className="w-3 h-3" /> {s.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Edit assigned */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1">
                      <Label className="text-xs">Responsável</Label>
                      <Select
                        value={selectedTicket.assigned_to || "_none"}
                        onValueChange={(v) => {
                          const val = v === "_none" ? null : v;
                          updateTicket(selectedTicket.id, { assigned_to: val });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Nenhum</SelectItem>
                          {profiles.filter(p => p.full_name).map((p) => (
                            <SelectItem key={p.id} value={p.full_name!}>{p.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    
  );
};

export default CSC;
