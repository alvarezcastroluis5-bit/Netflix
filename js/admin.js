import {supabase,$,$$,escapeHtml,formatDate,statusLabel,statusTone,serviceLabel,serviceBadge,toast,openModal,wireNavigation,setupLogin,callUserManager,parseEmailBlock,uploadPublicImage,loadNotifications,updateNotificationBadge,showNotificationsModal,openNetflixIntegrated,showSection} from "./core.js?v=3.8";

const state={profile:null,users:[],accounts:[],assignments:[],tickets:[],history:[],content:[],notifications:[]};

setupLogin({
  allowedRoles:["admin","support"],
  onAuthenticated:async({profile})=>{
    state.profile=profile;

    $("#topUserName").textContent=profile.full_name;
    $("#topUserRole").textContent=
      profile.role==="admin"?"Administrador":"Personal de soporte";
    $("#dashboardGreeting").textContent=`Hola, ${profile.full_name}`;

    if(profile.role==="support"){
      document.body.classList.add("support-session");

      const allowedSections=new Set(["dashboard","accounts","tickets","history"]);

      $$(".nav-link").forEach(button=>{
        if(!allowedSections.has(button.dataset.section)){
          button.remove();
        }
      });

      ["services","users","content","notifications"].forEach(section=>{
        $(`#section-${section}`)?.remove();
      });

      $("#openCreateUser")?.remove();
      $("#openCreateAccount")?.remove();
      $("#openCreateContent")?.remove();
      $("#notificationBell")?.remove();
    }

    wireNavigation(loadSection);
    bindActions();
    await loadAll();
  }
});

function bindActions(){
  $("#adminOpenNetflixService")?.addEventListener("click",openNetflixIntegrated);

  $("#adminOpenSpotifyService")?.addEventListener("click",()=>{
    showSection("accounts");
    const filter=$("#accountServiceFilter");
    if(filter){
      filter.value="spotify";
      renderAccounts();
    }
  });

  $("#openCreateUser")?.addEventListener("click",createDistributorModal);
  $("#openCreateAccount")?.addEventListener("click",bulkAddAccountsModal);
  $("#openCreateContent")?.addEventListener("click",()=>contentModal());

  $("#userSearch")?.addEventListener("input",renderUsers);
  $("#userRoleFilter")?.addEventListener("change",renderUsers);
  $("#userStatusFilter")?.addEventListener("change",renderUsers);

  $("#accountSearch")?.addEventListener("input",renderAccounts);
  $("#accountServiceFilter")?.addEventListener("change",renderAccounts);
  $("#accountStatusFilter")?.addEventListener("change",renderAccounts);

  $("#ticketSearch")?.addEventListener("input",renderTickets);
  $("#ticketServiceFilter")?.addEventListener("change",renderTickets);
  $("#ticketStatusFilter")?.addEventListener("change",renderTickets);

  $("#recipientSearch")?.addEventListener("input",renderRecipientList);
  $("#selectAllRecipients")?.addEventListener("click",selectAllRecipients);
  $("#notificationForm")?.addEventListener("submit",sendNotification);
  $("#notificationBell")?.addEventListener(
    "click",
    ()=>showNotificationsModal(state.notifications,loadAdminNotifications)
  );
}
async function loadAll(){
  const commonTasks=[
    loadUsers(),
    loadAccounts(),
    loadAssignments(),
    loadTickets(),
    loadHistory()
  ];

  if(state.profile.role==="admin"){
    commonTasks.push(loadContent(),loadAdminNotifications());
  }

  await Promise.allSettled(commonTasks);
  renderDashboard();

  if(state.profile.role==="admin"){
    renderRecipientList();
  }
}

async function loadSection(section){
  if(section==="users"&&state.profile.role==="admin")await loadUsers();
  if(section==="accounts")await Promise.all([loadAccounts(),loadAssignments()]);
  if(section==="tickets")await loadTickets();
  if(section==="history")await loadHistory();
  if(section==="content"&&state.profile.role==="admin")await loadContent();

  if(section==="notifications"&&state.profile.role==="admin"){
    await loadUsers();
    renderRecipientList();
  }
}

