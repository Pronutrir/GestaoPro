export const ALL_PROJECT_TABS = [
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

export const normalizeProjectTabs = (tabs?: string[] | null) => {
  const validTabs = (tabs || []).filter((tab): tab is typeof ALL_TAB_VALUES[number] =>
    ALL_TAB_VALUES.includes(tab as typeof ALL_TAB_VALUES[number])
  );

  const baseTabs = validTabs.length > 0 ? validTabs : [...ALL_TAB_VALUES];

  return Array.from(new Set(["kanban", ...baseTabs]));
};
