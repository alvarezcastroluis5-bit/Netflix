const createClient = globalThis.__SUPABASE_CREATE_CLIENT__;

if (typeof createClient !== "function") {
  throw new Error("El cargador de Supabase no se inició correctamente.");
}

const SUPABASE_URL = "https://rmligdfmfwpmdsllembk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ld1G5Si_wWzHK_-G-ZUBlg_KQOFO2Ov";
const USER_MANAGER_FUNCTION = "hyper-processor";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
export const normalizeService = value => String(value || "").toLowerCase() === "spotify" ? "spotify" : "netflix";
export const serviceLabel = value => normalizeService(value) === "spotify" ? "Spotify" : "Netflix";
export function serviceBadge(value) {
  if (normalizeService(value) === "spotify") return `<span class="service-badge spotify"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.58 14.43a.75.75 0 0 1-1.03.25c-2.82-1.72-6.38-2.11-10.57-1.16a.75.75 0 1 1-.33-1.46c4.58-1.04 8.51-.59 11.68 1.35.35.21.46.67.25 1.02Zm1.47-3.28a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.55-11.97-1.39a.94.94 0 1 1-.55-1.79c4.37-1.33 9.8-.69 13.5 1.58.44.27.58.85.31 1.29Zm.13-3.42C14.3 7.43 7.9 7.22 4.2 8.34a1.12 1.12 0 1 1-.65-2.14c4.25-1.29 11.32-1.04 15.77 1.6a1.12 1.12 0 0 1-1.14 1.93Z"/></svg>Spotify</span>`;
  return `<span class="service-badge netflix"><b>N</b>Netflix</span>`;
}
export function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-BO", withTime ? {dateStyle:"short",timeStyle:"short"} : {day:"2-digit",month:"2-digit",year:"numeric"}).format(date);
}
export function statusLabel(status) {
  return ({active:"Activo",inactive:"Inactivo",blocked:"Eliminado",available:"Disponible",assigned:"Asignada",suspended:"Suspendida",retired:"Retirada",open:"Abierto",in_review:"En revisión",answered:"Respondido",waiting_user:"Esperando usuario",resolved:"Resuelto",closed:"Cerrado",expired:"Vencida",expiring:"Por vencer",cancelled:"Cancelada",published:"Publicado",draft:"Borrador",hidden:"Oculto"})[status] || status || "—";
}
export function statusTone(status) {
  if (["active","available","resolved","answered","published"].includes(status)) return "green";
  if (["assigned","in_review","waiting_user","expiring"].includes(status)) return "orange";
  if (["blocked","retired","closed","expired"].includes(status)) return "red";
  if (["inactive","suspended","cancelled","hidden","draft"].includes(status)) return "gray";
  return "cyan";
}
export function toast(message, type = "success") {
  const root = $("#toastRoot"); if (!root) return;
  const node = document.createElement("div"); node.className = `toast ${type}`; node.textContent = message; root.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => { node.classList.remove("show"); setTimeout(() => node.remove(), 250); }, 3800);
}
export function openModal({title, body, actions = "", wide = false, extraWide = false}) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal-backdrop"><section class="modal-card ${wide?"wide":""} ${extraWide?"extra-wide":""}"><header><h2>${escapeHtml(title)}</h2><button class="icon-button modal-close">×</button></header><div class="modal-content">${body}</div>${actions?`<footer>${actions}</footer>`:""}</section></div>`;
  const close = () => root.innerHTML = "";
  $(".modal-close", root)?.addEventListener("click", close);
  $(".modal-backdrop", root)?.addEventListener("click", event => { if (event.target.classList.contains("modal-backdrop")) close(); });
  return {root, close};
}