async function loadUsers(){
  const {data,error}=await supabase
    .from("profiles")
    .select(
      "id,full_name,email,whatsapp,role,status,parent_id,business_name,avatar_url,created_at"
    )
    .in("role",["reseller","admin","support"])
    .order("created_at",{ascending:false});

  if(error)return toast(error.message,"error");

  state.users=data||[];

  if($("#usersTable")){
    renderUsers();
  }
}
const distributors=()=>state.users.filter(u=>u.role==="reseller");
const userName=id=>state.users.find(u=>u.id===id)?.full_name||"Administrador principal";
function renderUsers(){
  const query=($("#userSearch")?.value||"").toLowerCase();
  const role=$("#userRoleFilter")?.value||"";
  const status=$("#userStatusFilter")?.value||"";

  const rows=state.users.filter(user=>{
    if(!["reseller","support"].includes(user.role)){
      return false;
    }

    const haystack=`
      ${user.full_name}
      ${user.business_name||""}
      ${user.email}
      ${user.whatsapp||""}
    `.toLowerCase();

    return haystack.includes(query)
      &&(!role||user.role===role)
      &&(!status||user.status===status);
  });

  $("#usersTable").innerHTML=rows.length
    ?rows.map(user=>{
      const isDistributor=user.role==="reseller";
      const roleLabel=isDistributor?"Distribuidor":"Soporte";
      const roleClass=isDistributor?"blue":"violet";
      const superior=isDistributor
        ?userName(user.parent_id)
        :"Administración";

      const actions=isDistributor
        ?`
          <button class="action-button blue" data-user-accounts="${user.id}">Cuentas</button>
          <button class="action-button yellow" data-user-edit="${user.id}">Editar</button>
          <button class="action-button red" data-user-delete="${user.id}">Eliminar</button>
          <button class="action-button cyan" data-user-assign="${user.id}">Asignar</button>
        `
        :`
          <button class="action-button yellow" data-user-edit="${user.id}">Editar</button>
          <button class="action-button red" data-user-delete="${user.id}">Eliminar</button>
        `;

      return `
        <tr>
          <td>
            <div class="person-cell">
              <span class="avatar-small">${escapeHtml(user.full_name[0].toUpperCase())}</span>
              <div>
                <strong>${escapeHtml(user.full_name)}</strong>
                <small>${escapeHtml(
                  isDistributor
                    ?(user.business_name||"Sin nombre comercial")
                    :"Personal interno"
                )}</small>
              </div>
            </div>
          </td>

          <td>
            <span class="user-role-pill ${roleClass}">${roleLabel}</span>
          </td>

          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(user.whatsapp||"—")}</td>
          <td>${escapeHtml(superior)}</td>

          <td>
            <span class="status-pill ${statusTone(user.status)}">
              ${statusLabel(user.status)}
            </span>
          </td>

          <td>
            <div class="action-group">${actions}</div>
          </td>
        </tr>
      `;
    }).join("")
    :`<tr><td colspan="7" class="empty-cell">No se encontraron usuarios.</td></tr>`;

  $$("[data-user-accounts]").forEach(button=>{
    button.onclick=()=>showDistributorAccounts(button.dataset.userAccounts);
  });

  $$("[data-user-edit]").forEach(button=>{
    button.onclick=()=>editDistributorModal(button.dataset.userEdit);
  });

  $$("[data-user-delete]").forEach(button=>{
    button.onclick=()=>deleteDistributor(button.dataset.userDelete);
  });

  $$("[data-user-assign]").forEach(button=>{
    button.onclick=()=>bulkAssignModal(button.dataset.userAssign);
  });
}

async function loadAccounts(){const {data,error}=await supabase.from("netflix_accounts").select("id,service,current_email,account_type,status,current_reseller_id,current_client_id,created_at,reseller:current_reseller_id(full_name,parent_id),client:current_client_id(full_name)").order("created_at",{ascending:false});if(error)return toast(error.message,"error");state.accounts=data||[];renderAccounts();}
async function loadAssignments(){const {data,error}=await supabase.from("account_assignment_summary").select("*").order("created_at",{ascending:false});if(error)return toast(error.message,"error");state.assignments=data||[];renderAccounts();}
function activeAssignment(a){const rows=state.assignments.filter(x=>x.account_id===a.id&&x.status==="active");return rows.find(x=>a.current_client_id&&x.buyer_client_id===a.current_client_id)||rows.find(x=>a.current_reseller_id&&x.buyer_reseller_id===a.current_reseller_id)||rows[0]||null;}
function ownerDisplay(a){if(a.client?.full_name)return `${a.client.full_name} / ${a.reseller?.full_name||"Sin distribuidor"}`;if(a.reseller?.full_name)return a.reseller.parent_id?`${a.reseller.full_name} / ${userName(a.reseller.parent_id)}`:a.reseller.full_name;return "Disponible";}
function renderAccounts(){const q=($("#accountSearch")?.value||"").toLowerCase(),service=$("#accountServiceFilter")?.value||"",status=$("#accountStatusFilter")?.value||"";const rows=state.accounts.filter(a=>`${a.current_email} ${ownerDisplay(a)}`.toLowerCase().includes(q)&&(!service||a.service===service)&&(!status||a.status===status));$("#accountsTable").innerHTML=rows.length?rows.map(a=>{const x=activeAssignment(a);return `<tr><td>${serviceBadge(a.service)}</td><td><strong>${escapeHtml(a.current_email)}</strong></td><td>${escapeHtml(a.account_type||"Cuenta completa")}</td><td>${escapeHtml(ownerDisplay(a))}</td><td>${formatDate(x?.starts_on||a.created_at)}</td><td><span class="days-pill ${statusTone(x?.calculated_status)}">${x?.days_remaining??"—"}</span></td><td><span class="status-pill ${statusTone(a.status)}">${statusLabel(a.status)}</span></td><td><button class="action-button yellow" data-account-edit="${a.id}">${state.profile.role==="support"?"Cambiar correo":"Editar"}</button></td></tr>`;}).join(""):`<tr><td colspan="8" class="empty-cell">No se encontraron cuentas.</td></tr>`;$$('[data-account-edit]').forEach(b=>b.onclick=()=>editAccountModal(b.dataset.accountEdit));}
async function loadTickets(){const {data,error}=await supabase.from("support_tickets").select("id,ticket_number,service,reported_email,account_email_snapshot,title,category,description,status,created_at,updated_at,account_id,creator:created_by(full_name)").order("updated_at",{ascending:false});if(error)return toast(error.message,"error");state.tickets=data||[];renderTickets();$("#ticketBadge").textContent=state.tickets.filter(t=>!["closed","resolved"].includes(t.status)).length;}
function renderTickets(){const q=($("#ticketSearch")?.value||"").toLowerCase(),service=$("#ticketServiceFilter")?.value||"",status=$("#ticketStatusFilter")?.value||"";const rows=state.tickets.filter(t=>`${t.creator?.full_name||""} ${t.title} ${t.reported_email||t.account_email_snapshot}`.toLowerCase().includes(q)&&(!service||t.service===service)&&(!status||t.status===status));$("#ticketsTable").innerHTML=rows.length?rows.map(t=>`<tr><td>#${t.ticket_number}</td><td>${escapeHtml(t.creator?.full_name||"—")}</td><td>${serviceBadge(t.service)}</td><td><strong>${escapeHtml(t.title)}</strong></td><td>${escapeHtml(t.category)}</td><td>${escapeHtml(t.reported_email||t.account_email_snapshot)}</td><td><span class="status-pill ${statusTone(t.status)}">${statusLabel(t.status)}</span></td><td><button class="round-action" data-ticket-open="${t.id}">◉</button></td></tr>`).join(""):`<tr><td colspan="8" class="empty-cell">No se encontraron tickets.</td></tr>`;$$('[data-ticket-open]').forEach(b=>b.onclick=()=>openTicket(b.dataset.ticketOpen));}
async function loadHistory(){const {data,error}=await supabase.from("account_change_history").select("id,service,old_email,new_email,change_type,reason,created_at,operator:performed_by(full_name)").order("created_at",{ascending:false});if(error)return toast(error.message,"error");state.history=data||[];$("#historyTable").innerHTML=state.history.length?state.history.map(h=>`<tr><td>${serviceBadge(h.service)}</td><td><div class="change-old">Anterior: ${escapeHtml(h.old_email)}</div><div class="change-new">Nueva: ${escapeHtml(h.new_email)}</div></td><td><span class="status-pill orange">${escapeHtml(h.change_type)}</span></td><td>${escapeHtml(h.operator?.full_name||"Sistema")}</td><td>${formatDate(h.created_at,true)}</td></tr>`).join(""):`<tr><td colspan="5" class="empty-cell">No hay cambios registrados.</td></tr>`;}
async function loadContent(){const {data,error}=await supabase.from("entertainment_content").select("*").order("display_order",{ascending:true});if(error)return toast(error.message,"error");state.content=data||[];renderContentAdmin();}

