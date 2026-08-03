/**
 * STATUS DO PROJETO — fonte única.
 *
 * `projects.status` é text livre no banco: o CHECK original foi derrubado numa
 * migration antiga e nunca recriado. Os sete valores estavam repetidos
 * literalmente em nove arquivos (telas de projeto, portfólio, qualidade,
 * relatórios, visão geral, pipeline, drawer, agente de IA).
 *
 * O risco concreto disso é a grafia: o ROADMAP usa `em_execucao` (underscore) e
 * o PROJETO usa `em-execucao` (hífen). São namespaces diferentes, e sem CHECK no
 * banco uma troca de separador é gravada em silêncio — o projeto simplesmente
 * some dos filtros, sem erro nenhum. Ao ligar os dois módulos (projetização),
 * essa confusão passa a ser provável, não hipotética.
 *
 * Use SEMPRE estas constantes ao ler ou gravar status de projeto.
 */

export const PROJECT_STATUS = {
  IDEACAO: "ideacao",
  POC: "poc",
  MVP: "mvp",
  BLOCKED: "blocked",
  DRAWER: "drawer",
  EM_EXECUCAO: "em-execucao",
  CONCLUIDO: "concluido",
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: PROJECT_STATUS.IDEACAO, label: "Ideação" },
  { value: PROJECT_STATUS.POC, label: "POC" },
  { value: PROJECT_STATUS.MVP, label: "MVP" },
  { value: PROJECT_STATUS.BLOCKED, label: "Bloqueio" },
  { value: PROJECT_STATUS.DRAWER, label: "Gaveta" },
  { value: PROJECT_STATUS.EM_EXECUCAO, label: "Em Execução" },
  { value: PROJECT_STATUS.CONCLUIDO, label: "Concluído" },
];

const LABELS: Record<string, string> = Object.fromEntries(
  PROJECT_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * Normaliza grafias que já existem no banco.
 *
 * Há dado gravado com underscore (`em_execucao`) e variantes em português
 * (`concluído`, `completed`) de versões anteriores — uma migration de 2026-05
 * já testava por essas formas. Ler por aqui evita que um projeto suma da tela
 * por causa do separador.
 */
export const normalizeProjectStatus = (status?: string | null): ProjectStatus => {
  const s = (status || "").trim().toLowerCase().replace(/_/g, "-");
  switch (s) {
    case "em-execucao":
    case "em-execução":
      return PROJECT_STATUS.EM_EXECUCAO;
    case "concluido":
    case "concluído":
    case "completed":
    case "done":
      return PROJECT_STATUS.CONCLUIDO;
    case "ideacao":
    case "ideação":
      return PROJECT_STATUS.IDEACAO;
    case "poc":
      return PROJECT_STATUS.POC;
    case "mvp":
      return PROJECT_STATUS.MVP;
    case "blocked":
    case "bloqueio":
      return PROJECT_STATUS.BLOCKED;
    case "drawer":
    case "gaveta":
      return PROJECT_STATUS.DRAWER;
    default:
      return PROJECT_STATUS.IDEACAO;
  }
};

export const projectStatusLabel = (status?: string | null): string =>
  LABELS[normalizeProjectStatus(status)] ?? "Ideação";

/** Projeto concluído é somente leitura em várias telas. */
export const isProjectConcluded = (status?: string | null): boolean =>
  normalizeProjectStatus(status) === PROJECT_STATUS.CONCLUIDO;
