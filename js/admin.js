import {
  supabase, $, $$, escapeHtml, formatDate, statusLabel, statusClass,
  toast, openModal, wireNavigation, setupLogin, createUserSecurely
} from "./core.js";

let state = {
  profile: null,
  users: [],
  accounts: [],
  tickets: [],
  history: [],
  content: []
};

setupLogin({
  allowedRoles: ["admin", "support"],
  onAuthenticated: async ({ profile }) => {
    state.profile = profile;
    $("#topUserName").textContent = profile.full_name;
    $("#topUserRole").textContent = profile.role === "admin" ? "Administrador" : "Soporte";
    $("#welcomeText").textContent = `Bienvenido, ${profile.full_name}.`;
    if (profile.role !== "admin") {
      $("#openCreateUser")?.remove();
      $("#openCreateAccount")?.remove();
      $("#openCreateContent")?.remove();
    }
    wireNavigation(loadSection);
    bindActions();
    await loadAll();
  }
});

function bindActions() {
  $("#refreshDashboard")?.addEventListener("click", loadAll);
  $("#openCreateUser")?.addEventListener("click", createUserModal);
  $("#openCreateAccount")?.addEventListener("click", createAccountModal);
  $("#openCreateContent")?.addEventListener("click", createContentModal);
  $("#userSearch")?.addEventListener("input", renderUsers);
  $("#userRoleFilter")?.addEventListener("change", renderUsers);
  $("#accountSearch")?.addEventListener("input", renderAccounts);
  $("#accountStatusFilter")?.addEventListener("change", renderAccounts);
  $("#ticketSearch")?.addEventListener("input", renderTickets);
  $("#ticketStatusFilter")?.addEventListener("change", renderTickets);
}

async function loadAll() {
  await Promise.allSettled([
    loadUsers(), loadAccounts(), loadTickets(), loadHistory(), loadContent()
  ]);
  renderDashboard();
}

async function loadSection(section) {
  if (section === "users") await loadUsers();
  if (section === "accounts") await loadAccounts();
  if (section === "tickets") await loadTickets();
  if (section === "history") await loadHistory();
  if (section === "content") await loadContent();
}

async function loadUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, whatsapp, role, status, parent_id, created_at")
    .order("created_at", { ascending: false });
  if (error) return toast(error.message, "error");
  state.users = data || [];
  renderUsers();
}

