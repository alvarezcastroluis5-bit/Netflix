import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, USER_MANAGER_FUNCTION } from "./config.js";

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
export function parseEmailBlock(rawValue){return [...new Set(String(rawValue||"").split(/[\n,;]+/).map(v=>v.trim().toLowerCase()).filter(Boolean))];}
export async function uploadPublicImage(bucket,file,folder){if(!file)return null;const extension=file.name.split(".").pop()?.toLowerCase()||"jpg";const path=`${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;const {error}=await supabase.storage.from(bucket).upload(path,file,{cacheControl:"3600",upsert:false});if(error)throw error;return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;}
export async function loadNotifications(){const {data,error}=await supabase.from("notification_recipients").select("id,read_at,created_at,notification:notification_id(id,title,message,image_url,created_at,sender:sender_id(full_name))").order("created_at",{ascending:false});if(error)throw error;return data||[];}
export function updateNotificationBadge(items=[]){const unread=items.filter(i=>!i.read_at).length,badge=$("#notificationBadge");if(!badge)return;badge.textContent=unread;badge.hidden=unread===0;}
export async function showNotificationsModal(items,onRead){const modal=openModal({title:"Notificaciones",wide:true,body:`<div class="notification-modal-list">${items.length?items.map(item=>{const n=item.notification||{};return `<article class="notification-card ${item.read_at?"":"unread"}" data-notification-recipient="${item.id}">${n.image_url?`<img src="${escapeHtml(n.image_url)}" alt="">`:""}<div><div class="notification-meta"><strong>${escapeHtml(n.title||"Notificación")}</strong><small>${formatDate(n.created_at,true)}</small></div><p>${escapeHtml(n.message||"")}</p><small>Enviado por ${escapeHtml(n.sender?.full_name||"Administración")}</small></div></article>`;}).join(""):`<div class="empty-state">No tienes notificaciones.</div>`}</div>`});
  $$('[data-notification-recipient]',modal.root).forEach(card=>card.addEventListener("click",async()=>{if(!card.classList.contains("unread"))return;const {error}=await supabase.rpc("mark_notification_read",{p_recipient_id:card.dataset.notificationRecipient});if(error)return toast(error.message,"error");card.classList.remove("unread");await onRead?.();}));
}
export function maybeShowBrowserNotifications(items,profile){const settings=profile?.notification_settings||{};if(!settings.browser||!("Notification"in window)||Notification.permission!=="granted")return;items.filter(i=>!i.read_at).slice(0,3).forEach(item=>{const n=item.notification||{};new Notification(n.title||"Nueva notificación",{body:n.message||"",icon:n.image_url||undefined});});}
