"use client";
// GERENCIAR COLUNAS — a tabela com todas as colunas do quadro de uma vez.
//
// O painel "Colunas" (StageListButton) resolve o caso de UMA coluna: abre a
// lista, clica no ⋯ daquela, mexe. O que ele não resolve é COMPARAR: para
// descobrir quais colunas têm limite de WIP era preciso abrir sete menus, um
// de cada vez, guardando o resultado de cabeça.
//
// Aqui cada coluna é uma LINHA e cada propriedade é uma COLUNA da tabela:
// nome, cor, progresso, WIP e visibilidade lado a lado, com reordenação por
// arrasto. Um olhar responde "quem tem WIP?" e "quem está oculta?".
//
// SALVAR EXPLÍCITO, ao contrário do resto do quadro (que aplica na hora): numa
// tabela editável a pessoa mexe em várias linhas antes de decidir, e gravar a
// cada tecla faria o quadro dançar atrás do diálogo. Cancelar descarta tudo.
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GripVertical, Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { STAGE_PRESET_COLORS, ehColunaDeEntrada, type WorkflowStage } from "./shared";

/** O que a tabela edita. `id` novo começa com "novo:" e ainda não existe no banco. */
export type LinhaColuna = {
  id: string;
  title: string;
  color: string;
  progress_percent: number | null;
  wip_limit: number | null;
  is_visible: boolean;
  is_final: boolean;
};

export type PlanoDeSalvamento = {
  criadas: LinhaColuna[];
  alteradas: LinhaColuna[];
  excluidas: string[];
  /** ids na ordem final — só quando a ordem mudou. */
  ordem: string[] | null;
};

const paraLinha = (s: WorkflowStage): LinhaColuna => ({
  id: s.id,
  title: s.title,
  color: s.color,
  progress_percent: s.progress_percent ?? null,
  wip_limit: s.wip_limit ?? null,
  is_visible: s.is_visible !== false,
  is_final: s.is_final === true,
});

/** "auto" e "—" são a forma de dizer "sem valor" sem deixar o campo vazio. */
const textoProgresso = (v: number | null) => (v == null ? "auto" : `${v}%`);
const textoWip = (v: number | null) => (v == null ? "—" : String(v));

