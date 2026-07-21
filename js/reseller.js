import {
  supabase, $, $$, escapeHtml, formatDate, statusLabel, statusClass,
  toast, openModal, wireNavigation, setupLogin, createUserSecurely
} from "./core.js";

let state = {
  profile: null, network: [], clients: [], accounts: [], assignments: [],
  tickets: [], history: [], content: [], parent: null
};

setupLogin({
  allowedRoles: ["reseller"],
  onAuthenticated: async ({ profile }) => {
    state.profile = profile;
    $("#topUserName").textContent = profile.full_name;
    $("#welcomeTitle").textContent = `¡Bienvenido, ${profile.full_name}! 👋`;
    wireNavigation(loadSection);
    bindActions();
    await loadAll();
  }
});

function bindActions() {
  $("#openNetflixService")?.addEventListener("click", netflixServiceModal);
  $("#openCreateReseller")?.addEventListener("click", createResellerModal);
  $("#openCreateClient")?.addEventListener("click", createClientModal);
  $("#openCreateTicket")?.addEventListener("click", createTicketModal);
  $("#accountSearch")?.addEventListener("input", renderAccounts);
}

async function loadAll() {
  await Promise.allSettled([
    loadNetwork(), loadClients(), loadAccountsAndAssignments(),
    loadTickets(), loadHistory(), loadContent(), loadParent()
  ]);
  renderDashboard();
}

async function loadSection(section) {
  if (section === "network") await loadNetwork();
  if (section === "clients") await loadClients();
  if (section === "accounts") await loadAccountsAndAssignments();
  if (section === "tickets") await loadTickets();
  if (section === "history") await loadHistory();
  if (section === "content") await loadContent();
}

async function loadNetwork() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, whatsapp, status, parent_id, created_at")
    .eq("role", "reseller")
    .neq("id", state.profile.id)
    .order("created_at", { ascending: false });
  if (error) return toast(error.message, "error");
  state.network = data || [];
  const names = new Map([[state.profile.id, state.profile.full_name], ...state.network.map(x => [x.id, x.full_name])]);
  $("#networkTable").innerHTML = state.network.length ? state.network.map(user => `
    <tr><td><strong>${escapeHtml(user.full_name)}</strong></td><td>${escapeHtml(user.email)}</td>
    <td>${escapeHtml(user.whatsapp || "—")}</td><td>${escapeHtml(names.get(user.parent_id) || "—")}</td>
    <td><span class="status-pill ${statusClass(user.status)}">${statusLabel(user.status)}</span></td></tr>`).join("")
    : `<tr><td colspan="5" class="empty-cell">Aún no existen vendedores debajo de tu red.</td></tr>`;
}

async function loadClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("owner_id", state.profile.id)
    .order("created_at", { ascending: false });
  if (error) return toast(error.message, "error");
  state.clients = data || [];
  $("#clientsTable").innerHTML = state.clients.length ? state.clients.map(c => `
    <tr><td><strong>${escapeHtml(c.full_name)}</strong></td><td>${escapeHtml(c.email || "—")}</td>
    <td>${escapeHtml(c.whatsapp || "—")}</td><td><span class="status-pill ${statusClass(c.status)}">${statusLabel(c.status)}</span></td>
    <td>${formatDate(c.created_at)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="empty-cell">Aún no registraste clientes.</td></tr>`;
}

async function loadAccountsAndAssignments() {
  const [accountsRes, assignmentsRes] = await Promise.all([
    supabase.from("netflix_accounts").select(`
      id, current_email, account_type, status, current_reseller_id, current_client_id,
      reseller:current_reseller_id(full_name),
      client:current_client_id(full_name)
    `).order("created_at", { ascending: false }),
    supabase.from("account_assignment_summary").select("*").order("created_at", { ascending: false })
  ]);
  if (accountsRes.error) toast(accountsRes.error.message, "error");
  if (assignmentsRes.error) toast(assignmentsRes.error.message, "error");
  state.accounts = accountsRes.data || [];
  state.assignments = assignmentsRes.data || [];
  renderAccounts();
}

function myAssignmentFor(accountId) {
  return state.assignments.find(a => a.account_id === accountId && a.seller_id === state.profile.id && a.status === "active")
    || state.assignments.find(a => a.account_id === accountId && a.buyer_reseller_id === state.profile.id && a.status === "active");
}

