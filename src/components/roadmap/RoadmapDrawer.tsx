import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInputBRL } from "@/components/ui/currency-input-brl";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Archive, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { RoadmapItem } from "@/components/roadmap/types";
import {
  CRITERIOS,
  PONTUACAO_MAXIMA,
  classificar,
  indicePrioridade,
  pontuacaoTotal,
  type CriterioKey,
} from "@/components/roadmap/criterios";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem: RoadmapItem | null;
}

const defaultForm = {
  title: "",
  description: "",
  // Critérios começam vazios: quem avalia precisa escolher cada nota, e nada é
  // gravado enquanto isso. Pré-selecionar "3" faria a demanda parecer avaliada.
  alinhamento_estrategico: null as number | null,
  valor_economico: null as number | null,
  impacto_paciente: null as number | null,
  urgencia_risco: null as number | null,
  facilidade_desenvolvimento: null as number | null,
  custo_desenvolvimento: null as number | null,
};

type FormState = typeof defaultForm;

/**
 * Campo de leitura: mostra o texto recortado em poucas linhas e o conteúdo
 * completo em tooltip no hover. Usado para os dados que vieram do solicitante.
 */
function ReadOnlyField({
  label,
  value,
  clamp = "line-clamp-3",
}: {
  label: string;
  value: string;
  clamp?: string;
}) {
  if (!value?.trim()) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <p
            className={cn(
              "cursor-default rounded-md border bg-muted/30 px-3 py-2 text-sm leading-relaxed",
              clamp,
            )}
          >
            {value}
          </p>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-md whitespace-pre-wrap">
          {value}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function RoadmapDrawer({ open, onOpenChange, editItem }: Props) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (editItem) {
      // Pré-preenche com os dados do item (solicitação ou ideia interna).
      setForm({
        title: editItem.title,
        description: editItem.description || "",
        // Sem `?? 3`: um item ainda não classificado abre com os selects vazios.
        alinhamento_estrategico: editItem.alinhamento_estrategico,
        valor_economico: editItem.valor_economico,
        impacto_paciente: editItem.impacto_paciente,
        urgencia_risco: editItem.urgencia_risco,
        facilidade_desenvolvimento: editItem.facilidade_desenvolvimento,
        custo_desenvolvimento: editItem.custo_desenvolvimento ?? null,
      });
    } else {
      setForm(defaultForm);
    }
  }, [editItem, open]);

  // Notas ainda não escolhidas contam como 0 no preview do índice; o resultado
  // só é definitivo quando os 5 critérios estiverem preenchidos.
  const criterios = Object.fromEntries(
    CRITERIOS.map((c) => [c.key, form[c.key] ?? 0]),
  ) as Record<CriterioKey, number>;

  const completo = CRITERIOS.every((c) => form[c.key] != null);
  const preenchidos = CRITERIOS.filter((c) => form[c.key] != null).length;

  const pontos = pontuacaoTotal(criterios);
  const indice = indicePrioridade(criterios);
  const classe = classificar(indice);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editItem) return;
      // Grava apenas o que a classificação decide. Título, descrição, tema,
      // status e trimestre ficam fora do payload — não são editados aqui e
      // preservam o valor atual. `score` é coluna gerada e o Postgres rejeita.
      const payload = {
        alinhamento_estrategico: form.alinhamento_estrategico,
        valor_economico: form.valor_economico,
        impacto_paciente: form.impacto_paciente,
        urgencia_risco: form.urgencia_risco,
        facilidade_desenvolvimento: form.facilidade_desenvolvimento,
        custo_desenvolvimento: form.custo_desenvolvimento,
        classificado_em: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("roadmap_items" as any)
        .update(payload as any)
        .eq("id", editItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap_items"] });
      onOpenChange(false);
      toast({ title: editItem ? "Priorização salva!" : "Ideia criada!" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  /**
   * Arquivar não apaga: move o item para o status "descartado", tirando-o do
   * fluxo ativo mas preservando o histórico da solicitação.
   */
  const arquivarMutation = useMutation({
    mutationFn: async () => {
      if (!editItem) return;
      const { error } = await supabase
        .from("roadmap_items" as any)
        .update({ status: "descartado" } as any)
        .eq("id", editItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap_items"] });
      onOpenChange(false);
      toast({ title: "Demanda arquivada" });
    },
    onError: () => {
      toast({ title: "Erro ao arquivar", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mesmo padrão do modal de detalhes: só o corpo rola; svh evita estouro
          sob a barra de endereço no mobile. */}
      <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 max-h-[calc(100svh-2rem)] sm:w-[92vw] sm:max-h-[90svh] xl:max-w-5xl 2xl:max-w-6xl">
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-4 py-4 text-left sm:px-6 sm:py-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
            <DialogTitle className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              Priorizar Demanda
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">
              {editItem?.origem === "formulario" ? (
                <>
                  Solicitação de{" "}
                  <span className="font-medium text-foreground">
                    {editItem.solicitante_nome || "—"}
                  </span>
                  {editItem.area && <> · {editItem.area}</>}
                </>
              ) : (
                "Avalie os critérios para calcular o índice de prioridade."
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 items-start gap-6 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:grid-cols-[1fr_260px] 2xl:grid-cols-[1fr_320px] 2xl:gap-8">
          {/* ── Coluna esquerda: identificação + critérios ── */}
          <div className="space-y-4">
          {/* O objetivo e a descrição vêm do solicitante: exibidos em leitura,
              com o texto completo no tooltip. Quem classifica avalia o pedido,
              não o reescreve. */}
          <ReadOnlyField
            label={
              editItem?.origem === "formulario"
                ? "Objetivo da solicitação"
                : "Título"
            }
            value={form.title}
            clamp="line-clamp-3"
          />

          <ReadOnlyField
            label="Descrição"
            value={form.description}
            clamp="line-clamp-3"
          />

          <Separator />

          {/* ── Critérios de priorização ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Critérios de Avaliação</h4>
              <span className="text-xs text-muted-foreground">Escala 1–5</span>
            </div>

            {CRITERIOS.map((c, i) => (
              <div key={c.key} className="flex items-start gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                  {i + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <Label className="text-sm">{c.label}</Label>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {c.description}
                  </p>
                  <Select
                    // `undefined` (não "null") deixa o placeholder aparecer.
                    value={form[c.key] != null ? String(form[c.key]) : undefined}
                    onValueChange={(v) =>
                      setForm({ ...form, [c.key]: Number(v) })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {c.options.map((opt, idx) => (
                        <SelectItem key={opt} value={String(idx + 1)}>
                          {idx + 1} — {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div>
            <Label>Custo do Desenvolvimento</Label>
            <p className="text-xs text-muted-foreground mb-1">
              Custo necessário para desenvolver o projeto solicitado.
            </p>
            <CurrencyInputBRL
              value={form.custo_desenvolvimento}
              onChange={(v) => setForm({ ...form, custo_desenvolvimento: v })}
            />
          </div>

          </div>

          {/* ── Coluna direita: índice de prioridade em tempo real ── */}
          <aside className="lg:sticky lg:top-0 space-y-3 rounded-lg border overflow-hidden">
            <div className="bg-muted/50 px-4 py-4 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Índice de prioridade
              </p>
              <p
                className="text-4xl font-black tabular-nums transition-colors"
                style={{ color: completo ? classe.color : undefined }}
              >
                {completo ? `${indice}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {completo
                  ? `Pontuação: ${pontos} / ${PONTUACAO_MAXIMA}`
                  : `${preenchidos} de ${CRITERIOS.length} critérios avaliados`}
              </p>
            </div>

            <div className="px-4">
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    // Incompleto: a barra reflete o progresso da avaliação.
                    width: completo
                      ? `${indice}%`
                      : `${(preenchidos / CRITERIOS.length) * 100}%`,
                    background: completo
                      ? classe.color
                      : "hsl(var(--muted-foreground))",
                  }}
                />
              </div>
            </div>

            <div className="px-4 text-center">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Nível de prioridade
              </p>
              <span
                className={cn(
                  "inline-block rounded-full border-2 px-5 py-1.5 text-sm font-extrabold",
                  completo
                    ? classe.className
                    : "border-dashed border-border text-muted-foreground",
                )}
              >
                {completo ? classe.label : "A definir"}
              </span>
            </div>

            <div className="px-4 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Faixas de prioridade
              </p>
              {[
                { label: "Alta", range: "70 – 100%", pct: 85 },
                { label: "Média", range: "40 – 69%", pct: 55 },
                { label: "Baixa", range: "0 – 39%", pct: 20 },
              ].map((f) => {
                const c = classificar(f.pct);
                return (
                  <div
                    key={f.label}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: c.color }}
                      />
                      <span className="font-semibold">{f.label}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {f.range}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Detalhamento por critério */}
            <div className="border-t px-4 py-3 space-y-1">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Detalhamento
              </p>
              {CRITERIOS.map((c) => {
                const nota = form[c.key];
                return (
                  <div
                    key={c.key}
                    className="flex items-center justify-between gap-2 border-b border-dashed py-1 last:border-0"
                  >
                    <span className="flex-1 text-[11px] text-muted-foreground">
                      {c.short}
                    </span>
                    <div className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: nota != null ? `${(nota / 5) * 100}%` : "0%" }}
                      />
                    </div>
                    <span className="w-3 shrink-0 text-right text-xs font-bold tabular-nums">
                      {nota ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>

        <div className="flex shrink-0 gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
          {editItem && editItem.status !== "descartado" && (
            <Button
              variant="ghost"
              onClick={() => arquivarMutation.mutate()}
              disabled={arquivarMutation.isPending}
              className="text-muted-foreground"
            >
              <Archive className="mr-2 h-4 w-4" />
              Arquivar
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="ml-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            // Sem os 5 critérios não há classificação: gravar parcial marcaria a
            // demanda como avaliada com notas que ninguém escolheu.
            disabled={!completo || saveMutation.isPending}
            title={
              !completo
                ? `Avalie os 5 critérios (${preenchidos}/${CRITERIOS.length})`
                : undefined
            }
            className="min-w-40"
          >
            Salvar Priorização
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
