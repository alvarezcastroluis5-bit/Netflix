console.info("Centro Premium core V6.9.20 cargado");
console.info("Centro Premium Netflix V6.9.20 cargado");
const createClient = globalThis.__SUPABASE_CREATE_CLIENT__;

if (typeof createClient !== "function") {
  throw new Error("El cargador de Supabase no se inició correctamente.");
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
  /*
   * V6.9.20:
   * Las actualizaciones automáticas ya no disparan el loader global.
   * El indicador visual queda reservado únicamente para acciones
   * explícitas del usuario, como cambiar de sección o entrar al panel.
   */
  return nativeFetch(input, init);
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
  return ({active:"Activo",inactive:"Inactivo",blocked:"Eliminado",available:"Disponible",assigned:"Asignada",suspended:"Suspendida",retired:"Retirada",open:"Abierto",in_review:"En revisión",answered:"Respondido",waiting_user:"Esperando usuario",resolved:"Resuelto",closed:"Cerrado",expired:"Vencida",expiring:"Por vencer",cancelled:"Cancelada",published:"Publicado",draft:"Borrador",hidden:"Oculto",pending_date:"Sin fecha"})[status] || status || "—";
}
export function statusTone(status) {
  if (["active","available","resolved","answered","published"].includes(status)) return "green";
  if (["assigned","in_review","waiting_user","expiring"].includes(status)) return "orange";
  if (["blocked","retired","closed","expired"].includes(status)) return "red";
  if (["inactive","suspended","cancelled","hidden","draft","pending_date"].includes(status)) return "gray";
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

export function openNetflixIntegrated() {
  const NETFLIX_GENERAL_PIN = "071726";

  /*
   * La dirección se arma en ejecución. La herramienta permanece dentro
   * del mismo modal y no abre ventanas ni pestañas adicionales.
   */
  const NETFLIX_EMBED_URL = atob(
    "aHR0cHM6Ly9qcC1zdHJlYW1pbmcucGFnZXMuZGV2Lw=="
  );

  const operations = [
    [
      "restablecer_contrasena",
      "▤",
      "Restablecer clave"
    ],
    [
      "inicio_sesion_codigo",
      "▣",
      "Inicio de sesión por código"
    ],
    [
      "actualizar_hogar",
      "⌂",
      "Actualizar hogar"
    ],
    [
      "acceso_temporal",
      "◷",
      "Código de acceso temporal"
    ],
    [
      "codigo_6_digitos",
      "⠿",
      "Código de 6 dígitos"
    ]
  ];

  const modal = openModal({
    title: "Netflix",
    extraWide: true,
    body: `
      <section class="netflix-v16-shell">
        <section id="netflixV16ValidationStage">
          <div class="netflix-v16-intro">
            <span class="eyebrow">CONTROL DE ACCESO</span>
            <h3>Validar cuenta Netflix</h3>
            <p>
              Ingresa el correo. El sistema verificará que la cuenta esté
              asignada exactamente a tu usuario.
            </p>
          </div>

          <form id="netflixV16Form" class="netflix-native-form">
            <label>
              <span>Correo de la cuenta Netflix</span>

              <div class="netflix-native-email-row">
                <input
                  name="email"
                  type="email"
                  autocomplete="off"
                  placeholder="cuenta@correo.com"
                  required
                >

                <button
                  id="validateNetflixV16"
                  class="btn secondary"
                  type="button"
                >
                  Validar acceso
                </button>
              </div>
            </label>

            <div
              id="netflixV16Validation"
              class="netflix-native-validation"
              hidden
            ></div>
          </form>

          <section
            id="netflixV16OperationStage"
            class="netflix-v16-operation-stage"
            hidden
          >
            <div class="netflix-v16-authorized-account">
              <span class="eyebrow">CUENTA VALIDADA</span>

              <div>
                <strong id="netflixV16AuthorizedEmail"></strong>
                <small>
                  País:
                  <b id="netflixV16Country"></b>
                </small>
              </div>
            </div>

            <fieldset class="netflix-v16-operations">
              <legend>Selecciona la operación</legend>

              ${operations.map(([value, icon, label]) => `
                <label class="netflix-v16-operation">
                  <input
                    type="radio"
                    name="netflix_v16_operation"
                    value="${value}"
                  >

                  <span>${icon}</span>
                  <strong>${label}</strong>
                </label>
              `).join("")}
            </fieldset>
          </section>
        </section>

        <section
          id="netflixV16ToolStage"
          class="netflix-v16-tool-stage"
          hidden
        >
          <section class="netflix-v16-pin-card">
            <div>
              <span class="eyebrow">PIN DE ACCESO</span>
              <strong>${NETFLIX_GENERAL_PIN}</strong>
              <p>
                Coloca este PIN dentro de la herramienta. Luego selecciona
                Netflix, pega el correo validado y pulsa Buscar código.
              </p>
            </div>

            <div class="netflix-v16-pin-actions">
              <button
                id="copyNetflixV16Pin"
                class="btn netflix-pin-copy-button"
                type="button"
              >
                Copiar PIN
              </button>

              <button
                id="copyNetflixV16Email"
                class="btn secondary"
                type="button"
              >
                Copiar correo
              </button>
            </div>
          </section>

          <div class="netflix-v16-tool-summary">
            <div>
              <span>Correo autorizado</span>
              <strong id="netflixV16ToolEmail"></strong>
            </div>

            <div>
              <span>País</span>
              <strong id="netflixV16ToolCountry"></strong>
            </div>

            <div>
              <span>Operación</span>
              <strong id="netflixV16ToolOperation"></strong>
            </div>
          </div>

          <div
            id="netflixV16FrameShell"
            class="netflix-v16-frame-shell"
          >
            <div
              id="netflixV16Loader"
              class="netflix-frame-loader"
            >
              <span class="spinner"></span>
              <strong>Cargando herramienta Netflix…</strong>
            </div>

            <iframe
              id="netflixV16Frame"
              class="netflix-v16-frame"
              title="Herramienta Netflix"
              src="about:blank"
              scrolling="yes"
              loading="eager"
              referrerpolicy="no-referrer"
              allow="clipboard-read; clipboard-write"
            ></iframe>

            <!--
              Las máscaras pertenecen al panel local y cubren únicamente
              encabezado, pie y texto de ejemplo de la herramienta incrustada.
            -->
            <div class="netflix-v16-mask netflix-v16-mask-top"></div>
            <div class="netflix-v16-mask netflix-v16-mask-bottom"></div>

            <div
              id="netflixV16EmailCover"
              class="netflix-v16-email-cover"
              aria-hidden="true"
            >
              <strong id="netflixV16CoveredEmail"></strong>
            </div>

            <div
              id="netflixV16ToolEmailCover"
              class="netflix-v16-tool-email-cover"
              aria-hidden="true"
            >
              <strong id="netflixV16ToolEmailCoverText"></strong>
            </div>

            <div
              class="netflix-v16-disney-mask"
              aria-hidden="true"
            ></div>
          </div>
        </section>
      </section>
    `
  });

  const form = $("#netflixV16Form", modal.root);
  const emailInput = form.elements.email;
  const validateButton = $("#validateNetflixV16", modal.root);
  const validationBox = $("#netflixV16Validation", modal.root);
  const operationStage = $("#netflixV16OperationStage", modal.root);
  const toolStage = $("#netflixV16ToolStage", modal.root);
  const authorizedEmail = $("#netflixV16AuthorizedEmail", modal.root);
  const countryLabel = $("#netflixV16Country", modal.root);
  const toolEmail = $("#netflixV16ToolEmail", modal.root);
  const toolCountry = $("#netflixV16ToolCountry", modal.root);
  const toolOperation = $("#netflixV16ToolOperation", modal.root);
  const coveredEmail = $("#netflixV16CoveredEmail", modal.root);
  const emailCover = $("#netflixV16EmailCover", modal.root);
  const toolEmailCoverText = $("#netflixV16ToolEmailCoverText", modal.root);
  const frame = $("#netflixV16Frame", modal.root);
  const loader = $("#netflixV16Loader", modal.root);
  const copyPinButton = $("#copyNetflixV16Pin", modal.root);
  const copyEmailButton = $("#copyNetflixV16Email", modal.root);
  const operationInputs = $$(
    'input[name="netflix_v16_operation"]',
    modal.root
  );

  let verified = null;
  let selectedOperation = "";

  async function copyText(value, message) {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      toast(message);
    } catch {
      const temporary = document.createElement("textarea");
      temporary.value = String(value || "");
      temporary.setAttribute("readonly", "");
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.appendChild(temporary);
      temporary.select();
      document.execCommand("copy");
      temporary.remove();
      toast(message);
    }
  }

  function operationLabel(value) {
    return operations.find(
      ([operation]) => operation === value
    )?.[2] || "Operación Netflix";
  }

  function showValidationError(message) {
    validationBox.className =
      "netflix-native-validation error";

    validationBox.innerHTML = `
      <strong>Acceso rechazado</strong>
      <span>${escapeHtml(message)}</span>
    `;

    validationBox.hidden = false;
    operationStage.hidden = true;
    toolStage.hidden = true;
  }

  async function validateProperty() {
    if (!emailInput.reportValidity()) return;

    validateButton.disabled = true;
    validateButton.textContent = "Validando...";
    validationBox.hidden = true;
    operationStage.hidden = true;
    toolStage.hidden = true;

    try {
      const { data, error } = await supabase.rpc(
        "validate_netflix_owner_access_v35",
        {
          p_email: emailInput.value.trim().toLowerCase()
        }
      );

      if (error) throw error;

      verified = data;
      selectedOperation = "";
      emailInput.value = data.email;

      validationBox.className =
        "netflix-native-validation success";

      validationBox.innerHTML = `
        <strong>✓ Acceso validado correctamente</strong>
        <span>
          Correo:
          ${escapeHtml(data.email)}
        </span>
        <span>
          País:
          ${escapeHtml(data.country || "Sin configurar")}
        </span>
      `;

      validationBox.hidden = false;

      authorizedEmail.textContent = data.email;
      countryLabel.textContent =
        data.country || "Sin configurar";

      operationInputs.forEach(input => {
        input.checked = false;
      });

      operationStage.hidden = false;

      operationStage.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
      });

      toast("Cuenta validada correctamente.");
    } catch (error) {
      verified = null;

      showValidationError(
        error.message ||
        "La cuenta no está asignada a tu usuario."
      );
    } finally {
      validateButton.disabled = false;
      validateButton.textContent = "Validar acceso";
    }
  }

  async function showTool(operation) {
    if (!verified) {
      toast(
        "Primero valida el correo de la cuenta.",
        "error"
      );
      return;
    }

    selectedOperation = operation;

    toolEmail.textContent = verified.email;
    toolCountry.textContent =
      verified.country || "Sin configurar";
    toolOperation.textContent =
      operationLabel(operation);

    coveredEmail.textContent = verified.email;
    emailCover.classList.remove("show-email");
    if (toolEmailCoverText) {
      toolEmailCoverText.textContent = verified.email;
    }

    toolStage.hidden = false;
    loader.hidden = false;

    if (frame.src === "about:blank") {
      frame.src = NETFLIX_EMBED_URL;
    }

    await copyText(
      NETFLIX_GENERAL_PIN,
      "PIN 071726 copiado."
    );

    toolStage.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  validateButton.onclick = validateProperty;

  emailInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      validateProperty();
    }
  });

  operationInputs.forEach(input => {
    input.addEventListener("change", () => {
      showTool(input.value);
    });
  });

  frame.addEventListener("load", () => {
    loader.hidden = true;
  });

  copyPinButton.onclick = () => copyText(
    NETFLIX_GENERAL_PIN,
    "PIN copiado."
  );

  copyEmailButton.onclick = async () => {
    await copyText(
      verified?.email || "",
      "Correo copiado."
    );

    /*
     * La cubierta permanece encima del texto de ejemplo externo y,
     * después de copiar, muestra el correo correcto ya validado.
     * Los clics pasan al campo real porque la cubierta no recibe eventos.
     */
    emailCover.classList.add("show-email");
  };
}
export async function showSection(section, onChange) {
  $$(".page-section").forEach(node =>
    node.classList.toggle("active", node.id === `section-${section}`)
  );

  $$(".nav-link").forEach(node =>
    node.classList.toggle("active", node.dataset.section === section)
  );

  if (window.innerWidth <= 1100) {
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

  const sidebar=$("#sidebar");

  if(
    sidebar
    &&window.innerWidth<=1100
  ){
    sidebar.classList.add("collapsed");
  }

  $("#sidebarToggle")?.addEventListener(
    "click",
    ()=>sidebar?.classList.toggle("collapsed")
  );
}
export async function signOut() { await supabase.auth.signOut(); location.reload(); }
export async function currentSessionAndProfile() {
  const {data:{session},error} = await supabase.auth.getSession(); if (error) throw error; if (!session?.user) return {session:null,profile:null};
  const result = await supabase.from("profiles").select("id,email,full_name,whatsapp,role,status,parent_id,business_name,avatar_url,notification_settings").eq("id",session.user.id).single();
  if (result.error) throw result.error; return {session,profile:result.data};
}
export function setupLogin({allowedRoles,onAuthenticated}) {
  const loginView=$("#loginView");
  const appView=$("#appView");
  const form=$("#loginForm");
  const errorBox=$("#loginError");

  const toggleUserMenu=force=>{
    const dropdown=$("#userMenuDropdown");
    if(!dropdown)return;
    const open=typeof force==="boolean"
      ?force
      :dropdown.hidden;
    dropdown.hidden=!open;
  };

  $("#userMenuToggle")?.addEventListener(
    "click",
    event=>{
      event.stopPropagation();
      toggleUserMenu();
    }
  );

  document.addEventListener("click",()=>{
    toggleUserMenu(false);
  });

  $("#userMenuDropdown")?.addEventListener(
    "click",
    event=>event.stopPropagation()
  );

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
        throw new Error("Tu usuario está inactivo o eliminado.");
      }

      if(!allowedRoles.includes(profile.role)){
        await supabase.auth.signOut();
        throw new Error("Este usuario no tiene acceso a este portal.");
      }

      loginView.hidden=true;
      appView.hidden=false;
      await onAuthenticated({session,profile});
    }catch(error){
      loginView.hidden=false;
      appView.hidden=true;
      errorBox.hidden=false;
      errorBox.textContent=
        error.message||"No se pudo iniciar sesión.";
    }finally{
      hidePageLoader();
    }
  };

  form?.addEventListener("submit",async event=>{
    event.preventDefault();
    errorBox.hidden=true;
    const button=form.querySelector("button[type=submit]");
    button.disabled=true;
    button.textContent="Ingresando...";

    try{
      const {error}=await supabase.auth.signInWithPassword({
        email:$("#loginEmail").value.trim(),
        password:$("#loginPassword").value
      });
      if(error)throw error;
      await enter();
    }catch(error){
      errorBox.hidden=false;
      errorBox.textContent=
        error.message==="Invalid login credentials"
          ?"Correo o contraseña incorrectos."
          :(error.message||"No se pudo iniciar sesión.");
    }finally{
      button.disabled=false;
      button.textContent="Ingresar";
    }
  });

  $("#logoutBtn")?.addEventListener("click",signOut);
  $("#userMenuLogout")?.addEventListener("click",signOut);

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



