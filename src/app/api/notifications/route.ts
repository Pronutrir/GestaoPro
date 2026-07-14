import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/integrations/supabase/server';
import { getSupabaseServerUrl } from '@/integrations/supabase/config';
import { anyMatchesIdentity, buildUserCandidates, matchesIdentity } from '@/lib/identityMatch';

type NotificationRow = {
  id: string;
  project_id: string | null;
  activity_id: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
  target_user_id: string | null;
};

type ActivityRow = {
  id: string;
  project_id: string;
  assigned_to: string | null;
  participants: string[] | null;
};

export async function GET() {
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
      .select('id, project_id, activity_id, type, title, message, is_read, created_at, target_user_id')
      .order('created_at', { ascending: false })
      .limit(300),
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

  if (notificationsRes.error || activitiesRes.error || membersRes.error || projectsRes.error) {
    const message =
      notificationsRes.error?.message ||
      activitiesRes.error?.message ||
      membersRes.error?.message ||
      projectsRes.error?.message ||
      'Erro ao buscar notificações';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const activities = (activitiesRes.data || []) as ActivityRow[];
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  const accessibleProjectIds = new Set<string>();

  for (const member of membersRes.data || []) {
    const status = (member.invitation_status || 'accepted').toLowerCase();
    if (status !== 'declined') {
      accessibleProjectIds.add(member.project_id);
    }
  }

  for (const project of projectsRes.data || []) {
    if (matchesIdentity(project.owner, userCandidates)) {
      accessibleProjectIds.add(project.id);
    }
  }

  for (const activity of activities) {
    const participants = Array.isArray(activity.participants) ? activity.participants : [];
    if (matchesIdentity(activity.assigned_to, userCandidates) || anyMatchesIdentity(participants, userCandidates)) {
      accessibleProjectIds.add(activity.project_id);
    }
  }

  const notifications = ((notificationsRes.data || []) as NotificationRow[]).filter((notification) => {
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
  });

  return NextResponse.json({ notifications });
}