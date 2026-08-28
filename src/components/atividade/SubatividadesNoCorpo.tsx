'use client';

import { useEffect, useState } from "react";
import { Diamond, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatarDataBR } from "@/lib/dataLocal";
import { lerTotaisDerivados, resumoDasSubatividades } from "@/lib/telaDaAtividadeDados";

/**
 * AS SUBATIVIDADES, NO CORPO DA ATIVIDADE.
 *
 * ============================================================================
 * O DIAGNÓSTICO QUE ISTO FECHA
 *
 * A seção 01 do desenho lista o que falta no painel atual, e um dos itens é:
 * *"nenhuma subatividade à vista, embora existam 6."*
 *
 * Quem abre uma atividade que foi quebrada em partes precisa ver as partes —
 * senão a tela mente por omissão: mostra uma tarefa que parece atômica quando
 * ela é um conjunto.
 *
 * ============================================================================
 * O TOTAL VEM DO SERVIDOR, E ISSO NÃO É DETALHE
 *
 * O cabeçalho diz "4 de 6 concluídas · 24h · término 19/09", e os números vêm
 * de `derived_hours`, `derived_end` e `derived_children` — calculados no banco,
 * sobre a árvore inteira.
 *
 * Somar aqui seria o defeito medido em 26/08: a lista de filhas passa pela RLS,
 * então quem enxerga 1 de 8 subatividades somaria 1. O pai encolheria para quem
 * vê menos — e, na versão antiga, isso chegava a ser GRAVADO.
 *
 * A única contagem feita aqui é "quantas concluíram", porque
 * `derived_completed_children` não existe (conferido no esquema). Contar o que
 * está à vista para EXIBIR é diferente de somar para GRAVAR.
 * ============================================================================
 */
export interface FilhaNaTela {
  id: string;
  wbs_code: string | null;
  title: string;
  assigned_to: string | null;
  hours: number | null;
  end_date: string | null;
  status: string | null;
  is_milestone: boolean | null;
}

export function SubatividadesNoCorpo({
  activityId,
  atividade,
  resolverNome,
  aoAbrir,
}: {
  activityId: string;
  /** A própria atividade, para ler os `derived_*` sem consultar de novo. */
  atividade: Record<string, unknown>;
  /** Nome de exibição a partir do que está gravado — nunca UUID na tela. */
  resolverNome?: (bruto: string) => string;
  aoAbrir?: (id: string) => void;
}) {
  const [filhas, setFilhas] = useState<FilhaNaTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id, wbs_code, title, assigned_to, hours, end_date, status, is_milestone")
        .eq("parent_id", activityId)
        .eq("is_trashed", false)
        .order("wbs_code", { ascending: true });
      if (!vivo) return;
      // SEM FALLBACK SILENCIOSO: lista vazia por erro diria "não tem
      // subatividades", que é o oposto de "não consegui ler".
      if (error) { setErro(error.message); return; }
      setFilhas((data ?? []) as FilhaNaTela[]);
    })();
    return () => { vivo = false; };
  }, [activityId]);

  if (erro) {
    return (
      <p className="text-[12px] text-destructive">
        Não foi possível ler as subatividades: {erro}
      </p>
    );
  }
  if (filhas === null) {
    return <p className="text-[12px] text-muted-foreground">Carregando subatividades…</p>;
  }
  if (filhas.length === 0) return null;

  const totais = lerTotaisDerivados(atividade as never);
  const concluidas = filhas.filter((f) => f.status === "completed").length;
  // O resumo do SERVIDOR quando ele existe; senão, o que está à vista — e o
  // título do elemento diz de onde veio, para ninguém confundir os dois.
  const resumo = resumoDasSubatividades(totais, formatarDataBR, concluidas)
    ?? `${concluidas} de ${filhas.length} concluídas`;
  const doServidor = totais.filhas !== null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Subatividades
        </p>
        <span
          className="text-[11px] text-muted-foreground"
          title={
            doServidor
              ? "Somado no servidor, sobre a árvore inteira"
              : "Contado nesta lista — o servidor ainda não derivou este item"
          }
        >
          {resumo}
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border overflow-hidden">
        {filhas.map((f) => {
          const feita = f.status === "completed";
          const nome = f.assigned_to
            ? (resolverNome ? resolverNome(f.assigned_to) : f.assigned_to)
            : null;
          return (
            <li
              key={f.id}
              className={cn(
                "grid grid-cols-[auto_1fr_auto] gap-2 items-center px-2 py-1.5 text-[12.5px]",
                aoAbrir && "cursor-pointer hover:bg-muted/60",
              )}
              onClick={aoAbrir ? () => aoAbrir(f.id) : undefined}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {f.is_milestone
                  ? <Diamond className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" aria-label="Marco" />
                  : <Layers className="w-3 h-3 text-muted-foreground/40 shrink-0" aria-hidden="true" />}
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  {f.wbs_code || "—"}
                </span>
              </span>

              <span className={cn("truncate", feita && "line-through text-muted-foreground")}>
                {f.title}
              </span>

              <span className="flex items-center gap-2 shrink-0 text-[11.5px]">
                {/* O VAZIO DIZ O QUE FALTA — regra não negociável do desenho.
                    "sem responsável" e "sem data", nunca "—" mudo. */}
                <span className={cn("truncate max-w-[120px]", !nome && "text-muted-foreground/60")}>
                  {nome || "sem responsável"}
                </span>
                <span className="tabular-nums text-muted-foreground w-[36px] text-right">
                  {f.hours ? `${f.hours}h` : ""}
                </span>
                <span className={cn("w-[64px] text-right", !f.end_date && "text-muted-foreground/60")}>
                  {f.end_date ? formatarDataBR(f.end_date) : "sem data"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