/** Aceita "auto", "", "—", "50", "50%". Devolve `undefined` se não der para ler. */
function lerProgresso(txt: string): number | null | undefined {
  const t = txt.trim().toLowerCase().replace("%", "").replace(",", ".");
  if (t === "" || t === "auto" || t === "—" || t === "-") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function lerWip(txt: string): number | null | undefined {
  const t = txt.trim().replace("—", "").replace("-", "");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function LinhaArrastavel({
  linha, ehEntrada, contagem, onMudar, onExcluir,
}: {
  linha: LinhaColuna;
  /**
   * A coluna de entrada (`display_order = 0`) — onde as atividades nascem.
   * Não se move nem se exclui; o resto se edita normalmente.
   */
  ehEntrada: boolean;
  contagem: number;
  onMudar: (id: string, p: Partial<LinhaColuna>) => void;
  onExcluir: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: linha.id });
  const [progressoTexto, setProgressoTexto] = useState(textoProgresso(linha.progress_percent));
  const [wipTexto, setWipTexto] = useState(textoWip(linha.wip_limit));

  // O valor pode mudar por fora (desfazer um arrasto, por exemplo).
  useEffect(() => { setProgressoTexto(textoProgresso(linha.progress_percent)); }, [linha.progress_percent]);
  useEffect(() => { setWipTexto(textoWip(linha.wip_limit)); }, [linha.wip_limit]);

  const oculta = !linha.is_visible;
  const presas = oculta && contagem > 0;

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "border-b border-border/60 last:border-0",
        isDragging && "opacity-60 bg-muted/40",
        oculta && "text-muted-foreground",
      )}
    >
      <td className="py-1.5 pl-1 pr-0 w-7">
        {/* A coluna de entrada não se move: ela é definida por
            `display_order = 0` e é onde as atividades nascem (criação rápida,
            importação de EAP, reabertura). Trocá-la de lugar mudaria isso em
            silêncio, então o puxador some em vez de enganar. */}
        {ehEntrada ? (
          <span
            className="block p-1 text-muted-foreground/25"
            title="A coluna de entrada é sempre a primeira — é onde as atividades nascem"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        ) : (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-foreground p-1 rounded"
            title="Arrastar para reordenar"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
      </td>

      <td className="py-1.5 pr-2">
        <Input
          value={linha.title}
          onChange={(e) => onMudar(linha.id, { title: e.target.value })}
          className={cn("h-8 text-[13px]", oculta && "text-muted-foreground")}
          aria-label="Nome da coluna"
          placeholder="Nome da coluna"
        />
      </td>

      <td className="py-1.5 pr-2 w-11">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-5 h-5 rounded-full ring-1 ring-border hover:ring-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/40"
              style={{ backgroundColor: linha.color }}
              title="Alterar cor"
              aria-label={`Cor de "${linha.title}"`}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-2 w-auto">
            <div className="grid grid-cols-4 gap-1.5">
              {STAGE_PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="w-6 h-6 rounded-full ring-1 ring-border hover:ring-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/40"
                  style={{ backgroundColor: c }}
                  onClick={() => onMudar(linha.id, { color: c })}
                  aria-label={`Usar cor ${c}`}
                />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>

      {/* Progresso e WIP guardam TEXTO enquanto se digita: converter a cada
          tecla apagaria o que a pessoa está escrevendo ("5" viraria 5 antes
          do "0" de "50"). A leitura acontece ao sair do campo. */}
      <td className="py-1.5 pr-2 w-24">
        <Input
          value={progressoTexto}
          onChange={(e) => setProgressoTexto(e.target.value)}
          onBlur={() => {
            const v = lerProgresso(progressoTexto);
            if (v === undefined) setProgressoTexto(textoProgresso(linha.progress_percent));
            else { onMudar(linha.id, { progress_percent: v }); setProgressoTexto(textoProgresso(v)); }
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-8 text-[13px] text-center tabular-nums"
          aria-label={`Progresso de "${linha.title}"`}
          title="Percentual fixo desta coluna. 'auto' = calculado pela posição."
        />
      </td>

      <td className="py-1.5 pr-2 w-20">
        <Input
          value={wipTexto}
          onChange={(e) => setWipTexto(e.target.value)}
          onBlur={() => {
            const v = lerWip(wipTexto);
            if (v === undefined) setWipTexto(textoWip(linha.wip_limit));
            else { onMudar(linha.id, { wip_limit: v }); setWipTexto(textoWip(v)); }
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-8 text-[13px] text-center tabular-nums"
          aria-label={`Limite WIP de "${linha.title}"`}
          title="Limite de cards em andamento. '—' = sem limite."
        />
      </td>

      <td className="py-1.5 pr-2 w-16 text-center">
        <div className="flex items-center justify-center gap-1">
          <Checkbox
            checked={linha.is_visible}
            onCheckedChange={(v) => onMudar(linha.id, { is_visible: v === true })}
            aria-label={`"${linha.title}" visível no quadro`}
          />
          {/* Coluna oculta VAZIA é arrumação; com tarefa dentro é problema —
              tem gente com status que ninguém enxerga. Só esse caso avisa. */}
          {presas && (
            <span
              className="text-warning text-[11px] font-medium tabular-nums"
              title={`${contagem} ${contagem === 1 ? "tarefa fica" : "tarefas ficam"} sem aparecer no quadro`}
            >
              {contagem}
            </span>
          )}
        </div>
      </td>

      <td className="py-1.5 pr-1 w-8">
        <button
          type="button"
          disabled={ehEntrada}
          onClick={() => onExcluir(linha.id)}
          className={cn(
            "p-1 rounded transition-colors",
            ehEntrada
              ? "text-muted-foreground/30 cursor-not-allowed"
              : "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
          )}
          title={ehEntrada
            ? "A coluna de entrada não pode ser excluída — é onde as atividades nascem"
            : `Excluir "${linha.title}"`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

export function GerenciarColunas({
  open, onOpenChange, stages, countByStage, onSalvar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** TODAS as colunas, visíveis e ocultas, em display_order. */
  stages: WorkflowStage[];
  countByStage?: Map<string, number>;
  onSalvar: (plano: PlanoDeSalvamento) => Promise<void> | void;
}) {
  const [linhas, setLinhas] = useState<LinhaColuna[]>([]);
  const [excluidas, setExcluidas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [novos, setNovos] = useState(0);

  const contagem = countByStage ?? new Map<string, number>();

  // Recarrega ao abrir: o diálogo trabalha sobre uma CÓPIA, e o quadro só muda
  // quando se clica em Salvar. Reabrir sem isso mostraria edições descartadas.
  useEffect(() => {
    if (open) {
      setLinhas(stages.map(paraLinha));
      setExcluidas([]);
      setNovos(0);
    }
  }, [open, stages]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** A coluna onde as atividades nascem — nunca se move nem se exclui. */
  const idDaEntrada = useMemo(() => stages.find(ehColunaDeEntrada)?.id ?? null, [stages]);

  const originais = useMemo(() => new Map(stages.map((s) => [s.id, paraLinha(s)])), [stages]);
  const ordemOriginal = useMemo(() => stages.map((s) => s.id).join(","), [stages]);
  const ordemAtual = linhas.map((l) => l.id).join(",");

  const mudou = useMemo(() => {
    if (excluidas.length > 0) return true;
    if (linhas.some((l) => l.id.startsWith("novo:"))) return true;
    if (ordemAtual !== ordemOriginal) return true;
    return linhas.some((l) => {
      const o = originais.get(l.id);
      if (!o) return true;
      return o.title !== l.title || o.color !== l.color
        || o.progress_percent !== l.progress_percent
        || o.wip_limit !== l.wip_limit
        || o.is_visible !== l.is_visible;
    });
  }, [linhas, excluidas, originais, ordemAtual, ordemOriginal]);

  const semNome = linhas.some((l) => !l.title.trim());
  const ocultasComTarefa = linhas.filter((l) => !l.is_visible && (contagem.get(l.id) ?? 0) > 0);

  const mudar = (id: string, p: Partial<LinhaColuna>) =>
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const excluir = (id: string) => {
    setLinhas((ls) => ls.filter((l) => l.id !== id));
    // Linha que nunca existiu no banco não entra na lista de exclusão.
    if (!id.startsWith("novo:")) setExcluidas((e) => [...e, id]);
  };

  const adicionar = () => {
    const id = `novo:${novos}`;
    setNovos((n) => n + 1);
    setLinhas((ls) => [...ls, {
      id, title: "", color: STAGE_PRESET_COLORS[0],
      progress_percent: null, wip_limit: null, is_visible: true, is_final: false,
    }]);
  };

  const aoArrastar = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Nem a entrada se move, nem outra ocupa o lugar dela: o puxador dela já
    // está desligado, mas soltar uma linha SOBRE a primeira posição também a
    // deslocaria — e `display_order = 0` é o que define onde a atividade nasce.
    if (active.id === idDaEntrada || over.id === idDaEntrada) return;
    setLinhas((ls) => {
      const de = ls.findIndex((l) => l.id === active.id);
      const para = ls.findIndex((l) => l.id === over.id);
      return de < 0 || para < 0 ? ls : arrayMove(ls, de, para);
    });
  };

  const salvar = async () => {
    if (semNome || salvando) return;
    setSalvando(true);
    try {
      const criadas = linhas.filter((l) => l.id.startsWith("novo:"));
      const alteradas = linhas.filter((l) => {
        const o = originais.get(l.id);
        if (!o) return false;
        return o.title !== l.title || o.color !== l.color
          || o.progress_percent !== l.progress_percent
          || o.wip_limit !== l.wip_limit
          || o.is_visible !== l.is_visible;
      });
      await onSalvar({
        criadas,
        alteradas,
        excluidas,
        ordem: ordemAtual !== ordemOriginal ? linhas.map((l) => l.id) : null,
      });
      onOpenChange(false);
    } finally {
      setSalvando(false);
    }
  };

  const nOcultas = linhas.filter((l) => !l.is_visible).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!salvando) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle className="text-base">Gerenciar colunas</DialogTitle>
            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
              {linhas.length} {linhas.length === 1 ? "coluna" : "colunas"}
              {nOcultas > 0 && ` · ${nOcultas} oculta${nOcultas > 1 ? "s" : ""}`}
            </span>
          </div>
          <DialogDescription className="text-xs">
            Arraste para reordenar. As mudanças valem para todos do projeto e só
            são aplicadas ao salvar.
          </DialogDescription>
        </DialogHeader>

        {/* O DndContext fica FORA da <table>: ele renderiza um <div>, e um div
            entre <table> e <tbody> é HTML inválido — o React reclama em
            desenvolvimento e o navegador reposiciona o nó, quebrando o layout. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoArrastar}>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-7" />
                  <th className="text-left py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nome</th>
                  <th className="text-left py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Cor</th>
                  <th className="text-center py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Progresso</th>
                  <th className="text-center py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">WIP</th>
                  <th className="text-center py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visível</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <SortableContext items={linhas.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {linhas.map((l) => (
                    <LinhaArrastavel
                      key={l.id}
                      linha={l}
                      // Pelo ID da coluna de entrada, não pela posição na lista:
                      // se a ordem mudar durante a edição, a posição mente e a
                      // proteção passaria para a linha errada.
                      ehEntrada={l.id === idDaEntrada}
                      contagem={contagem.get(l.id) ?? 0}
                      onMudar={mudar}
                      onExcluir={excluir}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </div>
        </DndContext>

        {ocultasComTarefa.length > 0 && (
          <div className="flex items-start gap-2 text-[11px] text-warning leading-snug">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              {ocultasComTarefa.length === 1
                ? `"${ocultasComTarefa[0].title}" está oculta e tem tarefa dentro — ninguém a vê no quadro.`
                : `${ocultasComTarefa.length} colunas ocultas têm tarefas dentro — ninguém as vê no quadro.`}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs px-2" onClick={adicionar}>
            <Plus className="w-3.5 h-3.5" /> Nova coluna
          </Button>
          <div className="flex items-center gap-2">
            {semNome && (
              <span className="text-[11px] text-destructive">Toda coluna precisa de um nome</span>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={salvar} disabled={!mudou || semNome || salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
