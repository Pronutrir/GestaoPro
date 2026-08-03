'use client';
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { Lightbulb, ArrowUpRight } from "lucide-react";

/**
 * De qual demanda do roadmap este projeto nasceu.
 *
 * A FK existe só num sentido (roadmap_items.project_id), então a partir de um
 * projeto não havia como descobrir a origem sem varrer a tabela — a evidência
 * que justificou a aprovação ficava perdida justamente onde ela é cobrada.
 *
 * Some quando o projeto não veio do roadmap, que é o caso da maioria.
 */

interface Origem {
  id: string;
  title: string;
  score: number | null;
  solicitante_nome: string | null;
  area: string | null;
  custo_atual: number | null;
}

export const OrigemDemanda = ({ projectId }: { projectId: string }) => {
  const [origem, setOrigem] = useState<Origem | null>(null);

  useEffect(() => {
    supabase
      .from("roadmap_items" as any)
      .select("id, title, score, solicitante_nome, area, custo_atual")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data }) => setOrigem((data as any) ?? null));
  }, [projectId]);

  if (!origem) return null;

  const prioridade =
    origem.score == null ? null
      : origem.score >= 70 ? "Alta"
      : origem.score >= 40 ? "Média" : "Baixa";

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-start gap-3 print:hidden">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
        <Lightbulb className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          Origem — demanda do roadmap
        </p>
        <p className="text-[13px] font-medium truncate mt-0.5">{origem.title}</p>
        <p className="text-[11.5px] text-muted-foreground mt-0.5">
          {[
            origem.solicitante_nome && `Solicitado por ${origem.solicitante_nome}`,
            origem.area,
            prioridade && `Prioridade ${prioridade}${origem.score != null ? ` (${Math.round(origem.score)}%)` : ""}`,
            origem.custo_atual ? `Custo atual R$ ${Number(origem.custo_atual).toLocaleString("pt-BR")}/mês` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      <Link
        href="/roadmap"
        className="shrink-0 text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5"
      >
        Ver no roadmap <ArrowUpRight className="w-3 h-3" />
      </Link>
    </div>
  );
};