export function openNetflixIntegrated(options = {}) {
  const verifiedEmail = String(options.verifiedEmail || "").trim();
  const netflixUrl = "https://jp-streaming.pages.dev/";
  const netflixPin = "071726";

  const modal = openModal({
    title: "Netflix · Centro de códigos",
    extraWide: true,
    body: `
      <section class="netflix-cropped-shell">
        <div class="netflix-access-card">
          <div class="netflix-access-logo">N</div>

          <div class="netflix-access-copy">
            <span class="eyebrow">ACCESO NETFLIX</span>
            <h3>PIN de acceso</h3>
            <p>
              Copia el PIN y colócalo dentro de la herramienta.
            </p>
          </div>

          <div class="netflix-access-pin">
            <strong>${netflixPin}</strong>
            <button id="copyNetflixPin" class="btn netflix-copy-button" type="button">
              Copiar PIN
            </button>
          </div>
        </div>

        ${verifiedEmail ? `
          <div class="netflix-verified-account">
            <div>
              <span class="eyebrow">CUENTA AUTORIZADA</span>
              <strong>${escapeHtml(verifiedEmail)}</strong>
              <small>Esta cuenta fue validada como asignada a tu usuario.</small>
            </div>

            <button
              id="copyVerifiedNetflixEmail"
              class="btn secondary"
              type="button"
            >
              Copiar correo
            </button>
          </div>
        ` : ""}

        <div id="netflixCropViewport" class="netflix-crop-viewport" data-view="pin">
          <div id="netflixFrameLoading" class="netflix-frame-loading">
            <span class="netflix-loader"></span>
            <strong>Cargando herramienta de Netflix…</strong>
          </div>

          <iframe
            id="netflixIntegratedFrame"
            class="netflix-cropped-frame"
            src="${netflixUrl}"
            title="Herramienta de códigos Netflix"
            allow="clipboard-read; clipboard-write"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>

          <div class="netflix-top-mask" aria-hidden="true"></div>
          <div class="netflix-bottom-mask" aria-hidden="true"></div>

          <div
            id="netflixEmailPlaceholderMask"
            class="netflix-email-placeholder-mask"
            aria-hidden="true"
          >
            Correo de Netflix
          </div>
        </div>

        <div class="netflix-crop-actions simplified">
          <div id="netflixViewInstruction">
            Coloca el PIN dentro de la herramienta y presiona Continuar.
          </div>

          <div class="netflix-crop-button-group">
            <button id="reloadNetflixFrame" class="btn secondary" type="button">
              Reiniciar
            </button>

            <button id="nextNetflixView" class="btn primary" type="button">
              Ya ingresé el PIN
            </button>
          </div>
        </div>
      </section>
    `
  });

  const iframe = $("#netflixIntegratedFrame", modal.root);
  const viewport = $("#netflixCropViewport", modal.root);
  const loading = $("#netflixFrameLoading", modal.root);
  const copyButton = $("#copyNetflixPin", modal.root);
  const copyVerifiedEmailButton = $("#copyVerifiedNetflixEmail", modal.root);
  const reloadButton = $("#reloadNetflixFrame", modal.root);
  const nextButton = $("#nextNetflixView", modal.root);
  const instruction = $("#netflixViewInstruction", modal.root);
  const emailPlaceholderMask = $("#netflixEmailPlaceholderMask", modal.root);

  const views = ["pin", "service", "code"];
  let viewIndex = 0;

  const viewContent = {
    pin: {
      instruction:
        "Coloca el PIN dentro de la herramienta y presiona Continuar.",
      button: "Ya ingresé el PIN"
    },
    service: {
      instruction:
        "Selecciona Netflix y presiona Continuar dentro de la herramienta.",
      button: "Ya seleccioné Netflix"
    },
    code: {
      instruction:
        "Ingresa el correo de Netflix y busca el código.",
      button: ""
    }
  };

  const switchView = view => {
    viewport.dataset.view = view;

    const content = viewContent[view] || viewContent.pin;
    instruction.textContent = content.instruction;

    if (nextButton) {
      nextButton.textContent = content.button;
      nextButton.hidden = view === "code";
    }

    if (emailPlaceholderMask) {
      emailPlaceholderMask.classList.remove("typing", "hidden");
    }
  };

  nextButton?.addEventListener("click", () => {
    viewIndex = Math.min(viewIndex + 1, views.length - 1);
    switchView(views[viewIndex]);
  });

  iframe?.addEventListener("load", () => {
    loading?.classList.add("hidden");

    if (emailPlaceholderMask) {
      emailPlaceholderMask.classList.remove("typing", "hidden");
    }
  });

  let emailMaskTimer = null;

  const beginEmailEntry = () => {
    if (
      viewport?.dataset.view !== "code" ||
      !emailPlaceholderMask
    ) {
      return;
    }

    window.clearTimeout(emailMaskTimer);
    emailPlaceholderMask.classList.add("typing");

    emailMaskTimer = window.setTimeout(() => {
      emailPlaceholderMask.classList.add("hidden");
    }, 1800);
  };

  window.addEventListener("blur", beginEmailEntry);

  iframe?.addEventListener("pointerenter", () => {
    if (viewport?.dataset.view === "code") {
      emailPlaceholderMask?.classList.add("typing");
    }
  });

  copyVerifiedEmailButton?.addEventListener("click", async () => {
    if (!verifiedEmail) return;

    try {
      await navigator.clipboard.writeText(verifiedEmail);
    } catch {
      const temporaryInput = document.createElement("input");
      temporaryInput.value = verifiedEmail;
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      document.execCommand("copy");
      temporaryInput.remove();
    }

    copyVerifiedEmailButton.textContent = "Correo copiado";
    toast("Correo autorizado copiado.");

    window.setTimeout(() => {
      if (copyVerifiedEmailButton) {
        copyVerifiedEmailButton.textContent = "Copiar correo";
      }
    }, 2200);
  });

  copyButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(netflixPin);
    } catch {
      const temporaryInput = document.createElement("input");
      temporaryInput.value = netflixPin;
      document.body.appendChild(temporaryInput);
      temporaryInput.select();
      document.execCommand("copy");
      temporaryInput.remove();
    }

    copyButton.textContent = "PIN copiado";
    toast("PIN copiado.");

    window.setTimeout(() => {
      if (copyButton) copyButton.textContent = "Copiar PIN";
    }, 2200);
  });

  reloadButton?.addEventListener("click", () => {
    if (!iframe) return;

    viewIndex = 0;
    switchView("pin");
    loading?.classList.remove("hidden");
    iframe.src = `${netflixUrl}?refresh=${Date.now()}`;
  });
}

