/**
 * Catálogo de MÓDULOS do sistema — FONTE ÚNICA DA VERDADE.
 *
 * Antes, a lista de módulos e o default estavam duplicados e DIVERGENTES entre
 * ModulePermissions.tsx (11 na lista, 6 no default) e AppSidebar.tsx (6 no
 * default), e a migration do banco tinha outro default (5). Isso deixava o
 * comportamento imprevisível para quem não tinha permissões gravadas.
 *
 * Agora todos importam daqui.
 */

export interface ModuleDef {
  key: string;
  label: string;
}

/**
 * Módulos que podem ser LIBERADOS por usuário na tela de permissões.
 * (settings é admin-only e não entra aqui — não é liberável por módulo.)
 * As chaves batem com os `moduleKey` do AppSidebar.
 */
export const ALL_MODULES: ModuleDef[] = [
  { key: "overview",    label: "Visão Geral" },
  { key: "projects",    label: "Projetos" },
  { key: "team",        label: "Equipe" },
  { key: "timeline",    label: "Cronograma" },
  { key: "blocked",     label: "Bloqueios" },
  { key: "agent",       label: "Agente de IA" },
  { key: "calendario",  label: "Calendário" },
  { key: "roadmap",     label: "Roadmap" },
  { key: "investments", label: "Gestão Financeira" },
  { key: "reports",     label: "Relatórios" },
  { key: "csc",         label: "CSC" },
  { key: "qualidade",   label: "Gestão da Qualidade" },
];

export const ALL_MODULE_KEYS: string[] = ALL_MODULES.map((m) => m.key);

/**
 * Módulos liberados por padrão quando o usuário AINDA NÃO tem uma linha em
 * user_module_permissions. Único ponto de verdade para front (tela + sidebar).
 * Mantém o conjunto essencial do dia a dia.
 */
export const DEFAULT_MODULES: string[] = [
  "overview",
  "projects",
  "team",
  "timeline",
  "blocked",
  "agent",
  "calendario",
];

/** Chave do módulo de configurações (admin-only; nunca liberável/removível). */
export const SETTINGS_MODULE_KEY = "settings";
