console.info("Centro Premium core V6.9.19.5 cargado");
console.info("Centro Premium Netflix V6.9.8 cargado");
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

/*
 * V6.9.18.3 · CARGADOR POR ACCIÓN REAL
 *
 * No existe una ventana de varios segundos. Una solicitud solo se considera
 * interactiva cuando nace inmediatamente de un clic, cambio o envío real.
 * El sondeo, la renovación de sesión y todas las sincronizaciones periódicas
 * pasan siempre en silencio.
 */
let silentRequestDepth = 0;
let trustedGestureActive = false;
let trustedGestureTimer = null;

function isUserActionElement(target) {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest([
    "button",
    "a[href]",
    "[role='button']",
    "input[type='submit']",
    "input[type='button']",
    "input[type='file']",
    "input[type='checkbox']",
    "input[type='radio']",
    "select",
    "[data-action]",
    "[data-go]",
    ".nav-link"
  ].join(",")));
}

function beginTrustedGesture(event) {
  if (!event?.isTrusted) return;
  if (event.type !== "submit" && !isUserActionElement(event.target)) return;

  const element = event.target.closest(
    "button,a[href],[role='button'],input,select,[data-action],[data-go],.nav-link"
  );

  if (element?.disabled || element?.getAttribute?.("aria-disabled") === "true") {
    return;
  }

  trustedGestureActive = true;
  window.clearTimeout(trustedGestureTimer);
  trustedGestureTimer = window.setTimeout(() => {
    trustedGestureActive = false;
  }, 240);
}

document.addEventListener("pointerdown", beginTrustedGesture, true);
document.addEventListener("submit", beginTrustedGesture, true);
document.addEventListener("change", beginTrustedGesture, true);