function renderUsers() {
  const search = ($("#userSearch")?.value || "").toLowerCase();
  const role = $("#userRoleFilter")?.value || "";
  const parentMap = new Map(state.users.map(x => [x.id, x.full_name]));
  const rows = state.users.filter(user => {
    const hay = `${user.full_name} ${user.email}`.toLowerCase();
    return hay.includes(search) && (!role || user.role === role);
  });
  $("#usersTable").innerHTML = rows.length ? rows.map(user => `
    <tr>
      <td><strong>${escapeHtml(user.full_name)}</strong></td>
      <td>${escapeHtml(user.email)}</td>
      <td>${escapeHtml(user.whatsapp || "—")}</td>
      <td>${escapeHtml(parentMap.get(user.parent_id) || "Administrador principal")}</td>
      <td><span class="status-pill blue">${user.role === "admin" ? "Administrador" : user.role === "support" ? "Soporte" : "Revendedor"}</span></td>
      <td><span class="status-pill ${statusClass(user.status)}">${statusLabel(user.status)}</span></td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-cell">No se encontraron usuarios.</td></tr>`;
}

async function loadAccounts() {
  const { data, error } = await supabase
    .from("netflix_accounts")
    .select(`
      id, current_email, account_type, status, created_at,
      reseller:current_reseller_id(full_name),
      client:current_client_id(full_name)
    `)
    .order("created_at", { ascending: false });
  if (error) return toast(error.message, "error");
  state.accounts = data || [];
  renderAccounts();
}

function renderAccounts() {
  const search = ($("#accountSearch")?.value || "").toLowerCase();
  const status = $("#accountStatusFilter")?.value || "";
  const rows = state.accounts.filter(a =>
    a.current_email.toLowerCase().includes(search) && (!status || a.status === status)
  );
  $("#accountsTable").innerHTML = rows.length ? rows.map(account => `
    <tr>
      <td><span class="netflix-chip">Netflix</span></td>
      <td><strong>${escapeHtml(account.current_email)}</strong></td>
      <td>${escapeHtml(account.account_type)}</td>
      <td>${escapeHtml(account.reseller?.full_name || "Sin asignar")}</td>
      <td>${escapeHtml(account.client?.full_name || "—")}</td>
      <td><span class="status-pill ${statusClass(account.status)}">${statusLabel(account.status)}</span></td>
      <td><button class="small-btn amber" data-replace="${account.id}">Cambiar correo</button></td>
    </tr>`).join("") : `<tr><td colspan="7" class="empty-cell">No se encontraron cuentas.</td></tr>`;
  $$("[data-replace]").forEach(btn => btn.addEventListener("click", () => replaceAccountModal(btn.dataset.replace)));
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
  renderTickets();
  const open = state.tickets.filter(t => !["closed", "resolved"].includes(t.status)).length;
  $("#ticketBadge").textContent = open;
}

function renderTickets() {
  const search = ($("#ticketSearch")?.value || "").toLowerCase();
  const status = $("#ticketStatusFilter")?.value || "";
  const rows = state.tickets.filter(t => {
    const hay = `${t.title} ${t.creator?.full_name || ""} ${t.account_email_snapshot}`.toLowerCase();
    return hay.includes(search) && (!status || t.status === status);
  });
  $("#ticketsTable").innerHTML = rows.length ? rows.map(ticket => `
    <tr>
      <td>#${ticket.ticket_number}</td>
      <td>${escapeHtml(ticket.creator?.full_name || "—")}</td>
      <td><strong>${escapeHtml(ticket.title)}</strong></td>
      <td>${escapeHtml(ticket.category)}</td>
      <td><span class="status-pill ${statusClass(ticket.status)}">${statusLabel(ticket.status)}</span></td>
      <td>${escapeHtml(ticket.account_email_snapshot)}</td>
      <td>${formatDate(ticket.updated_at, true)}</td>
      <td><button class="icon-action" data-ticket="${ticket.id}">◉</button></td>
    </tr>`).join("") : `<tr><td colspan="8" class="empty-cell">No se encontraron tickets.</td></tr>`;
  $$("[data-ticket]").forEach(btn => btn.addEventListener("click", () => openTicket(btn.dataset.ticket)));
}

async function loadHistory() {
  const { data, error } = await supabase
    .from("account_change_history")
    .select(`
      id, old_email, new_email, change_type, reason, created_at,
      operator:performed_by(full_name)
    `)
    .order("created_at", { ascending: false });
  if (error) return toast(error.message, "error");
  state.history = data || [];
  $("#historyTable").innerHTML = state.history.length ? state.history.map(item => `
    <tr>
      <td><div class="change-old">Anterior: ${escapeHtml(item.old_email)}</div><div class="change-new">Nuevo: ${escapeHtml(item.new_email)}</div></td>
      <td><span class="status-pill amber">${escapeHtml(item.change_type)}</span></td>
      <td>${escapeHtml(item.operator?.full_name || "Sistema")}</td>
      <td>${formatDate(item.created_at, true)}</td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty-cell">No existen cambios registrados.</td></tr>`;
}

async function loadContent() {
  const { data, error } = await supabase
    .from("entertainment_content")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) return toast(error.message, "error");
  state.content = data || [];
  $("#contentAdminGrid").innerHTML = state.content.length ? state.content.map(item => contentCard(item, true)).join("")
    : `<div class="empty-card">Aún no se publicaron estrenos.</div>`;
}

function contentCard(item, admin = false) {
  return `<article class="content-card">
    <div class="cover" style="background-image:url('${escapeHtml(item.cover_url || "")}')">
      <button class="play-btn" data-trailer="${escapeHtml(item.trailer_url)}" data-title="${escapeHtml(item.title)}">▶</button>
    </div>
    <div class="content-card-body">
      <div class="panel-head"><h3>${escapeHtml(item.title)}</h3><span class="status-pill ${item.status === "published" ? "green" : "gray"}">${escapeHtml(item.status)}</span></div>
      <p>${escapeHtml(item.synopsis)}</p>
      <small>${escapeHtml(item.genre || "")}${item.release_year ? ` · ${item.release_year}` : ""}</small>
      ${admin ? `<button class="small-btn" data-edit-content="${item.id}">Editar</button>` : ""}
    </div>
  </article>`;
}

function renderDashboard() {
  $("#statUsers").textContent = state.users.filter(x => x.role === "reseller" && x.status === "active").length;
  $("#statAccounts").textContent = state.accounts.length;
  $("#statAvailable").textContent = state.accounts.filter(x => x.status === "available").length;
  const openTickets = state.tickets.filter(x => !["closed", "resolved"].includes(x.status));
  $("#statTickets").textContent = openTickets.length;

  $("#recentTickets").className = "list-stack";
  $("#recentTickets").innerHTML = state.tickets.slice(0, 5).map(t => `
    <button class="list-row" data-ticket="${t.id}">
      <span><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.creator?.full_name || "")}</small></span>
      <span class="status-pill ${statusClass(t.status)}">${statusLabel(t.status)}</span>
    </button>`).join("") || `<div class="empty-state">Sin tickets.</div>`;

  $("#expiringAccounts").className = "list-stack";
  $("#expiringAccounts").innerHTML = `<div class="empty-state">Las fechas aparecerán cuando existan asignaciones.</div>`;
  $$("[data-ticket]").forEach(btn => btn.addEventListener("click", () => openTicket(btn.dataset.ticket)));
  $$("[data-trailer]").forEach(btn => btn.addEventListener("click", () => trailerModal(btn.dataset.title, btn.dataset.trailer)));
  $$("[data-edit-content]").forEach(btn => btn.addEventListener("click", () => editContentModal(btn.dataset.editContent)));
}

function createUserModal() {
  const modal = openModal({
    title: "Crear nuevo usuario",
    body: `
      <form id="createUserForm" class="form-grid">
        <label><span>Nombre completo</span><input name="full_name" required minlength="3"></label>
        <label><span>Correo electrónico</span><input name="email" type="email" required></label>
        <label><span>Contraseña</span><input name="password" type="password" required minlength="8"></label>
        <label><span>WhatsApp con código de país</span><input name="whatsapp" inputmode="numeric" required></label>
        <label><span>Nombre comercial</span><input name="business_name"></label>
        <label><span>Rol</span><select name="role"><option value="reseller">Revendedor</option><option value="support">Soporte</option></select></label>
      </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button class="btn primary" id="saveUser">Crear usuario</button>`
  });
  $(".modal-cancel", modal.root).addEventListener("click", modal.close);
  $("#saveUser", modal.root).addEventListener("click", async () => {
    const form = $("#createUserForm", modal.root);
    if (!form.reportValidity()) return;
    const body = Object.fromEntries(new FormData(form).entries());
    const button = $("#saveUser", modal.root);
    button.disabled = true;
    button.textContent = "Creando...";

    try {
      const data = await createUserSecurely(body);
      toast(data?.message || "Usuario creado.");
      modal.close();
      await loadUsers();
    } catch (error) {
      toast(error.message || "No se pudo crear el usuario.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Crear usuario";
    }
  });
}

function createAccountModal() {
  const modal = openModal({
    title: "Añadir cuentas Netflix en bloque",
    body: `
      <div class="notice">
        Pega únicamente correos. Puedes colocar uno por línea, separados por coma o por punto y coma.
        Todas se registrarán como <strong>Cuenta completa</strong>.
      </div>
      <form id="createAccountForm" class="form-grid">
        <label class="full">
          <span>Correos de las cuentas</span>
          <textarea
            name="emails"
            rows="12"
            placeholder="cuenta1@correo.com&#10;cuenta2@correo.com&#10;cuenta3@correo.com"
            required
          ></textarea>
        </label>
        <div id="bulkAccountCounter" class="full bulk-counter">0 correos detectados</div>
      </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button id="saveAccount" class="btn primary">Añadir cuentas</button>`
  });

  const form = $("#createAccountForm", modal.root);
  const textarea = form.elements.emails;
  const counter = $("#bulkAccountCounter", modal.root);

  const parseEmails = () => {
    const values = String(textarea.value || "")
      .split(/[\n,;]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(values)];
  };

  textarea.addEventListener("input", () => {
    const count = parseEmails().length;
    counter.textContent = `${count} correo${count === 1 ? "" : "s"} detectado${count === 1 ? "" : "s"}`;
  });

  $(".modal-cancel", modal.root).addEventListener("click", modal.close);

  $("#saveAccount", modal.root).addEventListener("click", async () => {
    if (!form.reportValidity()) return;

    const emails = parseEmails();

    if (!emails.length) {
      return toast("Pega al menos un correo.", "error");
    }

    const invalid = emails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

    if (invalid.length) {
      return toast(`Hay ${invalid.length} correo(s) con formato inválido.`, "error");
    }

    const button = $("#saveAccount", modal.root);
    button.disabled = true;
    button.textContent = "Añadiendo...";

    try {
      const { data, error } = await supabase.rpc("bulk_add_netflix_accounts", {
        p_emails: emails
      });

      if (error) throw error;

      const result = data || {};
      toast(
        `${result.inserted || 0} añadidas, ${result.duplicates || 0} duplicadas, ${result.invalid || 0} inválidas.`
      );

      modal.close();
      await loadAccounts();
    } catch (error) {
      toast(error.message || "No se pudieron añadir las cuentas.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Añadir cuentas";
    }
  });
}

function replaceAccountModal(accountId) {
  const account = state.accounts.find(x => x.id === accountId);
  const modal = openModal({
    title: "Cambiar correo de la cuenta",
    body: `<div class="notice">Correo actual: <strong>${escapeHtml(account.current_email)}</strong><br>La fecha de cada vendedor no será modificada.</div>
      <form id="replaceAccountForm" class="form-grid">
        <label class="full"><span>Correo nuevo</span><input name="new_email" type="email" required></label>
        <label><span>Ticket relacionado (opcional)</span><select name="ticket_id"><option value="">Sin ticket</option>${state.tickets.filter(t => t.account_id === accountId).map(t => `<option value="${t.id}">#${t.ticket_number} · ${escapeHtml(t.title)}</option>`).join("")}</select></label>
        <label><span>Motivo</span><input name="reason" value="Cambio por garantía"></label>
      </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button id="saveReplacement" class="btn primary">Realizar cambio</button>`
  });
  $(".modal-cancel", modal.root).addEventListener("click", modal.close);
  $("#saveReplacement", modal.root).addEventListener("click", async () => {
    const form = $("#replaceAccountForm", modal.root);
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    const { data, error } = await supabase.rpc("replace_netflix_account", {
      p_account_id: accountId,
      p_new_email: values.new_email.trim().toLowerCase(),
      p_ticket_id: values.ticket_id || null,
      p_reason: values.reason || "Cambio por garantía"
    });
    if (error) return toast(error.message, "error");
    toast(data?.message || "Cuenta reemplazada.");
    modal.close();
    await Promise.all([loadAccounts(), loadHistory(), loadTickets()]);
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
    title: `Ticket #${ticket.ticket_number}: ${ticket.title}`,
    wide: true,
    body: `
      <div class="ticket-meta">
        <span class="status-pill ${statusClass(ticket.status)}">${statusLabel(ticket.status)}</span>
        <span>Usuario: <strong>${escapeHtml(ticket.creator?.full_name || "—")}</strong></span>
        <span>Cuenta reportada: <strong>${escapeHtml(ticket.account_email_snapshot)}</strong></span>
      </div>
      <h3>Descripción del caso</h3><div class="description-box">${escapeHtml(ticket.description)}</div>
      <h3>Historial de mensajes</h3>
      <div class="messages">${(messages || []).map(m => `
        <article class="message ${m.is_system ? "system" : ""}">
          <header><strong>${escapeHtml(m.is_system ? "SISTEMA" : (m.author?.full_name || "Usuario"))}</strong><small>${formatDate(m.created_at, true)}</small></header>
          <p>${escapeHtml(m.message)}</p>
        </article>`).join("") || `<div class="empty-state">Sin mensajes.</div>`}</div>
      <form id="replyTicketForm" class="reply-box">
        <textarea name="message" placeholder="Escribe una respuesta..." required></textarea>
        <select name="status">
          <option value="${ticket.status}">Mantener: ${statusLabel(ticket.status)}</option>
          <option value="in_review">En revisión</option><option value="answered">Respondido</option>
          <option value="waiting_user">Esperando usuario</option><option value="resolved">Resuelto</option><option value="closed">Cerrado</option>
        </select>
        <button class="btn primary" type="submit">Responder</button>
      </form>`
  });
  $("#replyTicketForm", modal.root).addEventListener("submit", async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const { error: msgError } = await supabase.from("ticket_messages").insert({
      ticket_id: ticketId, author_id: state.profile.id, message: values.message, is_system: false
    });
    if (msgError) return toast(msgError.message, "error");
    const { error: updateError } = await supabase.from("support_tickets").update({
      status: values.status,
      assigned_support_id: state.profile.id,
      closed_at: ["closed", "resolved"].includes(values.status) ? new Date().toISOString() : null
    }).eq("id", ticketId);
    if (updateError) return toast(updateError.message, "error");
    toast("Respuesta enviada.");
    modal.close();
    await loadTickets();
  });
}

function createContentModal(existing = null) {
  const modal = openModal({
    title: existing ? "Editar publicación" : "Nueva publicación",
    body: `<form id="contentForm" class="form-grid">
      <label><span>Título</span><input name="title" value="${escapeHtml(existing?.title || "")}" required></label>
      <label><span>Tipo</span><select name="content_type"><option ${existing?.content_type === "Serie" ? "selected" : ""}>Serie</option><option ${existing?.content_type === "Película" ? "selected" : ""}>Película</option></select></label>
      <label><span>Género</span><input name="genre" value="${escapeHtml(existing?.genre || "")}"></label>
      <label><span>Año</span><input name="release_year" type="number" value="${existing?.release_year || ""}"></label>
      <label class="full"><span>URL de portada</span><input name="cover_url" type="url" value="${escapeHtml(existing?.cover_url || "")}"></label>
      <label class="full"><span>URL del tráiler (YouTube o MP4)</span><input name="trailer_url" type="url" value="${escapeHtml(existing?.trailer_url || "")}" required></label>
      <label class="full"><span>Sinopsis</span><textarea name="synopsis" required>${escapeHtml(existing?.synopsis || "")}</textarea></label>
      <label><span>Estado</span><select name="status"><option value="draft">Borrador</option><option value="published" ${existing?.status === "published" ? "selected" : ""}>Publicado</option><option value="hidden" ${existing?.status === "hidden" ? "selected" : ""}>Oculto</option></select></label>
      <label><span>Orden</span><input name="display_order" type="number" value="${existing?.display_order || 0}"></label>
      <label class="check-row"><input name="featured" type="checkbox" ${existing?.featured ? "checked" : ""}> Destacado</label>
    </form>`,
    actions: `<button class="btn secondary modal-cancel">Cancelar</button><button id="saveContent" class="btn primary">Guardar</button>`
  });
  $(".modal-cancel", modal.root).addEventListener("click", modal.close);
  $("#saveContent", modal.root).addEventListener("click", async () => {
    const form = $("#contentForm", modal.root);
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form).entries());
    values.release_year = values.release_year ? Number(values.release_year) : null;
    values.display_order = Number(values.display_order || 0);
    values.featured = form.elements.featured.checked;
    values.trailer_type = values.trailer_url.includes("youtube") || values.trailer_url.includes("youtu.be") ? "YouTube" : "MP4";
    if (!existing) values.created_by = state.profile.id;
    const query = existing
      ? supabase.from("entertainment_content").update(values).eq("id", existing.id)
      : supabase.from("entertainment_content").insert(values);
    const { error } = await query;
    if (error) return toast(error.message, "error");
    toast("Publicación guardada.");
    modal.close();
    await loadContent();
  });
}

function editContentModal(id) {
  createContentModal(state.content.find(x => x.id === id));
}

function trailerModal(title, url) {
  const safeUrl = String(url || "");
  const youtubeId = safeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/)?.[1];
  const media = youtubeId
    ? `<iframe class="trailer-frame" src="https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}" allowfullscreen></iframe>`
    : `<video class="trailer-frame" src="${escapeHtml(safeUrl)}" controls autoplay></video>`;
  openModal({ title, body: media, wide: true });
}
