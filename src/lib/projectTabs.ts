export const ALL_PROJECT_TABS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "kanban", label: "Kanban" },
  { value: "backlog", label: "Backlog" },
  { value: "timeline", label: "Cronograma" },
  { value: "deliveries", label: "Pacote de Entregas" },
  { value: "documents", label: "Documentos" },
  { value: "stories", label: "Histórias" },
  { value: "tap", label: "TAP" },
  { value: "meetings", label: "Reuniões" },
  { value: "assumptions", label: "Premissas" },
  { value: "risks", label: "Riscos" },
  { value: "financials", label: "Financeiro" },
  { value: "lessons", label: "Lições" },
  { value: "workflow", label: "Workflow" },
] as const;

export const ALL_TAB_VALUES = ALL_PROJECT_TABS.map(t => t.value);