export async function withSilentRequests(task) {
  silentRequestDepth += 1;

  try {
    return await task();
  } finally {
    silentRequestDepth = Math.max(0, silentRequestDepth - 1);
  }
}

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
        <strong>Procesando</strong>
        <span>Procesando tu acción…</span>
      </div>
    </div>
  `;

  document.body.appendChild(root);
  return root;
}

export function showPageLoader(message = "Procesando tu acción…") {
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
  }, 180);
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

  const interactive =
    silentRequestDepth === 0 &&
    trustedGestureActive &&
    document.visibilityState !== "hidden";

  if (!interactive) {
    return nativeFetch(input, init);
  }

  showPageLoader("Procesando tu acción…");

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

  // Las columnas DATE de Supabase llegan como YYYY-MM-DD. Crear un Date
  // directamente con ese texto lo interpreta en UTC y, en Bolivia, puede
  // mostrar el día anterior. Para fechas sin hora conservamos el día exacto.
  if (!withTime && typeof value === "string") {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return `${day}/${month}/${year}`;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(
    "es-BO",
    withTime
      ? {dateStyle:"short",timeStyle:"short"}
      : {day:"2-digit",month:"2-digit",year:"numeric"}
  ).format(date);
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
  const STREAMING_GENERAL_PIN = "071726";

  /*
   * Módulo unificado para Netflix y Disney. La cuenta se identifica
   * automáticamente en Supabase a partir del correo validado.
   */
  const STREAMING_EMBED_URL = atob(
    "aHR0cHM6Ly9qcC1zdHJlYW1pbmcucGFnZXMuZGV2Lw=="
  );

  const operations = [
    ["restablecer_contrasena", "▤", "Restablecer clave"],
    ["inicio_sesion_codigo", "▣", "Inicio de sesión por código"],
    ["actualizar_hogar", "⌂", "Actualizar hogar"],
    ["acceso_temporal", "◷", "Código de acceso temporal"],
    ["codigo_6_digitos", "⠿", "Código de 6 dígitos"]
  ];

  const modal = openModal({
    title: "Netflix / Disney",
    extraWide: true,
    body: `
      <section class="netflix-v16-shell">
        <section id="netflixV16ValidationStage">
          <div class="netflix-v16-intro">
            <span class="eyebrow">CONTROL DE ACCESO</span>
            <h3>Valida tu cuenta de Netflix o Disney</h3>
            <p>
              Ingresa el correo. El sistema verificará que la cuenta esté
              asignada exactamente a tu usuario.
            </p>
          </div>

          <form id="netflixV16Form" class="netflix-native-form">
            <label>
              <span>Correo de la cuenta Netflix / Disney</span>

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
              <strong>${STREAMING_GENERAL_PIN}</strong>
              <p id="streamingV16PinHelp">
                Coloca este PIN dentro de la herramienta. Luego selecciona
                la plataforma identificada, pega el correo validado y pulsa
                Buscar código.
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
              <span>Plataforma</span>
              <strong id="streamingV16Service"></strong>
            </div>

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
              <strong>Cargando herramienta Netflix / Disney…</strong>
            </div>

            <iframe
              id="netflixV16Frame"
              class="netflix-v16-frame"
              title="Herramienta Netflix y Disney"
              src="about:blank"
              scrolling="yes"
              loading="eager"
              referrerpolicy="no-referrer"
              allow="clipboard-read; clipboard-write"
            ></iframe>

            <div class="netflix-v16-mask netflix-v16-mask-top"></div>
            <div class="netflix-v16-mask netflix-v16-mask-bottom"></div>

            <div
              id="netflixV16EmailCover"
              class="netflix-v16-email-cover"
              aria-hidden="true"
            >
              <strong id="netflixV16CoveredEmail"></strong>
            </div>
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
  const toolService = $("#streamingV16Service", modal.root);
  const toolEmail = $("#netflixV16ToolEmail", modal.root);
  const toolCountry = $("#netflixV16ToolCountry", modal.root);
  const toolOperation = $("#netflixV16ToolOperation", modal.root);
  const pinHelp = $("#streamingV16PinHelp", modal.root);
  const coveredEmail = $("#netflixV16CoveredEmail", modal.root);
  const emailCover = $("#netflixV16EmailCover", modal.root);
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

  function normalizedService(data) {
    const raw = String(data?.service || data?.platform || "netflix")
      .trim()
      .toLowerCase();
    return raw.includes("disney") ? "disney" : "netflix";
  }

  function serviceName(data) {
    return normalizedService(data) === "disney" ? "Disney" : "Netflix";
  }

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
    )?.[2] || "Operación";
  }

  function showValidationError(message) {
    validationBox.className = "netflix-native-validation error";
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
        { p_email: emailInput.value.trim().toLowerCase() }
      );

      if (error) throw error;

      verified = data;
      selectedOperation = "";
      emailInput.value = data.email;
      const platformName = serviceName(data);

      validationBox.className = "netflix-native-validation success";
      validationBox.innerHTML = `
        <strong>✓ Acceso validado correctamente</strong>
        <span>Plataforma: ${escapeHtml(platformName)}</span>
        <span>Correo: ${escapeHtml(data.email)}</span>
        <span>País: ${escapeHtml(data.country || "Sin configurar")}</span>
      `;
      validationBox.hidden = false;

      operationInputs.forEach(input => { input.checked = false; });
      operationStage.hidden = false;
      operationStage.scrollIntoView({ behavior: "smooth", block: "nearest" });
      toast(`Cuenta ${platformName} validada correctamente.`);
    } catch (error) {
      verified = null;
      showValidationError(
        error.message ||
        "La cuenta Netflix o Disney no pertenece a tu usuario ni a tu red subordinada."
      );
    } finally {
      validateButton.disabled = false;
      validateButton.textContent = "Validar acceso";
    }
  }

  async function showTool(operation) {
    if (!verified) {
      toast("Primero valida el correo de la cuenta.", "error");
      return;
    }

    selectedOperation = operation;
    const platformName = serviceName(verified);

    toolService.textContent = platformName;
    toolEmail.textContent = verified.email;
    toolCountry.textContent = verified.country || "Sin configurar";
    toolOperation.textContent = operationLabel(operation);
    pinHelp.textContent =
      `Coloca este PIN dentro de la herramienta. Luego selecciona ${platformName}, ` +
      "pega el correo validado y pulsa Buscar código.";

    coveredEmail.textContent = verified.email;
    emailCover.classList.remove("show-email");
    toolStage.hidden = false;
    loader.hidden = false;

    if (frame.src === "about:blank") {
      frame.src = STREAMING_EMBED_URL;
    }

    await copyText(STREAMING_GENERAL_PIN, "PIN 071726 copiado.");
    toolStage.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  validateButton.onclick = validateProperty;

  emailInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      validateProperty();
    }
  });

  operationInputs.forEach(input => {
    input.addEventListener("change", () => showTool(input.value));
  });

  frame.addEventListener("load", () => { loader.hidden = true; });

  copyPinButton.onclick = () => copyText(
    STREAMING_GENERAL_PIN,
    "PIN copiado."
  );

  copyEmailButton.onclick = async () => {
    await copyText(verified?.email || "", "Correo copiado.");
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
    showPageLoader("Ingresando a tu panel…");

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

async function getUserManagerSession(forceRefresh=false){
  let session=null;

  if(forceRefresh){
    const {data,error}=await supabase.auth.refreshSession();
    if(error)throw error;
    session=data?.session||null;
  }else{
    const {data,error}=await supabase.auth.getSession();
    if(error)throw error;
    session=data?.session||null;

    const expiresAt=Number(session?.expires_at||0)*1000;
    if(session&&expiresAt&&expiresAt-Date.now()<90_000){
      const refreshed=await supabase.auth.refreshSession();
      if(refreshed.error)throw refreshed.error;
      session=refreshed.data?.session||session;
    }
  }

  if(!session?.access_token){
    throw new Error("Tu sesión venció. Cierra sesión e ingresa nuevamente.");
  }

  return session;
}

async function invokeUserManager(payload,forceRefresh=false){
  const session=await getUserManagerSession(forceRefresh);
  const response=await trackedFetch(
    `${SUPABASE_URL}/functions/v1/${USER_MANAGER_FUNCTION}`,
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        Authorization:`Bearer ${session.access_token}`,
        apikey:SUPABASE_PUBLISHABLE_KEY
      },
      body:JSON.stringify(payload)
    }
  );

  const raw=await response.text();
  let result={};

  try{
    result=raw?JSON.parse(raw):{};
  }catch{
    result={error:raw||"Respuesta no válida."};
  }

  return {response,result};
}

