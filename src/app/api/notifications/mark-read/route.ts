import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/integrations/supabase/server';
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from '@/lib/identityMatch';

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

  const userCandidates = buildUserCandidates([
    profile?.id,
    profile?.full_name,
    profile?.email,
    user.id,
    user.email,
  ]);

  const [notificationsRes, activitiesRes, membersRes, projectsRes] = await Promise.all([
    adminClient
      .from('notifications')
      .select('id, project_id, activity_id, target_user_id')
      .eq('is_read', false),
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

  const { error: updateError } = await adminClient
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in('id', idsToMark);

  // Fallback caso a migration do read_at ainda não tenha sido aplicada no banco
  // (coluna inexistente => 42703 / PGRST204). O check não pode depender dela.
  if (updateError) {
    const missingColumn =
      updateError.code === '42703' ||
      updateError.code === 'PGRST204' ||
      /read_at/i.test(updateError.message);

    if (!missingColumn) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: retryError } = await adminClient
      .from('notifications')
      .update({ is_read: true })
      .in('id', idsToMark);

    if (retryError) {
      return NextResponse.json({ error: retryError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ updated: idsToMark.length });
}
