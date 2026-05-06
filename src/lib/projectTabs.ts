export const ALL_PROJECT_TABS = [
  { value: "kanban", label: "Kanban" },
  { value: "backlog", label: "Backlog" },
  { value: "timeline", label: "Cronograma" },
  { value: "calendar", label: "Calendário" },
  { value: "documents", label: "Documentos" },
  { value: "docpages", label: "Páginas" },
  { value: "stories", label: "Histórias" },
  { value: "tap", label: "TAP" },
  { value: "meetings", label: "Reuniões" },
  { value: "assumptions", label: "Premissas" },
  { value: "risks", label: "Riscos" },
  { value: "changes", label: "Mudanças" },
  { value: "dependencies", label: "Dependências" },
  { value: "financials", label: "Financeiro" },
  { value: "lessons", label: "Lições" },
] as const;

export const ALL_TAB_VALUES = ALL_PROJECT_TABS.map(t => t.value);

const LEGACY_PROJECT_TAB_ALIASES: Record<string, typeof ALL_TAB_VALUES[number]> = {
  list: "backlog",
};

export const normalizeProjectTabs = (tabs?: string[] | null) => {
  const validTabs = (tabs || [])
    .map((tab) => LEGACY_PROJECT_TAB_ALIASES[tab] || tab)
    .filter((tab): tab is typeof ALL_TAB_VALUES[number] =>
      ALL_TAB_VALUES.includes(tab as typeof ALL_TAB_VALUES[number])
    );

  const baseTabs = validTabs.length > 0 ? validTabs : [...ALL_TAB_VALUES];

  return Array.from(new Set(["kanban", ...baseTabs]));
};
