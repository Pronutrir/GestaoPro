'use client';
// SEÇÃO RECOLHÍVEL — para documento longo que ninguém lê inteiro.
//
// Um procedimento com anexos, um TAP com detalhamento por área: a informação
// precisa estar lá, mas não de uma vez. Recolher é o que permite o documento
// ter profundidade sem parecer intransponível.
//
// O estado aberto/fechado é ATRIBUTO do nó, então é salvo com o documento:
// quem escreveu decide o que já chega aberto para quem lê.
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function ToggleView({ node, updateAttributes }: ReactNodeViewProps) {
  const open = node.attrs.open !== false;

  return (
    <NodeViewWrapper>
      <div className="my-2 rounded-lg border bg-card/60">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <button
            type="button"
            contentEditable={false}
            onClick={() => updateAttributes({ open: !open })}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title={open ? "Recolher" : "Expandir"}
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} />
          </button>
          {/* O título é um input simples, não conteúdo rico: cabeçalho de seção
              com formatação vira ruído e quebra o alinhamento da linha. */}
          <input
            contentEditable={false}
            value={node.attrs.summary ?? ""}
            onChange={(e) => updateAttributes({ summary: e.target.value })}
            placeholder="Título da seção"
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[14px] font-semibold placeholder:text-muted-foreground/50 placeholder:font-normal"
          />
        </div>
        {/* Escondido com CSS, não desmontado: desmontar o conteúdo faria o
            ProseMirror perder a seleção e o histórico de desfazer. */}
        <NodeViewContent className={cn("px-3 pb-2 pl-8", !open && "hidden")} />
      </div>
    </NodeViewWrapper>
  );
}

export const ToggleNode = Node.create({
  name: "toggleSection",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": String(attrs.open) }),
      },
      summary: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-summary") ?? "",
        renderHTML: (attrs) => ({ "data-summary": attrs.summary }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-toggle-section]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle-section": "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