function getYouTubeVideoId(url){
  const value=String(url||"").trim();
  if(!value)return null;

  const patterns=[
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{6,})/
  ];

  for(const pattern of patterns){
    const match=value.match(pattern);
    if(match?.[1])return match[1];
  }

  try{
    return new URL(value).searchParams.get("v")||null;
  }catch{
    return null;
  }
}

function getYouTubeThumbnail(url){
  const videoId=getYouTubeVideoId(url);
  return videoId?`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`:null;
}

function contentReleaseLabel(item){
  if(item.release_date)return `Estreno: ${formatDate(`${item.release_date}T00:00:00`)}`;
  if(item.release_year)return `Estreno: ${item.release_year}`;
  return "Fecha de estreno no registrada";
}

function renderContentAdmin(){
  $("#contentAdminGrid").innerHTML=state.content.length
    ?state.content.map(item=>`
      <article class="content-card">
        <div
          class="content-cover"
          style="background-image:url('${escapeHtml(item.cover_url||getYouTubeThumbnail(item.trailer_url)||"")}')"
        >
          <span class="content-platform">${serviceLabel(item.platform)}</span>
          <button
            class="play-button"
            data-trailer="${escapeHtml(item.trailer_url)}"
            data-title="${escapeHtml(item.title)}"
          >▶</button>
        </div>

        <div class="content-info">
          <div class="content-title-row">
            <h3>${escapeHtml(item.title)}</h3>
            <span class="status-pill ${statusTone(item.status)}">${statusLabel(item.status)}</span>
          </div>
          <p>${escapeHtml(item.synopsis)}</p>
          <small>${escapeHtml(item.genre||"")}${item.content_type?` · ${escapeHtml(item.content_type)}`:""}</small>
          <span class="content-release-date">${escapeHtml(contentReleaseLabel(item))}</span>
          <button class="action-button yellow" data-content-edit="${item.id}">Editar</button>
        </div>
      </article>
    `).join("")
    :`<div class="empty-gallery">Aún no hay publicaciones.</div>`;

  $$("[data-trailer]").forEach(button=>{
    button.onclick=()=>trailerModal(button.dataset.title,button.dataset.trailer);
  });

  $$("[data-content-edit]").forEach(button=>{
    button.onclick=()=>contentModal(
      state.content.find(item=>item.id===button.dataset.contentEdit)
    );
  });
}
async function loadAdminNotifications(){try{state.notifications=await loadNotifications();updateNotificationBadge(state.notifications);}catch{state.notifications=[];}}
function renderDashboard(){$("#statUsers").textContent=distributors().filter(u=>u.status==="active").length;$("#statAccounts").textContent=state.accounts.length;$("#statAvailable").textContent=state.accounts.filter(a=>a.status==="available").length;$("#statTickets").textContent=state.tickets.filter(t=>!["closed","resolved"].includes(t.status)).length;$("#recentAccounts").innerHTML=state.accounts.slice(0,7).map(a=>`<div class="activity-row">${serviceBadge(a.service)}<div><strong>${escapeHtml(a.current_email)}</strong><small>${escapeHtml(ownerDisplay(a))}</small></div><span class="status-pill ${statusTone(a.status)}">${statusLabel(a.status)}</span></div>`).join("")||`<div class="empty-state">No existen cuentas.</div>`;$("#recentTickets").innerHTML=state.tickets.slice(0,6).map(t=>`<button class="stack-row" data-ticket-open="${t.id}"><div><strong>${escapeHtml(t.title)}</strong><small>${serviceLabel(t.service)} · ${escapeHtml(t.creator?.full_name||"")}</small></div><span class="status-pill ${statusTone(t.status)}">${statusLabel(t.status)}</span></button>`).join("")||`<div class="empty-state">No existen tickets.</div>`;$$('[data-ticket-open]').forEach(b=>b.onclick=()=>openTicket(b.dataset.ticketOpen));}
function createDistributorModal(){
  const modal=openModal({
    title:"Crear usuario",
    body:`
      <form id="createDistributorForm" class="form-grid">
        <label>
          <span>Tipo de usuario</span>
          <select name="role" id="newUserRole">
            <option value="reseller">Distribuidor</option>
            <option value="support">Personal de soporte</option>
          </select>
        </label>

        <label>
          <span>Nombre completo</span>
          <input name="full_name" required minlength="3">
        </label>

        <label id="newBusinessNameField">
          <span>Nombre comercial</span>
          <input name="business_name">
        </label>

        <label>
          <span>Correo electrónico</span>
          <input name="email" type="email" required>
        </label>

        <label>
          <span>WhatsApp con código de país</span>
          <input name="whatsapp" inputmode="numeric" required>
        </label>

        <label class="full">
          <span>Contraseña</span>
          <input name="password" type="password" minlength="8" required>
        </label>

        <div id="newUserPermissionNote" class="notice-box full">
          El distribuidor podrá gestionar su propia red, clientes, cuentas y soporte.
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="saveDistributor" class="btn primary">Crear usuario</button>
    `
  });

  const form=$("#createDistributorForm",modal.root);
  const roleSelect=$("#newUserRole",modal.root);
  const businessField=$("#newBusinessNameField",modal.root);
  const permissionNote=$("#newUserPermissionNote",modal.root);

  const updateRoleView=()=>{
    const support=roleSelect.value==="support";
    businessField.hidden=support;

    if(support){
      form.elements.business_name.value="";
      permissionNote.textContent=
        "Soporte tendrá acceso a Escritorio, Cuentas, Soporte e Historial. Podrá cambiar correos y revisar fechas y días restantes.";
    }else{
      permissionNote.textContent=
        "El distribuidor podrá gestionar su propia red, clientes, cuentas y soporte.";
    }
  };

  roleSelect.addEventListener("change",updateRoleView);
  updateRoleView();

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveDistributor",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const button=$("#saveDistributor",modal.root);
    button.disabled=true;
    button.textContent="Creando...";

    try{
      const result=await callUserManager({
        action:"create",
        ...Object.fromEntries(new FormData(form).entries())
      });

      toast(result.message||"Usuario creado correctamente.");
      modal.close();
      await loadUsers();
      renderRecipientList();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Crear usuario";
    }
  };
}

