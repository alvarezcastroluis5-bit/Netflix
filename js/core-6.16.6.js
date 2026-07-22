const createClient =
  globalThis.supabase?.createClient||
  globalThis.__SUPABASE_CREATE_CLIENT__;

if(typeof createClient!=="function"){
  throw new Error(
    "La biblioteca de Supabase no se cargó correctamente."
  );
}

const SUPABASE_URL = "https://rmligdfmfwpmdsllembk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ld1G5Si_wWzHK_-G-ZUBlg_KQOFO2Ov";
const USER_MANAGER_FUNCTION = "hyper-processor";

let loaderRequests = 0;
let loaderDelayTimer = null;
let loaderMinimumTimer = null;
let loaderVisibleSince = 0;

function ensureGlobalLoader() {
  let root = document.getElementById("globalPageLoader");

  if (root) return root;

  root = document.createElement("div");
  root.id = "globalPageLoader";
  root.className = "global-page-loader";
  root.hidden = true;
  root.innerHTML = `
    <div class="global-loader-card" role="status" aria-live="polite">
      <div class="playing-disc" aria-hidden="true">
        <span class="playing-disc-ring ring-one"></span>
        <span class="playing-disc-ring ring-two"></span>
        <span class="playing-disc-ring ring-three"></span>
        <span class="playing-disc-center">
          <span class="playing-disc-play">▶</span>
        </span>
      </div>

      <div class="global-loader-copy">
        <strong>Cargando</strong>
        <span>Actualizando la información del panel…</span>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  return root;
}

export function showPageLoader(message = "Actualizando la información del panel…") {
  loaderRequests += 1;

  window.clearTimeout(loaderDelayTimer);
  window.clearTimeout(loaderMinimumTimer);

  loaderDelayTimer = window.setTimeout(() => {
    const root = ensureGlobalLoader();
    const messageNode = root.querySelector(".global-loader-copy span");

    if (messageNode) {
      messageNode.textContent = message;
    }

    root.hidden = false;
    root.classList.add("visible");
    loaderVisibleSince = Date.now();
    document.documentElement.classList.add("page-loading");
  }, 130);
}

export function hidePageLoader(force = false) {
  loaderRequests = force ? 0 : Math.max(0, loaderRequests - 1);

  if (loaderRequests > 0) return;

  window.clearTimeout(loaderDelayTimer);

  const root = document.getElementById("globalPageLoader");
  if (!root || root.hidden) return;

  const elapsed = Date.now() - loaderVisibleSince;
  const remaining = Math.max(0, 420 - elapsed);

  loaderMinimumTimer = window.setTimeout(() => {
    if (loaderRequests > 0) return;

    root.classList.remove("visible");
    document.documentElement.classList.remove("page-loading");

    window.setTimeout(() => {
      if (!root.classList.contains("visible")) {
        root.hidden = true;
      }
    }, 220);
  }, remaining);
}

export async function withPageLoader(task, message) {
  showPageLoader(message);

  try {
    return await task();
  } finally {
    hidePageLoader();
  }
}

const nativeFetch = globalThis.fetch.bind(globalThis);

async function trackedFetch(input, init) {
  const url = typeof input === "string"
    ? input
    : String(input?.url || "");

  const isSupabaseRequest =
    url.includes("supabase.co") ||
    url.includes("/functions/v1/");

  if (!isSupabaseRequest) {
    return nativeFetch(input, init);
  }

  showPageLoader();

  try {
    return await nativeFetch(input, init);
  } finally {
    hidePageLoader();
  }
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      fetch: trackedFetch
    }
  }
);
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
  const verifiedEmail = String(
    options.verifiedEmail || ""
  ).trim();

  const verifiedCountry = String(
    options.country || ""
  ).trim();

  const requestId = String(
    options.requestId || ""
  ).trim();

  const vpnMessage = String(
    options.vpnMessage || ""
  ).trim();

  const ownerName = String(
    options.ownerName || ""
  ).trim();

  const ownerParentName = String(
    options.ownerParentName || ""
  ).trim();

  const accessScope = String(
    options.accessScope || "own"
  ).trim();

  const netflixToolUrl =
    "https://jp-streaming.pages.dev/";

  const accessPin = "071726";

  const modal = openModal({
    title:"Netflix",
    extraWide:true,
    body:`
      <section class="netflix-direct-shell">
        <div class="netflix-pin-card">
          <div class="netflix-access-logo">N</div>

          <div class="netflix-pin-copy">
            <span class="eyebrow">ACCESO NETFLIX</span>
            <h3>PIN de acceso</h3>
            <p>
              Copia el PIN, colócalo en la ventana inferior
              y presiona Continuar.
            </p>
          </div>

          <div class="netflix-pin-box">
            <strong>${accessPin}</strong>

            <button
              id="copyNetflixAccessPin"
              class="btn netflix-pin-button"
              type="button"
            >
              Copiar PIN
            </button>
          </div>
        </div>

        ${verifiedEmail?`
          <div class="netflix-verified-account">
            <div>
              <span class="eyebrow">CUENTA VALIDADA</span>

              <strong>
                ${escapeHtml(verifiedEmail)}
              </strong>

              <small>
                País:
                <strong>
                  ${escapeHtml(
                    verifiedCountry||"Sin configurar"
                  )}
                </strong>
              </small>

              ${ownerName?`
                <small>
                  Propietario actual:
                  <strong>${escapeHtml(ownerName)}</strong>
                  ${ownerParentName?`
                    / ${escapeHtml(ownerParentName)}
                  `:""}
                </small>
              `:""}

              <small>
                Acceso:
                <strong>
                  ${accessScope==="subordinate"
                    ?"Cuenta de un subordinado de tu rama"
                    :"Cuenta asignada directamente a ti"
                  }
                </strong>
              </small>

              ${requestId?`
                <small>
                  Solicitud registrada:
                  ${escapeHtml(requestId)}
                </small>
              `:""}
            </div>

            <button
              id="copyVerifiedNetflixEmail"
              class="btn secondary"
              type="button"
            >
              Copiar correo
            </button>
          </div>

          <div class="vpn-country-notice">
            <strong>VPN recomendado:</strong>
            ${escapeHtml(
              verifiedCountry||"País sin configurar"
            )}.
            ${escapeHtml(
              vpnMessage||
              "Si vas a restablecer la contraseña, activa un VPN de este país."
            )}
          </div>
        `:""}

        <div class="netflix-access-toolbar">
          <div>
            <strong>Acceso a Netflix</strong>
            <small>
              No cierres esta ventana después de ingresar el PIN.
            </small>
          </div>

          <button
            id="reloadNetflixTool"
            class="btn secondary"
            type="button"
          >
            Recargar
          </button>
        </div>

        <div class="netflix-hidden-brand-frame">
          <div
            id="netflixToolLoading"
            class="netflix-frame-loading"
          >
            <span class="netflix-loader"></span>
            <strong>Cargando Netflix…</strong>
          </div>

          <iframe
            id="netflixToolFrame"
            class="netflix-direct-frame"
            src="${netflixToolUrl}"
            title="Netflix"
            allow="clipboard-read; clipboard-write"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>

          <div class="netflix-frame-top-mask"></div>
        </div>

        <div class="netflix-direct-notice">
          Copia el PIN <strong>${accessPin}</strong>,
          ingrésalo en la ventana superior del marco
          y presiona <strong>Continuar</strong>.
          La sesión permanecerá abierta dentro de esta ventana.
        </div>
      </section>
    `
  });

  const iframe=$("#netflixToolFrame",modal.root);
  const loading=$("#netflixToolLoading",modal.root);
  const reloadButton=$("#reloadNetflixTool",modal.root);
  const copyEmailButton=$(
    "#copyVerifiedNetflixEmail",
    modal.root
  );
  const copyPinButton=$(
    "#copyNetflixAccessPin",
    modal.root
  );

  iframe?.addEventListener("load",()=>{
    loading?.classList.add("hidden");
  });

  reloadButton?.addEventListener("click",()=>{
    if(!iframe)return;

    loading?.classList.remove("hidden");

    iframe.src=
      `${netflixToolUrl}?refresh=${Date.now()}`;
  });

  async function copyText(value){
    try{
      await navigator.clipboard.writeText(value);
      return true;
    }catch{
      const temporaryInput=
        document.createElement("input");

      temporaryInput.value=value;
      document.body.appendChild(temporaryInput);
      temporaryInput.select();

      const copied=
        document.execCommand("copy");

      temporaryInput.remove();
      return copied;
    }
  }

  copyPinButton?.addEventListener("click",async()=>{
    await copyText(accessPin);

    copyPinButton.textContent="PIN copiado";
    toast("PIN de Netflix copiado.");

    window.setTimeout(()=>{
      if(copyPinButton){
        copyPinButton.textContent="Copiar PIN";
      }
    },2200);
  });

  copyEmailButton?.addEventListener(
    "click",
    async()=>{
      if(!verifiedEmail)return;

      await copyText(verifiedEmail);

      copyEmailButton.textContent="Correo copiado";
      toast("Correo validado copiado.");

      window.setTimeout(()=>{
        if(copyEmailButton){
          copyEmailButton.textContent=
            "Copiar correo";
        }
      },2200);
    }
  );
}

export async function showSection(section, onChange) {
  $$(".page-section").forEach(node =>
    node.classList.toggle("active", node.id === `section-${section}`)
  );

  $$(".nav-link").forEach(node =>
    node.classList.toggle("active", node.dataset.section === section)
  );

  if (window.innerWidth < 920) {
    $("#sidebar")?.classList.add("collapsed");
  }

  if (typeof onChange === "function") {
    await withPageLoader(
      () => onChange(section),
      "Cargando la sección…"
    );
  }
}
export function wireNavigation(onChange) {
  $$(".nav-link").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await showSection(button.dataset.section, onChange);
      } catch (error) {
        toast(error.message || "No se pudo cargar la sección.", "error");
      }
    });
  });

  $$("[data-go]").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await showSection(button.dataset.go, onChange);
      } catch (error) {
        toast(error.message || "No se pudo cargar la sección.", "error");
      }
    });
  });

  $("#sidebarToggle")?.addEventListener("click", () =>
    $("#sidebar")?.classList.toggle("collapsed")
  );
}
export async function signOut() { await supabase.auth.signOut(); location.reload(); }
export async function currentSessionAndProfile() {
  const {data:{session},error} = await supabase.auth.getSession(); if (error) throw error; if (!session?.user) return {session:null,profile:null};
  const result = await supabase.from("profiles").select("id,email,full_name,whatsapp,role,status,parent_id,business_name,avatar_url,notification_settings").eq("id",session.user.id).single();
  if (result.error) throw result.error; return {session,profile:result.data};
}
function portalForRole(role){
  if(role==="reseller"){
    return "revendedores.html";
  }

  if(["admin","support"].includes(role)){
    return "admin.html";
  }

  return null;
}

function currentPortalFile(){
  const file=location.pathname
    .split("/")
    .filter(Boolean)
    .pop();

  return file||"index.html";
}

function redirectToRolePortal(role){
  const destination=portalForRole(role);

  if(!destination){
    return false;
  }

  if(currentPortalFile()===destination){
    return false;
  }

  const basePath=location.pathname.includes("/")
    ?location.pathname.slice(
      0,
      location.pathname.lastIndexOf("/")+1
    )
    :"/";

  location.replace(
    `${location.origin}${basePath}${destination}`
  );

  return true;
}

export function setupLogin({allowedRoles,onAuthenticated}) {
  const loginView=$("#loginView");
  const appView=$("#appView");
  const form=$("#loginForm");
  const errorBox=$("#loginError");

  const enter=async()=>{
    showPageLoader("Cargando tu panel…");

    try{
      const {session,profile}=await currentSessionAndProfile();

      if(!session||!profile){
        loginView.hidden=false;
        appView.hidden=true;
        return;
      }

      if(profile.status!=="active"){
        await supabase.auth.signOut();
        throw new Error(
          "Tu usuario está inactivo o eliminado. Comunícate con tu superior."
        );
      }

      if(!allowedRoles.includes(profile.role)){
        const redirected=redirectToRolePortal(profile.role);

        if(redirected){
          return;
        }

        await supabase.auth.signOut();
        throw new Error(
          "El tipo de usuario no tiene un portal configurado."
        );
      }

      loginView.hidden=true;
      appView.hidden=false;

      await onAuthenticated({
        session,
        profile
      });
    }catch(error){
      loginView.hidden=false;
      appView.hidden=true;
      errorBox.hidden=false;
      errorBox.textContent=
        error.message||
        "No se pudo iniciar sesión.";
    }finally{
      hidePageLoader();
    }
  };

  form?.addEventListener("submit",async event=>{
    event.preventDefault();
    errorBox.hidden=true;

    const button=form.querySelector(
      "button[type=submit]"
    );

    button.disabled=true;
    button.textContent="Ingresando...";

    try{
      const email=$("#loginEmail").value
        .trim()
        .toLowerCase();

      const password=$("#loginPassword").value;

      const {error}=await supabase.auth.signInWithPassword({
        email,
        password
      });

      if(error){
        throw error;
      }

      await enter();
    }catch(error){
      errorBox.hidden=false;

      if(error.message==="Invalid login credentials"){
        errorBox.textContent=
          "Correo o contraseña incorrectos.";
      }else if(
        /Email not confirmed/i.test(error.message||"")
      ){
        errorBox.textContent=
          "El correo todavía no está confirmado.";
      }else{
        errorBox.textContent=
          error.message||
          "No se pudo iniciar sesión.";
      }
    }finally{
      button.disabled=false;
      button.textContent="Ingresar";
    }
  });

  $("#logoutBtn")?.addEventListener(
    "click",
    signOut
  );

  enter();
}

export async function callUserManager(payload) {
  const {data:{session}}=await supabase.auth.getSession(); if(!session?.access_token) throw new Error("Tu sesión venció. Ingresa nuevamente.");
  const response=await trackedFetch(`${SUPABASE_URL}/functions/v1/${USER_MANAGER_FUNCTION}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`,apikey:SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
  const raw=await response.text(); let result={}; try{result=raw?JSON.parse(raw):{};}catch{result={error:raw||"Respuesta no válida."};}
  if(!response.ok||result.error) throw new Error(result.error||result.message||`Error ${response.status}`); return result;
}

export async function callPublicUserManager(payload) {
  const response = await trackedFetch(
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
  const {
    data:{user},
    error:userError
  }=await supabase.auth.getUser();

  if(userError){
    throw userError;
  }

  if(!user){
    return [];
  }

  const {data,error}=await supabase
    .from("notification_recipients")
    .select(
      "id,recipient_id,read_at,forwarded_at,created_at,"+
      "notification:notification_id("+
      "id,title,message,image_url,allow_forward,"+
      "forwarded_from_id,created_at,"+
      "sender:sender_id(full_name,business_name,role)"+
      ")"
    )
    .eq("recipient_id",user.id)
    .order("created_at",{ascending:false});

  if(error){
    throw error;
  }

  return (data||[]).filter(
    item=>item.recipient_id===user.id
  );
}
export function updateNotificationBadge(items=[]){
  document.__notificationItems=items;
  const unread=items.filter(item=>!item.read_at).length;
  const badge=$("#notificationBadge");
  const bell=$("#notificationBell");

  if(badge){
    badge.textContent=unread;
    badge.hidden=unread===0;
  }

  bell?.classList.toggle("has-unread-notifications",unread>0);
}

async function markNotificationAsRead(item,onRead){
  if(!item){
    return false;
  }

  if(item.read_at){
    return true;
  }

  const {data,error}=await supabase.rpc(
    "mark_notification_read_v21",
    {p_recipient_id:item.id}
  );

  if(error){
    toast(error.message||"No se pudo marcar la notificación como leída.","error");
    return false;
  }

  if(!data?.success){
    const currentItems=[
      ...(document.__notificationItems||[])
    ].filter(current=>current.id!==item.id);

    document.__notificationItems=currentItems;
    updateNotificationBadge(currentItems);

    document.getElementById("persistentNotificationAlert")?.remove();

    try{
      await onRead?.();
    }catch(refreshError){
      console.warn(
        "No se pudo refrescar la lista de notificaciones:",
        refreshError
      );
    }

    toast(
      "Este aviso pertenecía a otro usuario y fue retirado de tu panel.",
      "error"
    );

    return true;
  }

  item.read_at=data.read_at||new Date().toISOString();

  const currentItems=[
    ...(document.__notificationItems||[])
  ];

  currentItems.forEach(current=>{
    if(current.id===item.id){
      current.read_at=item.read_at;
    }
  });

  document.__notificationItems=currentItems;
  updateNotificationBadge(currentItems);

  const remainingUnread=currentItems.filter(
    current=>!current.read_at
  );

  if(!remainingUnread.length){
    document.getElementById("persistentNotificationAlert")?.remove();
  }

  try{
    await onRead?.();
  }catch(refreshError){
    console.warn(
      "La notificación se marcó como leída, pero no se pudo refrescar la lista:",
      refreshError
    );
  }

  return true;
}

export async function showNotificationsModal(
  items,
  onRead,
  onForward
){
  const modal=openModal({
    title:"Avisos y notificaciones",
    wide:true,
    body:`
      <div class="notification-modal-list">
        ${items.length
          ?items.map(item=>{
            const notification=item.notification||{};
            const canForward=
              notification.allow_forward===true
              &&!item.forwarded_at
              &&typeof onForward==="function";

            return `
              <article
                class="notification-card ${item.read_at?"":"unread"}"
                data-notification-recipient="${item.id}"
              >
                ${notification.image_url
                  ?`<img
                      src="${escapeHtml(notification.image_url)}"
                      alt=""
                    >`
                  :""
                }

                <div class="notification-card-content">
                  <div class="notification-meta">
                    <strong>
                      ${escapeHtml(
                        notification.title||"Notificación"
                      )}
                    </strong>

                    <small>
                      ${formatDate(notification.created_at,true)}
                    </small>
                  </div>

                  <p>${escapeHtml(notification.message||"")}</p>

                  <small>
                    Enviado por
                    ${escapeHtml(
                      notification.sender?.business_name||
                      notification.sender?.full_name||
                      "Administración"
                    )}
                  </small>

                  <div class="notification-card-actions">
                    ${item.read_at
                      ?`<span class="notification-read-label">Leída</span>`
                      :`<button
                          class="btn notification-read-button"
                          data-mark-notification-read="${item.id}"
                        >
                          Marcar como leída
                        </button>`
                    }

                    ${canForward
                      ?`<button
                          class="btn secondary"
                          data-forward-notification="${item.id}"
                        >
                          Reenviar a mi red
                        </button>`
                      :item.forwarded_at
                        ?`<span class="notification-forwarded-label">
                            Ya reenviada
                          </span>`
                        :""
                    }
                  </div>
                </div>
              </article>
            `;
          }).join("")
          :`<div class="empty-state">
              No tienes notificaciones.
            </div>`
        }
      </div>
    `
  });

  $$("[data-mark-notification-read]",modal.root).forEach(button=>{
    button.addEventListener("click",async event=>{
      event.stopPropagation();

      const item=items.find(
        row=>row.id===button.dataset.markNotificationRead
      );

      const marked=await markNotificationAsRead(item,onRead);

      if(marked){
        button.closest(".notification-card")?.remove();
        modal.close();
      }
    });
  });

  $$("[data-forward-notification]",modal.root).forEach(button=>{
    button.addEventListener("click",async event=>{
      event.stopPropagation();

      const item=items.find(
        row=>row.id===button.dataset.forwardNotification
      );

      if(!item)return;

      modal.close();
      await onForward?.(item);
    });
  });
}

export function renderPersistentNotificationAlert(
  items=[],
  {
    onRead,
    onOpen,
    onForward
  }={}
){
  let root=document.getElementById("persistentNotificationAlert");

  const unread=items
    .filter(item=>!item.read_at)
    .sort((a,b)=>
      new Date(b.created_at)-new Date(a.created_at)
    );

  if(!unread.length){
    root?.remove();
    return;
  }

  const item=unread[0];
  const notification=item.notification||{};
  const canForward=
    notification.allow_forward===true
    &&!item.forwarded_at
    &&typeof onForward==="function";

  if(!root){
    root=document.createElement("aside");
    root.id="persistentNotificationAlert";
    root.className="persistent-notification-alert";
    document.body.appendChild(root);
  }

  root.innerHTML=`
    <button
      class="persistent-notification-main"
      type="button"
      aria-label="Abrir notificación"
    >
      <span class="persistent-notification-pulse"></span>

      <span class="persistent-notification-icon">
        ✦
      </span>

      <span class="persistent-notification-copy">
        <small>
          NUEVO AVISO
          ${unread.length>1?` · ${unread.length} pendientes`:""}
        </small>

        <strong>
          ${escapeHtml(notification.title||"Notificación")}
        </strong>

        <span>
          ${escapeHtml(notification.message||"")}
        </span>
      </span>
    </button>

    <div class="persistent-notification-actions">
      <button
        class="persistent-read-action"
        type="button"
      >
        Marcar como leída
      </button>

      ${canForward
        ?`<button
            class="persistent-forward-action"
            type="button"
          >
            Reenviar
          </button>`
        :""
      }
    </div>
  `;

  $(".persistent-notification-main",root)?.addEventListener(
    "click",
    ()=>onOpen?.()
  );

  $(".persistent-read-action",root)?.addEventListener(
    "click",
    async()=>{
      const button=$(".persistent-read-action",root);
      button.disabled=true;
      button.textContent="Marcando...";

      const marked=await markNotificationAsRead(item,onRead);

      if(marked){
        root.remove();
      }else{
        button.disabled=false;
        button.textContent="Marcar como leída";
      }
    }
  );

  $(".persistent-forward-action",root)?.addEventListener(
    "click",
    ()=>onForward?.(item)
  );
}

export function maybeShowBrowserNotifications(items,profile){const settings=profile?.notification_settings||{};if(!settings.browser||!("Notification"in window)||Notification.permission!=="granted")return;items.filter(i=>!i.read_at).slice(0,3).forEach(item=>{const n=item.notification||{};new Notification(n.title||"Nueva notificación",{body:n.message||"",icon:n.image_url||undefined});});}
