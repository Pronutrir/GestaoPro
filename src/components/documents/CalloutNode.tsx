'use client';
// AVISO DESTACADO (callout) — o bloco que faltava para documento normativo.
//
// Num procedimento ou termo, algumas frases não são texto corrido: são "isto
// aqui é obrigatório", "cuidado com este prazo". Sem um bloco próprio, a pessoa
// recorria a negrito e MAIÚSCULAS, que não sobrevivem à leitura rápida.
//
// Três tons, não dez: nota, atenção e cuidado. Paleta maior vira decoração e
// o leitor para de distinguir o que é grave.
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { Info, AlertTriangle, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalloutTone = "nota" | "atencao" | "cuidado";

const TONES: Record<CalloutTone, {
  label: string;
  icon: typeof Info;
  box: string;
  mark: string;
}> = {
  nota: {
    label: "Nota",
    icon: Info,
    box: "border-primary/35 bg-primary/5",
    mark: "text-primary",
  },
  atencao: {
    label: "Atenção",
    icon: AlertTriangle,
    box: "border-amber-500/40 bg-amber-500/10",
    mark: "text-amber-600 dark:text-amber-400",
  },
  cuidado: {
    label: "Cuidado",
    icon: AlertOctagon,
    box: "border-destructive/40 bg-destructive/10",
    mark: "text-destructive",
  },
};

function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const tone = (node.attrs.tone ?? "nota") as CalloutTone;
  const meta = TONES[tone] ?? TONES.nota;
  const Icon = meta.icon;

  return (
    <NodeViewWrapper>
      <div className={cn("my-2 flex gap-2.5 rounded-lg border px-3 py-2.5", meta.box)}>
        {/* Clicar no ícone gira entre os três tons: é a forma mais direta de
            trocar sem precisar de menu, e o próprio ícone já indica o estado. */}
        <button
          type="button"
          contentEditable={false}
          title="Trocar o tipo de aviso"
          className={cn("shrink-0 mt-0.5", meta.mark)}
          onClick={() => {
            const order: CalloutTone[] = ["nota", "atencao", "cuidado"];
            const next = order[(order.indexOf(tone) + 1) % order.length];
            updateAttributes({ tone: next });
          }}
        >
          <Icon className="h-4 w-4" />
        </button>
        <NodeViewContent className="flex-1 min-w-0" />
      </div>
    </NodeViewWrapper>
  );
}

export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: "nota",
        parseHTML: (el) => el.getAttribute("data-tone") ?? "nota",
        renderHTML: (attrs) => ({ "data-tone": attrs.tone }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