export function showSection(section, onChange) {
  $$(".page-section").forEach(node => node.classList.toggle("active", node.id === `section-${section}`));
  $$(".nav-link").forEach(node => node.classList.toggle("active", node.dataset.section === section));
  if (window.innerWidth < 920) $("#sidebar")?.classList.add("collapsed");
  onChange?.(section);
}
export function wireNavigation(onChange) {
  $$(".nav-link").forEach(button => button.addEventListener("click", () => showSection(button.dataset.section, onChange)));
  $$("[data-go]").forEach(button => button.addEventListener("click", () => showSection(button.dataset.go, onChange)));
  $("#sidebarToggle")?.addEventListener("click", () => $("#sidebar")?.classList.toggle("collapsed"));
}
export async function signOut() { await supabase.auth.signOut(); location.reload(); }
export async function currentSessionAndProfile() {
  const {data:{session},error} = await supabase.auth.getSession(); if (error) throw error; if (!session?.user) return {session:null,profile:null};
  const result = await supabase.from("profiles").select("id,email,full_name,whatsapp,role,status,parent_id,business_name,avatar_url,notification_settings").eq("id",session.user.id).single();
  if (result.error) throw result.error; return {session,profile:result.data};
}
export function setupLogin({allowedRoles,onAuthenticated}) {
  const loginView=$("#loginView"), appView=$("#appView"), form=$("#loginForm"), errorBox=$("#loginError");
  const enter=async()=>{try{const {session,profile}=await currentSessionAndProfile();if(!session||!profile){loginView.hidden=false;appView.hidden=true;return;}if(profile.status!=="active"){await supabase.auth.signOut();throw new Error("Tu usuario está inactivo o eliminado.");}if(!allowedRoles.includes(profile.role)){await supabase.auth.signOut();throw new Error("Este usuario no tiene acceso a este portal.");}loginView.hidden=true;appView.hidden=false;await onAuthenticated({session,profile});}catch(error){loginView.hidden=false;appView.hidden=true;errorBox.hidden=false;errorBox.textContent=error.message||"No se pudo iniciar sesión.";}};
  form?.addEventListener("submit",async event=>{event.preventDefault();errorBox.hidden=true;const button=form.querySelector("button[type=submit]");button.disabled=true;button.textContent="Ingresando...";try{const {error}=await supabase.auth.signInWithPassword({email:$("#loginEmail").value.trim(),password:$("#loginPassword").value});if(error)throw error;await enter();}catch(error){errorBox.hidden=false;errorBox.textContent=error.message==="Invalid login credentials"?"Correo o contraseña incorrectos.":(error.message||"No se pudo iniciar sesión.");}finally{button.disabled=false;button.textContent="Ingresar";}});
  $("#logoutBtn")?.addEventListener("click",signOut); enter();
}
export async function callUserManager(payload) {
  const {data:{session}}=await supabase.auth.getSession(); if(!session?.access_token) throw new Error("Tu sesión venció. Ingresa nuevamente.");
  const response=await fetch(`${SUPABASE_URL}/functions/v1/${USER_MANAGER_FUNCTION}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`,apikey:SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
  const raw=await response.text(); let result={}; try{result=raw?JSON.parse(raw):{};}catch{result={error:raw||"Respuesta no válida."};}
  if(!response.ok||result.error) throw new Error(result.error||result.message||`Error ${response.status}`); return result;
}

export async function callPublicUserManager(payload) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/${USER_MANAGER_FUNCTION}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify(payload)
    }
  );

  const raw = await response.text();
  let result = {};

  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = { error: raw || "Respuesta no válida." };
  }

  if (!response.ok || result.error) {
    throw new Error(
      result.error ||
      result.message ||
      `No se pudo completar la solicitud. Error ${response.status}.`
    );
  }

  return result;
}