/* ================================================================
   V6.9.7 · SONIDO Y RECEPCIÓN DE NOTIFICACIONES
   ================================================================ */
let notificationAudio=null;
let notificationAudioUnlocked=false;
let notificationWatcherChannel=null;
let notificationWatcherTimer=null;
let notificationWatcherVisibleHandler=null;
let notificationWatcherRunning=false;
let notificationKnownRecipientIds=new Set();

function getNotificationAudio(){
  if(notificationAudio){
    return notificationAudio;
  }

  notificationAudio=new Audio(
    new URL(
      "../assets/notification-alert.mp3",
      import.meta.url
    ).href
  );

  notificationAudio.preload="auto";
  notificationAudio.volume=1;

  return notificationAudio;
}

function prepareNotificationAudio(){
  const unlock=async()=>{
    if(notificationAudioUnlocked){
      return;
    }

    const audio=getNotificationAudio();

    try{
      audio.muted=true;
      audio.currentTime=0;
      await audio.play();
      audio.pause();
      audio.currentTime=0;
      audio.muted=false;
      notificationAudioUnlocked=true;
    }catch{
      audio.muted=false;
    }
  };

  document.addEventListener(
    "pointerdown",
    unlock,
    {
      once:true,
      capture:true
    }
  );

  document.addEventListener(
    "keydown",
    unlock,
    {
      once:true,
      capture:true
    }
  );
}

