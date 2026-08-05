'use client';
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertTriangle, Clock, UserX, Ban, Search, X, ArrowRight, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useAssigneeAvatarLookup } from "@/hooks/useAssigneeAvatarLookup";
import { getAvatarInitials } from "@/lib/avatarLookup";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import {
  buildStagesFinais, ehPendencia, diasDeAtraso, faixaDeAtraso,
  ordenarPorAtraso, resumirPendencias,
  type PendenciaLike, type FaixaAtraso,
} from "@/lib/pendencias";

/**
 * Pendências — substitui a antiga tela de Bloqueios, que estava vazia (0
 * atividades bloqueadas, 0 projetos) enquanto 92 atividades venciam sem lugar
 * onde aparecer. Bloqueio virou um filtro daqui: é um tipo de pendência, não
 * uma tela própria.
 *
 * O RLS já decide o que cada pessoa enxerga (can_view_project_v2: líder, membro
 * ou criador). Esta tela NÃO refaz essa regra — refazer criaria uma segunda
 * fonte de verdade divergindo do banco. As abas são recorte de apresentação
 * sobre o conjunto que o banco já entregou.
 */

interface Row extends PendenciaLike {
  wbs_code: string | null;
  projects: { title: string; is_trashed: boolean | null } | null;
}

type Aba = "minhas" | "equipe" | "sem-dono";
type Filtro = FaixaAtraso | "bloqueadas" | null;

const FAIXA_UI: Record<FaixaAtraso, {
  faixa: string; texto: string; rotulo: string; situacao: string;
}> = {
  critico: { faixa: "bg-destructive", texto: "text-destructive", rotulo: "mais de 90 dias", situacao: "Parada" },
  atencao: { faixa: "bg-warning", texto: "text-warning", rotulo: "31 a 90 dias", situacao: "Atrasada" },
  recente: { faixa: "bg-muted-foreground/30", texto: "text-muted-foreground", rotulo: "até 30 dias", situacao: "Vencida" },
};

