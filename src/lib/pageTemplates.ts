/**
 * MODELOS DE DOCUMENTO — a folha em branco é o maior obstáculo.
 *
 * Pedir "escreva a ata" produz atas em cinco formatos diferentes, cada uma
 * esquecendo um campo distinto. Um modelo não é conveniência: é o que torna o
 * documento comparável entre projetos e o que garante que os campos que
 * importam (decisões, responsável, prazo) não fiquem de fora.
 *
 * Os três primeiros cobrem o que o sistema já faz: reunião, aceite de entrega
 * e acompanhamento. Cada um usa os blocos do próprio editor — tabela para o
 * que é comparável, lista de tarefas para o que tem dono, aviso destacado para
 * o que não pode passar batido.
 */

interface TemplateNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TemplateNode[];
  text?: string;
  marks?: { type: string }[];
}

export interface PageTemplate {
  key: string;
  label: string;
  hint: string;
  title: string;
  build: () => TemplateNode;
}

const p = (text = ""): TemplateNode =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };

const h = (level: number, text: string): TemplateNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const bold = (text: string): TemplateNode => ({
  type: "text",
  text,
  marks: [{ type: "bold" }],
});

const taskItem = (text: string): TemplateNode => ({
  type: "taskItem",
  attrs: { checked: false },
  content: [p(text)],
});

const taskList = (items: string[]): TemplateNode => ({
  type: "taskList",
  content: items.map(taskItem),
});

const cell = (text: string, header = false): TemplateNode => ({
  type: header ? "tableHeader" : "tableCell",
  content: [text ? p(text) : p()],
});

const row = (cells: string[], header = false): TemplateNode => ({
  type: "tableRow",
  content: cells.map((c) => cell(c, header)),
});

const table = (headers: string[], rows: string[][]): TemplateNode => ({
  type: "table",
  content: [row(headers, true), ...rows.map((r) => row(r))],
});

const callout = (tone: string, text: string): TemplateNode => ({
  type: "callout",
  attrs: { tone },
  content: [p(text)],
});

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    key: "ata",
    label: "Ata de reunião",
    hint: "Participantes, decisões e encaminhamentos",
    title: "Ata de reunião",
    build: () => ({
      type: "doc",
      content: [
        h(2, "Informações"),
        table(
          ["Campo", "Conteúdo"],
          [["Data", ""], ["Participantes", ""], ["Pauta", ""]],
        ),
        h(2, "Discussão"),
        p(),
        h(2, "Decisões"),
        // Decisão em lista numerada, não em texto corrido: cada uma precisa
        // poder ser citada depois ("conforme decisão 3").
        {
          type: "orderedList",
          content: [{ type: "listItem", content: [p()] }],
        },
        h(2, "Encaminhamentos"),
        p("Use /tarefa para transformar cada item em atividade no Kanban."),
        taskList(["", ""]),
      ],
    }),
  },
  {
    key: "aceite",
    label: "Termo de aceite",
    hint: "Entrega, critérios e assinatura",
    title: "Termo de aceite de entrega",
    build: () => ({
      type: "doc",
      content: [
        p(),
        h(2, "Objeto"),
        p("Descreva o que está sendo entregue."),
        h(2, "Critérios verificados"),
        taskList(["", ""]),
        h(2, "Ressalvas"),
        p(),
        callout(
          "atencao",
          "Depois de enviar para assinatura, o texto não deve mudar: a impressão digital registrada na trilha vale para esta versão.",
        ),
        h(2, "Aceite"),
        p("Ao confirmar no sistema, ficam registrados data, hora, origem do acesso e o texto exato aceito."),
      ],
    }),
  },
  {
    key: "status",
    label: "Relatório de status",
    hint: "Andamento, riscos e próximos passos",
    title: "Relatório de status",
    build: () => ({
      type: "doc",
      content: [
        p(),
        h(2, "Resumo do período"),
        p(),
        h(2, "Andamento"),
        table(
          ["Frente", "Situação", "Observação"],
          [["", "", ""], ["", "", ""]],
        ),
        h(2, "Pontos de atenção"),
        callout("cuidado", "O que pode atrasar a entrega se não for tratado agora."),
        h(2, "Próximos passos"),
        taskList(["", ""]),
      ],
    }),
  },
  {
    key: "procedimento",
    label: "Procedimento",
    hint: "Passo a passo com responsáveis",
    title: "Procedimento",
    build: () => ({
      type: "doc",
      content: [
        p(),
        h(2, "Objetivo"),
        p(),
        h(2, "Quando se aplica"),
        p(),
        h(2, "Passos"),
        {
          type: "orderedList",
          content: [{ type: "listItem", content: [p()] }],
        },
        {
          type: "toggleSection",
          attrs: { open: false, summary: "Exceções e casos especiais" },
          content: [p()],
        },
        h(2, "Responsáveis"),
        table(["Etapa", "Responsável"], [["", ""]]),
      ],
    }),
  },
];
