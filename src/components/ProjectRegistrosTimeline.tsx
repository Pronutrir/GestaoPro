'use client';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatarDiaMesMisto, parseDataOuInstante } from "@/lib/dataLocal";
import {
  CalendarDays, FileText, Lightbulb, ListTodo, Inbox, ArrowUpRight,
} from "lucide-react";

/**
 * LINHA DO TEMPO DO PROJETO — o que aconteceu, em ordem.
 *
 * Reuniões, documentos e lições viviam em três abas separadas, e responder
 * "o que andou neste projeto?" exigia abrir as três e comparar datas na cabeça.
 *
 * Isto NÃO substitui as telas de cada módulo: elas continuam sendo o lugar de
 * criar e editar. Aqui é só leitura, cronológica — a visão que faltava.
 *
 * Por que não fundir os três num módulo só: são naturezas diferentes (evento
 * com participantes, arquivo com versão, conhecimento reutilizável entre
 * projetos) e o vínculo entre eles é eventual. O que faltava era um lugar onde
 * se encontram em CONTEXTO, não uma tela que atendesse mal aos três.
 */

type TipoRegistro = "reuniao" | "documento" | "licao";

interface Registro {
  id: string;
  tipo: TipoRegistro;
  titulo: string;
  data: string;
  detalhe?: string | null;
  /** Quantas ações a reunião gerou — o que ela produziu de trabalho. */
  acoes?: number;
  /** Quantas dessas ações viraram tarefa de verdade. */
  acoesComTarefa?: number;
  /** Deep-link para a aba de origem. */
  href?: string;
}

const META: Record<TipoRegistro, { label: string; icon: React.ReactNode; cls: string }> = {
  reuniao: {
    label: "reunião",
    icon: <CalendarDays className="w-3 h-3" />,
    cls: "border-primary/40 bg-primary/5 text-primary",
  },
  documento: {
    label: "documento",
    icon: <FileText className="w-3 h-3" />,
    cls: "border-border bg-muted/50 text-muted-foreground",
  },
  licao: {
    label: "lição",
    icon: <Lightbulb className="w-3 h-3" />,
    cls: "border-warning/40 bg-warning/5 text-warning",
  },
};

const FILTROS: Array<{ id: "todos" | TipoRegistro; label: string }> = [
  { id: "todos", label: "Tudo" },
  { id: "reuniao", label: "Reuniões" },
  { id: "documento", label: "Documentos" },
  { id: "licao", label: "Lições" },
];

