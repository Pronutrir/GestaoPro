export const ALL_PROJECT_TABS = [
  { value: "kanban", label: "Kanban" },
  { value: "list", label: "Pendências" },
  { value: "backlog", label: "Lista" },
  { value: "timeline", label: "Cronograma" },
  { value: "calendar", label: "Calendário" },
  // "Páginas" foi fundida em Documentos (Central de Documentos): escrever e
  // enviar arquivo são visões da mesma aba, não permissões separadas.
  { value: "documents", label: "Documentos" },
  // Linha do tempo de reuniões, documentos e lições. É LEITURA das três fontes
  // — quem enxerga Registros vê o que já poderia ver abrindo as abas de origem,
  // então não abre acesso novo a nada.
  { value: "registros", label: "Registros" },
  { value: "stories", label: "Histórias" },
  { value: "tap", label: "TAP" },
  { value: "meetings", label: "Reuniões" },
  { value: "assumptions", label: "Premissas" },
  { value: "risks", label: "Riscos" },
  { value: "changes", label: "Mudanças" },
  { value: "dependencies", label: "Dependências" },
  { value: "financials", label: "Financeiro" },
  { value: "lessons", label: "Lições" },
  { value: "audit", label: "Auditoria" },
] as const;

export const ALL_TAB_VALUES = ALL_PROJECT_TABS.map(t => t.value);

export const normalizeProjectTabs = (tabs?: string[] | null) => {
  // Permissões gravadas antes da fusão podem conter "docpages" sozinho. Sem
  // esta troca, quem só tinha Páginas liberada perderia o acesso ao módulo.
  const migrated = (tabs || []).map((tab) => (tab === "docpages" ? "documents" : tab));

  const validTabs = migrated.filter((tab): tab is typeof ALL_TAB_VALUES[number] =>
    ALL_TAB_VALUES.includes(tab as typeof ALL_TAB_VALUES[number])
  );

  const baseTabs = validTabs.length > 0 ? validTabs : [...ALL_TAB_VALUES];

  return Array.from(new Set(["kanban", ...baseTabs]));
};
