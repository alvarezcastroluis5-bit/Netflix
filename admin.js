import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

export function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-BO", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { day: "2-digit", month: "2-digit", year: "numeric" }
  ).format(date);
}

export function statusLabel(status) {
  const map = {
    active: "Activo", inactive: "Inactivo", blocked: "Bloqueado",
    available: "Disponible", assigned: "Asignada", suspended: "Suspendida", retired: "Retirada",
    open: "Abierto", in_review: "En revisión", answered: "Respondido",
    waiting_user: "Esperando usuario", resolved: "Resuelto", closed: "Cerrado",
    expired: "Vencida", expiring: "Por vencer"
  };
  return map[status] || status || "—";
}

export function statusClass(status) {
  if (["active", "available", "resolved", "answered"].includes(status)) return "green";
  if (["expiring", "in_review", "waiting_user", "assigned"].includes(status)) return "amber";
  if (["inactive", "suspended"].includes(status)) return "gray";
  if (["blocked", "retired", "closed", "expired"].includes(status)) return "red";
  return "blue";
}

export function toast(message, type = "success") {
  const root = $("#toastRoot");
  if (!root) return;
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => node.classList.add("show"), 20);
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 250);
  }, 3600);
}

export function openModal({ title, body, actions = "", wide = false }) {
  const root = $("#modalRoot");
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
        <header><h2>${escapeHtml(title)}</h2><button class="icon-btn modal-close">×</button></header>
        <div class="modal-body">${body}</div>
        ${actions ? `<footer>${actions}</footer>` : ""}
      </section>
    </div>`;
  const close = () => root.innerHTML = "";
  $(".modal-close", root)?.addEventListener("click", close);
  $(".modal-backdrop", root)?.addEventListener("click", event => {
    if (event.target.classList.contains("modal-backdrop")) close();
  });
  return { root, close };
}

export function wireNavigation(onChange) {
  $$(".nav-item").forEach(button => {
    button.addEventListener("click", () => showSection(button.dataset.section, onChange));
  });
  $$("[data-go]").forEach(button => {
    button.addEventListener("click", () => showSection(button.dataset.go, onChange));
  });
  $("#sidebarToggle")?.addEventListener("click", () => $("#sidebar")?.classList.toggle("collapsed"));
}

export function showSection(section, onChange) {
  $$(".page-section").forEach(node => node.classList.toggle("active", node.id === `section-${section}`));
  $$(".nav-item").forEach(node => node.classList.toggle("active", node.dataset.section === section));
  if (window.innerWidth < 900) $("#sidebar")?.classList.add("collapsed");
  onChange?.(section);
}

export async function signIn(email, password, remember = true) {
  if (!remember) {
    try { localStorage.removeItem("sb-rmligdfmfwpmdsllembk-auth-token"); } catch {}
  }
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  await supabase.auth.signOut();
  location.reload();
}

export async function currentSessionAndProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { session: null, profile: null };
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, whatsapp, role, status, parent_id, business_name")
    .eq("id", session.user.id)
    .single();
  if (error) throw error;
  return { session, profile };
}

export function setupLogin({ allowedRoles, onAuthenticated }) {
  const loginView = $("#loginView");
  const appView = $("#appView");
  const form = $("#loginForm");
  const errorBox = $("#loginError");

  const enter = async () => {
    try {
      const { session, profile } = await currentSessionAndProfile();
      if (!session || !profile) {
        loginView.hidden = false;
        appView.hidden = true;
        return;
      }
      if (profile.status !== "active") {
        await supabase.auth.signOut();
        throw new Error("Tu usuario está inactivo o bloqueado.");
      }
      if (!allowedRoles.includes(profile.role)) {
        await supabase.auth.signOut();
        throw new Error("Este usuario no tiene acceso a este portal.");
      }
      loginView.hidden = true;
      appView.hidden = false;
      await onAuthenticated({ session, profile });
    } catch (error) {
      loginView.hidden = false;
      appView.hidden = true;
      errorBox.hidden = false;
      errorBox.textContent = error.message || "No se pudo iniciar sesión.";
    }
  };

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    errorBox.hidden = true;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Ingresando...";
    try {
      const { error } = await signIn(
        $("#loginEmail").value.trim(),
        $("#loginPassword").value,
        $("#rememberSession").checked
      );
      if (error) throw error;
      await enter();
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error.message === "Invalid login credentials"
        ? "Correo o contraseña incorrectos."
        : (error.message || "No se pudo iniciar sesión.");
    } finally {
      button.disabled = false;
      button.textContent = "Ingresar";
    }
  });

  $("#logoutBtn")?.addEventListener("click", signOut);
  enter();
}
