"use client";
// GERENCIAR COLUNAS — todas as colunas do quadro numa lista.
//
// O menu ⋯ da coluna resolve UMA por vez. O que ele não resolve é COMPARAR:
// para saber quais colunas têm limite era preciso abrir sete menus, guardando
// o resultado de cabeça.
//
// LISTA, NÃO TABELA. A primeira versão era uma grade de 7 colunas com 5
// controles por linha, todos com borda e peso iguais — densidade sem
// hierarquia, e o campo Nome espremido a ~20px. Agora cada coluna é uma linha
// com o nome em destaque, e os controles cabem sem disputar.
//
// TUDO À VISTA, COM O EFEITO AO LADO. Nenhuma ação escondida no hover: a pessoa
// veria a linha sem saber o que dá para mudar, e teria de descobrir passando o
// mouse. Cada controle mostra a consequência antes do clique — "vale 25%",
// "não avança", "2 presas". Padrão de Linear (status do time) e Asana (regras);
// o hover-para-revelar é do Jira, e é a queixa recorrente daquela tela.
//
// O LIMITE saiu daqui: era uma coluna inteira exibindo "—" para um valor que
// quase nenhum projeto usa. Vive no menu ⋯ da coluna, no quadro.
//
// SALVAR EXPLÍCITO, ao contrário do resto do quadro (que aplica na hora): numa
// lista editável a pessoa mexe em várias linhas antes de decidir, e gravar a
// cada tecla faria o quadro dançar atrás do diálogo. Cancelar descarta tudo.
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GripVertical, Plus, Trash2, AlertTriangle, ChevronDown, Check, LogIn } from "lucide-react";
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
import { STAGE_PRESET_COLORS, ehColunaDeEntrada, ehBacklog, type WorkflowStage } from "./shared";
import { percentualAutomaticoDaColuna } from "@/lib/activityProgress";
import {
  WORKFLOW_CATEGORIES, WORKFLOW_CATEGORY_META, parseWorkflowCategory,
  categoryFromLegacyFlags, suggestCategoryFromTitle, type WorkflowCategory,
} from "@/lib/workflowCategory";

/** O que a tabela edita. `id` novo começa com "novo:" e ainda não existe no banco. */
export type LinhaColuna = {
  id: string;
  title: string;
  color: string;
  progress_percent: number | null;
  wip_limit: number | null;
  is_visible: boolean;
  is_final: boolean;
  /**
   * O que a coluna SIGNIFICA, independente do nome que o time deu.
   *
   * Existia só no banco: era adivinhada pelo título na criação
   * (`suggestCategoryFromTitle`) e depois não havia como corrigir em tela
   * nenhuma — criar "Aguardando cliente" virava "Em andamento" para sempre,
   * contando como trabalho em curso no progresso e no limite.
   */
  categoria: WorkflowCategory;
};

export type PlanoDeSalvamento = {
  criadas: LinhaColuna[];
  alteradas: LinhaColuna[];
  excluidas: string[];
  /** ids na ordem final — só quando a ordem mudou. */
  ordem: string[] | null;
  /** Nova coluna de entrada — só quando mudou. Pode ser uma chave "novo:". */
  entrada: string | null;
};

const paraLinha = (s: WorkflowStage): LinhaColuna => ({
  id: s.id,
  title: s.title,
  color: s.color,
  progress_percent: s.progress_percent ?? null,
  wip_limit: s.wip_limit ?? null,
  is_visible: s.is_visible !== false,
  is_final: s.is_final === true,
  // Quadro anterior à migration da categoria: deriva das flags legadas, mesma
  // leitura que activityProgress usa, em vez de assumir "andamento".
  categoria: parseWorkflowCategory(s.categoria) ?? categoryFromLegacyFlags(s),
});

/**
 * Lê o percentual digitado. Só número agora — "auto" virou caixa de seleção,
 * então o campo não precisa mais adivinhar se o texto é palavra ou valor.
 * Devolve `null` quando não dá para ler (o chamador restaura o anterior).
 */