export function parseEmailBlock(rawValue){return [...new Set(String(rawValue||"").split(/[\n,;]+/).map(v=>v.trim().toLowerCase()).filter(Boolean))];}
export async function uploadPublicImage(bucket,file,folder){if(!file)return null;const extension=file.name.split(".").pop()?.toLowerCase()||"jpg";const path=`${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;const {error}=await supabase.storage.from(bucket).upload(path,file,{cacheControl:"3600",upsert:false});if(error)throw error;return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;}
export async function loadNotifications(){
  const {data,error}=await supabase
    .from("notification_recipients")
    .select(
      "id,read_at,created_at,notification:notification_id("+
      "id,title,message,image_url,created_at,"+
      "sender:sender_id(full_name,business_name,role)"+
      ")"
    )
    .order("created_at",{ascending:false});

  if(error)throw error;
  return data||[];
}
export function updateNotificationBadge(items=[]){const unread=items.filter(i=>!i.read_at).length,badge=$("#notificationBadge");if(!badge)return;badge.textContent=unread;badge.hidden=unread===0;}
export async function showNotificationsModal(items,onRead){const modal=openModal({title:"Notificaciones",wide:true,body:`<div class="notification-modal-list">${items.length?items.map(item=>{const n=item.notification||{};return `<article class="notification-card ${item.read_at?"":"unread"}" data-notification-recipient="${item.id}">${n.image_url?`<img src="${escapeHtml(n.image_url)}" alt="">`:""}<div><div class="notification-meta"><strong>${escapeHtml(n.title||"Notificación")}</strong><small>${formatDate(n.created_at,true)}</small></div><p>${escapeHtml(n.message||"")}</p><small>Enviado por ${escapeHtml(n.sender?.business_name||n.sender?.full_name||"Administración")}</small></div></article>`;}).join(""):`<div class="empty-state">No tienes notificaciones.</div>`}</div>`});
  $$('[data-notification-recipient]',modal.root).forEach(card=>card.addEventListener("click",async()=>{if(!card.classList.contains("unread"))return;const {error}=await supabase.rpc("mark_notification_read",{p_recipient_id:card.dataset.notificationRecipient});if(error)return toast(error.message,"error");card.classList.remove("unread");await onRead?.();}));
}
export function maybeShowBrowserNotifications(items,profile){const settings=profile?.notification_settings||{};if(!settings.browser||!("Notification"in window)||Notification.permission!=="granted")return;items.filter(i=>!i.read_at).slice(0,3).forEach(item=>{const n=item.notification||{};new Notification(n.title||"Nueva notificación",{body:n.message||"",icon:n.image_url||undefined});});}