function renderAccounts() {
  const search = ($("#accountSearch")?.value || "").toLowerCase();
  const rows = state.accounts.filter(a => `${a.current_email} ${a.client?.full_name || ""} ${a.reseller?.full_name || ""}`.toLowerCase().includes(search));
  $("#accountsTable").innerHTML = rows.length ? rows.map(a => {
    const asg = myAssignmentFor(a.id);
    const target = a.client?.full_name || a.reseller?.full_name || "Sin asignar";
    return `<tr>
      <td><strong>${escapeHtml(a.current_email)}</strong></td><td>${escapeHtml(target)}</td>
      <td>${formatDate(asg?.starts_on)}</td><td>${formatDate(asg?.expires_on)}</td>
      <td><span class="days-box ${statusClass(asg?.calculated_status)}">${asg?.days_remaining ?? "—"}</span></td>
      <td><span class="status-pill ${statusClass(asg?.calculated_status || a.status)}">${statusLabel(asg?.calculated_status || a.status)}</span></td>
      <td><button class="small-btn" data-assign="${a.id}">Asignar</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7" class="empty-cell">No existen cuentas visibles.</td></tr>`;
  $$("[data-assign]").forEach(btn => btn.addEventListener("click", () => assignAccountModal(btn.dataset.assign)));
}

async function loadTickets() {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(`
      id, ticket_number, title, category, status, account_email_snapshot,
      description, created_at, updated_at, account_id,
      creator:created_by(full_name)
    `)
    .order("updated_at", { ascending: false });
  if (error) return toast(error.message, "error");
  state.tickets = data || [];
  const open = state.tickets.filter(t => !["closed", "resolved"].includes(t.status)).length;
  $("#ticketBadge").textContent = open;
  $("#ticketsTable").innerHTML = state.tickets.length ? state.tickets.map(t => `
    <tr><td>#${t.ticket_number}</td><td>${escapeHtml(t.creator?.full_name || "—")}</td>
    <td><strong>${escapeHtml(t.title)}</strong></td><td>${escapeHtml(t.category)}</td>
    <td><span class="status-pill ${statusClass(t.status)}">${statusLabel(t.status)}</span></td>
    <td>${escapeHtml(t.account_email_snapshot)}</td><td>${formatDate(t.updated_at, true)}</td>
    <td><button class="icon-action" data-ticket="${t.id}">◉</button></td></tr>`).join("")
    : `<tr><td colspan="8" class="empty-cell">No existen tickets.</td></tr>`;
  $$("[data-ticket]").forEach(btn => btn.addEventListener("click", () => openTicket(btn.dataset.ticket)));
}

async function loadHistory() {
  const { data, error } = await supabase
    .from("account_change_history")
    .select(`id, old_email, new_email, change_type, created_at, operator:performed_by(full_name)`)
    .order("created_at", { ascending: false });
  if (error) return toast(error.message, "error");
  state.history = data || [];
  $("#historyTable").innerHTML = state.history.length ? state.history.map(item => `
    <tr><td><div class="change-old">Anterior: ${escapeHtml(item.old_email)}</div><div class="change-new">Nuevo: ${escapeHtml(item.new_email)}</div></td>
    <td><span class="status-pill amber">${escapeHtml(item.change_type)}</span></td>
    <td>${escapeHtml(item.operator?.full_name || "Sistema")}</td><td>${formatDate(item.created_at, true)}</td></tr>`).join("")
    : `<tr><td colspan="4" class="empty-cell">No existen cambios registrados.</td></tr>`;
}

async function loadContent() {
  const { data, error } = await supabase
    .from("entertainment_content")
    .select("*")
    .eq("status", "published")
    .order("display_order", { ascending: true });
  if (error) return toast(error.message, "error");
  state.content = data || [];
  $("#contentGrid").innerHTML = state.content.length ? state.content.map(contentCard).join("")
    : `<div class="empty-card">No hay contenido publicado.</div>`;
  $("#featuredContent").innerHTML = state.content.slice(0, 5).map(item => `
    <button class="poster-mini" data-trailer="${escapeHtml(item.trailer_url)}" data-title="${escapeHtml(item.title)}">
      <span style="background-image:url('${escapeHtml(item.cover_url || "")}')"></span><strong>${escapeHtml(item.title)}</strong>
    </button>`).join("") || `<div class="empty-state">No hay estrenos.</div>`;
  $$("[data-trailer]").forEach(btn => btn.addEventListener("click", () => trailerModal(btn.dataset.title, btn.dataset.trailer)));
}

function contentCard(item) {
  return `<article class="content-card">
    <div class="cover" style="background-image:url('${escapeHtml(item.cover_url || "")}')">
      <button class="play-btn" data-trailer="${escapeHtml(item.trailer_url)}" data-title="${escapeHtml(item.title)}">▶</button>
    </div>
    <div class="content-card-body"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.synopsis)}</p>
    <small>${escapeHtml(item.genre || "")}${item.release_year ? ` · ${item.release_year}` : ""}</small></div>
  </article>`;
}

async function loadParent() {
  const { data, error } = await supabase.rpc("get_my_parent_contact");
  if (error) {
    $("#parentWhatsappBtn").hidden = true;
    return;
  }
  state.parent = Array.isArray(data) ? data[0] : data;
  if (!state.parent?.whatsapp) {
    $("#parentWhatsappBtn").hidden = true;
    return;
  }
  const message = encodeURIComponent(`Hola ${state.parent.full_name}, soy ${state.profile.full_name}. Necesito ayuda con mi cuenta.`);
  $("#parentWhatsappBtn").href = `https://wa.me/${state.parent.whatsapp}?text=${message}`;
}

function renderDashboard() {
  $("#statNetwork").textContent = state.network.length;
  $("#statAccounts").textContent = state.accounts.length;
  const expiring = state.assignments.filter(a => a.days_remaining <= 3 && a.days_remaining >= 0 && a.status === "active");
  $("#statExpiring").textContent = expiring.length;
  $("#statTickets").textContent = state.tickets.filter(t => !["closed", "resolved"].includes(t.status)).length;

  $("#dashboardAccountsTable").innerHTML = state.accounts.slice(0, 6).map(a => {
    const asg = myAssignmentFor(a.id);
    return `<tr><td><strong>${escapeHtml(a.current_email)}</strong></td>
    <td>${escapeHtml(a.client?.full_name || a.reseller?.full_name || "—")}</td>
    <td>${formatDate(asg?.starts_on)}</td><td><span class="status-pill ${statusClass(asg?.calculated_status)}">${asg?.days_remaining ?? "—"} días</span></td>
    <td>${formatDate(asg?.expires_on)}</td><td><span class="status-pill ${statusClass(asg?.calculated_status || a.status)}">${statusLabel(asg?.calculated_status || a.status)}</span></td></tr>`;
  }).join("") || `<tr><td colspan="6" class="empty-cell">No existen cuentas.</td></tr>`;

  $("#upcomingPayments").className = "list-stack";
  $("#upcomingPayments").innerHTML = state.assignments
    .filter(a => a.status === "active")
    .sort((a, b) => (a.days_remaining ?? 999) - (b.days_remaining ?? 999))
    .slice(0, 5)
    .map(a => `<div class="list-row"><span><strong>${formatDate(a.expires_on)}</strong><small>Cuenta asignada</small></span><span class="status-pill ${statusClass(a.calculated_status)}">${a.days_remaining} días</span></div>`)
    .join("") || `<div class="empty-state">Sin cobros próximos.</div>`;

  $("#recentTickets").className = "list-stack";
  $("#recentTickets").innerHTML = state.tickets.slice(0, 5).map(t => `
    <button class="list-row" data-ticket="${t.id}"><span><strong>${escapeHtml(t.title)}</strong><small>#${t.ticket_number} · ${escapeHtml(t.creator?.full_name || "")}</small></span><span class="status-pill ${statusClass(t.status)}">${statusLabel(t.status)}</span></button>`
  ).join("") || `<div class="empty-state">Sin tickets.</div>`;
  $$("[data-ticket]").forEach(btn => btn.addEventListener("click", () => openTicket(btn.dataset.ticket)));
}

function netflixServiceModal() {
  openModal({
    title: "Opciones de Netflix",
    wide: true,
    body: `<div class="service-options">
      ${[
        ["Restablecer contraseña", "Solicitar cambio de contraseña"],
        ["Código de inicio de sesión", "Enviar código de acceso"],
        ["Actualizar hogar", "Actualizar el hogar de Netflix"],
        ["Nueva solicitud de inicio", "Solicitud para TV"],
        ["Código de acceso temporal", "Acceso temporal"],
        ["Código de verificación", "Código de seis dígitos"]
      ].map(([title, desc]) => `<button class="option-card"><span class="status-pill green">Disponible</span><strong>${title}</strong><small>${desc}</small></button>`).join("")}
    </div><div class="notice">Estas opciones podrán conectarse posteriormente a automatizaciones o solicitudes internas.</div>`
  });
}

function createResellerModal() {
  const modal = openModal({
    title: "Crear nuevo revendedor",
    body: `<form id="createResellerForm" class="form-grid">
      <label><span>Nombre completo</span><input name="full_name" required minlength="3"></label>
      <label><span>Correo electrónico</span><input name="email" type="email" required></label>
      <label><span>Contraseña</span><input name="password" type="password" required minlength="8"></label>
      <label><span>WhatsApp</span><input name="whatsapp" required></label>
      <label class="full"><span>Nombre comercial</span><input name="business_name"></label>
      <input type="hidden" name="role" value="reseller">
    </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button id="saveReseller" class="btn primary">Crear</button>`
  });
  $(".modal-cancel", modal.root).addEventListener("click", modal.close);
  $("#saveReseller", modal.root).addEventListener("click", async () => {
    const form = $("#createResellerForm", modal.root);
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form).entries());
    const button = $("#saveReseller", modal.root);
    button.disabled = true;
    button.textContent = "Creando...";

    try {
      const data = await createUserSecurely(body);
      toast(data?.message || "Revendedor creado.");
      modal.close();
      await loadNetwork();
    } catch (error) {
      toast(error.message || "No se pudo crear el revendedor.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Crear";
    }
  });
}

function createClientModal() {
  const modal = openModal({
    title: "Crear cliente",
    body: `<form id="createClientForm" class="form-grid">
      <label><span>Nombre completo</span><input name="full_name" required></label>
      <label><span>Correo</span><input name="email" type="email"></label>
      <label><span>WhatsApp</span><input name="whatsapp"></label>
      <label class="full"><span>Notas</span><textarea name="notes"></textarea></label>
    </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button id="saveClient" class="btn primary">Guardar</button>`
  });
  $(".modal-cancel", modal.root).addEventListener("click", modal.close);
  $("#saveClient", modal.root).addEventListener("click", async () => {
    const form = $("#createClientForm", modal.root);
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    values.owner_id = state.profile.id;
    const { error } = await supabase.from("clients").insert(values);
    if (error) return toast(error.message, "error");
    toast("Cliente registrado.");
    modal.close();
    await loadClients();
  });
}

function assignAccountModal(accountId) {
  const account = state.accounts.find(a => a.id === accountId);
  const directChildren = state.network.filter(x => x.parent_id === state.profile.id);
  const modal = openModal({
    title: "Asignar cuenta",
    body: `<div class="notice">Cuenta: <strong>${escapeHtml(account.current_email)}</strong><br>Cada asignación utiliza exactamente 30 días.</div>
      <form id="assignAccountForm" class="form-grid">
        <label><span>Asignar a</span><select name="target_type"><option value="client">Cliente final</option><option value="reseller">Revendedor directo</option></select></label>
        <label><span>Fecha de inicio</span><input name="starts_on" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
        <label class="full target-client"><span>Cliente</span><select name="client_id">${state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.full_name)}</option>`).join("")}</select></label>
        <label class="full target-reseller" hidden><span>Revendedor</span><select name="reseller_id">${directChildren.map(r => `<option value="${r.id}">${escapeHtml(r.full_name)}</option>`).join("")}</select></label>
      </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button id="saveAssignment" class="btn primary">Asignar</button>`
  });
  const type = $('[name="target_type"]', modal.root);
  type.addEventListener("change", () => {
    $(".target-client", modal.root).hidden = type.value !== "client";
    $(".target-reseller", modal.root).hidden = type.value !== "reseller";
  });
  $(".modal-cancel", modal.root).addEventListener("click", modal.close);
  $("#saveAssignment", modal.root).addEventListener("click", async () => {
    const form = $("#assignAccountForm", modal.root);
    const values = Object.fromEntries(new FormData(form).entries());
    const rpc = values.target_type === "client" ? "assign_account_to_client" : "assign_account_to_reseller";
    const params = values.target_type === "client"
      ? { p_account_id: accountId, p_client_id: values.client_id, p_starts_on: values.starts_on }
      : { p_account_id: accountId, p_buyer_reseller_id: values.reseller_id, p_starts_on: values.starts_on };
    const { data, error } = await supabase.rpc(rpc, params);
    if (error) return toast(error.message, "error");
    toast(data?.message || "Cuenta asignada.");
    modal.close();
    await loadAccountsAndAssignments();
  });
}

function createTicketModal() {
  const modal = openModal({
    title: "Nuevo ticket de soporte",
    body: `<form id="createTicketForm" class="form-grid">
      <label class="full"><span>Cuenta afectada</span><select name="account_id" required>${state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.current_email)}</option>`).join("")}</select></label>
      <label><span>Título</span><input name="title" required></label>
      <label><span>Categoría</span><select name="category"><option>Cuenta caída</option><option>Sin suscripción</option><option>Contraseña incorrecta</option><option>Código de inicio</option><option>Actualizar hogar</option><option>Otro</option></select></label>
      <label class="full"><span>Descripción</span><textarea name="description" required></textarea></label>
    </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button id="saveTicket" class="btn primary">Crear ticket</button>`
  });
  $(".modal-cancel", modal.root).addEventListener("click", modal.close);
  $("#saveTicket", modal.root).addEventListener("click", async () => {
    const form = $("#createTicketForm", modal.root);
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    const { data, error } = await supabase.rpc("create_support_ticket", {
      p_account_id: values.account_id,
      p_client_id: null,
      p_title: values.title,
      p_category: values.category,
      p_description: values.description
    });
    if (error) return toast(error.message, "error");
    toast(data?.message || "Ticket creado.");
    modal.close();
    await loadTickets();
  });
}

