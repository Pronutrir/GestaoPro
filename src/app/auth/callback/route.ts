import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseServerUrl, SUPABASE_COOKIE_NAME } from '@/integrations/supabase/config';

/**
 * Callback OAuth (Azure AD).
 * GoTrue redireciona aqui após o login no Microsoft com `?code=...`.
 * Trocamos o code por uma sessão (cookies httpOnly) e redirecionamos.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Quando o app roda atrás de um reverse proxy (NPM/nginx), `request.nextUrl.origin`
  // pode retornar o host interno do container (ex.: https://0.0.0.0:8080). Para
  // redirecionar de volta para o domínio público, usamos os headers do proxy.
  const fwdHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const fwdProto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  const origin =
    fwdHost && fwdProto ? `${fwdProto}://${fwdHost}` : request.nextUrl.origin;

  // Envolve toda a lógica em try/catch para garantir que NUNCA retornemos
  // 502 (exceção não tratada) — sempre redirecionar para /login com mensagem.
  try {
    if (error) {
      const url = new URL('/login', origin);
      url.searchParams.set('error', errorDescription ?? error);
      return NextResponse.redirect(url);
    }

    if (!code) {
      return NextResponse.redirect(new URL('/login?error=missing_code', origin));
    }

    let response = NextResponse.redirect(new URL(next, origin));

    const supabase = createServerClient(
      getSupabaseServerUrl(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: { name: SUPABASE_COOKIE_NAME },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const url = new URL('/login', origin);
      url.searchParams.set('error', exchangeError.message);
      return NextResponse.redirect(url);
    }

    // Verifica se o profile está ativo
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (profile && profile.is_active === false) {
        return NextResponse.redirect(new URL('/pending-approval', origin));
      }
    }

    return response;
  } catch (e) {
    console.error('[auth/callback] exceção não tratada:', e);
    const url = new URL('/login', origin);
    url.searchParams.set(
      'error',
      e instanceof Error ? `callback_exception: ${e.message}` : 'callback_exception'
    );
    return NextResponse.redirect(url);
  }
}
