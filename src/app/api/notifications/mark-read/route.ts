import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/integrations/supabase/server';
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity, carregarNomesAmbiguos } from '@/lib/identityMatch';

type NotificationRow = {
  id: string;
  project_id: string | null;
  activity_id: string | null;
  target_user_id: string | null;
};

type ActivityRow = {
  id: string;
  project_id: string;
  assigned_to: string | null;
  participants: string[] | null;
};

// PostgREST recebe `in.(...)` na QUERY STRING, então uma lista longa de ids vira
// uma URL longa — e o proxy à frente do Supabase corta em ~3,7 KB, devolvendo
// 502 antes de a requisição chegar ao banco. Com 199 não lidas a URL passava de
// 7 KB e o "Ler todas" falhava sempre.
//
// 50 ids ≈ 1,9 KB de URL: metade do limite medido, com folga para o host mudar.
const ID_CHUNK = 50;

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// Marca notificações como lidas usando service role (o RLS bloqueia o update
// direto do browser, mesmo padrão da leitura em ../route.ts). Body opcional:
// { ids?: string[] }. Sem ids => marca todas as notificações do usuário.
export async function POST(request: Request) {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabaseUrl =
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
  }

  let requestedIds: string[] | null = null;
  try {
    const body = await request.json();
    if (Array.isArray(body?.ids)) {
      requestedIds = body.ids.filter((id: unknown): id is string => typeof id === 'string');
    }
  } catch {
    // sem body => marca todas
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey);

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    adminClient.from('profiles').select('id, full_name, email').eq('id', user.id).maybeSingle(),
    adminClient.from('user_roles').select('role').eq('user_id', user.id),
  ]);

  const isAdmin = (roleRows || []).some((row) => row.role === 'admin');

  // A trava do homônimo, também aqui — ver o comentário em
  // `api/notifications/route.ts`. Sem ela, `matchesIdentity` roda no servidor
  // com o conjunto vazio, e um homônimo marca como lida a notificação do outro.
  await carregarNomesAmbiguos(adminClient as never);

  const userCandidates = buildUserCandidates([
    profile?.id,
    profile?.full_name,
    profile?.email,
    user.id,
    user.email,
  ]);

  const [notificationsRes, activitiesRes, membersRes, projectsRes] = await Promise.all([
    // Quando o cliente diz QUAIS notificações marcar (caso comum: clique numa
    // notificação), restringe já na consulta em vez de carregar todas as não
    // lidas do sistema para filtrar em memória. canAccess continua sendo o
    // guarda de permissão — isto é só escopo.
    // Em lotes: ver ID_CHUNK. Sem isso a própria leitura já estourava a URL.
    (requestedIds && requestedIds.length > 0
      ? Promise.all(
          chunk(requestedIds, ID_CHUNK).map((ids) =>
            adminClient
              .from('notifications')
              .select('id, project_id, activity_id, target_user_id')
              .eq('is_read', false)
              .in('id', ids),
          ),
        ).then((parts) => {
          const failed = parts.find((part) => part.error);
          if (failed?.error) return { data: null, error: failed.error };
          return { data: parts.flatMap((part) => part.data || []), error: null };
        })
      : adminClient
          .from('notifications')
          .select('id, project_id, activity_id, target_user_id')
          .eq('is_read', false)),
    adminClient
      .from('activities')
      .select('id, project_id, assigned_to, participants')
      .eq('is_trashed', false),
    adminClient
      .from('project_members')
      .select('project_id, invitation_status')
      .eq('user_id', user.id),
    adminClient
      .from('projects')
      .select('id, owner')
      .eq('is_trashed', false),
  ]);

  if (notificationsRes.error) {
    return NextResponse.json({ error: notificationsRes.error.message }, { status: 500 });
  }

  const activities = (activitiesRes.data || []) as ActivityRow[];
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  /**
   * Projetos que o usuário alcança — INCLUINDO os arquivados.
   *
   * Esta rota é deliberadamente mais permissiva que a de listagem. Lá, projeto
   * na lixeira não aparece; aqui, marcar como lida é o gesto de DISPENSAR o
   * aviso. Se o vínculo com o projeto arquivado não contasse, as não lidas
   * antigas ficariam presas e o contador nunca zeraria — o sintoma exato que
   * "Ler todas" foi criado para resolver.
   *
   * `liveProjectIds` existe para o caso oposto (ver a rota GET) e não entra
   * aqui de propósito.
   */
  const accessibleProjectIds = new Set<string>();
  for (const member of membersRes.data || []) {
    const status = (member.invitation_status || 'accepted').toLowerCase();
    if (status !== 'declined') accessibleProjectIds.add(member.project_id);
  }
  for (const project of projectsRes.data || []) {
    if (matchesIdentity(project.owner, userCandidates)) accessibleProjectIds.add(project.id);
  }
  for (const activity of activities) {
    const participants = Array.isArray(activity.participants) ? activity.participants : [];
    if (matchesIdentity(activity.assigned_to, userCandidates) || anyMatchesIdentity(participants, userCandidates)) {
      accessibleProjectIds.add(activity.project_id);
    }
  }

  const canAccess = (notification: NotificationRow) => {
    if (isAdmin) return true;
    if (notification.target_user_id === user.id) return true;
    if (notification.target_user_id) return false;

    if (!notification.activity_id) {
      return !!notification.project_id && accessibleProjectIds.has(notification.project_id);
    }

    const activity = activityById.get(notification.activity_id);
    if (!activity) return false;
    if (matchesIdentity(activity.assigned_to, userCandidates)) return true;

    const participants = Array.isArray(activity.participants) ? activity.participants : [];
    if (anyMatchesIdentity(participants, userCandidates)) return true;

    return !!notification.project_id && accessibleProjectIds.has(notification.project_id);
  };

  const requestedSet = requestedIds ? new Set(requestedIds) : null;
  const idsToMark = ((notificationsRes.data || []) as NotificationRow[])
    .filter((n) => (requestedSet ? requestedSet.has(n.id) : true))
    .filter(canAccess)
    .map((n) => n.id);

  if (idsToMark.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Em lotes: ver ID_CHUNK. Sequencial de propósito — o proxy corta a URL, e
  // disparar 4 UPDATEs simultâneos na mesma tabela só troca um problema por
  // outro. São poucas centenas de linhas, o custo é irrelevante.
  const isMissingReadAt = (error: { code?: string; message: string }) =>
    error.code === '42703' || error.code === 'PGRST204' || /read_at/i.test(error.message);

  const batches = chunk(idsToMark, ID_CHUNK);
  // Um único carimbo para todas as linhas: marcadas no mesmo ato, mesma hora.
  const readAt = new Date().toISOString();
  let updated = 0;
  // Uma vez detectada a ausência da coluna, os lotes seguintes já vão sem ela.
  let hasReadAtColumn = true;

  for (const ids of batches) {
    let { error } = await adminClient
      .from('notifications')
      .update(hasReadAtColumn ? { is_read: true, read_at: readAt } : { is_read: true })
      .in('id', ids);

    // Fallback caso a migration do read_at ainda não tenha sido aplicada no
    // banco. O check não pode depender dela.
    if (error && hasReadAtColumn && isMissingReadAt(error)) {
      hasReadAtColumn = false;
      ({ error } = await adminClient
        .from('notifications')
        .update({ is_read: true })
        .in('id', ids));
    }

    if (error) {
      // Os lotes anteriores já foram gravados: informa o parcial em vez de
      // fingir que nada aconteceu, senão a UI reexibe como não lidas algo que
      // já está lido no banco.
      return NextResponse.json({ error: error.message, updated }, { status: 500 });
    }

    updated += ids.length;
  }

  return NextResponse.json({ updated });
}