export async function callUserManager(payload) {
  let attempt=await invokeUserManager(payload,false);
  const firstMessage=String(
    attempt.result?.error||attempt.result?.message||""
  );

  const jwtFailure=
    attempt.response.status===401&&
    /(jwt|token|signature|sesión|session)/i.test(firstMessage);

  if(jwtFailure){
    attempt=await invokeUserManager(payload,true);
  }

  if(!attempt.response.ok||attempt.result?.error){
    const message=String(
      attempt.result?.error||
      attempt.result?.message||
      `Error ${attempt.response.status}`
    );

    if(
      attempt.response.status===401&&
      /(jwt|signature|kid|token)/i.test(message)
    ){
      throw new Error(
        "La función de usuarios rechazó la sesión. En Supabase, abre " +
        "Edge Functions > hyper-processor y desactiva Verify JWT; " +
        "la función ya valida la sesión internamente."
      );
    }

    throw new Error(message);
  }

  return attempt.result;
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
   V6.9.18.8 · SONIDO CONFIABLE Y RECEPCIÓN DE NOTIFICACIONES
   ================================================================ */
let notificationAudio=null;
let notificationAudioUnlocked=false;
let notificationAudioContext=null;
let notificationAudioBuffer=null;
let notificationAudioBufferPromise=null;
let notificationWatcherChannel=null;
let notificationWatcherTimer=null;
let notificationWatcherVisibleHandler=null;
let notificationWatcherRunning=false;
let notificationKnownRecipientIds=new Set();

const notificationSoundUrl=new URL(
  "../assets/notification-alert.mp3",
  import.meta.url
).href;

function getNotificationAudio(){
  if(notificationAudio){
    return notificationAudio;
  }

  notificationAudio=new Audio(notificationSoundUrl);
  notificationAudio.preload="auto";
  notificationAudio.volume=1;
  notificationAudio.playsInline=true;

  return notificationAudio;
}

function getNotificationAudioContext(){
  const AudioContextClass=
    window.AudioContext||window.webkitAudioContext;

  if(!AudioContextClass){
    return null;
  }

  if(!notificationAudioContext){
    notificationAudioContext=new AudioContextClass();
  }

  return notificationAudioContext;
}

async function loadNotificationAudioBuffer(){
  if(notificationAudioBuffer){
    return notificationAudioBuffer;
  }

  if(notificationAudioBufferPromise){
    return notificationAudioBufferPromise;
  }

  const context=getNotificationAudioContext();
  if(!context){
    return null;
  }

  notificationAudioBufferPromise=(async()=>{
    const response=await fetch(notificationSoundUrl,{cache:"force-cache"});

    if(!response.ok){
      throw new Error(`No se pudo cargar el sonido (${response.status}).`);
    }

    const bytes=await response.arrayBuffer();
    notificationAudioBuffer=await context.decodeAudioData(bytes.slice(0));
    return notificationAudioBuffer;
  })();

  try{
    return await notificationAudioBufferPromise;
  }catch(error){
    notificationAudioBufferPromise=null;
    console.warn("No se pudo preparar el sonido de notificación:",error);
    return null;
  }
}

async function unlockNotificationAudio(){
  let unlocked=false;
  const context=getNotificationAudioContext();

  if(context){
    try{
      if(context.state==="suspended"){
        await context.resume();
      }

      if(context.state==="running"){
        notificationAudioUnlocked=true;
        unlocked=true;
        loadNotificationAudioBuffer();
      }
    }catch(error){
      console.warn("No se pudo activar Web Audio:",error);
    }
  }

  /* Respaldo para navegadores que no mantienen AudioContext activo. */
  const audio=getNotificationAudio();

  try{
    audio.load();
  }catch{}

  return unlocked;
}

function prepareNotificationAudio(){
  const events=["pointerdown","touchstart","keydown"];

  const unlock=async()=>{
    const unlocked=await unlockNotificationAudio();

    if(unlocked){
      events.forEach(eventName=>{
        document.removeEventListener(eventName,unlock,true);
      });
    }
  };

  events.forEach(eventName=>{
    document.addEventListener(eventName,unlock,true);
  });
}

prepareNotificationAudio();

export async function playNotificationSound(){
  const context=getNotificationAudioContext();

  if(context){
    try{
      if(context.state==="suspended"){
        await context.resume();
      }

      const buffer=await loadNotificationAudioBuffer();

      if(context.state==="running"&&buffer){
        const source=context.createBufferSource();
        source.buffer=buffer;
        source.connect(context.destination);
        source.start(0);
        notificationAudioUnlocked=true;
        return true;
      }
    }catch(error){
      console.warn("Web Audio no pudo reproducir la notificación:",error);
    }
  }

  const audio=getNotificationAudio();

  try{
    audio.muted=false;
    audio.volume=1;
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
  pollMilliseconds=8000
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
      const items=await withSilentRequests(
        ()=>loadNotifications()
      );

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
      async payload=>{
        const recipientId=payload?.new?.id;
        const isNew=recipientId
          ?!notificationKnownRecipientIds.has(recipientId)
          :true;

        if(recipientId){
          notificationKnownRecipientIds.add(recipientId);
        }

        if(isNew){
          await playNotificationSound();
        }

        await refresh({sound:false});
      }
    )
    .subscribe();

  notificationWatcherTimer=window.setInterval(
    ()=>refresh({sound:true}),
    Math.max(5000,Number(pollMilliseconds)||8000)
  );

  notificationWatcherVisibleHandler=()=>{
    if(document.visibilityState==="visible"){
      unlockNotificationAudio();
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
    .is("read_at",null)
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

  /*
   * La bandeja representa únicamente avisos pendientes. Al marcar uno
   * como leído se retira inmediatamente y no volverá a cargarse al
   * iniciar una nueva sesión, porque read_at queda guardado en Supabase.
   */
  const currentItems=[
    ...(document.__notificationItems||[])
  ].filter(current=>current.id!==item.id);

  document.__notificationItems=currentItems;
  updateNotificationBadge(currentItems);

  if(!currentItems.length){
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
              No tienes notificaciones pendientes.
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

let persistentNotificationHideTimer=null;
let notificationReminderTimer=null;
let notificationReminderSignature="";

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
    window.clearTimeout(persistentNotificationHideTimer);
    window.clearInterval(notificationReminderTimer);
    notificationReminderTimer=null;
    notificationReminderSignature="";
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

  const signature=unread.map(row=>row.id).sort().join(",");
  if(notificationReminderSignature!==signature){
    notificationReminderSignature=signature;
    window.clearInterval(notificationReminderTimer);
    notificationReminderTimer=window.setInterval(()=>{
      if(document.visibilityState==="visible"&&document.__notificationItems?.some(row=>!row.read_at)){
        playNotificationSound();
      }
    },5*60*1000);
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

  window.clearTimeout(persistentNotificationHideTimer);
  persistentNotificationHideTimer=window.setTimeout(()=>{
    root?.remove();
  },60*1000);
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
