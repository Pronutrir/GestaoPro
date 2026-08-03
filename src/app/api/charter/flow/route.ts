import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/integrations/supabase/server';

/**
 * FLUXO DE APROVAÇÃO DO TAP.
 *
 * Antes, "Aprovar TAP" gravava três chaves num JSONB direto do navegador: sem
 * validação, sem trilha, sem avisar ninguém, e com o "bloqueio" existindo só na
 * UI — qualquer gestor reabria e apagava o carimbo sem deixar rastro.
 *
 * Aqui o ato passa a ser formal:
 *   enviar   → valida o TAP, cria o envelope (document_flows) com os aprovadores
 *              designados e NOTIFICA quem está na vez;
 *   decidir  → aprova/recusa a própria participação, com trilha;
 *   reabrir  → invalida a rodada e gera uma versão nova.
 *
 * No servidor porque: (a) o insert de notificação do navegador não grava,
 * (b) a validação não pode ficar do lado que se pode contornar, e (c) o hash do
 * conteúdo precisa ser calculado sobre o que foi realmente gravado.
 */

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Campos sem os quais o termo não deveria circular para assinatura. */
const REQUIRED: { key: string; label: string }[] = [
  { key: 'objective', label: 'Objetivo' },
  { key: 'scope', label: 'Escopo' },
  { key: 'justification', label: 'Justificativa' },
];

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
  }

  let payload: {
    action?: 'enviar' | 'decidir' | 'reabrir';
    projectId?: string;
    approverIds?: string[];
    dueDate?: string | null;
    message?: string | null;
    decision?: 'aprovado' | 'recusado';
    reason?: string | null;
  };
  try { payload = await request.json(); } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { action, projectId } = payload;
  if (!action || !projectId) {
    return NextResponse.json({ error: 'action e projectId são obrigatórios' }, { status: 400 });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey);

  const { data: profile } = await admin
    .from('profiles').select('id, full_name, email').eq('id', user.id).maybeSingle();
  const actorName = profile?.full_name?.trim() || profile?.email || user.email || 'Alguém';

  const { data: project } = await admin
    .from('projects')
    .select('id, title, owner, manager, charter_data, charter_status, charter_version')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 });

  const charter = (project.charter_data as Record<string, any>) || {};
  const version = Number(project.charter_version || 1);

  // Quem pode conduzir o TAP: admin global OU líder/gestor DO PROJETO.
  // A tela usava o cargo global (admin/gestor/coordenador), então 7 pessoas
  // conduziam o TAP de qualquer projeto sem serem parte dele.
  const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', user.id);
  const isAdmin = (roleRows || []).some((r) => r.role === 'admin');
  const nomes = [profile?.full_name, profile?.email, user.email].filter(Boolean).map((v) => norm(String(v)));
  const isLeader =
    (project.owner && nomes.includes(norm(String(project.owner)))) ||
    (project.manager && nomes.includes(norm(String(project.manager))));
  const canManage = isAdmin || !!isLeader;

  // ---------------------------------------------------------------- enviar
  if (action === 'enviar') {
    if (!canManage) {
      return NextResponse.json(
        { error: 'Só o líder, o gestor do projeto ou um administrador pode enviar o TAP para aprovação.' },
        { status: 403 },
      );
    }
    if (project.charter_status === 'em_aprovacao') {
      return NextResponse.json({ error: 'Este TAP já está circulando para aprovação.' }, { status: 409 });
    }

    // Validação: antes NADA era checado — dava para aprovar um termo vazio.
    const faltando = REQUIRED.filter((f) => !String(charter[f.key] ?? '').trim()).map((f) => f.label);
    const approverIds = (payload.approverIds || []).filter(Boolean);
    if (approverIds.length === 0) faltando.push('Pelo menos um aprovador');
    if (faltando.length > 0) {
      return NextResponse.json(
        { error: `Preencha antes de enviar: ${faltando.join(', ')}.`, missing: faltando },
        { status: 422 },
      );
    }

    const contentHash = await sha256(JSON.stringify(charter));

    const { data: flow, error: flowErr } = await admin
      .from('document_flows')
      .insert({
        charter_project_id: projectId,
        project_id: projectId,
        kind: 'aprovacao',
        status: 'circulando',
        title: `TAP — ${project.title}`,
        message: payload.message ?? null,
        file_hash: contentHash,
        due_date: payload.dueDate ?? null,
        document_version: version,
        created_by: user.id,
        created_by_name: actorName,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (flowErr) return NextResponse.json({ error: flowErr.message }, { status: 500 });

    const { data: people } = await admin
      .from('profiles').select('id, full_name').in('id', approverIds);

    const { error: partErr } = await admin.from('document_participants').insert(
      approverIds.map((uid, i) => ({
        flow_id: flow.id,
        user_id: uid,
        user_name: (people || []).find((p) => p.id === uid)?.full_name ?? null,
        role: 'aprovador',
        // Todos na mesma posição = aprovação em paralelo. Ordem sequencial não
        // é o caso comum de um TAP e atrasaria sem ganho.
        position: 1,
        is_blocking: true,
        status: 'pendente',
      })),
    );
    if (partErr) return NextResponse.json({ error: partErr.message }, { status: 500 });

    await admin.from('document_flow_events').insert({
      flow_id: flow.id, event_type: 'enviado', actor_id: user.id, actor_name: actorName,
      detail: `TAP v${version} enviado para ${approverIds.length} aprovador(es).`,
    });

    await admin.from('project_charter_versions').insert({
      project_id: projectId, version, snapshot: charter, content_hash: contentHash,
      event: 'enviado', actor_id: user.id, actor_name: actorName,
      detail: `Enviado para ${approverIds.length} aprovador(es).`,
    });

    await admin.from('projects').update({ charter_status: 'em_aprovacao' }).eq('id', projectId);

    // É esta chamada que faz o aviso existir — sem ela, o participante ficaria
    // "notificado" no papel e ninguém saberia de nada.
    const { data: notified } = await admin.rpc('notify_flow_participants', { _flow_id: flow.id });

    return NextResponse.json({ flowId: flow.id, notified: notified ?? 0 });
  }

  // --------------------------------------------------------------- decidir
  if (action === 'decidir') {
    const decision = payload.decision;
    if (decision !== 'aprovado' && decision !== 'recusado') {
      return NextResponse.json({ error: 'decision inválida' }, { status: 400 });
    }

    const { data: flow } = await admin
      .from('document_flows')
      .select('id, status')
      .eq('charter_project_id', projectId)
      .eq('status', 'circulando')
      .maybeSingle();
    if (!flow) return NextResponse.json({ error: 'Não há TAP circulando para este projeto.' }, { status: 404 });

    // Só quem foi designado decide. Esta é a mudança central: antes qualquer
    // gestor da organização aprovava o TAP de qualquer projeto.
    const { data: mine } = await admin
      .from('document_participants')
      .select('id, status')
      .eq('flow_id', flow.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!mine) {
      return NextResponse.json({ error: 'Você não é aprovador designado deste TAP.' }, { status: 403 });
    }
    if (mine.status === 'concluido' || mine.status === 'recusado') {
      return NextResponse.json({ error: 'Você já respondeu a este TAP.' }, { status: 409 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || null;
    const ua = request.headers.get('user-agent')?.slice(0, 300) || null;

    await admin.from('document_participants').update({
      status: decision === 'aprovado' ? 'concluido' : 'recusado',
      completed_at: new Date().toISOString(),
      refusal_reason: decision === 'recusado' ? (payload.reason ?? null) : null,
      accepted_text: decision === 'aprovado'
        ? 'Aprovo o conteúdo deste Termo de Abertura do Projeto na versão apresentada.'
        : null,
      ip, user_agent: ua,
    }).eq('id', mine.id);

    await admin.from('document_flow_events').insert({
      flow_id: flow.id, participant_id: mine.id,
      event_type: decision === 'aprovado' ? 'aprovado' : 'recusado',
      actor_id: user.id, actor_name: actorName, ip, user_agent: ua,
      detail: payload.reason ?? null,
    });

    if (decision === 'recusado') {
      await admin.from('document_flows').update({
        status: 'recusado', finished_at: new Date().toISOString(),
      }).eq('id', flow.id);
      await admin.from('projects').update({ charter_status: 'recusado' }).eq('id', projectId);
      await admin.from('project_charter_versions').insert({
        project_id: projectId, version, snapshot: charter, event: 'recusado',
        actor_id: user.id, actor_name: actorName, detail: payload.reason ?? null,
      });
      return NextResponse.json({ status: 'recusado' });
    }

    // Aprovou: só fecha o TAP quando TODOS os bloqueantes concluírem.
    const { data: pendentes } = await admin
      .from('document_participants')
      .select('id')
      .eq('flow_id', flow.id)
      .eq('is_blocking', true)
      .not('status', 'in', '("concluido","recusado")');

    if ((pendentes || []).length > 0) {
      return NextResponse.json({ status: 'em_aprovacao', pendentes: pendentes!.length });
    }

    const approvedAt = new Date().toISOString();
    await admin.from('document_flows').update({
      status: 'concluido', finished_at: approvedAt,
    }).eq('id', flow.id);

    await admin.from('projects').update({
      charter_status: 'aprovado',
      charter_data: { ...charter, approved_at: approvedAt, approved_by: user.id, approved_by_name: actorName },
    }).eq('id', projectId);

    await admin.from('project_charter_versions').insert({
      project_id: projectId, version, snapshot: charter, event: 'aprovado',
      actor_id: user.id, actor_name: actorName, detail: 'Todos os aprovadores concluíram.',
    });

    await admin.from('document_flow_events').insert({
      flow_id: flow.id, event_type: 'concluido', actor_id: user.id, actor_name: actorName,
    });

    return NextResponse.json({ status: 'aprovado' });
  }

  // --------------------------------------------------------------- reabrir
  if (action === 'reabrir') {
    if (!canManage) {
      return NextResponse.json(
        { error: 'Só o líder, o gestor do projeto ou um administrador pode reabrir o TAP.' },
        { status: 403 },
      );
    }

    // Reabrir INVALIDA a rodada e sobe a versão: uma assinatura que continua
    // valendo depois de o conteúdo mudar não prova nada. Antes reabrir apagava
    // o carimbo sem deixar rastro de que houve aprovação.
    await admin.from('document_flows').update({
      status: 'cancelado', finished_at: new Date().toISOString(),
    }).eq('charter_project_id', projectId).in('status', ['circulando']);

    await admin.from('project_charter_versions').insert({
      project_id: projectId, version, snapshot: charter, event: 'reaberto',
      actor_id: user.id, actor_name: actorName,
      detail: 'Reaberto para edição — as aprovações da versão anterior deixam de valer.',
    });

    const { approved_at, approved_by, approved_by_name, ...semCarimbo } = charter;
    await admin.from('projects').update({
      charter_status: 'rascunho',
      charter_version: version + 1,
      charter_data: semCarimbo,
    }).eq('id', projectId);

    return NextResponse.json({ status: 'rascunho', version: version + 1 });
  }

  return NextResponse.json({ error: 'action desconhecida' }, { status: 400 });
}
