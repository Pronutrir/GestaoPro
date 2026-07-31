import { NextResponse } from 'next/server';
import { createClient } from '@/integrations/supabase/server';

/**
 * ORIGEM DO ACESSO para a trilha de auditoria dos documentos.
 *
 * O painel de assinatura promete "registra data, hora e origem do acesso", mas
 * o IP saía sempre vazio: o navegador não conhece o próprio endereço público, e
 * o insert era feito direto do browser. Só o servidor sabe.
 *
 * Vale para a prova porque o cliente não escolhe o valor — ele pergunta, e quem
 * responde é o servidor, lendo o cabeçalho que o proxy escreveu.
 */
export async function GET(request: Request) {
  // Exige sessão: sem isso vira um "qual é o meu IP" aberto na internet.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const h = request.headers;

  // x-forwarded-for acumula a cadeia de proxies ("cliente, proxy1, proxy2").
  // O primeiro é o cliente original; os demais são infraestrutura.
  const forwarded = h.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    null;

  return NextResponse.json({
    ip,
    userAgent: h.get('user-agent') ?? null,
  });
}