function editDistributorModal(id){
  const user=state.users.find(item=>item.id===id);
  if(!user)return;

  const isSupport=user.role==="support";

  const modal=openModal({
    title:isSupport?"Editar personal de soporte":"Editar distribuidor",
    body:`
      <form id="editDistributorForm" class="form-grid">
        <label>
          <span>Tipo</span>
          <input value="${isSupport?"Personal de soporte":"Distribuidor"}" readonly>
        </label>

        <label>
          <span>Nombre completo</span>
          <input name="full_name" value="${escapeHtml(user.full_name)}" required>
        </label>

        ${isSupport?"":`
          <label>
            <span>Nombre comercial</span>
            <input name="business_name" value="${escapeHtml(user.business_name||"")}">
          </label>
        `}

        <label>
          <span>Correo electrónico</span>
          <input name="email" type="email" value="${escapeHtml(user.email)}" required>
        </label>

        <label>
          <span>WhatsApp</span>
          <input name="whatsapp" value="${escapeHtml(user.whatsapp||"")}" required>
        </label>

        <label class="full">
          <span>Nueva contraseña (opcional)</span>
          <input
            name="password"
            type="password"
            minlength="8"
            placeholder="Vacío conserva la contraseña actual"
          >
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="updateDistributor" class="btn primary">Guardar cambios</button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#updateDistributor",modal.root).onclick=async()=>{
    const form=$("#editDistributorForm",modal.root);
    if(!form.reportValidity())return;

    try{
      const values=Object.fromEntries(new FormData(form).entries());

      const result=await callUserManager({
        action:"update",
        user_id:id,
        role:user.role,
        business_name:isSupport?"":(values.business_name||""),
        ...values
      });

      toast(result.message);
      modal.close();
      await loadUsers();
    }catch(error){
      toast(error.message,"error");
    }
  };
}

async function deleteDistributor(id){
  const user=state.users.find(item=>item.id===id);
  if(!user)return;

  const label=user.role==="support"
    ?"este usuario de soporte"
    :"este distribuidor";

  if(!confirm(
    `¿Eliminar ${label}: ${user.full_name}?\n`+
    "Se bloqueará el acceso y se conservará el historial."
  ))return;

  try{
    const result=await callUserManager({
      action:"delete",
      user_id:id
    });

    toast(result.message);
    await loadUsers();
  }catch(error){
    toast(error.message,"error");
  }
}

function showDistributorAccounts(id){const u=state.users.find(x=>x.id===id),rows=state.accounts.filter(a=>a.current_reseller_id===id);openModal({title:`Cuentas de ${u?.full_name||"distribuidor"}`,extraWide:true,body:`<div class="table-scroll"><table class="data-table"><thead><tr><th>Servicio</th><th>Correo</th><th>Tipo</th><th>Cliente</th><th>Estado</th></tr></thead><tbody>${rows.length?rows.map(a=>`<tr><td>${serviceBadge(a.service)}</td><td>${escapeHtml(a.current_email)}</td><td>${escapeHtml(a.account_type)}</td><td>${escapeHtml(a.client?.full_name||"—")}</td><td><span class="status-pill ${statusTone(a.status)}">${statusLabel(a.status)}</span></td></tr>`).join(""):`<tr><td colspan="5" class="empty-cell">No tiene cuentas asignadas.</td></tr>`}</tbody></table></div>`});}
function bulkAssignModal(id){const u=state.users.find(x=>x.id===id);if(!u)return;const m=openModal({title:`Asignar cuentas a ${u.full_name}`,body:`<div class="notice-box">Pega correos ya registrados y disponibles, uno por línea.</div><form id="bulkAssignForm" class="form-grid"><label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label><label><span>Fecha de inicio</span><input name="starts_on" type="date" value="${new Date().toISOString().slice(0,10)}" required></label><label class="full"><span>Correos</span><textarea name="emails" rows="12" required></textarea></label><div id="assignCounter" class="counter-note full">0 correos detectados</div></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="assignAccounts" class="btn primary">Asignar cuentas</button>`});const f=$("#bulkAssignForm",m.root),ta=f.elements.emails;ta.oninput=()=>$("#assignCounter",m.root).textContent=`${parseEmailBlock(ta.value).length} correos detectados`;$(".modal-cancel",m.root).onclick=m.close;$("#assignAccounts",m.root).onclick=async()=>{if(!f.reportValidity())return;const v=Object.fromEntries(new FormData(f).entries()),b=$("#assignAccounts",m.root);b.disabled=true;try{const {data,error}=await supabase.rpc("bulk_assign_service_accounts",{p_service:v.service,p_account_emails:parseEmailBlock(v.emails),p_distributor_id:id,p_starts_on:v.starts_on});if(error)throw error;toast(`${data.assigned||0} asignadas, ${data.unavailable||0} no disponibles, ${data.not_found||0} no encontradas.`);m.close();await Promise.all([loadAccounts(),loadAssignments()]);}catch(e){toast(e.message,"error");}finally{b.disabled=false;}};}
function bulkAddAccountsModal(){const m=openModal({title:"Añadir cuentas en bloque",body:`<div class="notice-box">Selecciona Netflix o Spotify y pega solo correos.</div><form id="bulkAddForm" class="form-grid"><label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label><label><span>Tipo</span><select name="account_type"><option>Cuenta completa</option><option>Pantalla</option><option>Individual</option><option>Familiar</option></select></label><label class="full"><span>Correos</span><textarea name="emails" rows="12" required></textarea></label><div id="addCounter" class="counter-note full">0 correos detectados</div></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveBulkAccounts" class="btn primary">Añadir cuentas</button>`});const f=$("#bulkAddForm",m.root),ta=f.elements.emails;ta.oninput=()=>$("#addCounter",m.root).textContent=`${parseEmailBlock(ta.value).length} correos detectados`;$(".modal-cancel",m.root).onclick=m.close;$("#saveBulkAccounts",m.root).onclick=async()=>{if(!f.reportValidity())return;const v=Object.fromEntries(new FormData(f).entries()),b=$("#saveBulkAccounts",m.root);b.disabled=true;try{const {data,error}=await supabase.rpc("bulk_add_service_accounts",{p_service:v.service,p_account_type:v.account_type,p_emails:parseEmailBlock(v.emails)});if(error)throw error;toast(`${data.inserted||0} añadidas, ${data.duplicates||0} duplicadas, ${data.invalid||0} inválidas.`);m.close();await loadAccounts();}catch(e){toast(e.message,"error");}finally{b.disabled=false;}};}
function editAccountModal(id){
  if(state.profile.role==="support"){
    return supportEditAccountEmailModal(id);
  }

  return adminFullEditAccountModal(id);
}

function supportEditAccountEmailModal(id){
  const account=state.accounts.find(item=>item.id===id);
  if(!account)return;

  const assignment=activeAssignment(account);

  const modal=openModal({
    title:"Cambiar correo de la cuenta",
    body:`
      <div class="notice-box">
        El personal de soporte solo puede cambiar el correo.
        El propietario, la fecha y los 30 días se conservan.
      </div>

      <form id="supportAccountEmailForm" class="form-grid">
        <label>
          <span>Plataforma</span>
          <input value="${serviceLabel(account.service)}" readonly>
        </label>

        <label>
          <span>Propietario</span>
          <input value="${escapeHtml(ownerDisplay(account))}" readonly>
        </label>

        <label class="full">
          <span>Correo actual</span>
          <input value="${escapeHtml(account.current_email)}" readonly>
        </label>

        <label class="full">
          <span>Correo nuevo</span>
          <input name="new_email" type="email" required>
        </label>

        <label>
          <span>Fecha de inicio</span>
          <input value="${escapeHtml(formatDate(assignment?.starts_on||account.created_at))}" readonly>
        </label>

        <label>
          <span>Días restantes</span>
          <input value="${assignment?.days_remaining??"—"}" readonly>
        </label>

        <label class="full">
          <span>Motivo</span>
          <input name="reason" value="Actualización realizada por soporte">
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="saveSupportEmail" class="btn primary">Guardar nuevo correo</button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveSupportEmail",modal.root).onclick=async()=>{
    const form=$("#supportAccountEmailForm",modal.root);
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#saveSupportEmail",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      const {data,error}=await supabase.rpc("support_update_service_email",{
        p_account_id:id,
        p_new_email:values.new_email.trim().toLowerCase(),
        p_reason:values.reason
      });

      if(error)throw error;

      toast(data.message||"Correo actualizado.");
      modal.close();

      await Promise.all([
        loadAccounts(),
        loadAssignments(),
        loadHistory()
      ]);
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Guardar nuevo correo";
    }
  };
}

function adminFullEditAccountModal(id){const a=state.accounts.find(x=>x.id===id);if(!a)return;const ds=distributors().filter(u=>u.status==="active"),x=activeAssignment(a);const m=openModal({title:"Editar cuenta",body:`<form id="editAccountForm" class="form-grid"><label><span>Plataforma</span><select name="service"><option value="netflix" ${a.service==="netflix"?"selected":""}>Netflix</option><option value="spotify" ${a.service==="spotify"?"selected":""}>Spotify</option></select></label><label><span>Tipo</span><select name="account_type"><option ${a.account_type==="Cuenta completa"?"selected":""}>Cuenta completa</option><option ${a.account_type==="Pantalla"?"selected":""}>Pantalla</option><option ${a.account_type==="Individual"?"selected":""}>Individual</option><option ${a.account_type==="Familiar"?"selected":""}>Familiar</option></select></label><label class="full"><span>Correo</span><input name="current_email" type="email" value="${escapeHtml(a.current_email)}" required></label><label class="full"><span>Buscar propietario</span><input id="ownerSearchInput" list="ownerOptions" value="${escapeHtml(a.reseller?.full_name||"")}" placeholder="Nombre del distribuidor"><datalist id="ownerOptions">${ds.map(u=>`<option value="${escapeHtml(u.full_name)}">${escapeHtml(u.email)}</option>`).join("")}</datalist></label><input type="hidden" name="owner_id" value="${a.current_reseller_id||""}"><label><span>Fecha de creación</span><input name="starts_on" type="date" value="${x?.starts_on||new Date(a.created_at).toISOString().slice(0,10)}" required></label><label><span>Duración</span><input value="30 días" readonly></label></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveAccountChanges" class="btn primary">Guardar</button>`});const f=$("#editAccountForm",m.root),input=$("#ownerSearchInput",m.root);input.oninput=()=>{const match=ds.find(u=>u.full_name.toLowerCase()===input.value.trim().toLowerCase());f.elements.owner_id.value=match?.id||"";};$(".modal-cancel",m.root).onclick=m.close;$("#saveAccountChanges",m.root).onclick=async()=>{if(!f.reportValidity())return;const v=Object.fromEntries(new FormData(f).entries());try{const {data,error}=await supabase.rpc("admin_edit_service_account",{p_account_id:id,p_service:v.service,p_email:v.current_email.trim().toLowerCase(),p_account_type:v.account_type,p_owner_id:v.owner_id||null,p_starts_on:v.starts_on});if(error)throw error;toast(data.message);m.close();await Promise.all([loadAccounts(),loadAssignments()]);}catch(e){toast(e.message,"error");}};}
async function openTicket(id){const t=state.tickets.find(x=>x.id===id);if(!t)return;const {data:messages,error}=await supabase.from("ticket_messages").select("id,message,is_system,created_at,author:author_id(full_name)").eq("ticket_id",id).order("created_at",{ascending:true});if(error)return toast(error.message,"error");const m=openModal({title:`Ticket #${t.ticket_number}`,wide:true,body:`<div class="ticket-header-card">${serviceBadge(t.service)}<div><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.reported_email||t.account_email_snapshot)}</small></div><span class="status-pill ${statusTone(t.status)}">${statusLabel(t.status)}</span></div><div class="ticket-description"><strong>Descripción</strong><p>${escapeHtml(t.description)}</p></div><div class="message-thread">${(messages||[]).map(x=>`<article class="message-bubble ${x.is_system?"system":""}"><header><strong>${escapeHtml(x.is_system?"SISTEMA":(x.author?.full_name||"Usuario"))}</strong><small>${formatDate(x.created_at,true)}</small></header><p>${escapeHtml(x.message)}</p></article>`).join("")||`<div class="empty-state">Sin mensajes.</div>`}</div><form id="ticketReplyForm" class="reply-form"><textarea name="message" required></textarea><select name="status"><option value="${t.status}">Mantener: ${statusLabel(t.status)}</option><option value="in_review">En revisión</option><option value="answered">Respondido</option><option value="waiting_user">Esperando usuario</option><option value="resolved">Resuelto</option><option value="closed">Cerrado</option></select><button class="btn primary">Responder</button></form>${t.account_id?`<button id="replaceFromTicket" class="btn success">Cambiar cuenta reportada</button>`:""}`});$("#ticketReplyForm",m.root).onsubmit=async event=>{event.preventDefault();const v=Object.fromEntries(new FormData(event.currentTarget).entries());try{let r=await supabase.from("ticket_messages").insert({ticket_id:id,author_id:state.profile.id,message:v.message,is_system:false});if(r.error)throw r.error;r=await supabase.from("support_tickets").update({status:v.status,assigned_support_id:state.profile.id,closed_at:["closed","resolved"].includes(v.status)?new Date().toISOString():null}).eq("id",id);if(r.error)throw r.error;toast("Respuesta enviada.");m.close();await loadTickets();}catch(e){toast(e.message,"error");}};$("#replaceFromTicket",m.root)?.addEventListener("click",()=>{m.close();replaceAccountModal(t);});}
function replaceAccountModal(t){const a=state.accounts.find(x=>x.id===t.account_id);if(!a)return;const m=openModal({title:"Reemplazar cuenta",body:`<div class="notice-box">La cuenta antigua queda en el ticket y las fechas no cambian.</div><form id="replaceAccountForm" class="form-grid"><label><span>Plataforma</span><input value="${serviceLabel(a.service)}" readonly></label><label><span>Correo anterior</span><input value="${escapeHtml(a.current_email)}" readonly></label><label class="full"><span>Correo nuevo</span><input name="new_email" type="email" required></label><label class="full"><span>Motivo</span><input name="reason" value="Cambio por garantía"></label></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="confirmReplacement" class="btn success">Realizar cambio</button>`});$(".modal-cancel",m.root).onclick=m.close;$("#confirmReplacement",m.root).onclick=async()=>{const f=$("#replaceAccountForm",m.root);if(!f.reportValidity())return;const v=Object.fromEntries(new FormData(f).entries());try{const {data,error}=await supabase.rpc("replace_service_account",{p_account_id:a.id,p_new_email:v.new_email.trim().toLowerCase(),p_ticket_id:t.id,p_reason:v.reason});if(error)throw error;toast(data.message);m.close();await Promise.all([loadAccounts(),loadHistory(),loadTickets()]);}catch(e){toast(e.message,"error");}};}
function contentModal(existing=null){
  const existingThumbnail=
    existing?.cover_url||
    getYouTubeThumbnail(existing?.trailer_url)||
    "";

  const modal=openModal({
    title:existing?"Editar publicación":"Nueva publicación",
    body:`
      <form id="contentForm" class="form-grid">
        <label>
          <span>Título</span>
          <input name="title" value="${escapeHtml(existing?.title||"")}" required>
        </label>

        <label>
          <span>Plataforma</span>
          <select name="platform">
            <option value="netflix" ${existing?.platform!=="spotify"?"selected":""}>Netflix</option>
            <option value="spotify" ${existing?.platform==="spotify"?"selected":""}>Spotify</option>
          </select>
        </label>

        <label>
          <span>Tipo</span>
          <select name="content_type">
            <option ${existing?.content_type!=="Película"&&existing?.content_type!=="Documental"?"selected":""}>Serie</option>
            <option ${existing?.content_type==="Película"?"selected":""}>Película</option>
            <option ${existing?.content_type==="Documental"?"selected":""}>Documental</option>
          </select>
        </label>

        <label>
          <span>Género</span>
          <input name="genre" value="${escapeHtml(existing?.genre||"")}">
        </label>

        <label>
          <span>Fecha de estreno</span>
          <input
            name="release_date"
            type="date"
            value="${escapeHtml(existing?.release_date||"")}"
            required
          >
        </label>

        <label>
          <span>Orden</span>
          <input name="display_order" type="number" min="0" value="${existing?.display_order||0}">
        </label>

        <label class="full">
          <span>Enlace del tráiler en YouTube</span>
          <input
            name="trailer_url"
            type="url"
            value="${escapeHtml(existing?.trailer_url||"")}"
            placeholder="https://www.youtube.com/watch?v=..."
            required
          >
          <small class="field-help">
            La portada se genera automáticamente desde este video.
          </small>
        </label>

        <div id="youtubeCoverPreview" class="youtube-cover-preview full ${existingThumbnail?"has-image":""}">
          <div
            id="youtubeCoverImage"
            class="youtube-cover-image"
            ${existingThumbnail?`style="background-image:url('${escapeHtml(existingThumbnail)}')"`:""}
          >
            <span id="youtubeCoverPlaceholder" ${existingThumbnail?"hidden":""}>
              La portada del video aparecerá aquí
            </span>
          </div>

          <div>
            <strong>Portada automática de YouTube</strong>
            <small id="youtubeCoverStatus">
              ${existingThumbnail
                ?"Portada detectada correctamente."
                :"Pega un enlace válido de YouTube."}
            </small>
          </div>
        </div>

        <label class="full">
          <span>Sinopsis</span>
          <textarea name="synopsis" required>${escapeHtml(existing?.synopsis||"")}</textarea>
        </label>

        <label>
          <span>Estado</span>
          <select name="status">
            <option value="draft" ${existing?.status==="draft"?"selected":""}>Borrador</option>
            <option value="published" ${existing?.status==="published"?"selected":""}>Publicado</option>
            <option value="hidden" ${existing?.status==="hidden"?"selected":""}>Oculto</option>
          </select>
        </label>

        <label class="inline-check">
          <input name="featured" type="checkbox" ${existing?.featured?"checked":""}>
          Destacado
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="saveContent" class="btn primary">Guardar</button>
    `
  });

  const form=$("#contentForm",modal.root);
  const trailerInput=form.elements.trailer_url;
  const preview=$("#youtubeCoverPreview",modal.root);
  const previewImage=$("#youtubeCoverImage",modal.root);
  const placeholder=$("#youtubeCoverPlaceholder",modal.root);
  const previewStatus=$("#youtubeCoverStatus",modal.root);

  const updatePreview=()=>{
    const thumbnail=getYouTubeThumbnail(trailerInput.value);

    if(thumbnail){
      preview.classList.add("has-image");
      previewImage.style.backgroundImage=`url("${thumbnail}")`;
      placeholder.hidden=true;
      previewStatus.textContent="Portada detectada correctamente.";
    }else{
      preview.classList.remove("has-image");
      previewImage.style.backgroundImage="";
      placeholder.hidden=false;
      previewStatus.textContent="El enlace debe pertenecer a YouTube.";
    }

    return thumbnail;
  };

  trailerInput.addEventListener("input",updatePreview);
  trailerInput.addEventListener("change",updatePreview);

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveContent",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const thumbnail=getYouTubeThumbnail(values.trailer_url);

    if(!thumbnail){
      toast("Coloca un enlace válido de YouTube para generar la portada.","error");
      trailerInput.focus();
      return;
    }

    values.cover_url=thumbnail;
    values.release_year=Number(values.release_date.slice(0,4));
    values.display_order=Number(values.display_order||0);
    values.featured=form.elements.featured.checked;
    values.trailer_type="YouTube";

    if(!existing)values.created_by=state.profile.id;

    const button=$("#saveContent",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      const query=existing
        ?supabase
          .from("entertainment_content")
          .update(values)
          .eq("id",existing.id)
        :supabase
          .from("entertainment_content")
          .insert(values);

      const {error}=await query;
      if(error)throw error;

      toast("Publicación guardada con portada automática.");
      modal.close();
      await loadContent();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Guardar";
    }
  };
}
function trailerModal(title,url){const id=String(url||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/)?.[1];openModal({title,wide:true,body:id?`<iframe class="trailer-frame" src="https://www.youtube.com/embed/${encodeURIComponent(id)}" allowfullscreen></iframe>`:`<video class="trailer-frame" src="${escapeHtml(url)}" controls autoplay></video>`});}
function renderRecipientList(){const root=$("#recipientList");if(!root)return;const q=($("#recipientSearch")?.value||"").toLowerCase(),rows=distributors().filter(u=>u.status==="active"&&`${u.full_name} ${u.email}`.toLowerCase().includes(q));root.innerHTML=rows.length?rows.map(u=>`<label class="recipient-row"><input type="checkbox" value="${u.id}"><span class="avatar-small">${escapeHtml(u.full_name[0].toUpperCase())}</span><div><strong>${escapeHtml(u.full_name)}</strong><small>${escapeHtml(u.email)} · Superior: ${escapeHtml(userName(u.parent_id))}</small></div></label>`).join(""):`<div class="empty-state">No se encontraron distribuidores.</div>`;}
function selectAllRecipients(){const list=$$("#recipientList input[type=checkbox]"),select=list.some(i=>!i.checked);list.forEach(i=>i.checked=select);}
async function sendNotification(event){event.preventDefault();const f=event.currentTarget,v=Object.fromEntries(new FormData(f).entries()),ids=$$("#recipientList input[type=checkbox]:checked").map(i=>i.value);if(!ids.length)return toast("Selecciona al menos un distribuidor.","error");const b=f.querySelector("button[type=submit]");b.disabled=true;b.textContent="Enviando...";try{const file=f.elements.image.files[0],image=file?await uploadPublicImage("notification-images",file,state.profile.id):null;const {data,error}=await supabase.rpc("send_distributor_notification",{p_recipient_ids:ids,p_include_descendants:f.elements.include_descendants.checked,p_title:v.title,p_message:v.message,p_image_url:image});if(error)throw error;toast(`Notificación enviada a ${data.recipients||0} distribuidor(es).`);f.reset();renderRecipientList();}catch(e){toast(e.message,"error");}finally{b.disabled=false;b.textContent="Enviar notificación";}}