function lerProgresso(txt: string): number | null {
  const t = txt.trim().replace("%", "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function LinhaArrastavel({
  linha, ehEntrada, contagem, percentualAuto, concluidaOcupadaPor, nomeDaConcluida, onMudar, onMudarNome, onMarcarEntrada, onExcluir,
}: {
  linha: LinhaColuna;
  /**
   * A coluna de entrada (`display_order = 0`) — onde as atividades nascem.
   * Não se move nem se exclui; o resto se edita normalmente.
   */
  ehEntrada: boolean;
  contagem: number;
  /** Quanto o "auto" vale para esta coluna hoje; null = não avança progresso. */
  percentualAuto: number | null;
  /** Id da coluna que já é "Concluída" — só uma por projeto (índice no banco). */
  concluidaOcupadaPor: string | null;
  nomeDaConcluida: string;
  onMudar: (id: string, p: Partial<LinhaColuna>) => void;
  /** Separado de `onMudar`: só o nome dispara a sugestão de categoria. */
  onMudarNome: (id: string, title: string) => void;
  onMarcarEntrada: (id: string) => void;
  onExcluir: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: linha.id });
  // `progress_percent = null` É o modo automático — não existe terceiro estado.
  const ehAuto = linha.progress_percent == null;
  const [progressoTexto, setProgressoTexto] = useState(String(linha.progress_percent ?? ""));

  // O valor pode mudar por fora (desfazer um arrasto, por exemplo).
  useEffect(() => { setProgressoTexto(String(linha.progress_percent ?? "")); }, [linha.progress_percent]);

  const ehFila = ehBacklog(linha);
  const oculta = !linha.is_visible;
  /* A fila nunca conta como "tarefa presa": ela sai do quadro por decisão de
     produto e o que está nela aparece inteiro na aba Backlog. Sem esta guarda
     o aviso âmbar ficaria aceso para sempre, num projeto sem nada de errado. */
  const presas = oculta && contagem > 0 && !ehFila;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative grid items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
        // A grade acompanha a legenda do cabeçalho. Em tela estreita as duas
        // colunas do meio descem para uma segunda linha, sem quebrar o resto.
        "grid-cols-[22px_minmax(0,1fr)_132px_136px_64px_78px_30px]",
        "max-[860px]:grid-cols-[22px_minmax(0,1fr)_64px_78px_30px]",
        isDragging ? "opacity-60 bg-muted/50" : "hover:bg-muted/40",
        ehEntrada && "bg-primary/[0.06]",
      )}
    >
      {/* A faixa lateral marca a entrada sem depender de o olho achar o
          marcador redondo lá na direita. */}
      {ehEntrada && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" aria-hidden />
      )}

      <button
        type="button"
        className="justify-self-center cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground p-0.5 rounded"
        title="Arrastar para reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      {/* NOME — o que se lê primeiro, então é o maior elemento da linha. A
          borda só aparece no hover/foco: campo com caixa permanente competia
          com os controles ao lado, todos do mesmo peso. */}
      <div className="flex items-center gap-2 min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-border/70 hover:ring-2 hover:ring-primary transition-all"
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
        <input
          value={linha.title}
          onChange={(e) => onMudarNome(linha.id, e.target.value)}
          className={cn(
            "min-w-0 w-full -ml-1.5 px-1.5 py-1 rounded-md bg-transparent",
            "text-[14.5px] font-semibold tracking-[-.008em] text-foreground",
            "border border-transparent hover:border-border hover:bg-background",
            "focus:outline-none focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/15",
            oculta && "opacity-55",
          )}
          aria-label="Nome da coluna"
          placeholder="Nome da coluna"
        />
      </div>

      {/* SIGNIFICA — a categoria por extenso, não um ícone. É ela que decide
          progresso, limite e indicadores; escondê-la atrás de um símbolo foi o
          que deixou "Aguardando cliente" contando como trabalho em curso. */}
      <div className="max-[860px]:col-start-2 max-[860px]:col-span-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 px-2 py-1.5 rounded-md border border-border bg-background text-[11.5px] text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 transition-colors"
              title={WORKFLOW_CATEGORY_META[linha.categoria].hint}
              aria-label={`Categoria de "${linha.title}"`}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", WORKFLOW_CATEGORY_META[linha.categoria].dotClass)} />
              <span className="flex-1 truncate text-left">{WORKFLOW_CATEGORY_META[linha.categoria].label}</span>
              <ChevronDown className="w-3 h-3 shrink-0 opacity-40" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {WORKFLOW_CATEGORIES.map((c) => {
              const meta = WORKFLOW_CATEGORY_META[c];
              // "Concluída" é única por projeto (índice no banco): oferecer a
              // segunda faria o salvamento falhar depois de a pessoa escolher.
              const ocupada = c === "concluida" && concluidaOcupadaPor != null && concluidaOcupadaPor !== linha.id;
              return (
                <DropdownMenuItem
                  key={c}
                  disabled={ocupada}
                  className="focus:bg-muted/60 focus:text-foreground items-start gap-2"
                  onSelect={(e) => { e.preventDefault(); onMudar(linha.id, { categoria: c }); }}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-1.5", meta.dotClass)} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-[12.5px] leading-tight">
                      {meta.label}
                      {c === linha.categoria && <Check className="w-3 h-3 text-primary" />}
                    </span>
                    <span className="block text-[10.5px] text-muted-foreground leading-snug mt-0.5">
                      {ocupada ? `Já em uso por "${nomeDaConcluida}"` : meta.hint}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* PROGRESSO — o modo à esquerda, o EFEITO à direita. Ver o resultado sem
          clicar é o ponto: "vale 25%" muda ao reordenar ou trocar a categoria,
          e é isso que distingue Auto de um número fixo. */}
      <div className="flex items-center gap-2 max-[860px]:col-start-3 max-[860px]:col-span-2">
        <div className="inline-flex shrink-0 rounded-md border border-border overflow-hidden text-[10.5px]" role="group">
          <button
            type="button"
            onClick={() => { if (!ehAuto) onMudar(linha.id, { progress_percent: null }); }}
            aria-pressed={ehAuto}
            className={cn(
              "px-2 py-1 transition-colors",
              ehAuto ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
            )}
            title="Calculado pela posição no fluxo — muda ao reordenar"
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => {
              if (ehAuto) {
                // Parte do valor que o Auto já vale: quem troca para Fixo quase
                // sempre quer ajustar aquilo, não digitar do zero.
                const base = percentualAuto ?? 50;
                onMudar(linha.id, { progress_percent: base });
                setProgressoTexto(String(base));
              }
            }}
            aria-pressed={!ehAuto}
            className={cn(
              "px-2 py-1 transition-colors",
              !ehAuto ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-muted",
            )}
            title="Percentual que você define. Não muda com reordenação."
          >
            Fixo
          </button>
        </div>
        {ehAuto ? (
          <span className="text-[11.5px] text-muted-foreground tabular-nums whitespace-nowrap">
            {percentualAuto == null
              ? <span title="Esta coluna não avança o progresso">não avança</span>
              : <>vale <b className="font-semibold text-foreground/70">{percentualAuto}%</b></>}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <input
              value={progressoTexto}
              onChange={(e) => setProgressoTexto(e.target.value)}
              onBlur={() => {
                const v = lerProgresso(progressoTexto);
                if (v == null) setProgressoTexto(String(linha.progress_percent ?? 0));
                else { onMudar(linha.id, { progress_percent: v }); setProgressoTexto(String(v)); }
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="w-11 px-1 py-1 text-[12px] text-center tabular-nums rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              inputMode="numeric"
              aria-label={`Progresso de "${linha.title}" em porcento`}
            />
            <span className="text-[11.5px] text-muted-foreground">%</span>
          </div>
        )}
      </div>

      {/* ENTRADA — marcador redondo em TODAS as linhas, para se ver que é
          escolha exclusiva. Antes era um ícone de seta só na marcada: nada
          indicava que as outras podiam assumir o papel. */}
      <button
        type="button"
        onClick={() => { if (!ehEntrada) onMarcarEntrada(linha.id); }}
        className={cn(
          "justify-self-center w-4 h-4 rounded-full border-[1.5px] bg-background transition-all",
          ehEntrada
            ? "border-primary border-[5px] cursor-default"
            : "border-muted-foreground/40 hover:border-primary cursor-pointer",
        )}
        title={ehEntrada
          ? `As tarefas novas nascem em "${linha.title}" — criação rápida, importação de EAP e reabertura`
          : `Fazer as tarefas novas nascerem em "${linha.title}"`}
        aria-label={`Coluna de entrada: "${linha.title}"`}
        aria-pressed={ehEntrada}
      />

      {/* NO QUADRO — interruptor em vez de caixa: liga/desliga comunica
          "aparece ou não" melhor que marcado/desmarcado. O aviso de tarefa
          presa nasce embaixo, na hora em que se desliga. */}
      <div className="justify-self-center flex flex-col items-center gap-1">
        {ehFila ? (
          /* O BACKLOG NUNCA VAI AO QUADRO — regra de produto, não preferência
             (ver `colunasDoQuadro`). Antes havia um interruptor aqui: ele
             aceitava o clique e a coluna continuava fora, mentindo sobre o
             próprio estado. Um rótulo que explica o porquê vale mais que um
             controle inerte. */
          <span
            className="text-[10px] text-muted-foreground whitespace-nowrap"
            title="Backlog é a fila do projeto e tem tela própria, com a EAP inteira. O quadro mostra o fluxo — onde cada item está."
          >
            Tela própria
          </span>
        ) : (
        <button
          type="button"
          role="switch"
          aria-checked={linha.is_visible}
          onClick={() => onMudar(linha.id, { is_visible: !linha.is_visible })}
          className={cn(
            "relative w-8 h-[18px] rounded-full transition-colors",
            linha.is_visible ? "bg-primary" : "bg-muted-foreground/40",
          )}
          title={linha.is_visible ? "Aparece no quadro" : "Some do quadro, para todos do projeto"}
          aria-label={`"${linha.title}" aparece no quadro`}
        >
          <span
            className={cn(
              "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all",
              linha.is_visible ? "left-[18px]" : "left-0.5",
            )}
          />
        </button>
        )}
        {presas && (
          <span
            className="flex items-center gap-0.5 text-[10px] text-warning bg-warning/10 px-1.5 py-px rounded whitespace-nowrap"
            title={`${contagem} ${contagem === 1 ? "tarefa fica" : "tarefas ficam"} sem aparecer no quadro`}
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            {contagem} {contagem === 1 ? "presa" : "presas"}
          </span>
        )}
      </div>

      <button
        type="button"
        disabled={ehEntrada}
        onClick={() => onExcluir(linha.id)}
        className={cn(
          "justify-self-center p-1 rounded transition-colors",
          ehEntrada
            ? "text-muted-foreground/25 cursor-not-allowed"
            : "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10",
        )}
        title={ehEntrada
          ? "A coluna de entrada não pode ser excluída — é onde as atividades nascem"
          : `Excluir "${linha.title}"`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
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

  /**
   * A coluna onde as atividades nascem. Editável aqui (uma por vez), e a
   * escolha só vai para o banco no Salvar, como todo o resto da tabela.
   */
  const [idDaEntrada, setIdDaEntrada] = useState<string | null>(null);
  const entradaOriginal = useMemo(() => stages.find(ehColunaDeEntrada)?.id ?? null, [stages]);
  useEffect(() => { if (open) setIdDaEntrada(entradaOriginal); }, [open, entradaOriginal]);

  /** Marcar uma desmarca a anterior — o banco tem índice de uma por projeto. */
  const marcarEntrada = (id: string) => setIdDaEntrada(id);

  /**
   * A coluna marcada como "Concluída". O banco tem índice único por projeto, e
   * oferecer a categoria a uma segunda coluna faria o salvamento falhar DEPOIS
   * de a pessoa escolher — o menu desabilita e diz quem já ocupa.
   */
  const linhaConcluida = useMemo(
    () => linhas.find((l) => l.categoria === "concluida") ?? null,
    [linhas],
  );

  /**
   * Quanto o "auto" vale para cada coluna, calculado sobre a ORDEM EM EDIÇÃO —
   * não sobre a salva. É o ponto do recurso: reordenar ou excluir muda o valor
   * do automático, e a tela mostra isso ANTES de salvar, em vez de a pessoa
   * descobrir depois. As linhas novas herdam os metadados de `stages` quando
   * existem; as recém-criadas entram como "andamento", que é o padrão.
   */
  const autoPorColuna = useMemo(() => {
    const meta = new Map(stages.map((s) => [s.id, s]));
    const comoStages = linhas.map((l, i) => {
      const original = meta.get(l.id);
      return {
        id: l.id,
        title: l.title,
        // A entrada mantém 0; as demais seguem a posição atual da lista.
        display_order: l.id === idDaEntrada ? 0 : i,
        is_final: l.is_final,
        is_blocked: original?.is_blocked ?? false,
        is_visible: l.is_visible,
        progress_percent: l.progress_percent,
        contributes_to_progress: original?.contributes_to_progress,
        // A categoria EM EDIÇÃO, não a salva: trocar "Em andamento" por
        // "A iniciar" tira a coluna do denominador, e o valor das vizinhas muda
        // junto. Usar a original faria o tooltip mentir até salvar.
        categoria: l.categoria,
      };
    });
    const out = new Map<string, number | null>();
    for (const l of linhas) out.set(l.id, percentualAutomaticoDaColuna(l.id, comoStages));
    return out;
  }, [linhas, stages, idDaEntrada]);

  const originais = useMemo(() => new Map(stages.map((s) => [s.id, paraLinha(s)])), [stages]);
  const ordemOriginal = useMemo(() => stages.map((s) => s.id).join(","), [stages]);
  const ordemAtual = linhas.map((l) => l.id).join(",");

  const mudou = useMemo(() => {
    if (excluidas.length > 0) return true;
    if (linhas.some((l) => l.id.startsWith("novo:"))) return true;
    if (ordemAtual !== ordemOriginal) return true;
    if (idDaEntrada !== entradaOriginal) return true;
    return linhas.some((l) => {
      const o = originais.get(l.id);
      if (!o) return true;
      return o.title !== l.title || o.color !== l.color
        || o.progress_percent !== l.progress_percent
        || o.wip_limit !== l.wip_limit
        || o.is_visible !== l.is_visible
        || o.categoria !== l.categoria;
    });
  }, [linhas, excluidas, originais, ordemAtual, ordemOriginal, idDaEntrada, entradaOriginal]);

  const semNome = linhas.some((l) => !l.title.trim());
  // Mesma guarda de `presas`: a fila sai do quadro de propósito, e o que está
  // nela está à vista na aba Backlog. Ver `colunasOcultas` em kanban/shared.
  const ocultasComTarefa = linhas.filter(
    (l) => !l.is_visible && (contagem.get(l.id) ?? 0) > 0 && !ehBacklog(l),
  );

  /**
   * Linhas cuja categoria a pessoa escolheu à mão. A sugestão automática pelo
   * nome para de agir nelas — senão continuar digitando o título apagaria a
   * escolha logo depois de ela ser feita.
   */
  const [categoriasTocadas, setCategoriasTocadas] = useState<Set<string>>(new Set());

  const mudar = (id: string, p: Partial<LinhaColuna>) => {
    if (p.categoria !== undefined) setCategoriasTocadas((s) => new Set(s).add(id));
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
  };

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
      categoria: "andamento",
    }]);
  };

  /**
   * Sugere a categoria enquanto a pessoa digita o nome de uma coluna NOVA —
   * mas só isso: sugere. Antes o palpite era gravado e virava definitivo, sem
   * como corrigir. Agora ele preenche o campo e a pessoa vê, confere e troca
   * se quiser. Só age em linha nova e enquanto a categoria não foi tocada à
   * mão; renomear coluna existente nunca mexe na categoria (foi o defeito que
   * derrubava o progresso ao renomear "Concluída").
   */
  const mudarNome = (id: string, title: string) => {
    setLinhas((ls) => ls.map((l) => {
      if (l.id !== id) return l;
      const nova = l.id.startsWith("novo:") && !categoriasTocadas.has(l.id);
      return nova ? { ...l, title, categoria: suggestCategoryFromTitle(title) } : { ...l, title };
    }));
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
          || o.is_visible !== l.is_visible
          || o.categoria !== l.categoria;
      });
      await onSalvar({
        criadas,
        alteradas,
        excluidas,
        ordem: ordemAtual !== ordemOriginal ? linhas.map((l) => l.id) : null,
        entrada: idDaEntrada !== entradaOriginal ? idDaEntrada : null,
      });
      onOpenChange(false);
    } finally {
      setSalvando(false);
    }
  };

  const nOcultas = linhas.filter((l) => !l.is_visible).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!salvando) onOpenChange(v); }}>
      {/* 4xl, não 2xl: com as colunas de controle somando ~440px, o diálogo
          estreito deixava ~70px para o Nome — que trunca em "Em Anda…". O
          Nome é o campo que se lê e se edita mais, então ele fica com a folga. */}
      <DialogContent className="max-w-4xl">
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

        {/* A LISTA, não uma tabela. Era uma grade de 7 colunas com 5 controles
            por linha, todos com borda e peso iguais: densidade sem hierarquia,
            e o campo Nome espremido a ~20px. Agora cada coluna é uma linha, o
            nome é o elemento maior, e cada controle carrega o efeito ao lado.
            Padrão de Linear (status do time) e Asana (regras); o Jira mantém
            tabela e é a queixa recorrente daquela tela. */}
        <div>
          {/* A legenda alinha com a grade das linhas. Some junto com as duas
              colunas do meio quando a tela estreita. */}
          <div className={cn(
            "grid gap-2.5 px-2.5 pb-1.5 border-b border-border",
            "grid-cols-[22px_minmax(0,1fr)_132px_136px_64px_78px_30px]",
            "max-[860px]:grid-cols-[22px_minmax(0,1fr)_64px_78px_30px]",
          )}>
            <span />
            <span className="text-[9.5px] font-semibold uppercase tracking-[.07em] text-muted-foreground">Nome</span>
            <span
              className="text-[9.5px] font-semibold uppercase tracking-[.07em] text-muted-foreground max-[860px]:hidden"
              title="O que a coluna significa para o sistema — decide progresso, limite e indicadores. O nome é livre; a categoria, não."
            >Significa</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-[.07em] text-muted-foreground max-[860px]:hidden">Progresso</span>
            <span
              className="text-[9.5px] font-semibold uppercase tracking-[.07em] text-muted-foreground text-center"
              title="Onde a tarefa nasce: criação rápida, importação de EAP e reabertura. Uma por projeto."
            >Entrada</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-[.07em] text-muted-foreground text-center">No quadro</span>
            <span />
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={aoArrastar}>
            <SortableContext items={linhas.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col py-1 divide-y divide-border/50">
                {linhas.map((l) => (
                  <LinhaArrastavel
                    key={l.id}
                    linha={l}
                    // Pelo ID da coluna de entrada, não pela posição na lista:
                    // se a ordem mudar durante a edição, a posição mente e a
                    // proteção passaria para a linha errada.
                    ehEntrada={l.id === idDaEntrada}
                    contagem={contagem.get(l.id) ?? 0}
                    percentualAuto={autoPorColuna.get(l.id) ?? null}
                    concluidaOcupadaPor={linhaConcluida?.id ?? null}
                    nomeDaConcluida={linhaConcluida?.title ?? ""}
                    onMudar={mudar}
                    onMudarNome={mudarNome}
                    onMarcarEntrada={marcarEntrada}
                    onExcluir={excluir}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

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
