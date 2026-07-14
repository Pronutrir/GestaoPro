import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerUrl } from "@/integrations/supabase/config";

// Origem permitida para CORS. O app é same-origin (chamadas via fetch relativo),
// então restringimos ao domínio público em vez de "*". Configurável via
// ALLOWED_ORIGIN; fallback para a URL pública do Supabase (mesmo domínio do app).
const allowedOrigin =
  process.env.ALLOWED_ORIGIN || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function OPTIONS() {
  return new NextResponse("ok", { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const supabaseUrl = getSupabaseServerUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: corsHeaders });
  }

  // Verify calling user
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers: corsHeaders });
  }

  // Check admin role
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    return NextResponse.json(
      { error: "Sem permissão de administrador" },
      { status: 403, headers: corsHeaders }
    );
  }

  try {
    const {
      target_user_id,
      full_name,
      sector,
      role_title,
      role,
      new_password,
      new_email,
      avatar_url,
      action,
    } = await req.json();

    if (!target_user_id) {
      return NextResponse.json({ error: "target_user_id é obrigatório" }, { status: 400, headers: corsHeaders });
    }

    if (action === "ban") {
      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "876600h",
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
      await adminClient.from("profiles").update({ is_active: false }).eq("id", target_user_id);
      return NextResponse.json({ success: true, action: "banned" }, { headers: corsHeaders });
    }

    if (action === "unban") {
      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "none",
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
      await adminClient.from("profiles").update({ is_active: true }).eq("id", target_user_id);
      return NextResponse.json({ success: true, action: "unbanned" }, { headers: corsHeaders });
    }

    if (action === "delete") {
      const { error: roleDeleteError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", target_user_id);
      if (roleDeleteError) return NextResponse.json({ error: roleDeleteError.message }, { status: 400, headers: corsHeaders });

      const { error: profileDeleteError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", target_user_id);
      if (profileDeleteError) return NextResponse.json({ error: profileDeleteError.message }, { status: 400, headers: corsHeaders });

      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(target_user_id);
      if (authDeleteError) return NextResponse.json({ error: authDeleteError.message }, { status: 400, headers: corsHeaders });

      return NextResponse.json({ success: true, action: "deleted" }, { headers: corsHeaders });
    }

    // Profile update
    const profileUpdate: Record<string, string> = {};
    if (full_name !== undefined) profileUpdate.full_name = full_name;
    if (sector !== undefined) profileUpdate.sector = sector;
    if (role_title !== undefined) profileUpdate.role_title = role_title;
    if (avatar_url !== undefined) profileUpdate.avatar_url = avatar_url;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await adminClient
        .from("profiles")
        .update(profileUpdate)
        .eq("id", target_user_id);
      if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400, headers: corsHeaders });
    }

    if (role) {
      const { error: delRoleError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", target_user_id);
      if (delRoleError) return NextResponse.json({ error: delRoleError.message }, { status: 400, headers: corsHeaders });

      const { error: insRoleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: target_user_id, role });
      if (insRoleError) {
        console.error("[update-user] insert user_roles failed:", { target_user_id, role, error: insRoleError });
        return NextResponse.json({ error: insRoleError.message }, { status: 400, headers: corsHeaders });
      }
    }

    if (new_password) {
      const { error: pwError } = await adminClient.auth.admin.updateUserById(target_user_id, {
        password: new_password,
      });
      if (pwError) return NextResponse.json({ error: pwError.message }, { status: 400, headers: corsHeaders });
    }

    if (new_email) {
      const { error: emailError } = await adminClient.auth.admin.updateUserById(target_user_id, {
        email: new_email,
        email_confirm: true,
      });
      if (emailError) return NextResponse.json({ error: emailError.message }, { status: 400, headers: corsHeaders });

      await adminClient.from("profiles").update({ email: new_email }).eq("id", target_user_id);
    }

    if (full_name !== undefined) {
      await adminClient.auth.admin.updateUserById(target_user_id, {
        user_metadata: { full_name },
      });
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
