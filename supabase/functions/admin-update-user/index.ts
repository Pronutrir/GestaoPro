import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const decodeJwtPayload = (token: string): { sub?: string; exp?: number } | null => {
  try {
    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;

    const normalized = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Não autenticado" }, 401);
    }

    const accessToken = authHeader.slice(7).trim();
    const payload = decodeJwtPayload(accessToken);
    const requesterUserId = payload?.sub;

    if (!requesterUserId) {
      return jsonResponse({ error: "Token inválido" }, 401);
    }

    if (payload?.exp && payload.exp * 1000 < Date.now()) {
      return jsonResponse({ error: "Sessão expirada" }, 401);
    }

    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requesterUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      console.error("Erro ao validar papel admin:", roleError);
      return jsonResponse({ error: "Falha ao validar permissões" }, 500);
    }

    if (!roleData) {
      return jsonResponse({ error: "Sem permissão de administrador" }, 403);
    }

    const { target_user_id, full_name, sector, role_title, role, new_password, avatar_url, action } = await req.json();

    if (!target_user_id) {
      return jsonResponse({ error: "target_user_id é obrigatório" }, 400);
    }

    if (action === "ban") {
      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "876600h",
      });
      if (error) return jsonResponse({ error: error.message }, 400);
      await adminClient.from("profiles").update({ is_active: false }).eq("id", target_user_id);
      return jsonResponse({ success: true, action: "banned" });
    }

    if (action === "unban") {
      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "none",
      });
      if (error) return jsonResponse({ error: error.message }, 400);
      await adminClient.from("profiles").update({ is_active: true }).eq("id", target_user_id);
      return jsonResponse({ success: true, action: "unbanned" });
    }

    if (action === "delete") {
      const { error: roleDeleteError } = await adminClient.from("user_roles").delete().eq("user_id", target_user_id);
      if (roleDeleteError) {
        console.error("Erro ao remover papel:", roleDeleteError);
        return jsonResponse({ error: roleDeleteError.message }, 400);
      }

      const { error: profileDeleteError } = await adminClient.from("profiles").delete().eq("id", target_user_id);
      if (profileDeleteError) {
        console.error("Erro ao remover perfil:", profileDeleteError);
        return jsonResponse({ error: profileDeleteError.message }, 400);
      }

      const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(target_user_id);
      if (authDeleteError) {
        console.error("Erro ao remover usuário de autenticação:", authDeleteError);
        return jsonResponse({ error: authDeleteError.message }, 400);
      }

      return jsonResponse({ success: true, action: "deleted" });
    }

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

      if (profileError) return jsonResponse({ error: profileError.message }, 400);
    }

    if (role) {
      const { error: delRoleError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", target_user_id);

      if (delRoleError) {
        console.error("Erro ao remover papel antigo:", delRoleError);
        return jsonResponse({ error: delRoleError.message }, 400);
      }

      const { error: insRoleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: target_user_id, role });

      if (insRoleError) {
        console.error("Erro ao inserir novo papel:", insRoleError);
        return jsonResponse({ error: insRoleError.message }, 400);
      }
    }

    if (new_password) {
      const { error: pwError } = await adminClient.auth.admin.updateUserById(target_user_id, {
        password: new_password,
      });
      if (pwError) return jsonResponse({ error: pwError.message }, 400);
    }

    if (full_name !== undefined) {
      const { error: metadataError } = await adminClient.auth.admin.updateUserById(target_user_id, {
        user_metadata: { full_name },
      });

      if (metadataError) {
        console.error("Erro ao atualizar metadados do usuário:", metadataError);
        return jsonResponse({ error: metadataError.message }, 400);
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Erro inesperado em admin-update-user:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
