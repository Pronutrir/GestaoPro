import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // O callback OAuth precisa rodar sem nenhuma chamada do middleware ao Supabase.
  // Cookies parciais do PKCE (vindos do redirect cross-site da Microsoft) podem
  // fazer `auth.getUser()` lançar e o NPM reportar como 502 Bad Gateway.
  if (pathname.startsWith('/auth/callback')) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const initialSetupEnabled = process.env.NEXT_PUBLIC_ENABLE_INITIAL_SETUP === 'true';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Em ambientes sem .env (ex.: preview local), evita crash e mantém
  // apenas as rotas públicas acessíveis.
  if (!supabaseUrl || !supabaseAnonKey) {
    const isPublicPath =
      pathname === '/login' ||
      pathname === '/pending-approval' ||
      (pathname === '/setup' && initialSetupEnabled);

    if (!isPublicPath) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next({ request });
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession() evita validação remota do JWT em toda navegação e reduz
  // latência percebida de clique/rota. A proteção de rota segue pelo cookie
  // de sessão e pelas validações de perfil abaixo.
  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    user = (data.session?.user as { id: string } | null) ?? null;
  } catch {
    return supabaseResponse;
  }

  if (pathname === '/setup' && !initialSetupEnabled) {
    return NextResponse.redirect(new URL(user ? '/' : '/login', request.url));
  }

  const isPublicPath =
    pathname === '/login' ||
    pathname === '/pending-approval' ||
    (pathname === '/setup' && initialSetupEnabled);

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user) {
    // Bloqueia usuários inativos (ex.: novo cadastro Azure aguardando aprovação)
    if (pathname !== '/pending-approval') {
      const cachedActive = request.cookies.get('profile_active')?.value;

      if (cachedActive === '0') {
        return NextResponse.redirect(new URL('/pending-approval', request.url));
      }

      if (cachedActive !== '1') {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_active')
            .eq('id', user.id)
            .maybeSingle();

          if (profile && profile.is_active === false) {
            const redirect = NextResponse.redirect(new URL('/pending-approval', request.url));
            redirect.cookies.set('profile_active', '0', { maxAge: 120, path: '/' });
            return redirect;
          }

          // Cache curto para reduzir latência de navegação entre páginas.
          supabaseResponse.cookies.set('profile_active', '1', { maxAge: 120, path: '/' });
        } catch {
          // Falha ao buscar perfil — permite continuar, a página tratará o estado
        }
      }
    }

    if (isPublicPath && pathname !== '/pending-approval') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Exclui rotas de API (auth via Bearer token) e assets estáticos
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
