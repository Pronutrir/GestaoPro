import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/integrations/supabase/server';

/**
 * Avisa quem ficou com ação numa reunião.
 *
 * Sem isto, a ata terminava nela mesma: a ação era gravada com responsável e
 * prazo, mas ninguém era acionado — a pessoa só descobriria abrindo a reunião
 * por conta própria. Era a lacuna central da aba.
 *
 * Usa service role pelo mesmo motivo de /api/notifications/create: escrever em
 * `notifications` de OUTRO usuário. Sob RLS, o cliente só escreve para si.
 *
 * Body: { meetingId }
 * Notifica as ações ABERTAS da reunião, agrupadas por responsável — uma
 * notificação por pessoa, não uma por ação.
 */

export async function POST(request: Request) {
  const userClient = await createServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
  }

  let payload: { meetingId?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const meetingId = payload.meetingId;
  if (!meetingId) {
    return NextResponse.json({ error: 'meetingId é obrigatório' }, { status: 400 });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // A reunião é lida com o cliente DO USUÁRIO: se o RLS não deixa ele ver,
  // ele também não pode disparar notificação sobre ela.
  const { data: meeting } = await userClient
    .from('meetings')
    .select('id, title, project_id')
    .eq('id', meetingId)
    .maybeSingle();

  if (!meeting) {
    return NextResponse.json({ error: 'Reunião não encontrada' }, { status: 404 });
  }

  const { data: actions } = await admin
    .from('meeting_actions')
    .select('id, description, assigned_to, due_date')
    .eq('meeting_id', meetingId)
    .eq('is_completed', false);

  if (!actions?.length) return NextResponse.json({ created: 0 });

  // Uma notificação por PESSOA, não por ação: quem recebeu 4 ações da mesma
  // reunião não deve receber 4 avisos.
  const porPessoa = new Map<string, { description: string; due_date: string | null }[]>();
  for (const a of actions) {
    if (!a.assigned_to || a.assigned_to === user.id) continue;
    porPessoa.set(a.assigned_to, [...(porPessoa.get(a.assigned_to) || []), a]);
  }
  if (porPessoa.size === 0) return NextResponse.json({ created: 0 });

  const fmt = (d: string | null) => {
    if (!d) return null;
    const [y, m, dd] = d.slice(0, 10).split('-');
    return `${dd}/${m}/${y}`;
  };

  const rows = Array.from(porPessoa.entries()).map(([uid, list]) => {
    const n = list.length;
    // Com uma ação só, o texto mostra QUAL é — evita obrigar a abrir a tela
    // para descobrir. Com várias, mostra a contagem e o prazo mais próximo.
    const prazos = list.map((a) => a.due_date).filter(Boolean).sort();
    const prazo = fmt(prazos[0] ?? null);
    return {
      target_user_id: uid,
      activity_id: null,
      project_id: meeting.project_id,
      type: 'meeting_action',
      title: n === 1
        ? `Você ficou com 1 ação da reunião "${meeting.title}"`
        : `Você ficou com ${n} ações da reunião "${meeting.title}"`,
      message: n === 1
        ? `${list[0].description.slice(0, 120)}${prazo ? ` · prazo ${prazo}` : ''}`
        : `${prazo ? `Primeiro prazo: ${prazo}` : 'Sem prazo definido'}`,
    };
  });

  const { error } = await admin.from('notifications').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ created: rows.length });
}