async function openTicket(ticketId) {
  const ticket = state.tickets.find(x => x.id === ticketId);
  const { data: messages, error } = await supabase
    .from("ticket_messages")
    .select("id, message, is_system, created_at, author:author_id(full_name)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) return toast(error.message, "error");
  const modal = openModal({
    title: ticket.title,
    wide: true,
    body: `<div class="ticket-meta"><span class="status-pill ${statusClass(ticket.status)}">${statusLabel(ticket.status)}</span>
      <span>Usuario: <strong>${escapeHtml(ticket.creator?.full_name || "—")}</strong></span>
      <span>Cuenta reportada: <strong>${escapeHtml(ticket.account_email_snapshot)}</strong></span></div>
      <h3>Descripción del caso</h3><div class="description-box">${escapeHtml(ticket.description)}</div>
      <h3>Historial de mensajes</h3><div class="messages">${(messages || []).map(m => `
        <article class="message ${m.is_system ? "system" : ""}"><header><strong>${escapeHtml(m.is_system ? "SISTEMA" : (m.author?.full_name || "Usuario"))}</strong><small>${formatDate(m.created_at, true)}</small></header><p>${escapeHtml(m.message)}</p></article>`).join("") || `<div class="empty-state">Sin mensajes.</div>`}</div>
      ${["closed", "resolved"].includes(ticket.status) ? "" : `<form id="replyTicketForm" class="reply-box"><textarea name="message" placeholder="Agregar mensaje..." required></textarea><button class="btn primary">Enviar</button></form>`}`
  });
  $("#replyTicketForm", modal.root)?.addEventListener("submit", async event => {
    event.preventDefault();
    const message = new FormData(event.currentTarget).get("message");
    const { error: msgError } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId, author_id: state.profile.id, message, is_system: false
    });
    if (msgError) return toast(msgError.message, "error");
    toast("Mensaje enviado.");
    modal.close();
    await loadTickets();
  });
}

function trailerModal(title, url) {
  const safeUrl = String(url || "");
  const youtubeId = safeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/)?.[1];
  const media = youtubeId
    ? `<iframe class="trailer-frame" src="https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}" allowfullscreen></iframe>`
    : `<video class="trailer-frame" src="${escapeHtml(safeUrl)}" controls autoplay></video>`;
  openModal({ title, body: media, wide: true });
}
