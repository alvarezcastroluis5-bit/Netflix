import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AllowedRole = "support" | "reseller";

interface CreateUserBody {
  full_name: string;
  email: string;
  password: string;
  whatsapp: string;
  role?: AllowedRole;
  business_name?: string;
}

function responseJson(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return responseJson({ error: "Método no permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return responseJson(
        { error: "Falta la configuración interna de la función." },
        500,
      );
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return responseJson(
        { error: "Debes iniciar sesión para crear usuarios." },
        401,
      );
    }

    const accessToken = authorization.slice(7).trim();

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user: caller },
      error: callerAuthError,
    } = await adminClient.auth.getUser(accessToken);

    if (callerAuthError || !caller) {
      return responseJson(
        { error: "La sesión no es válida o ha vencido." },
        401,
      );
    }

    const { data: callerProfile, error: callerProfileError } =
      await adminClient
        .from("profiles")
        .select("id, full_name, role, status")
        .eq("id", caller.id)
        .single();

    if (callerProfileError || !callerProfile) {
      return responseJson(
        { error: "No se encontró el perfil del usuario conectado." },
        403,
      );
    }

    if (callerProfile.status !== "active") {
      return responseJson(
        { error: "Tu usuario está inactivo o bloqueado." },
        403,
      );
    }

    if (!["admin", "reseller"].includes(callerProfile.role)) {
      return responseJson(
        { error: "Tu usuario no tiene permiso para crear usuarios." },
        403,
      );
    }

    let body: CreateUserBody;

    try {
      body = await req.json();
    } catch {
      return responseJson({ error: "Los datos enviados no son válidos." }, 400);
    }

    const fullName = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const whatsapp = String(body.whatsapp ?? "").replace(/\D/g, "");
    const businessName = String(body.business_name ?? "").trim();

    let requestedRole: AllowedRole =
      body.role === "support" ? "support" : "reseller";

    if (callerProfile.role === "reseller") {
      requestedRole = "reseller";
    }

    if (fullName.length < 3) {
      return responseJson(
        { error: "El nombre debe tener al menos 3 caracteres." },
        400,
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responseJson({ error: "El correo no es válido." }, 400);
    }

    if (password.length < 8) {
      return responseJson(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        400,
      );
    }

    if (whatsapp.length < 8 || whatsapp.length > 15) {
      return responseJson(
        {
          error:
            "El WhatsApp debe incluir el código de país y contener solo números.",
        },
        400,
      );
    }

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile) {
      return responseJson(
        { error: "Ya existe un usuario con ese correo." },
        409,
      );
    }

    const {
      data: authResult,
      error: createAuthError,
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createAuthError || !authResult.user) {
      return responseJson(
        {
          error:
            createAuthError?.message ||
            "No se pudo crear el acceso del usuario.",
        },
        400,
      );
    }

    const newUserId = authResult.user.id;
    const parentId = requestedRole === "reseller" ? caller.id : null;

    const { data: savedProfile, error: saveProfileError } =
      await adminClient
        .from("profiles")
        .update({
          full_name: fullName,
          email,
          whatsapp,
          role: requestedRole,
          status: "active",
          parent_id: parentId,
          created_by: caller.id,
          business_name: businessName || null,
        })
        .eq("id", newUserId)
        .select(
          "id, full_name, email, whatsapp, role, status, parent_id, business_name, created_at",
        )
        .single();

    if (saveProfileError || !savedProfile) {
      await adminClient.auth.admin.deleteUser(newUserId);

      return responseJson(
        {
          error: "No se pudo completar el perfil del usuario.",
          details: saveProfileError?.message,
        },
        500,
      );
    }

    await adminClient.from("audit_logs").insert({
      actor_id: caller.id,
      action: "crear_usuario",
      entity_type: "profile",
      entity_id: newUserId,
      details: {
        full_name: fullName,
        email,
        role: requestedRole,
        parent_id: parentId,
      },
    });

    return responseJson(
      {
        success: true,
        message:
          requestedRole === "support"
            ? "Personal de soporte creado correctamente."
            : "Revendedor creado correctamente.",
        user: savedProfile,
      },
      201,
    );
  } catch (error) {
    console.error("crear usuario:", error);

    return responseJson(
      {
        error: "Ocurrió un error interno al crear el usuario.",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