export default function PendenciasPage() {
  const router = useRouter();
  const { user, isAdmin, canManage } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>("minhas");
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [busca, setBusca] = useState("");

  // Só quem gerencia vê a fila sem dono: para um colaborador, uma lista de
  // tarefas de ninguém é ruído ou convite a assumir o que não é dele.
  const podeVerSemDono = isAdmin || canManage;

  useEffect(() => {
    const carregar = async () => {
      try {
        const [actRes, stgRes, profRes] = await Promise.all([
          // O is_trashed de baixo é o da ATIVIDADE. Uma atividade viva dentro de
          // um projeto descartado continua vindo — por isso o projeto entra na
          // seleção com o próprio is_trashed e é filtrado logo abaixo.
          supabase
            .from("activities")
            .select("id, title, project_id, wbs_code, end_date, assigned_to, workflow_stage_id, status, is_blocked, blocked_reason, projects(title, is_trashed)")
            .eq("is_trashed", false),
          // `categoria` existe no banco mas ainda não nos tipos gerados; o cast
          // evita depender de regenerar os tipos para a tela funcionar.
          supabase.from("workflow_stages").select("id, is_final, categoria") as unknown as
            Promise<{ data: { id: string; is_final: boolean | null; categoria: string | null }[] | null }>,
          supabase.from("profiles").select("id, full_name, email"),
        ]);
        if (actRes.error) throw actRes.error;

        const finais = buildStagesFinais(stgRes.data ?? []);
        const todas = (actRes.data as unknown as Row[]) ?? [];
        // Projeto na lixeira não gera pendência: ninguém deve nada num projeto
        // descartado. Sem esta linha, um único projeto arquivado respondia por
        // 14 das 92 pendências — e as dele nasceram vencidas em ~2 anos porque
        // vieram de importação com as datas originais do plano de origem.
        setRows(todas.filter((a) => a.projects?.is_trashed !== true && ehPendencia(a, finais)));

        const mapa: Record<string, string> = {};
        (profRes.data ?? []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
          mapa[p.id] = p.full_name || p.email || "Sem nome";
        });
        setNomes(mapa);
      } catch {
        toast.error("Erro ao carregar pendências");
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  // Se o colaborador não tem nada seu, abrir numa aba vazia parece tela quebrada.
  useEffect(() => {
    if (loading || !user?.id) return;
    const minhas = rows.filter((r) => r.assigned_to === user.id).length;
    if (minhas === 0 && rows.length > 0) setAba("equipe");
  }, [loading, rows, user?.id]);

  const daAba = useMemo(() => {
    if (aba === "minhas") return rows.filter((r) => r.assigned_to === user?.id);
    if (aba === "sem-dono") return rows.filter((r) => !r.assigned_to);
    return rows;
  }, [rows, aba, user?.id]);

  const resumo = useMemo(() => resumirPendencias(daAba), [daAba]);

  const lista = useMemo(() => {
    let l = daAba;
    if (filtro === "bloqueadas") l = l.filter((r) => r.is_blocked === true);
    else if (filtro) l = l.filter((r) => faixaDeAtraso(diasDeAtraso(r.end_date)) === filtro);
    const q = busca.trim().toLowerCase();
    if (q) {
      l = l.filter((r) =>
        (r.title || "").toLowerCase().includes(q) ||
        (r.projects?.title || "").toLowerCase().includes(q));
    }
    return ordenarPorAtraso(l);
  }, [daAba, filtro, busca]);

  const avatares = useAssigneeAvatarLookup(lista.map((r) => r.assigned_to));

  const contarAba = (a: Aba) => {
    if (a === "minhas") return rows.filter((r) => r.assigned_to === user?.id).length;
    if (a === "sem-dono") return rows.filter((r) => !r.assigned_to).length;
    return rows.length;
  };

  const abas: { id: Aba; label: string }[] = [
    { id: "minhas", label: "Minhas" },
    { id: "equipe", label: "Da minha equipe" },
    ...(podeVerSemDono ? [{ id: "sem-dono" as Aba, label: "Sem responsável" }] : []),
  ];

  // Os cartões são filtros, não enfeite — mesmo comportamento do painel de
  // reuniões. Todos recortam a aba atual; "sem responsável" é aba, não cartão,
  // porque muda o conjunto e não a fatia dele.
  const cartoes: { id: Filtro; n: number; label: string; icone: typeof Clock; destaque?: boolean }[] = [
    { id: "critico", n: resumo.criticas, label: "mais de 90 dias", icone: AlertTriangle, destaque: true },
    { id: "atencao", n: resumo.atencao, label: "31 a 90 dias", icone: Clock },
    { id: "recente", n: resumo.recentes, label: "até 30 dias", icone: Clock },
  ];
  if (resumo.bloqueadas > 0) {
    cartoes.push({ id: "bloqueadas", n: resumo.bloqueadas, label: "bloqueadas", icone: Ban, destaque: true });
  }

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Pendências</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            O que passou do prazo e continua em aberto. Concluídas com atraso não entram.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pendência ou projeto"
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Abas: recorte de apresentação. O conjunto por trás já veio filtrado
          pelo RLS — quem não participa do projeto não recebeu a linha. */}
      <div className="flex gap-1 flex-wrap">
        {abas.map((t) => {
          const on = aba === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setAba(t.id); setFiltro(null); }}
              className={cn(
                "text-sm px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-2",
                on ? "bg-foreground text-background font-medium"
                   : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {t.label}
              <span className={cn("text-xs tabular-nums", on ? "opacity-75" : "text-muted-foreground/70")}>
                {contarAba(t.id)}
              </span>
            </button>
          );
        })}
      </div>

      <div className={cn("grid gap-3 grid-cols-2", cartoes.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
        {cartoes.map((c) => {
          const on = filtro === c.id;
          const Icone = c.icone;
          return (
            <Card
              key={String(c.id)}
              onClick={() => setFiltro(on ? null : c.id)}
              className={cn(
                "p-3.5 cursor-pointer transition-colors",
                on ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className={cn(
                    "text-2xl font-semibold tabular-nums leading-tight",
                    c.destaque && c.n > 0 ? "text-destructive" : "text-foreground",
                  )}>
                    {c.n}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
                </div>
                <Icone className={cn(
                  "w-4 h-4 shrink-0",
                  c.destaque && c.n > 0 ? "text-destructive" : "text-muted-foreground",
                )} />
              </div>
            </Card>
          );
        })}
      </div>

      {filtro && (
        <button
          onClick={() => setFiltro(null)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" /> limpar filtro
        </button>
      )}

      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Carregando…</div>
      ) : lista.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-14 h-14 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-success" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {busca || filtro ? "Nada com esse recorte" : "Nenhuma pendência"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {busca || filtro
              ? "Ajuste a busca ou limpe o filtro."
              : aba === "minhas"
                ? "Você está em dia."
                : "Nada em aberto fora do prazo por aqui."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y">
          {/* Cabeçalho: sem ele a linha é uma sequência de valores sem nome —
              "53d" e um avatar não se explicam sozinhos. As larguras espelham
              exatamente as da linha abaixo para as colunas ficarem alinhadas. */}
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="w-[3px] shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">Pendência</span>
            <span className="w-16 text-right shrink-0">Prazo</span>
            <span className="w-28 text-right shrink-0 hidden sm:block">Responsável</span>
            <span className="w-20 text-right shrink-0 hidden md:block">Situação</span>
            <span className="w-4 shrink-0" aria-hidden />
          </div>
          {lista.map((r) => {
            const dias = diasDeAtraso(r.end_date);
            const faixa = faixaDeAtraso(dias);
            const ui = FAIXA_UI[faixa];
            const dono = r.assigned_to ? (nomes[r.assigned_to] ?? "Usuário") : null;
            return (
              <div
                key={r.id}
                onClick={() => router.push(`/project/${r.project_id}`)}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer group"
              >
                {/* Única cor da linha. Seis elementos coloridos por linha é o que
                    já corrigimos na tabela de projetos. */}
                <span className={cn("w-[3px] self-stretch rounded-full shrink-0", ui.faixa)} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.is_blocked && (
                      <Ban className="inline w-3.5 h-3.5 text-destructive mr-1.5 -mt-0.5" />
                    )}
                    {r.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {r.projects?.title ?? "Projeto"}
                    {r.end_date && <> · venceu em {format(parseISO(r.end_date.slice(0, 10)), "dd/MM/yyyy")}</>}
                  </p>
                </div>

                <span className={cn("w-16 text-right text-xs font-semibold tabular-nums shrink-0", ui.texto)}
                  title={`Atrasada há ${dias} dias — ${ui.rotulo}`}>
                  {dias}d
                </span>

                <div className="w-28 shrink-0 hidden sm:flex items-center justify-end gap-1.5">
                  {dono ? (
                    <>
                      <Avatar className="h-5 w-5 shrink-0">
                        {avatares[r.assigned_to ?? ""] && (
                          <AvatarImage src={avatares[r.assigned_to ?? ""]} alt={dono} />
                        )}
                        <AvatarFallback className="text-[9px]">{getAvatarInitials(dono)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground truncate">{dono}</span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-destructive">sem dono</span>
                  )}
                </div>

                {/* Situação: o nome da faixa, que até aqui só existia como cor.
                    Quem não distingue os tons — ou lê num print — precisa da
                    palavra. Em texto, não em etiqueta: a faixa lateral já é o
                    sinal, e uma pílula colorida por linha traria a cor de volta. */}
                <span className={cn("w-20 text-right text-xs shrink-0 hidden md:block", ui.texto)}>
                  {r.is_blocked ? "Bloqueada" : ui.situacao}
                </span>

                <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground shrink-0 transition-colors" />
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
