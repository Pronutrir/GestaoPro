import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTemporaryPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomBytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function OPTIONS() {
  return new NextResponse("ok", { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
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

  // Check admin or gestor role
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "gestor"])
    .limit(1)
    .maybeSingle();

  if (!roleData) {
    return NextResponse.json(
      { error: "Sem permissão de administrador ou gestor" },
      { status: 403, headers: corsHeaders }
    );
  }

  try {
    const { email, password, full_name, sector, role_title, role } = await req.json();

    const temporaryPassword =
      typeof password === "string" && password.trim().length >= 8
        ? password.trim()
        : generateTemporaryPassword();

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { role: "authenticated" },
      user_metadata: { full_name },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400, headers: corsHeaders });
    }

    await adminClient.from("profiles").insert({
      id: newUser.user.id,
      email,
      full_name,
      sector,
      role_title,
    });

    await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role: role || "user",
    });

    return NextResponse.json(
      { user: newUser.user, temporary_password: temporaryPassword },
      { headers: corsHeaders }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
