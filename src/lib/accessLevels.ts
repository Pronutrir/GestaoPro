/**
 * NÍVEL DE ACESSO — fonte única (o que a pessoa PODE fazer).
 *
 * Unifica o antigo "Perfil de Acesso" com o nível hierárquico: um campo só.
 * O nível define a permissão; "Administrador" é um interruptor técnico à parte
 * (acesso total ao sistema/configurações), independente do nível.
 *
 * Cada nível mapeia para um valor do enum `app_role` (user_roles) — a camada
 * técnica que o RBAC lê. Vários níveis podem apontar para o mesmo app_role
 * quando o comportamento é o mesmo (ex.: Coordenador é tratado como gestor).
 *
 * Separado do CARGO descritivo livre em profiles.role_title (ex.: "Analista de
 * Marketing"), que continua existindo como rótulo opcional, sem afetar acesso.
 */

export type AppRole = "admin" | "gestor" | "coordenador" | "user" | "visualizador" | "convidado";

export interface AccessLevel {
  /** valor gravado em user_roles.role (enum app_role) */
  value: AppRole;
  /** rótulo exibido */
  label: string;
  /** descrição curta (dica no seletor) */
  hint: string;
  /** ordem hierárquica (0 = topo) */
  rank: number;
  /** entra em canManage? (gerencia área/projetos, como gestor) */
  manages: boolean;
  /** só leitura? */
  readOnly: boolean;
}

/**
 * Lista canônica dos níveis de ACESSO — cada um mapeia 1:1 para um app_role
 * (sem ambiguidade). "admin" NÃO entra aqui: é o interruptor separado (acesso
 * total). "Direção" pertence ao eixo de CARGO (role_title), não ao de acesso —
 * quem é da direção normalmente também recebe o interruptor Administrador.
 */
export const ACCESS_LEVELS: AccessLevel[] = [
  { value: "gestor",       label: "Gestor",        hint: "Gerencia área e projetos",    rank: 0, manages: true,  readOnly: false },
  { value: "coordenador",  label: "Coordenador",   hint: "Coordena time (~gestor)",     rank: 1, manages: true,  readOnly: false },
  { value: "user",         label: "Colaborador",   hint: "Executa atividades",          rank: 2, manages: false, readOnly: false },
  { value: "visualizador", label: "Visualizador",  hint: "Só leitura",                  rank: 3, manages: false, readOnly: true  },
  { value: "convidado",    label: "Externo",       hint: "Só projetos ligados",         rank: 4, manages: false, readOnly: false },
];

/** Chave estável por nível (usada no seletor). Como agora é 1:1, casa com value. */
export const accessLevelKey = (l: Pick<AccessLevel, "label">) => l.label.toLowerCase();

/** Papéis (app_role) que concedem gestão — usado no RBAC (canManage). */
export const MANAGER_ROLES: AppRole[] = ["gestor", "coordenador"];

/** Retorna o rótulo de nível para um app_role (o primeiro que casar). */
export function accessLabelForRole(role: string | null | undefined): string {
  if (role === "admin") return "Administrador";
  const found = ACCESS_LEVELS.find((l) => l.value === role);
  return found?.label ?? "Colaborador";
}

/** app_role a partir da chave de nível escolhida no seletor. */
export function roleFromAccessKey(key: string): AppRole {
  const found = ACCESS_LEVELS.find((l) => accessLevelKey(l) === key);
  return found?.value ?? "user";
}
