import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeWhatsapp(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function createRecoveryToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createTemporaryPassword(): string {
  const bytes=crypto.getRandomValues(
    new Uint8Array(24)
  );

  return Array.from(bytes)
    .map((byte)=>byte.toString(36))
    .join("")
    .slice(0,32)
    + "!Aa9";
}

function deletedEmail(userId: string): string {
  return (
    `deleted+${userId.replace(/-/g,"")}+`
    +`${Date.now()}@deleted.cuentaspremiumbo.local`
  );
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string
) {
  for(let page=1;page<=10;page+=1){
    const {
      data,
      error
    }=await admin.auth.admin.listUsers({
      page,
      perPage:1000
    });

    if(error){
      throw error;
    }

    const match=data.users.find(
      (user)=>
        String(user.email||"")
          .trim()
          .toLowerCase()===email
    );

    if(match){
      return match;
    }

    if(data.users.length<1000){
      break;
    }
  }

  return null;
}

async function purgeDeletedUserIdentity(
  admin: ReturnType<typeof createClient>,
  userId: string,
  fallbackActorId: string
): Promise<void> {
  const tombstoneEmail=deletedEmail(userId);
  const now=new Date().toISOString();

  await admin
    .from("notification_recipients")
    .delete()
    .eq("recipient_id",userId);

  await admin
    .from("notifications")
    .update({sender_id:fallbackActorId})
    .eq("sender_id",userId);

  await admin
    .from("password_reset_requests")
    .delete()
    .or(`user_id.eq.${userId},parent_id.eq.${userId}`);

  await admin
    .from("password_change_audit")
    .delete()
    .eq("user_id",userId);

  const {
    data:avatarObjects
  }=await admin.storage
    .from("avatars")
    .list(userId,{
      limit:1000
    });

  if(avatarObjects?.length){
    await admin.storage
      .from("avatars")
      .remove(
        avatarObjects.map(
          (item)=>`${userId}/${item.name}`
        )
      );
  }

  const {
    error:authUpdateError
  }=await admin.auth.admin.updateUserById(
    userId,
    {
      email:tombstoneEmail,
      password:createTemporaryPassword(),
      email_confirm:true,
      ban_duration:"876000h",
      user_metadata:{
        deleted:true,
        deleted_at:now
      }
    }
  );

  if(
    authUpdateError
    &&!/not found/i.test(authUpdateError.message||"")
  ){
    throw authUpdateError;
  }

  const {
    error:profileUpdateError
  }=await admin
    .from("profiles")
    .update({
      full_name:"Usuario eliminado",
      business_name:null,
      email:tombstoneEmail,
      whatsapp:null,
      avatar_url:null,
      notification_settings:{
        in_app:false,
        browser:false
      },
      status:"blocked",
      parent_id:null
    })
    .eq("id",userId);

  if(profileUpdateError){
    throw profileUpdateError;
  }
}

async function clearReusableEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
  fallbackActorId: string
): Promise<void> {
  const {
    data:profile,
    error:profileLookupError
  }=await admin
    .from("profiles")
    .select("id,status")
    .eq("email",email)
    .maybeSingle();

  if(profileLookupError){
    throw profileLookupError;
  }

  if(profile?.status==="active"){
    throw new Error(
      "Ya existe un usuario activo con ese correo."
    );
  }

  if(profile?.id){
    await purgeDeletedUserIdentity(
      admin,
      profile.id,
      fallbackActorId
    );
  }

  const orphanAuthUser=
    await findAuthUserByEmail(admin,email);

  if(orphanAuthUser?.id){
    const tombstoneEmail=
      deletedEmail(orphanAuthUser.id);

    const {
      error
    }=await admin.auth.admin.updateUserById(
      orphanAuthUser.id,
      {
        email:tombstoneEmail,
        password:createTemporaryPassword(),
        email_confirm:true,
        ban_duration:"876000h",
        user_metadata:{
          deleted:true,
          deleted_at:new Date().toISOString()
        }
      }
    );

    if(error){
      throw error;
    }
  }
}


Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      return json({ error: "Falta la configuración interna." }, 500);
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await request.json();
    const action = String(body.action || "create");

    // ======================================================
    // RECUPERACIÓN PÚBLICA: PASO 1
    // ======================================================
    if (action === "validate_password_recovery") {
      const email = String(body.email || "").trim().toLowerCase();
      const superiorWhatsapp = normalizeWhatsapp(body.superior_whatsapp);

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "El correo no es válido." }, 400);
      }

      if (superiorWhatsapp.length < 8 || superiorWhatsapp.length > 15) {
        return json({ error: "El WhatsApp del superior no es válido." }, 400);
      }

      const { data: target } = await admin
        .from("profiles")
        .select(
          "id,full_name,business_name,email,parent_id,role,status"
        )
        .eq("email", email)
        .eq("role", "reseller")
        .eq("status", "active")
        .maybeSingle();

      if (!target?.parent_id) {
        return json({
          error:
            "Los datos no coinciden con un distribuidor activo y su superior.",
        }, 400);
      }

      const { data: parent } = await admin
        .from("profiles")
        .select("id,whatsapp,status")
        .eq("id", target.parent_id)
        .maybeSingle();

      if (
        !parent ||
        parent.status !== "active" ||
        normalizeWhatsapp(parent.whatsapp) !== superiorWhatsapp
      ) {
        return json({
          error:
            "Los datos no coinciden con un distribuidor activo y su superior.",
        }, 400);
      }

      const fifteenMinutesAgo = new Date(
        Date.now() - 15 * 60 * 1000
      ).toISOString();

      const { count } = await admin
        .from("password_reset_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", target.id)
        .gte("created_at", fifteenMinutesAgo);

      if ((count || 0) >= 5) {
        return json({
          error:
            "Se realizaron demasiados intentos. Espera 15 minutos y vuelve a intentar.",
        }, 429);
      }

      const recoveryToken = createRecoveryToken();
      const tokenHash = await sha256(recoveryToken);
      const expiresAt = new Date(
        Date.now() + 10 * 60 * 1000
      ).toISOString();

      await admin
        .from("password_reset_requests")
        .delete()
        .eq("user_id", target.id)
        .is("used_at", null);

      const { error: insertError } = await admin
        .from("password_reset_requests")
        .insert({
          user_id: target.id,
          parent_id: parent.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
        });

      if (insertError) {
        return json({
          error: "No se pudo iniciar la recuperación.",
        }, 500);
      }

      return json({
        success: true,
        recovery_token: recoveryToken,
        commercial_name:
          target.business_name ||
          target.full_name ||
          "Distribuidor",
        expires_in_seconds: 600,
      });
    }

    // ======================================================
    // RECUPERACIÓN PÚBLICA: PASO 2
    // ======================================================
    if (action === "confirm_password_recovery") {
      const recoveryToken = String(
        body.recovery_token || ""
      ).trim();

      const newPassword = String(body.new_password || "");

      if (!recoveryToken) {
        return json({
          error: "La validación venció. Inicia nuevamente.",
        }, 400);
      }

      if (newPassword.length < 8) {
        return json({
          error: "La contraseña debe tener al menos 8 caracteres.",
        }, 400);
      }

      const tokenHash = await sha256(recoveryToken);

      const { data: resetRequest } = await admin
        .from("password_reset_requests")
        .select("id,user_id,parent_id,expires_at,used_at")
        .eq("token_hash", tokenHash)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!resetRequest) {
        return json({
          error:
            "La validación ya fue utilizada o venció. Inicia nuevamente.",
        }, 400);
      }

      const { data: target } = await admin
        .from("profiles")
        .select("id,full_name,business_name,email,status")
        .eq("id", resetRequest.user_id)
        .eq("role", "reseller")
        .maybeSingle();

      if (!target || target.status !== "active") {
        return json({
          error: "El usuario ya no está activo.",
        }, 400);
      }

      const { error: updatePasswordError } =
        await admin.auth.admin.updateUserById(
          target.id,
          {
            password:newPassword,
            email_confirm:true,
            ban_duration:"none"
          }
        );

      if (updatePasswordError) {
        return json({
          error:
            updatePasswordError.message ||
            "No se pudo actualizar la contraseña.",
        }, 400);
      }

      await admin
        .from("password_reset_requests")
        .update({ used_at: new Date().toISOString() })
        .eq("id", resetRequest.id);

      await admin
        .from("password_change_audit")
        .insert({
          user_id: target.id,
          parent_id: resetRequest.parent_id,
          change_source: "parent_whatsapp_recovery",
        });

      const {
        data:parentProfile
      }=await admin
        .from("profiles")
        .select(
          "id,full_name,business_name,email,status"
        )
        .eq("id",resetRequest.parent_id)
        .maybeSingle();

      const {
        data:admins
      }=await admin
        .from("profiles")
        .select("id")
        .eq("role","admin")
        .eq("status","active");

      const adminIds=(admins||[])
        .map((item)=>item.id);

      const senderId=
        parentProfile?.id
        ||adminIds[0]
        ||resetRequest.parent_id;

      const displayName=
        target.business_name
        ||target.full_name
        ||target.email;

      const parentName=
        parentProfile?.business_name
        ||parentProfile?.full_name
        ||parentProfile?.email
        ||"Sin superior";

      const {
        data:notification,
        error:notificationError
      }=await admin
        .from("notifications")
        .insert({
          sender_id:senderId,
          title:"Contraseña actualizada",
          message:
            `${displayName} / ${parentName} cambió su clave `+
            "mediante la recuperación validada con el WhatsApp de su superior. "+
            "La nueva contraseña no se almacena ni se muestra."
        })
        .select("id")
        .single();

      if(notificationError){
        console.error(
          "No se pudo crear la notificación:",
          notificationError
        );
      }

      if(notification?.id){
        const recipientIds=[
          ...new Set([
            ...adminIds,
            resetRequest.parent_id
          ].filter(Boolean))
        ];

        if(recipientIds.length){
          const {
            error:recipientError
          }=await admin
            .from("notification_recipients")
            .upsert(
              recipientIds.map((recipientId)=>({
                notification_id:notification.id,
                recipient_id:recipientId
              })),
              {
                onConflict:
                  "notification_id,recipient_id",
                ignoreDuplicates:true
              }
            );

          if(recipientError){
            console.error(
              "No se pudieron registrar destinatarios:",
              recipientError
            );
          }
        }
      }

      return json({
        success: true,
        message:
          "Contraseña actualizada. Ya puedes iniciar sesión.",
      });
    }

    // ======================================================
    // DESDE AQUÍ, LAS ACCIONES REQUIEREN SESIÓN
    // ======================================================
    const auth = request.headers.get("Authorization");

    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Debes iniciar sesión." }, 401);
    }

    const {
      data: { user: caller },
      error: authError,
    } = await admin.auth.getUser(
      auth.slice(7).trim()
    );

    if (authError || !caller) {
      return json({
        error: "La sesión no es válida o venció.",
      }, 401);
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id,full_name,role,status")
      .eq("id", caller.id)
      .single();

    if (!callerProfile) {
      return json({ error: "No se encontró el perfil." }, 403);
    }

    if (callerProfile.status !== "active") {
      return json({
        error: "Tu usuario está inactivo o eliminado.",
      }, 403);
    }

    // ======================================================
    // CREAR DISTRIBUIDOR O SOPORTE
    // ======================================================
    if (action === "create") {
      if (!["admin", "reseller"].includes(callerProfile.role)) {
        return json({
          error: "No tienes permiso para crear usuarios.",
        }, 403);
      }

      const fullName = String(body.full_name || "").trim();
      const businessName = String(
        body.business_name || ""
      ).trim();
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const password = String(body.password || "");
      const whatsapp = normalizeWhatsapp(body.whatsapp);

      let role =
        body.role === "support"
          ? "support"
          : "reseller";

      if (callerProfile.role === "reseller") {
        role = "reseller";
      }

      if (
        role === "support" &&
        callerProfile.role !== "admin"
      ) {
        return json({
          error:
            "Solo el administrador puede crear personal de soporte.",
        }, 403);
      }

      if (fullName.length < 3) {
        return json({
          error:
            "El nombre debe tener al menos 3 caracteres.",
        }, 400);
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "El correo no es válido." }, 400);
      }

      if (password.length < 8) {
        return json({
          error:
            "La contraseña debe tener al menos 8 caracteres.",
        }, 400);
      }

      if (whatsapp.length < 8 || whatsapp.length > 15) {
        return json({
          error: "El WhatsApp no es válido.",
        }, 400);
      }

      try{
        await clearReusableEmail(
          admin,
          email,
          caller.id
        );
      }catch(error){
        return json({
          error:
            error instanceof Error
              ?error.message
              :"No se pudo preparar el correo."
        },409);
      }

      const { data: authData, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
          },
        });

      if (createError || !authData.user) {
        return json({
          error:
            createError?.message ||
            "No se pudo crear el acceso.",
        }, 400);
      }

      const userId = authData.user.id;
      const parentId =
        role === "reseller"
          ? caller.id
          : null;

      const { data: profile, error: profileError } =
        await admin
          .from("profiles")
          .update({
            full_name: fullName,
            business_name:
              role === "reseller"
                ? businessName || null
                : null,
            email,
            whatsapp,
            role,
            status: "active",
            parent_id: parentId,
            created_by: caller.id,
          })
          .eq("id", userId)
          .select(
            "id,full_name,email,whatsapp,role,status,parent_id,business_name"
          )
          .single();

      if (profileError || !profile) {
        await admin.auth.admin.deleteUser(userId);

        return json({
          error:
            profileError?.message ||
            "No se pudo completar el perfil.",
        }, 500);
      }

      return json({
        success: true,
        message:
          role === "support"
            ? "Personal de soporte creado correctamente."
            : "Distribuidor creado correctamente.",
        user: profile,
      }, 201);
    }

    // ======================================================
    // ACTUALIZAR O ELIMINAR
    // ======================================================
    const userId = String(body.user_id || "");

    if (!userId) {
      return json({ error: "Falta el usuario." }, 400);
    }

    const { data: target } = await admin
      .from("profiles")
      .select(
        "id,full_name,email,role,status,parent_id,business_name"
      )
      .eq("id", userId)
      .single();

    if (!target) {
      return json({ error: "El usuario no existe." }, 404);
    }

    const isAdmin = callerProfile.role === "admin";
    const isDirectParent =
      callerProfile.role === "reseller" &&
      target.parent_id === caller.id &&
      target.role === "reseller";

    if (!isAdmin && !isDirectParent) {
      return json({
        error:
          "No tienes permiso para modificar ese usuario.",
      }, 403);
    }

    if (
      target.role === "support" &&
      callerProfile.role !== "admin"
    ) {
      return json({
        error:
          "Solo el administrador puede modificar personal de soporte.",
      }, 403);
    }

    if (action === "update") {
      const fullName = String(
        body.full_name || target.full_name
      ).trim();

      const businessName = String(
        body.business_name || ""
      ).trim();

      const email = String(
        body.email || target.email
      ).trim().toLowerCase();

      const whatsapp = normalizeWhatsapp(body.whatsapp);
      const password = String(body.password || "");

      if (fullName.length < 3) {
        return json({
          error:
            "El nombre debe tener al menos 3 caracteres.",
        }, 400);
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "El correo no es válido." }, 400);
      }

      if (password && password.length < 8) {
        return json({
          error:
            "La nueva contraseña debe tener al menos 8 caracteres.",
        }, 400);
      }

      if (whatsapp.length < 8 || whatsapp.length > 15) {
        return json({
          error: "El WhatsApp no es válido.",
        }, 400);
      }

      const authUpdates: Record<string, unknown> = {
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      };

      if (password) {
        authUpdates.password = password;
      }

      const { error: updateAuthError } =
        await admin.auth.admin.updateUserById(
          userId,
          authUpdates
        );

      if (updateAuthError) {
        return json({
          error: updateAuthError.message,
        }, 400);
      }

      const { data: profile, error: profileError } =
        await admin
          .from("profiles")
          .update({
            full_name: fullName,
            business_name:
              target.role === "reseller"
                ? businessName || null
                : null,
            email,
            whatsapp,
          })
          .eq("id", userId)
          .select(
            "id,full_name,email,whatsapp,role,status,parent_id,business_name"
          )
          .single();

      if (profileError) {
        return json({
          error: profileError.message,
        }, 500);
      }

      return json({
        success: true,
        message:
          target.role === "support"
            ? "Personal de soporte actualizado correctamente."
            : "Distribuidor actualizado correctamente.",
        user: profile,
      });
    }

    if (action === "delete") {
      if(target.role==="support"){
        try{
          await purgeDeletedUserIdentity(
            admin,
            userId,
            caller.id
          );
        }catch(error){
          return json({
            error:
              error instanceof Error
                ?error.message
                :"No se pudo eliminar el usuario."
          },500);
        }

        return json({
          success:true,
          message:
            "Usuario de soporte eliminado. Sus datos personales fueron retirados y su correo puede utilizarse nuevamente.",
          deleted_users:1,
          returned_accounts:0
        });
      }

      const { data: branchResult, error: branchError } =
        await admin.rpc(
          "return_deleted_reseller_accounts",
          {
            p_reseller_id: userId,
            p_actor_id: caller.id,
          }
        );

      if (branchError) {
        return json({
          error:
            branchError.message ||
            "No se pudo eliminar la rama del distribuidor.",
        }, 400);
      }

      const deletedUserIds = Array.isArray(
        branchResult?.deleted_user_ids
      )
        ? branchResult.deleted_user_ids
        : [userId];

      const purgeErrors:string[]=[];

      for(const deletedUserId of deletedUserIds){
        try{
          await purgeDeletedUserIdentity(
            admin,
            String(deletedUserId),
            caller.id
          );
        }catch(error){
          purgeErrors.push(
            `${deletedUserId}: ${
              error instanceof Error
                ?error.message
                :String(error)
            }`
          );
        }
      }

      if(purgeErrors.length){
        console.error(
          "No se pudieron retirar todos los datos:",
          purgeErrors
        );

        return json({
          error:
            "Las cuentas fueron devueltas, pero algunos usuarios no pudieron eliminarse por completo.",
          details:purgeErrors
        },500);
      }

      const deletedCount = Number(
        branchResult?.deleted_count || deletedUserIds.length
      );

      const returnedAccounts = Number(
        branchResult?.total_returned || 0
      );

      const returnedToBase = Number(
        branchResult?.returned_to_base || 0
      );

      const destinationText =
        returnedToBase > 0
          ? "volvieron a la base central"
          : "volvieron al superior de la rama";

      return json({
        success: true,
        deleted_users: deletedCount,
        returned_accounts: returnedAccounts,
        message:
          `Rama eliminada completamente. ${deletedCount} usuario(s) fueron retirados `+
          `y dejaron de aparecer en Usuarios. ${returnedAccounts} cuenta(s) `+
          `${destinationText}. Los correos eliminados pueden utilizarse nuevamente.`,
      });
    }

    return json({
      error: "Acción no reconocida.",
    }, 400);
  } catch (error) {
    console.error(error);

    return json({
      error: "Ocurrió un error interno.",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    }, 500);
  }
});
