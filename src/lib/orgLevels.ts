/**
 * Níveis hierárquicos organizacionais — FONTE ÚNICA.
 *
 * Padroniza o campo `profiles.role_title` (antes texto livre) numa lista de
 * mercado: Direção → Gestor → Coordenador → Colaborador → Externo.
 *
 * IMPORTANTE: é um vocabulário SUGERIDO, não fechado. O seletor permite texto
 * livre para preservar cargos específicos já existentes (ex.: "Analista de
 * Marketing"). Assim a padronização não descarta dados atuais.
 *
 * Este é o CARGO/NÍVEL (quem a pessoa é na organização) — separado do PAPEL DE
 * ACESSO (user_roles: o que ela pode fazer). Ver lib/modules.ts / AuthContext.
 */

export interface OrgLevel {
  /** valor gravado em role_title */
  value: string;
  /** rótulo exibido */
  label: string;
  /** ordem hierárquica (0 = topo) */
  rank: number;
  /** descrição curta */
  hint: string;
}

export const ORG_LEVELS: OrgLevel[] = [
  { value: "Direção",      label: "Direção",      rank: 0, hint: "Visão executiva do portfólio" },
  { value: "Gestor",       label: "Gestor",       rank: 1, hint: "Responde por área/projetos" },
  { value: "Coordenador",  label: "Coordenador",  rank: 2, hint: "Coordena um time/frente" },
  { value: "Colaborador",  label: "Colaborador",  rank: 3, hint: "Executa as atividades" },
  { value: "Externo",      label: "Usuário Externo", rank: 4, hint: "Time externo/parceiro" },
];

export const ORG_LEVEL_VALUES = ORG_LEVELS.map((l) => l.value);

/** Encontra o nível padronizado que casa (case-insensitive) com um role_title. */
export function findOrgLevel(roleTitle: string | null | undefined): OrgLevel | null {
  if (!roleTitle) return null;
  const t = roleTitle.trim().toLowerCase();
  return ORG_LEVELS.find((l) => l.value.toLowerCase() === t || l.label.toLowerCase() === t) || null;
}
