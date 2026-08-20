import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from "@/lib/identityMatch";

/**
 * QUEM GERENCIA O PROJETO — espelho de `can_manage_project_v2` na RLS.
 *
 * Editar a FICHA do projeto — e sobretudo a permissão de cada membro da
 * equipe — é outra permissão que editar ATIVIDADE. As policies de
 * insert/update/delete em `project_members` exigem `can_manage_project_v2`,
 * que aceita apenas:
 *
 *   - admin do sistema;
 *   - líder do projeto (`projects.owner`);
 *   - gestor do projeto (`projects.manager`, desde 20260729140000).
 *
 * A tela não sabia disso: o botão de editar aparecia sob `can_edit`, a
 * permissão de mexer em atividade. Um membro comum abria a ficha, trocava a
 * permissão dos colegas, salvava e lia "Projeto atualizado!" — enquanto o
 * banco recusava e o erro era engolido pelo try/catch da sincronização.
 *
 * Conferido com dados reais em 19/08/2026: para um membro com `can_edit` e
 * `can_delete` na Revitalização Tasy, `can_manage_project_v2` devolve `false`
 * e `can_view_project_v2` devolve `true`. Ele edita o trabalho, não decide
 * quem faz o quê — a mesma separação que Jira e Asana fazem entre "editar
 * itens" e "administrar o projeto".
 *
 * Vive em `lib` porque TRÊS telas abrem o EditProjectDialog (projeto, lista de
 * projetos e qualidade). Duplicar a regra em cada uma é como o front e a RLS
 * divergiram em primeiro lugar.
 *
 * A comparação é por identidade tolerante (`matchesIdentity`) porque `owner` e
 * `manager` são TEXTO LIVRE com o nome da pessoa, não FK — a mesma razão pela
 * qual `is_project_leader_v2` compara `lower(trim(...))` com `full_name`.
 */
export function podeGerenciarProjeto(
  projeto: { owner?: string | null; manager?: string | null } | null | undefined,
  usuario: {
    isAdmin?: boolean;
    id?: string | null;
    email?: string | null;
    fullName?: string | null;
    profileId?: string | null;
  },
): boolean {
  if (usuario.isAdmin) return true;
  if (!projeto) return false;
  if (!usuario.id && !usuario.profileId) return false;

  const candidatos = buildUserCandidates([
    usuario.fullName,
    usuario.email,
    usuario.profileId,
    usuario.id,
  ]);

  return matchesIdentity(projeto.owner, candidatos)
    || matchesIdentity(projeto.manager, candidatos);
}

/**
 * Reexportado para quem precisa da mesma checagem sobre uma LISTA de nomes
 * (ex.: `projects.assignees`). Evita que cada tela importe de dois lugares.
 */
export { anyMatchesIdentity };
