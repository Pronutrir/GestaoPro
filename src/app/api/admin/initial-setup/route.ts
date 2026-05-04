import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const enabled = process.env.INITIAL_SETUP_ENABLED === "true";
  if (!enabled) {
    return NextResponse.json({ error: "Setup inicial desabilitado" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Bloquear se já existe admin
    const { data: existingAdmins } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (existingAdmins && existingAdmins.length > 0) {
      return NextResponse.json({ error: "Admin já existe" }, { status: 400 });
    }

    const { email, password, full_name } = await req.json();

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "authenticated" },
      user_metadata: { full_name },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    await adminClient.from("profiles").insert({
      id: newUser.user.id,
      email,
      full_name,
    });

    await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "admin",
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
