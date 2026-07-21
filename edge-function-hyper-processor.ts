import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Falta la configuración interna." }, 500);

    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Debes iniciar sesión." }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: authError } = await admin.auth.getUser(auth.slice(7).trim());
    if (authError || !caller) return json({ error: "La sesión no es válida o venció." }, 401);

    const { data: callerProfile, error: callerProfileError } = await admin
      .from("profiles").select("id,full_name,role,status").eq("id", caller.id).single();
    if (callerProfileError || !callerProfile) return json({ error: "No se encontró el perfil." }, 403);
    if (callerProfile.status !== "active") return json({ error: "Tu usuario está inactivo o eliminado." }, 403);

    const body = await request.json();
    const action = body.action || "create";

    if (action === "create") {
      if (!["admin", "reseller"].includes(callerProfile.role)) return json({ error: "No tienes permiso para crear distribuidores." }, 403);
      const fullName = String(body.full_name || "").trim();
      const businessName = String(body.business_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const whatsapp = String(body.whatsapp || "").replace(/\D/g, "");
      let role = body.role === "support" ? "support" : "reseller";
      if (callerProfile.role === "reseller") role = "reseller";

      if (fullName.length < 3) return json({ error: "El nombre debe tener al menos 3 caracteres." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "El correo no es válido." }, 400);
      if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      if (whatsapp.length < 8 || whatsapp.length > 15) return json({ error: "El WhatsApp no es válido." }, 400);

      const { data: exists } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
      if (exists) return json({ error: "Ya existe un usuario con ese correo." }, 409);

      const { data: authData, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (createError || !authData.user) return json({ error: createError?.message || "No se pudo crear el acceso." }, 400);

      const userId = authData.user.id;
      const parentId = role === "reseller" ? caller.id : null;
      const { data: profile, error: profileError } = await admin.from("profiles").update({
        full_name: fullName, business_name: businessName || null, email, whatsapp,
        role, status: "active", parent_id: parentId, created_by: caller.id,
      }).eq("id", userId).select("id,full_name,email,whatsapp,role,status,parent_id,business_name").single();

      if (profileError || !profile) {
        await admin.auth.admin.deleteUser(userId);
        return json({ error: profileError?.message || "No se pudo completar el perfil." }, 500);
      }
      return json({ success: true, message: role === "support" ? "Soporte creado correctamente." : "Distribuidor creado correctamente.", user: profile }, 201);
    }

    const userId = String(body.user_id || "");
    if (!userId) return json({ error: "Falta el usuario." }, 400);
    const { data: target, error: targetError } = await admin.from("profiles").select("id,full_name,email,role,status,parent_id").eq("id", userId).single();
    if (targetError || !target) return json({ error: "El distribuidor no existe." }, 404);

    const isAdmin = callerProfile.role === "admin";
    const isDirectParent = callerProfile.role === "reseller" && target.parent_id === caller.id && target.role === "reseller";
    if (!isAdmin && !isDirectParent) return json({ error: "No tienes permiso para modificar ese distribuidor." }, 403);

    if (action === "update") {
      const fullName = String(body.full_name || target.full_name).trim();
      const businessName = String(body.business_name || "").trim();
      const email = String(body.email || target.email).trim().toLowerCase();
      const whatsapp = String(body.whatsapp || "").replace(/\D/g, "");
      const password = String(body.password || "");
      if (fullName.length < 3) return json({ error: "El nombre debe tener al menos 3 caracteres." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "El correo no es válido." }, 400);
      if (password && password.length < 8) return json({ error: "La nueva contraseña debe tener al menos 8 caracteres." }, 400);

      const updates: Record<string, unknown> = { email, email_confirm: true, user_metadata: { full_name: fullName } };
      if (password) updates.password = password;
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(userId, updates);
      if (updateAuthError) return json({ error: updateAuthError.message }, 400);

      const { data: profile, error: profileError } = await admin.from("profiles").update({
        full_name: fullName, business_name: businessName || null, email, whatsapp: whatsapp || null,
      }).eq("id", userId).select("id,full_name,email,whatsapp,role,status,parent_id,business_name").single();
      if (profileError) return json({ error: profileError.message }, 500);
      return json({ success: true, message: "Distribuidor actualizado correctamente.", user: profile });
    }

    if (action === "delete") {
      const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (banError) return json({ error: banError.message }, 400);
      const { error: blockError } = await admin.from("profiles").update({ status: "blocked" }).eq("id", userId);
      if (blockError) return json({ error: blockError.message }, 500);
      return json({ success: true, message: "Distribuidor eliminado. Su historial se conservó y ya no puede iniciar sesión." });
    }

    return json({ error: "Acción no reconocida." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Ocurrió un error interno.", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