export const ProjectRegistrosTimeline = ({ projectId }: { projectId: string }) => {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | TipoRegistro>("todos");

  useEffect(() => {
    if (!projectId) return;
    let cancelado = false;
    setCarregando(true);

    (async () => {
      // Em paralelo: são fontes independentes e esperar em série multiplicaria
      // o tempo de abertura da aba.
      const [reunioes, documentos, licoes] = await Promise.all([
        supabase
          .from("meetings")
          .select("id, title, meeting_date, created_at, location")
          .eq("project_id", projectId)
          .eq("is_trashed", false),
        supabase
          .from("project_documents")
          .select("id, file_name, description, created_at")
          .eq("project_id", projectId)
          .eq("is_trashed", false),
        supabase
          .from("lessons_learned")
          .select("id, problem, category, created_at")
          .eq("project_id", projectId)
          .eq("is_trashed", false),
      ]);

      if (cancelado) return;

      // Ações SÓ das reuniões deste projeto. `meeting_actions` não tem
      // project_id, então o recorte vem dos ids obtidos acima — sem isso a
      // consulta traria as ações de todos os projetos que o usuário enxerga.
      const idsReuniao = ((reunioes.data || []) as Array<{ id: string }>).map((m) => m.id);
      const acoes = idsReuniao.length
        ? await supabase
            .from("meeting_actions")
            .select("id, meeting_id, activity_id")
            .in("meeting_id", idsReuniao)
        : { data: [] as Array<{ meeting_id: string; activity_id: string | null }> };

      if (cancelado) return;

      const acoesPorReuniao = new Map<string, { total: number; comTarefa: number }>();
      for (const a of (acoes.data || []) as Array<{ meeting_id: string; activity_id: string | null }>) {
        const atual = acoesPorReuniao.get(a.meeting_id) || { total: 0, comTarefa: 0 };
        atual.total += 1;
        if (a.activity_id) atual.comTarefa += 1;
        acoesPorReuniao.set(a.meeting_id, atual);
      }

      const lista: Registro[] = [];

      for (const m of (reunioes.data || []) as any[]) {
        const c = acoesPorReuniao.get(m.id);
        lista.push({
          id: `m:${m.id}`,
          tipo: "reuniao",
          titulo: m.title || "Reunião sem título",
          // meeting_date é quando a reunião ACONTECEU; created_at é quando foi
          // registrada. Numa linha do tempo do projeto, vale o fato.
          data: m.meeting_date || m.created_at,
          detalhe: m.location || null,
          acoes: c?.total ?? 0,
          acoesComTarefa: c?.comTarefa ?? 0,
          href: `?tab=meetings`,
        });
      }

      for (const d of (documentos.data || []) as any[]) {
        lista.push({
          id: `d:${d.id}`,
          tipo: "documento",
          titulo: d.file_name || "Documento",
          data: d.created_at,
          detalhe: d.description || null,
          href: `?tab=documents`,
        });
      }

      for (const l of (licoes.data || []) as any[]) {
        lista.push({
          id: `l:${l.id}`,
          tipo: "licao",
          titulo: l.problem || "Lição registrada",
          data: l.created_at,
          detalhe: l.category || null,
          href: `?tab=lessons`,
        });
      }

      lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      setRegistros(lista);
      setCarregando(false);
    })();

    return () => { cancelado = true; };
  }, [projectId]);

  const visiveis = useMemo(
    () => (filtro === "todos" ? registros : registros.filter((r) => r.tipo === filtro)),
    [registros, filtro],
  );

  const contagem = useMemo(() => {
    const c: Record<TipoRegistro, number> = { reuniao: 0, documento: 0, licao: 0 };
    registros.forEach((r) => { c[r.tipo] += 1; });
    return c;
  }, [registros]);

  // Agrupa por mês: numa lista longa, a data solta em cada linha vira ruído e
  // o olho perde a noção de período.
  const porMes = useMemo(() => {
    const grupos = new Map<string, Registro[]>();
    for (const r of visiveis) {
      // meeting_date é coluna `date`: lido como instante, uma reunião do dia 1º
      // caía no mês ANTERIOR aqui no agrupamento.
      // r.data é misto: meeting_date (data pura) ou created_at (timestamp). Ver
      // parseDataOuInstante — tratar os dois igual erraria um dos lados.
      const d = parseDataOuInstante(r.data);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const arr = grupos.get(chave) || [];
      arr.push(r);
      grupos.set(chave, arr);
    }
    return Array.from(grupos.entries());
  }, [visiveis]);

  const rotuloMes = (chave: string) => {
    const [ano, mes] = chave.split("-");
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  if (carregando) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando registros…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Filtro por tipo, com a contagem de cada um — o número já diz o que
          este projeto de fato registra. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTROS.map((f) => {
          const n = f.id === "todos" ? registros.length : contagem[f.id as TipoRegistro];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] font-medium transition-colors",
                filtro === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-lg border border-border p-10 text-center">
          <Inbox className="w-9 h-9 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {registros.length === 0
              ? "Nada registrado neste projeto ainda"
              : "Nenhum registro deste tipo"}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Reuniões, documentos e lições aparecem aqui em ordem cronológica.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {porMes.map(([mes, itens]) => (
            <div key={mes}>
              <div className="px-3 py-1.5 bg-muted/40 border-b border-border text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                {rotuloMes(mes)}
                <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                  {itens.length} registro{itens.length > 1 ? "s" : ""}
                </span>
              </div>
              {itens.map((r) => {
                const meta = META[r.tipo];
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2.5 px-3 py-2 border-b border-border/60 last:border-b-0 hover:bg-muted/30 transition-colors group"
                  >
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-[42px]">
                      {formatarDiaMesMisto(r.data)}
                    </span>
                    <span className={cn("inline-flex items-center gap-1 h-[18px] px-1.5 rounded border text-[10px] font-medium shrink-0", meta.cls)}>
                      {meta.icon}{meta.label}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] truncate" title={r.titulo}>
                      {r.titulo}
                    </span>

                    {/* O que a reunião PRODUZIU. Uma reunião sem ação é uma
                        reunião que não virou trabalho — e esse é o dado que
                        justifica a aba existir. */}
                    {r.tipo === "reuniao" && (r.acoes ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0 gap-1"
                        title={`${r.acoesComTarefa} de ${r.acoes} ação(ões) viraram tarefa`}
                      >
                        <ListTodo className="w-3 h-3" />
                        {r.acoesComTarefa}/{r.acoes}
                      </Badge>
                    )}
                    {r.tipo === "reuniao" && (r.acoes ?? 0) === 0 && (
                      <span className="text-[10px] text-muted-foreground/60 shrink-0" title="Esta reunião não registrou nenhuma ação">
                        sem ações
                      </span>
                    )}

                    {r.detalhe && (
                      <span className="hidden sm:inline text-[11px] text-muted-foreground truncate max-w-[140px] shrink-0">
                        {r.detalhe}
                      </span>
                    )}

                    {r.href && (
                      <a
                        href={r.href}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0"
                        title="Abrir na aba de origem"
                      >
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
