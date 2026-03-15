import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization")!;
    const anonKey = req.headers.get("apikey")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Sem permissão de administrador" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id, full_name, sector, role_title, role, new_password, avatar_url, action } = await req.json();

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle special actions
    if (action === "ban") {
      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "876600h", // ~100 years
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, action: "banned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unban") {
      const { error } = await adminClient.auth.admin.updateUserById(target_user_id, {
        ban_duration: "none",
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, action: "unbanned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      // Delete profile, roles, then auth user
      await adminClient.from("user_roles").delete().eq("user_id", target_user_id);
      await adminClient.from("profiles").delete().eq("id", target_user_id);
      const { error } = await adminClient.auth.admin.deleteUser(target_user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, action: "deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile
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
      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update role if provided
    if (role) {
      const { error: delRoleError } = await adminClient.from("user_roles").delete().eq("user_id", target_user_id);
      if (delRoleError) {
        console.error("Error deleting old role:", delRoleError);
        return new Response(JSON.stringify({ error: delRoleError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: insRoleError } = await adminClient.from("user_roles").insert({ user_id: target_user_id, role });
      if (insRoleError) {
        console.error("Error inserting new role:", insRoleError);
        return new Response(JSON.stringify({ error: insRoleError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update password if provided
    if (new_password) {
      const { error: pwError } = await adminClient.auth.admin.updateUserById(target_user_id, {
        password: new_password,
      });
      if (pwError) {
        return new Response(JSON.stringify({ error: pwError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update user metadata (name) in auth
    if (full_name !== undefined) {
      await adminClient.auth.admin.updateUserById(target_user_id, {
        user_metadata: { full_name },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