prepareNotificationAudio();

export async function playNotificationSound(){
  const audio=getNotificationAudio();

  try{
    audio.muted=false;
    audio.currentTime=0;
    await audio.play();
    notificationAudioUnlocked=true;
    return true;
  }catch(error){
    console.warn(
      "El navegador todavía no permitió reproducir el sonido:",
      error
    );

    return false;
  }
}

export function stopNotificationWatcher(){
  if(notificationWatcherTimer){
    window.clearInterval(notificationWatcherTimer);
    notificationWatcherTimer=null;
  }

  if(notificationWatcherChannel){
    supabase.removeChannel(notificationWatcherChannel);
    notificationWatcherChannel=null;
  }

  if(notificationWatcherVisibleHandler){
    document.removeEventListener(
      "visibilitychange",
      notificationWatcherVisibleHandler
    );
    notificationWatcherVisibleHandler=null;
  }

  notificationWatcherRunning=false;
  notificationKnownRecipientIds=new Set();
}

export function startNotificationWatcher({
  userId,
  onItems,
  pollMilliseconds=12000
}={}){
  stopNotificationWatcher();

  if(!userId){
    return null;
  }

  const visibleItems=
    document.__notificationItems||[];

  notificationKnownRecipientIds=new Set(
    visibleItems.map(item=>item.id)
  );

  const refresh=async({
    sound=true
  }={})=>{
    if(notificationWatcherRunning){
      return;
    }

    notificationWatcherRunning=true;

    try{
      const items=await loadNotifications();

      const alreadyVisible=new Set([
        ...notificationKnownRecipientIds,
        ...(document.__notificationItems||[])
          .map(item=>item.id)
      ]);

      const newUnread=items.filter(
        item=>
          !item.read_at
          &&!alreadyVisible.has(item.id)
      );

      notificationKnownRecipientIds=new Set(
        items.map(item=>item.id)
      );

      if(sound&&newUnread.length){
        await playNotificationSound();
      }

      await onItems?.(
        items,
        {
          newUnread
        }
      );
    }catch(error){
      console.warn(
        "No se pudieron actualizar las notificaciones:",
        error
      );
    }finally{
      notificationWatcherRunning=false;
    }
  };

  notificationWatcherChannel=supabase
    .channel(
      `notification-recipient-${userId}-${crypto.randomUUID()}`
    )
    .on(
      "postgres_changes",
      {
        event:"INSERT",
        schema:"public",
        table:"notification_recipients",
        filter:`recipient_id=eq.${userId}`
      },
      ()=>refresh({sound:true})
    )
    .subscribe();

  notificationWatcherTimer=window.setInterval(
    ()=>refresh({sound:true}),
    Math.max(6000,Number(pollMilliseconds)||12000)
  );

  notificationWatcherVisibleHandler=()=>{
    if(document.visibilityState==="visible"){
      refresh({sound:true});
    }
  };

  document.addEventListener(
    "visibilitychange",
    notificationWatcherVisibleHandler
  );

  return {
    refresh,
    stop:stopNotificationWatcher
  };
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

export function maybeShowBrowserNotifications(
  items,
  profile
){
  const settings=profile?.notification_settings||{};

  if(
    !settings.browser
    ||!("Notification" in window)
    ||Notification.permission!=="granted"
  ){
    return;
  }

  if(!document.__browserNotificationShownIds){
    document.__browserNotificationShownIds=new Set();
  }

  items
    .filter(item=>
      !item.read_at
      &&!document.__browserNotificationShownIds.has(item.id)
    )
    .slice(0,3)
    .forEach(item=>{
      const notification=item.notification||{};

      document.__browserNotificationShownIds.add(item.id);

      new Notification(
        notification.title||"Nueva notificación",
        {
          body:notification.message||"",
          icon:notification.image_url||undefined
        }
      );
    });
}
