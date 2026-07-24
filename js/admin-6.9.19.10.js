console.info("Centro Premium admin V6.9.19.10 cargado");
import {supabase,$,$$,escapeHtml,formatDate,statusLabel,statusTone,serviceLabel,serviceBadge,toast,openModal,wireNavigation,setupLogin,callUserManager,parseEmailBlock,uploadPublicImage,loadNotifications,updateNotificationBadge,showNotificationsModal,renderPersistentNotificationAlert,startNotificationWatcher,openNetflixIntegrated,showSection} from "./core-6.9.19.10.js";

const state={profile:null,users:[],accounts:[],assignments:[],tickets:[],history:[],content:[],notifications:[],notificationHistory:[],helpArticles:[],panelSettings:null,services:[]};
const adminAccountPager={page:1,pageSize:25};
const adminTicketPager={page:1,pageSize:25};
let adminTicketView="";
let adminNotificationSending=false;

setupLogin({
  allowedRoles:["admin","support"],
  onAuthenticated:async({profile})=>{
    state.profile=profile;

    $("#dashboardGreeting").textContent=`Hola, ${profile.full_name}`;
    $("#topbarUserName").textContent=
      profile.business_name||profile.full_name;
    $("#topbarUserRole").textContent=
      profile.role==="support"?"Soporte":"Administración";
    $("#topbarUserAvatar").textContent=
      (profile.business_name||profile.full_name||"U")[0].toUpperCase();

    if(profile.role==="support"){
      document.body.classList.add("support-session");

      const allowedSections=new Set(["dashboard","accounts","tickets","history"]);

      $$(".nav-link").forEach(button=>{
        if(!allowedSections.has(button.dataset.section)){
          button.remove();
        }
      });

      ["services","users","content","help","notifications","panelsettings"].forEach(section=>{
        $(`#section-${section}`)?.remove();
      });

      $("#openCreateUser")?.remove();
      $("#openCreateAccount")?.remove();
      $("#openBulkDeleteAccounts")?.remove();
      $("#openCreateContent")?.remove();
      $("#notificationBell")?.remove();
      $("#adminDashboardSummary").hidden=true;
      $("#supportDashboardSummary").hidden=false;
      $("#supportDashboardGreeting").textContent=`Hola, ${profile.full_name}`;
    }else{
      $("#adminDashboardSummary").hidden=false;
      $("#supportDashboardSummary").hidden=true;
    }

    wireNavigation(loadSection);
    bindActions();
    await loadAll();

    if(profile.role==="admin"){
      startNotificationWatcher({
        userId:profile.id,
        onItems:async(items)=>{
          state.notifications=items;
          updateNotificationBadge(items);

          renderPersistentNotificationAlert(
            items,
            {
              onRead:loadAdminNotifications,
              onOpen:()=>showNotificationsModal(
                state.notifications,
                loadAdminNotifications
              )
            }
          );
        }
      });
    }
  }
});

function bindActions(){


  $("#openCreateUser")?.addEventListener("click",createDistributorModal);
  $("#openCreateAccount")?.addEventListener("click",bulkAddAccountsModal);
  $("#openBulkDeleteAccounts")?.addEventListener("click",bulkDeleteAccountsModal);
  $("#openCreateContent")?.addEventListener("click",()=>contentModal());
  $("#adminCreateTicket")?.addEventListener("click",createStaffTicketModal);
  $("#openCreateHelpArticle")?.addEventListener("click",()=>helpArticleModal());
  $("#helpTypeFilter")?.addEventListener("change",renderHelpAdmin);

  $$("[data-ticket-view]").forEach(button=>{
    button.addEventListener("click",()=>{
      $$("[data-ticket-view]").forEach(
        tab=>tab.classList.remove("active")
      );

      button.classList.add("active");
      adminTicketView=button.dataset.ticketView||"";
      adminTicketPager.page=1;
      renderTickets();
    });
  });

  $$("[data-support-status]").forEach(button=>{
    button.addEventListener("click",async()=>{
      await showSection("tickets",loadSection);

      adminTicketView=
        button.dataset.supportStatus==="pending"
          ?"pending"
          :"resolved";

      $$("[data-ticket-view]").forEach(tab=>{
        tab.classList.toggle(
          "active",
          tab.dataset.ticketView===adminTicketView
        );
      });

      adminTicketPager.page=1;
      renderTickets();
    });
  });

  $("#userSearch")?.addEventListener("input",renderUsers);
  $("#userRoleFilter")?.addEventListener("change",renderUsers);

  $("#accountSearch")?.addEventListener("input",()=>{
    adminAccountPager.page=1;
    renderAccounts();
  });

  $("#accountServiceFilter")?.addEventListener("change",()=>{
    adminAccountPager.page=1;
    renderAccounts();
  });

  $("#accountStatusFilter")?.addEventListener("change",()=>{
    adminAccountPager.page=1;
    renderAccounts();
  });

  $("#adminAccountsPageSize")?.addEventListener("change",event=>{
    adminAccountPager.pageSize=Math.min(
      100,
      Math.max(25,Number(event.target.value)||25)
    );
    adminAccountPager.page=1;
    renderAccounts();
  });

  $("#exportAdminAccounts")?.addEventListener(
    "click",
    exportAdminAccountsToExcel
  );

  $("#openAdminUpdateDates")?.addEventListener(
    "click",
    adminBulkUpdateDatesModal
  );

  $("#ticketSearch")?.addEventListener("input",()=>{adminTicketPager.page=1;renderTickets();});
  $("#ticketServiceFilter")?.addEventListener("change",()=>{adminTicketPager.page=1;renderTickets();});
  $("#adminTicketsPageSize")?.addEventListener("change",event=>{
    adminTicketPager.pageSize=Math.min(100,Math.max(25,Number(event.target.value)||25));
    adminTicketPager.page=1;
    renderTickets();
  });
  $("#exportAdminTickets")?.addEventListener("click",exportAdminTicketsToExcel);

  $("#recipientSearch")?.addEventListener("input",renderRecipientList);
  $("#selectAllRecipients")?.addEventListener("click",selectAllRecipients);
  $("#adminNotificationScope")?.addEventListener(
    "change",
    updateAdminNotificationScope
  );
  if($("#notificationForm")) $("#notificationForm").onsubmit=sendNotification;
  $("#notificationBell")?.addEventListener(
    "click",
    ()=>showNotificationsModal(
      state.notifications,
      loadAdminNotifications
    )
  );
  $("#panelBrandForm")?.addEventListener(
    "submit",
    savePanelBrand
  );
  $("#openCreatePanelService")?.addEventListener(
    "click",
    ()=>panelServiceModal()
  );

}
async function loadAll(){
  const commonTasks=[
    loadUsers(),
    loadAccounts(),
    loadTickets(),
    loadHistory(),
    loadPanelSettings(),
    loadServiceCatalog()
  ];

  if(state.profile.role==="admin"){
    commonTasks.push(loadContent(),loadHelpArticles(),loadAdminNotifications());
  }

  await Promise.allSettled(commonTasks);
  renderDashboard();

  if(state.profile.role==="admin"){
    renderRecipientList();
  }
}

async function loadSection(section){
  if(section==="users"&&state.profile.role==="admin")await loadUsers();
  if(section==="accounts")await loadAccounts();
  if(section==="tickets")await loadTickets();
  if(section==="history")await loadHistory();
  if(section==="content"&&state.profile.role==="admin")await loadContent();
  if(section==="help"&&state.profile.role==="admin")await loadHelpArticles();
  if(section==="services")await loadServiceCatalog();
  if(section==="panelsettings"&&state.profile.role==="admin"){
    await Promise.all([loadPanelSettings(),loadServiceCatalog()]);
  }

  if(section==="notifications"&&state.profile.role==="admin"){
    await Promise.all([loadUsers(),loadSentNotificationHistory()]);
    renderRecipientList();
  }
}

async function loadUsers(){
  const {data,error}=await supabase.rpc("staff_list_profiles_v24");

  if(error){
    toast(`No se pudieron cargar los usuarios: ${error.message}`,"error");
    state.users=[];
    renderUsers();
    return;
  }

  state.users=data||[];

  if($("#usersTable")){
    renderUsers();
  }
}
const distributors=()=>state.users.filter(u=>u.role==="reseller");
const userName=id=>state.users.find(u=>u.id===id)?.full_name||"Administrador principal";
function adminHierarchyRows(){
  const activeResellers=state.users.filter(
    user=>user.role==="reseller"&&user.status==="active"
  );

  const resellerIds=new Set(activeResellers.map(user=>user.id));
  const children=new Map();

  activeResellers.forEach(user=>{
    const parentKey=user.parent_id||"__root__";
    if(!children.has(parentKey))children.set(parentKey,[]);
    children.get(parentKey).push(user);
  });

  children.forEach(rows=>rows.sort((a,b)=>
    (a.business_name||a.full_name||"").localeCompare(
      b.business_name||b.full_name||"",
      "es",
      {sensitivity:"base"}
    )
  ));

  const roots=activeResellers.filter(user=>
    user.parent_id===state.profile.id
    ||!resellerIds.has(user.parent_id)
  );

  const output=[];
  const visited=new Set();

  function append(user,depth){
    if(!user||visited.has(user.id))return;
    visited.add(user.id);
    output.push({user,depth});
    (children.get(user.id)||[]).forEach(child=>append(child,depth+1));
  }

  roots.forEach(user=>append(user,0));
  activeResellers.forEach(user=>append(user,0));
  return output;
}

function renderUsers(){
  const query=($("#userSearch")?.value||"").trim().toLowerCase();
  const role=$("#userRoleFilter")?.value||"";
  const hierarchy=adminHierarchyRows();
  const supportUsers=state.users
    .filter(user=>user.role==="support"&&user.status==="active")
    .sort((a,b)=>(a.full_name||"").localeCompare(b.full_name||"","es"));

  const matches=user=>{
    const haystack=`${user.full_name||""} ${user.business_name||""} ${user.email||""}`.toLowerCase();
    return haystack.includes(query);
  };

  const resellerRows=role==="support"
    ?[]
    :hierarchy.filter(item=>matches(item.user));
  const supportRows=role==="reseller"
    ?[]
    :supportUsers.filter(matches).map(user=>({user,depth:0,support:true}));

  const rows=[];

  if(!query&&role!=="support"){
    const adminName=state.profile.business_name||state.profile.full_name||"Administrador";
    rows.push(`
      <tr class="hierarchy-admin-root">
        <td>
          <div class="hierarchy-person hierarchy-depth-0">
            <span class="hierarchy-root-symbol">◆</span>
            <div>
              <strong>${escapeHtml(adminName)}</strong>
              <small>ADMINISTRACIÓN PRINCIPAL</small>
            </div>
          </div>
        </td>
        <td>${escapeHtml(state.profile.email||"")}</td>
        <td>—</td>
        <td><span class="status-pill green">Activo</span></td>
        <td><span class="read-only-pill">Administrador</span></td>
      </tr>
    `);
  }

  resellerRows.forEach(({user,depth})=>{
    const displayName=user.business_name||user.full_name||"Sin nombre";
    const parentName=user.parent_id===state.profile.id
      ?(state.profile.business_name||state.profile.full_name||"Administración")
      :userName(user.parent_id);

    rows.push(`
      <tr class="hierarchy-user-row" style="--tree-depth:${depth}">
        <td>
          <div class="hierarchy-person">
            <span class="hierarchy-connector">${depth?"└":"├"}</span>
            <span class="avatar-small">${escapeHtml(displayName[0].toUpperCase())}</span>
            <div>
              <strong>${escapeHtml(displayName)}</strong>
              <small>${escapeHtml(user.full_name||"Distribuidor")}</small>
            </div>
          </div>
        </td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(parentName)}</td>
        <td><span class="status-pill ${statusTone(user.status)}">${statusLabel(user.status)}</span></td>
        <td><div class="action-group">
          <button class="action-button blue" data-user-accounts="${user.id}">Cuentas</button>
          <button class="action-button cyan" data-user-assign="${user.id}">Asignar</button>
          <button class="action-button yellow" data-user-edit="${user.id}">Editar</button>
          <button class="action-button red" data-user-delete="${user.id}">Eliminar</button>
        </div></td>
      </tr>
    `);
  });

  supportRows.forEach(({user})=>{
    const displayName=user.full_name||user.email||"Soporte";
    rows.push(`
      <tr class="support-user-row">
        <td><div class="person-cell"><span class="avatar-small">${escapeHtml(displayName[0].toUpperCase())}</span><div><strong>${escapeHtml(displayName)}</strong><small>Personal de soporte</small></div></div></td>
        <td>${escapeHtml(user.email)}</td>
        <td>Administración</td>
        <td><span class="status-pill ${statusTone(user.status)}">${statusLabel(user.status)}</span></td>
        <td><div class="action-group">
          <button class="action-button yellow" data-user-edit="${user.id}">Editar</button>
          <button class="action-button red" data-user-delete="${user.id}">Eliminar</button>
        </div></td>
      </tr>
    `);
  });

  $("#usersTable").innerHTML=rows.join("")||`<tr><td colspan="5" class="empty-cell">No se encontraron usuarios.</td></tr>`;

  $$('[data-user-accounts]').forEach(button=>button.onclick=()=>showDistributorAccounts(button.dataset.userAccounts));
  $$('[data-user-edit]').forEach(button=>button.onclick=()=>editDistributorModal(button.dataset.userEdit));
  $$('[data-user-delete]').forEach(button=>button.onclick=()=>deleteDistributor(button.dataset.userDelete));
  $$('[data-user-assign]').forEach(button=>button.onclick=()=>bulkAssignModal(button.dataset.userAssign));
}

async function loadAccounts(){
  const {data,error}=await supabase.rpc("staff_list_service_accounts_v29");

  if(error){
    toast(`No se pudieron cargar las cuentas: ${error.message}`,"error");
    state.accounts=[];
    state.assignments=[];
    renderAccounts();
    return false;
  }

  const rows=data||[];

  state.accounts=rows.map(row=>({
    id:row.id,
    service:row.service,
    current_email:row.current_email,
    country:row.country||"Sin configurar",
    account_type:row.account_type,
    status:row.status,
    current_reseller_id:row.current_reseller_id,
    current_client_id:row.current_client_id,
    origin_distributor_id:row.origin_distributor_id,
    inventory_admin_id:row.inventory_admin_id,
    created_at:row.created_at,
    reseller:row.current_reseller_id?{
      full_name:row.reseller_full_name,
      business_name:row.reseller_business_name,
      parent_id:row.reseller_parent_id,
      parent_full_name:row.parent_full_name,
      parent_business_name:row.parent_business_name
    }:null,
    origin:row.origin_distributor_id?{
      full_name:row.origin_full_name,
      business_name:row.origin_business_name
    }:null,
    client:row.current_client_id?{
      full_name:row.client_full_name
    }:null
  }));

  state.assignments=rows
    .filter(row=>row.assignment_id)
    .map(row=>({
      id:row.assignment_id,
      account_id:row.id,
      status:row.assignment_status,
      seller_id:row.seller_id,
      buyer_reseller_id:row.buyer_reseller_id,
      buyer_client_id:row.buyer_client_id,
      starts_on:row.starts_on,
      duration_days:row.duration_days,
      expires_on:row.expires_on,
      days_remaining:row.days_remaining,
      calculated_status:row.calculated_status,
      created_at:row.assignment_created_at
    }));

  renderAccounts();
  return true;
}

async function loadAssignments(){
  // Las asignaciones llegan junto con las cuentas mediante la API V24.
  if(!state.accounts.length){
    await loadAccounts();
  }else{
    renderAccounts();
  }
  return true;
}

function activeAssignment(a){
  const rows=state.assignments.filter(
    assignment=>
      assignment.account_id===a.id
      &&assignment.status==="active"
  );

  return rows.find(
    assignment=>
      a.current_client_id
      &&assignment.buyer_client_id===a.current_client_id
  )||rows.find(
    assignment=>
      a.current_reseller_id
      &&assignment.buyer_reseller_id===a.current_reseller_id
  )||rows[0]||null;
}
function ownerDisplay(account){
  if(account.client?.full_name){
    return `${account.client.full_name} / ${
      account.reseller?.business_name||
      account.reseller?.full_name||
      "Sin distribuidor"
    }`;
  }

  if(account.reseller?.full_name){
    const owner=
      account.reseller.business_name||
      account.reseller.full_name;

    const parent=
      account.reseller.parent_business_name||
      account.reseller.parent_full_name||
      (account.reseller.parent_id
        ?userName(account.reseller.parent_id)
        :"");

    return parent?`${owner} / ${parent}`:owner;
  }

  return "Disponible";
}

function adminFilteredAccounts(){
  const query=($("#accountSearch")?.value||"").toLowerCase();
  const service=$("#accountServiceFilter")?.value||"";
  const status=$("#accountStatusFilter")?.value||"";

  return state.accounts.filter(account=>{
    const matchesText=`
      ${account.current_email||""}
      ${ownerDisplay(account)}
    `.toLowerCase().includes(query);

    return matchesText
      &&(!service||account.service===service)
      &&(!status||account.status===status);
  });
}

function paginationTokens(current,total){
  if(total<=7){
    return Array.from({length:total},(_,index)=>index+1);
  }

  const tokens=[1];

  if(current>4){
    tokens.push("ellipsis-left");
  }

  const start=Math.max(2,current-1);
  const end=Math.min(total-1,current+1);

  for(let page=start;page<=end;page+=1){
    tokens.push(page);
  }

  if(current<total-3){
    tokens.push("ellipsis-right");
  }

  tokens.push(total);
  return tokens;
}

function renderAccountPagination(rootId,totalRows,pager,onChange){
  const root=$(rootId);
  if(!root)return;

  const totalPages=Math.max(1,Math.ceil(totalRows/pager.pageSize));
  pager.page=Math.min(Math.max(1,pager.page),totalPages);

  root.innerHTML=`
    <button
      class="pagination-button"
      data-page-action="previous"
      ${pager.page===1?"disabled":""}
    >
      Anterior
    </button>

    ${paginationTokens(pager.page,totalPages).map(token=>
      typeof token==="number"
        ?`<button
            class="pagination-button ${token===pager.page?"active":""}"
            data-page-number="${token}"
          >
            ${token}
          </button>`
        :`<span class="pagination-ellipsis">…</span>`
    ).join("")}

    <button
      class="pagination-button"
      data-page-action="next"
      ${pager.page===totalPages?"disabled":""}
    >
      Siguiente
    </button>
  `;

  $$("[data-page-number]",root).forEach(button=>{
    button.onclick=()=>{
      pager.page=Number(button.dataset.pageNumber);
      onChange();
    };
  });

  $("[data-page-action='previous']",root)?.addEventListener("click",()=>{
    pager.page=Math.max(1,pager.page-1);
    onChange();
  });

  $("[data-page-action='next']",root)?.addEventListener("click",()=>{
    pager.page=Math.min(totalPages,pager.page+1);
    onChange();
  });
}

function renderAccounts(){
  const rows=adminFilteredAccounts();
  const totalPages=Math.max(
    1,
    Math.ceil(rows.length/adminAccountPager.pageSize)
  );

  adminAccountPager.page=Math.min(
    adminAccountPager.page,
    totalPages
  );

  const start=(adminAccountPager.page-1)*adminAccountPager.pageSize;
  const visibleRows=rows.slice(
    start,
    start+adminAccountPager.pageSize
  );

  $("#accountsTable").innerHTML=visibleRows.length
    ?visibleRows.map(account=>{
      const assignment=activeAssignment(account);

      const actions=state.profile.role==="admin"
        ?`
          <button
            class="action-button yellow"
            data-account-edit="${account.id}"
          >
            Editar
          </button>

          <button
            class="action-button red"
            data-account-delete="${account.id}"
          >
            Eliminar
          </button>
        `
        :`<span class="read-only-pill">Solo consulta</span>`;

      return `
        <tr>
          <td>${serviceBadge(account.service)}</td>
          <td><strong>${escapeHtml(account.current_email)}</strong></td>
          <td>${escapeHtml(account.country||"Sin configurar")}</td>
          <td>${escapeHtml(account.account_type||"Cuenta completa")}</td>
          <td>${escapeHtml(ownerDisplay(account))}</td>
          <td>${formatDate(assignment?.expires_on)}</td>
          <td>
            <span class="days-pill ${statusTone(assignment?.calculated_status)}">
              ${assignment?.days_remaining??"—"}
            </span>
          </td>
          <td>
            <span class="status-pill ${statusTone(
              assignment?.calculated_status||account.status
            )}">
              ${statusLabel(
                assignment?.calculated_status||account.status
              )}
            </span>
          </td>
          <td>${actions}</td>
        </tr>
      `;
    }).join("")
    :`<tr>
        <td colspan="9" class="empty-cell">
          No se encontraron cuentas.
        </td>
      </tr>`;

  const from=rows.length?start+1:0;
  const to=Math.min(start+visibleRows.length,rows.length);

  $("#adminAccountsCount").textContent=
    `Mostrando ${from}–${to} de ${rows.length} cuentas`;

  renderAccountPagination(
    "#adminAccountsPagination",
    rows.length,
    adminAccountPager,
    renderAccounts
  );

  $$("[data-account-edit]").forEach(button=>{
    button.onclick=()=>editAccountModal(button.dataset.accountEdit);
  });

  $$("[data-account-delete]").forEach(button=>{
    button.onclick=()=>deleteServiceAccount(button.dataset.accountDelete);
  });
}

function exportWorkbook(rows,fileName){
  const headers=[
    "Servicio",
    "Cuenta",
    "País",
    "Tipo",
    "Propietario",
    "Fecha de inicio",
    "Fecha de corte",
    "Duración",
    "Días restantes",
    "Estado"
  ];

  if(window.XLSX){
    const worksheet=window.XLSX.utils.json_to_sheet(rows,{
      header:headers
    });

    worksheet["!cols"]=[
      {wch:12},
      {wch:38},
      {wch:18},
      {wch:20},
      {wch:28},
      {wch:16},
      {wch:16},
      {wch:12},
      {wch:16},
      {wch:16}
    ];

    const workbook=window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Cuentas"
    );

    window.XLSX.writeFile(workbook,fileName);
    return;
  }

  const escapeXml=value=>String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");

  const allRows=[
    headers,
    ...rows.map(row=>headers.map(header=>row[header]))
  ];

  const xml=`<?xml version="1.0"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Worksheet ss:Name="Cuentas">
        <Table>
          ${allRows.map((row,index)=>`
            <Row>
              ${row.map(value=>`
                <Cell>
                  <Data ss:Type="${typeof value==="number"?"Number":"String"}">
                    ${escapeXml(value)}
                  </Data>
                </Cell>
              `).join("")}
            </Row>
          `).join("")}
        </Table>
      </Worksheet>
    </Workbook>`;

  const blob=new Blob([xml],{
    type:"application/vnd.ms-excel"
  });

  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download=fileName.replace(/\.xlsx$/i,".xls");
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportAdminAccountsToExcel(){
  const rows=adminFilteredAccounts().map(account=>{
    const assignment=activeAssignment(account);

    return {
      "Servicio":serviceLabel(account.service),
      "Cuenta":account.current_email,
      "Tipo":account.account_type||"Cuenta completa",
      "Propietario":ownerDisplay(account),
      "Fecha de inicio":assignment?.starts_on||"",
      "Fecha de corte":assignment?.expires_on||"",
      "Duración":assignment?.duration_days||30,
      "Días restantes":assignment?.days_remaining??"",
      "Estado":statusLabel(
        assignment?.calculated_status||account.status
      )
    };
  });

  if(!rows.length){
    toast("No existen cuentas para exportar.","error");
    return;
  }

  exportWorkbook(
    rows,
    `cuentas-servicio-${new Date().toISOString().slice(0,10)}.xlsx`
  );

  toast(`${rows.length} cuentas exportadas.`);
}

function adminBulkUpdateDatesModal(){
  const modal=openModal({
    title:"Actualizar fechas en lote",
    body:`
      <div class="notice-box">
        Escribe las cuentas que deseas actualizar, una por línea.
        Esta fecha pertenece únicamente a tu usuario administrador.
        Las fechas de los distribuidores no se modificarán.
      </div>

      <form id="adminBulkUpdateDatesForm" class="form-grid">
        <label>
          <span>Plataforma</span>
          <select name="service">
            <option value="netflix">Netflix</option>
            <option value="spotify">Spotify</option>
          </select>
        </label>

        <label>
          <span>Fecha de venta / inicio</span>
          <input
            name="starts_on"
            type="date"
            value="${new Date().toISOString().slice(0,10)}"
            required
          >
        </label>

        <label class="full">
          <span>Cuentas, una por línea</span>
          <textarea
            name="emails"
            rows="11"
            placeholder="correo1@ejemplo.com&#10;correo2@ejemplo.com"
            required
          ></textarea>
        </label>

        <label>
          <span>Duración</span>
          <input value="30 días" readonly>
        </label>

        <div id="adminBulkUpdateCounter" class="counter-note">
          0 cuentas detectadas
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="confirmAdminBulkUpdateDates" class="btn primary">
        Actualizar fechas
      </button>
    `
  });

  const form=$("#adminBulkUpdateDatesForm",modal.root);
  const textarea=form.elements.emails;

  textarea.oninput=()=>{
    $("#adminBulkUpdateCounter",modal.root).textContent=
      `${parseEmailBlock(textarea.value).length} cuentas detectadas`;
  };

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmAdminBulkUpdateDates",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const emails=parseEmailBlock(values.emails);
    const button=$("#confirmAdminBulkUpdateDates",modal.root);

    if(!emails.length){
      toast("Coloca al menos una cuenta.","error");
      return;
    }

    button.disabled=true;
    button.textContent="Actualizando...";

    try{
      const {data,error}=await supabase.rpc(
        "bulk_update_my_account_terms_v28",
        {
          p_service:values.service,
          p_account_emails:emails,
          p_starts_on:values.starts_on||null
        }
      );

      if(error)throw error;

      toast(
        `${data.updated||0} actualizadas, `+
        `${data.not_allowed||0} sin permiso, `+
        `${data.not_found||0} no encontradas y `+
        `${data.invalid||0} inválidas.`
      );

      modal.close();
      await Promise.all([
        loadAccounts(),
        loadAssignments()
      ]);
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Actualizar fechas";
    }
  };
}

async function loadTickets(){const {data,error}=await supabase.from("support_tickets").select("id,ticket_number,service,reported_email,account_email_snapshot,title,category,description,status,created_at,updated_at,account_id,creator:created_by(full_name)").order("updated_at",{ascending:false});if(error)return toast(error.message,"error");state.tickets=data||[];renderTickets();}
function staffTicketStatusLabel(status){
  return {
    open:"Pendiente de resolver",
    in_review:"En proceso",
    answered:"En proceso",
    waiting_user:"En proceso",
    resolved:"Cerrado",
    closed:"Cerrado"
  }[status]||statusLabel(status);
}

function adminFilteredTickets(){
  const query=(
    $("#ticketSearch")?.value||""
  ).toLowerCase();

  const service=
    $("#ticketServiceFilter")?.value||"";

  const pendingStatuses=new Set([
    "open",
    "in_review",
    "answered",
    "waiting_user"
  ]);

  const resolvedStatuses=new Set([
    "closed",
    "resolved"
  ]);

  return state.tickets.filter(ticket=>{
    const matchesSearch=`
      ${ticket.creator?.full_name||""}
      ${ticket.title||""}
      ${ticket.category||""}
      ${ticket.reported_email||ticket.account_email_snapshot||""}
    `.toLowerCase().includes(query);

    const matchesService=
      !service||ticket.service===service;

    const matchesView=
      !adminTicketView
      ||(
        adminTicketView==="pending"
        &&pendingStatuses.has(ticket.status)
      )
      ||(
        adminTicketView==="resolved"
        &&resolvedStatuses.has(ticket.status)
      );

    return (
      matchesSearch
      &&matchesService
      &&matchesView
    );
  });
}
function renderAdminTicketPagination(totalRows){
  const root=$("#adminTicketsPagination"); if(!root)return;
  const totalPages=Math.max(1,Math.ceil(totalRows/adminTicketPager.pageSize));
  adminTicketPager.page=Math.min(Math.max(1,adminTicketPager.page),totalPages);
  root.innerHTML=`<button class="pagination-button" data-at-action="prev" ${adminTicketPager.page===1?"disabled":""}>Anterior</button>${paginationTokens(adminTicketPager.page,totalPages).map(token=>typeof token==="number"?`<button class="pagination-button ${token===adminTicketPager.page?"active":""}" data-at-page="${token}">${token}</button>`:`<span class="pagination-ellipsis">…</span>`).join("")}<button class="pagination-button" data-at-action="next" ${adminTicketPager.page===totalPages?"disabled":""}>Siguiente</button>`;
  $$("[data-at-page]",root).forEach(button=>button.onclick=()=>{adminTicketPager.page=Number(button.dataset.atPage);renderTickets();});
  $("[data-at-action='prev']",root)?.addEventListener("click",()=>{adminTicketPager.page=Math.max(1,adminTicketPager.page-1);renderTickets();});
  $("[data-at-action='next']",root)?.addEventListener("click",()=>{adminTicketPager.page=Math.min(totalPages,adminTicketPager.page+1);renderTickets();});
}
function renderTickets(){
  const rows=adminFilteredTickets();
  const totalPages=Math.max(1,Math.ceil(rows.length/adminTicketPager.pageSize));
  adminTicketPager.page=Math.min(adminTicketPager.page,totalPages);
  const start=(adminTicketPager.page-1)*adminTicketPager.pageSize;
  const visible=rows.slice(start,start+adminTicketPager.pageSize);
  $("#ticketsTable").innerHTML=visible.length?visible.map(ticket=>`<tr><td>${escapeHtml(ticket.creator?.full_name||"—")}</td><td>${serviceBadge(ticket.service)}</td><td><strong>${escapeHtml(ticket.title)}</strong></td><td>${escapeHtml(ticket.category)}</td><td>${escapeHtml(ticket.reported_email||ticket.account_email_snapshot)}</td><td><span class="status-pill ${statusTone(ticket.status)}">${staffTicketStatusLabel(ticket.status)}</span></td><td><button class="round-action" data-ticket-open="${ticket.id}">Ver</button></td></tr>`).join(""):`<tr><td colspan="7" class="empty-cell">No se encontraron tickets.</td></tr>`;
  const from=rows.length?start+1:0,to=Math.min(start+visible.length,rows.length);
  $("#adminTicketsCount").textContent=`Mostrando ${from}–${to} de ${rows.length} tickets`;
  renderAdminTicketPagination(rows.length);
  $$("[data-ticket-open]").forEach(button=>button.onclick=()=>openTicket(button.dataset.ticketOpen));
}
function exportAdminTicketsToExcel(){
  if(state.profile?.role!=="admin"){
    toast(
      "Solo el administrador puede descargar los tickets de soporte.",
      "error"
    );
    return;
  }

  const rows=adminFilteredTickets().map(ticket=>({
    "Distribuidor":ticket.creator?.full_name||"",
    "Plataforma":serviceLabel(ticket.service),
    "Título":ticket.title||"",
    "Categoría":ticket.category||"",
    "Correo reportado":ticket.reported_email||ticket.account_email_snapshot||"",
    "Estado":staffTicketStatusLabel(ticket.status),
    "Fecha de creación":ticket.created_at||"",
    "Fecha de cierre":ticket.closed_at||""
  }));
  if(!rows.length){toast("No existen tickets para exportar.","error");return;}
  exportWorkbook(rows,`tickets-soporte-${new Date().toISOString().slice(0,10)}.xlsx`);
  toast(`${rows.length} tickets exportados.`);
}

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
            data-synopsis="${escapeHtml(item.synopsis||"Sin sinopsis disponible.")}"
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
    button.onclick=()=>trailerModal(button.dataset.title,button.dataset.trailer,button.dataset.synopsis);
  });

  $$("[data-content-edit]").forEach(button=>{
    button.onclick=()=>contentModal(
      state.content.find(item=>item.id===button.dataset.contentEdit)
    );
  });
}
async function loadAdminNotifications(){
  try{
    state.notifications=await loadNotifications();
    updateNotificationBadge(state.notifications);

    renderPersistentNotificationAlert(
      state.notifications,
      {
        onRead:loadAdminNotifications,
        onOpen:()=>showNotificationsModal(
          state.notifications,
          loadAdminNotifications
        )
      }
    );
  }catch{
    state.notifications=[];
    updateNotificationBadge([]);
    renderPersistentNotificationAlert([]);
  }
}
function renderDashboard(){
  const pending=state.tickets.filter(ticket=>!["closed","resolved"].includes(ticket.status));
  const resolved=state.tickets.filter(ticket=>["closed","resolved"].includes(ticket.status));

  if(state.profile.role==="support"){
    $("#supportPendingTickets").textContent=pending.length;
    $("#supportReviewTickets").textContent=state.tickets.filter(
      ticket=>["in_review","answered","waiting_user"].includes(ticket.status)
    ).length;
    $("#supportResolvedTickets").textContent=resolved.length;

    $("#supportPendingList").innerHTML=pending.slice(0,8).map(ticket=>`
      <button class="activity-row support-ticket-row" data-ticket-open="${ticket.id}">
        ${serviceBadge(ticket.service)}
        <div>
          <strong>${escapeHtml(ticket.title)}</strong>
          <small>${escapeHtml(ticket.creator?.full_name||"Usuario")} · ${escapeHtml(ticket.reported_email||ticket.account_email_snapshot)}</small>
        </div>
        <span class="status-pill ${statusTone(ticket.status)}">${statusLabel(ticket.status)}</span>
      </button>
    `).join("")||`<div class="empty-state">No hay tickets pendientes.</div>`;

    $("#supportResolvedList").innerHTML=resolved.slice(0,6).map(ticket=>`
      <button class="stack-row" data-ticket-open="${ticket.id}">
        <div>
          <strong>${escapeHtml(ticket.title)}</strong>
          <small>${escapeHtml(ticket.creator?.full_name||"Usuario")}</small>
        </div>
        <span class="status-pill green">${statusLabel(ticket.status)}</span>
      </button>
    `).join("")||`<div class="empty-state">Todavía no hay tickets resueltos.</div>`;
  }else{
    $("#statUsers").textContent=distributors().filter(u=>u.status==="active").length;
    $("#statAccounts").textContent=state.accounts.length;
    $("#statAvailable").textContent=state.accounts.filter(a=>a.status==="available").length;
    $("#statTickets").textContent=pending.length;

    $("#recentAccounts").innerHTML=state.accounts.slice(0,7).map(a=>`
      <div class="activity-row">
        ${serviceBadge(a.service)}
        <div><strong>${escapeHtml(a.current_email)}</strong><small>${escapeHtml(ownerDisplay(a))}</small></div>
        <span class="status-pill ${statusTone(a.status)}">${statusLabel(a.status)}</span>
      </div>
    `).join("")||`<div class="empty-state">No existen cuentas.</div>`;

    renderAdminFeaturedContent();

    $("#recentTickets").innerHTML=state.tickets.slice(0,6).map(t=>`
      <button class="stack-row" data-ticket-open="${t.id}">
        <div><strong>${escapeHtml(t.title)}</strong><small>${serviceLabel(t.service)} · ${escapeHtml(t.creator?.full_name||"")}</small></div>
        <span class="status-pill ${statusTone(t.status)}">${statusLabel(t.status)}</span>
      </button>
    `).join("")||`<div class="empty-state">No existen tickets.</div>`;
  }

  $$("[data-ticket-open]").forEach(button=>{
    button.onclick=()=>openTicket(button.dataset.ticketOpen);
  });
}
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

  const accountReturnMessage=user.role==="reseller"
    ?" Se eliminará también toda su rama de distribuidores. Todas las cuentas de esa rama volverán al superior o a la base central."
    :"";

  if(!confirm(
    `¿Eliminar ${label}: ${user.full_name}?\n`+
    "Se bloqueará el acceso y se conservará el historial."+
    accountReturnMessage
  ))return;

  try{
    const result=await callUserManager({
      action:"delete",
      user_id:id
    });

    toast(result.message);

    await Promise.all([
      loadUsers(),
      loadAccounts(),
      loadAssignments()
    ]);
  }catch(error){
    toast(error.message,"error");
  }
}

async function showDistributorAccounts(id){
  const user=state.users.find(item=>item.id===id);
  if(!user)return;

  const modal=openModal({
    title:`Cuentas asignadas a ${user.business_name||user.full_name}`,
    extraWide:true,
    body:`
      <div class="notice-box">
        Se muestran las cuentas originales de esta rama y las que actualmente
        manejan sus subordinados. Cada cuenta aparece una sola vez.
      </div>

      <div id="branchAccountsLoading" class="empty-state">
        Cargando cuentas de la rama...
      </div>
    `
  });

  try{
    const {data,error}=await supabase.rpc(
      "staff_list_user_branch_accounts_v29",
      {p_distributor_id:id}
    );
    if(error)throw error;

    const allRows=data||[];
    let page=1;
    let pageSize=25;
    let search="";
    let service="";

    $("#branchAccountsLoading",modal.root).outerHTML=`
      <section class="branch-accounts-browser">
        <div class="branch-account-controls">
          <input
            id="branchAccountSearch"
            class="search-control"
            placeholder="Buscar correo, propietario, país o tipo"
          >

          <select id="branchAccountPageSize" class="page-size-select compact">
            <option value="25">25 por página</option>
            <option value="50">50 por página</option>
            <option value="100">100 por página</option>
          </select>

          <select id="branchAccountService">
            <option value="">Todas las plataformas</option>
            <option value="netflix">Netflix</option>
            <option value="spotify">Spotify</option>
          </select>
        </div>

        <div class="branch-account-summary">
          <strong id="branchAccountTotal"></strong>
          <span id="branchAccountRange"></span>
        </div>

        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Servicio</th><th>Correo</th><th>País</th><th>Tipo</th>
                <th>Propietario</th><th>Fecha de corte</th>
                <th>Días restantes</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody id="branchAccountRows"></tbody>
          </table>
        </div>

        <div id="branchAccountPagination" class="pagination"></div>
      </section>
    `;

    const ownerPath=account=>{
      const owner=account.reseller_business_name||
        account.reseller_full_name||"Disponible";
      const parent=account.parent_business_name||
        account.parent_full_name||"";
      return parent?`${owner} / ${parent}`:owner;
    };

    const render=()=>{
      const query=search.trim().toLowerCase();
      const filtered=allRows.filter(account=>{
        if(service&&String(account.service).toLowerCase()!==service)return false;
        if(!query)return true;
        return [
          account.current_email,
          account.country,
          account.account_type,
          ownerPath(account)
        ].some(value=>String(value||"").toLowerCase().includes(query));
      });

      const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
      page=Math.min(Math.max(1,page),totalPages);
      const start=(page-1)*pageSize;
      const visible=filtered.slice(start,start+pageSize);

      $("#branchAccountRows",modal.root).innerHTML=visible.length
        ?visible.map(account=>`<tr>
          <td>${serviceBadge(account.service)}</td>
          <td><strong>${escapeHtml(account.current_email)}</strong></td>
          <td>${escapeHtml(account.country||"Sin configurar")}</td>
          <td>${escapeHtml(account.account_type||"Cuenta completa")}</td>
          <td>${escapeHtml(ownerPath(account))}</td>
          <td>${formatDate(account.expires_on)}</td>
          <td><span class="days-pill ${statusTone(account.calculated_status)}">${account.days_remaining??"—"}</span></td>
          <td><span class="status-pill ${statusTone(account.calculated_status||account.status)}">${statusLabel(account.calculated_status||account.status)}</span></td>
          <td><button class="action-button yellow" data-branch-account-edit="${account.id}">Editar</button></td>
        </tr>`).join("")
        :`<tr><td colspan="9" class="empty-cell">No existen cuentas con estos filtros.</td></tr>`;

      const platformLabel=service?serviceLabel(service):"todas las plataformas";
      $("#branchAccountTotal",modal.root).textContent=
        service?`Total ${platformLabel}: ${filtered.length}`:`Total de cuentas: ${filtered.length}`;
      const from=filtered.length?start+1:0;
      const to=Math.min(start+visible.length,filtered.length);
      $("#branchAccountRange",modal.root).textContent=
        `Mostrando ${from}–${to} de ${filtered.length}`;

      const pagination=$("#branchAccountPagination",modal.root);
      pagination.innerHTML=`
        <button class="pagination-button" data-branch-prev ${page===1?"disabled":""}>Anterior</button>
        <span class="pagination-current">Página ${page} de ${totalPages}</span>
        <button class="pagination-button" data-branch-next ${page===totalPages?"disabled":""}>Siguiente</button>
      `;

      $("[data-branch-prev]",pagination)?.addEventListener("click",()=>{page-=1;render();});
      $("[data-branch-next]",pagination)?.addEventListener("click",()=>{page+=1;render();});
      $$('[data-branch-account-edit]',modal.root).forEach(button=>{
        button.onclick=()=>{
          modal.close();
          editAccountModal(button.dataset.branchAccountEdit);
        };
      });
    };

    $("#branchAccountSearch",modal.root).addEventListener("input",event=>{
      search=event.target.value;page=1;render();
    });
    $("#branchAccountService",modal.root).addEventListener("change",event=>{
      service=event.target.value;page=1;render();
    });
    $("#branchAccountPageSize",modal.root).addEventListener("change",event=>{
      pageSize=Number(event.target.value)||25;page=1;render();
    });

    render();
  }catch(error){
    $("#branchAccountsLoading",modal.root).innerHTML=`
      <div class="danger-notice">${escapeHtml(error.message)}</div>
    `;
  }
}

function bulkAssignModal(id){
  const user=state.users.find(item=>item.id===id);
  if(!user)return;

  const modal=openModal({
    title:`Asignar o transferir cuentas a ${user.business_name||user.full_name}`,
    body:`
      <div class="notice-box">
        Pega los correos registrados. Si una cuenta ya tiene otro propietario,
        se transferirá al distribuidor seleccionado.
      </div>
      <form id="bulkAssignForm" class="form-grid">
        <label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label>
        <label><span>Mi fecha de venta</span><input name="starts_on" type="date"><small class="field-help">Opcional y exclusiva de tu usuario.</small></label>
        <label class="full"><span>Correos</span><textarea name="emails" rows="12" required></textarea></label>
        <div id="assignCounter" class="counter-note full">0 correos detectados</div>
      </form>
    `,
    actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="assignAccounts" class="btn primary">Asignar cuentas</button>`
  });

  const form=$("#bulkAssignForm",modal.root);
  const textarea=form.elements.emails;
  textarea.oninput=()=>{
    $("#assignCounter",modal.root).textContent=`${parseEmailBlock(textarea.value).length} correos detectados`;
  };
  $(".modal-cancel",modal.root).onclick=modal.close;
  $("#assignAccounts",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#assignAccounts",modal.root);
    button.disabled=true;
    button.textContent="Asignando...";
    try{
      const {data,error}=await supabase.rpc(
        "bulk_reassign_service_accounts_v36",
        {
          p_service:values.service,
          p_account_emails:parseEmailBlock(values.emails),
          p_distributor_id:id,
          p_starts_on:values.starts_on||null
        }
      );
      if(error)throw error;
      toast(`${data.assigned||0} asignadas; ${data.transferred||0} transferidas; ${data.not_allowed||0} sin permiso; ${data.not_found||0} no encontradas.`);
      modal.close();
      await Promise.all([loadAccounts(),loadAssignments()]);
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Asignar cuentas";
    }
  };
}
function serviceAccountTypeOptions(service,selected=""){
  const options=service==="spotify"
    ?["Cuenta familiar","Cuenta individual"]
    :["Cuenta completa"];

  return options.map(option=>`
    <option ${option===selected?"selected":""}>
      ${option}
    </option>
  `).join("");
}

function bindServiceTypeSelector(form,serviceField="service",typeField="account_type"){
  const serviceSelect=form.elements[serviceField];
  const typeSelect=form.elements[typeField];

  const refresh=()=>{
    const previous=typeSelect.value;
    typeSelect.innerHTML=serviceAccountTypeOptions(
      serviceSelect.value,
      previous
    );
  };

  serviceSelect.addEventListener("change",refresh);
  refresh();
}

function bulkAddAccountsModal(){
  const modal=openModal({
    title:"Añadir cuentas en bloque",
    body:`
      <div class="notice-box">
        Netflix admite únicamente <strong>Cuenta completa</strong>.
        Spotify admite <strong>Cuenta familiar</strong> o
        <strong>Cuenta individual</strong>.
      </div>

      <form id="bulkAddForm" class="form-grid">
        <label>
          <span>Plataforma</span>
          <select name="service">
            <option value="netflix">Netflix</option>
            <option value="spotify">Spotify</option>
          </select>
        </label>

        <label>
          <span>Tipo</span>
          <select name="account_type"></select>
        </label>

        <label class="full">
          <span>País de las cuentas</span>
          <input
            name="country"
            placeholder="Ej.: Nigeria, Bolivia, Brasil"
            required
          >
          <small class="field-help">
            Solo administración puede configurar este dato.
          </small>
        </label>

        <label class="full">
          <span>Correos</span>
          <textarea
            name="emails"
            rows="12"
            placeholder="correo1@ejemplo.com&#10;correo2@ejemplo.com"
            required
          ></textarea>
        </label>

        <div id="addCounter" class="counter-note full">
          0 correos detectados
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="saveBulkAccounts" class="btn primary">
        Añadir cuentas
      </button>
    `
  });

  const form=$("#bulkAddForm",modal.root);
  const textarea=form.elements.emails;
  bindServiceTypeSelector(form);

  textarea.oninput=()=>{
    $("#addCounter",modal.root).textContent=
      `${parseEmailBlock(textarea.value).length} correos detectados`;
  };

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveBulkAccounts",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#saveBulkAccounts",modal.root);
    button.disabled=true;
    button.textContent="Añadiendo...";

    try{
      const {data,error}=await supabase.rpc(
        "bulk_add_service_accounts_v27",
        {
          p_service:values.service,
          p_account_type:values.account_type,
          p_country:values.country,
          p_emails:parseEmailBlock(values.emails)
        }
      );

      if(error)throw error;

      toast(
        `${data.inserted||0} añadidas, `+
        `${data.duplicates||0} duplicadas, `+
        `${data.invalid||0} inválidas.`
      );

      modal.close();

      if($("#accountSearch"))$("#accountSearch").value="";
      if($("#accountServiceFilter")){
        $("#accountServiceFilter").value=values.service;
      }
      if($("#accountStatusFilter")){
        $("#accountStatusFilter").value="";
      }

      adminAccountPager.page=1;
      const loaded=await loadAccounts();

      if(
        loaded
        &&Number(data.inserted||0)>0
        &&!state.accounts.some(
          account=>account.service===values.service
        )
      ){
        toast(
          "Las cuentas fueron guardadas, pero la lectura regresó vacía. Ejecuta el diagnóstico del Bloque 24.",
          "error"
        );
      }
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Añadir cuentas";
    }
  };
}

function bulkDeleteAccountsModal(){
  if(state.profile.role!=="admin"){
    toast("Solo el administrador puede eliminar cuentas.","error");
    return;
  }

  const modal=openModal({
    title:"Eliminar cuentas en bloque",
    body:`
      <div class="danger-notice">
        <strong>Eliminación definitiva</strong>
        <p>
          Las cuentas seleccionadas serán eliminadas de la base,
          asignaciones, tickets e historial relacionado.
        </p>
      </div>

      <form id="bulkDeleteAccountsForm" class="form-grid">
        <label>
          <span>Plataforma</span>
          <select name="service">
            <option value="netflix">Netflix</option>
            <option value="spotify">Spotify</option>
          </select>
        </label>

        <label class="full">
          <span>Correos, uno por línea</span>
          <textarea
            name="emails"
            rows="12"
            placeholder="correo1@ejemplo.com&#10;correo2@ejemplo.com"
            required
          ></textarea>
        </label>

        <div id="deleteCounter" class="counter-note full">
          0 correos detectados
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="confirmBulkDeleteAccounts" class="btn danger">
        Eliminar definitivamente
      </button>
    `
  });

  const form=$("#bulkDeleteAccountsForm",modal.root);
  const textarea=form.elements.emails;

  textarea.oninput=()=>{
    $("#deleteCounter",modal.root).textContent=
      `${parseEmailBlock(textarea.value).length} correos detectados`;
  };

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmBulkDeleteAccounts",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const emails=parseEmailBlock(values.emails);

    if(!confirm(
      `¿Eliminar definitivamente ${emails.length} cuenta(s)?\n\n`+
      "Esta acción no se puede deshacer."
    )){
      return;
    }

    const button=$("#confirmBulkDeleteAccounts",modal.root);
    button.disabled=true;
    button.textContent="Eliminando...";

    try{
      const {data,error}=await supabase.rpc(
        "admin_delete_service_accounts",
        {
          p_service:values.service,
          p_emails:emails
        }
      );

      if(error)throw error;

      toast(
        `${data.deleted||0} eliminadas y `+
        `${data.not_found||0} no encontradas.`
      );

      modal.close();

      await Promise.all([
        loadAccounts(),
        loadAssignments(),
        loadTickets(),
        loadHistory()
      ]);
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Eliminar definitivamente";
    }
  };
}

async function deleteServiceAccount(id){
  if(state.profile.role!=="admin"){
    toast("Solo el administrador puede eliminar cuentas.","error");
    return;
  }

  const account=state.accounts.find(item=>item.id===id);
  if(!account)return;

  if(!confirm(
    `¿Eliminar definitivamente esta cuenta?\n\n`+
    `${serviceLabel(account.service)}: ${account.current_email}\n\n`+
    "Se eliminará también de asignaciones, tickets e historial."
  )){
    return;
  }

  try{
    const {data,error}=await supabase.rpc(
      "admin_delete_service_account",
      {p_account_id:id}
    );

    if(error)throw error;

    toast(data.message||"Cuenta eliminada definitivamente.");

    await Promise.all([
      loadAccounts(),
      loadAssignments(),
      loadTickets(),
      loadHistory()
    ]);
  }catch(error){
    toast(error.message,"error");
  }
}

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

function adminFullEditAccountModal(id){
  const account=state.accounts.find(item=>item.id===id);
  if(!account)return;

  const distributorsList=distributors().filter(
    user=>user.status==="active"
  );

  const assignment=activeAssignment(account);

  const modal=openModal({
    title:"Editar cuenta",
    body:`
      <div class="notice-box">
        El correo está bloqueado en administración.
        Solo cambia cuando el personal de soporte realiza un reemplazo.
      </div>

      <form id="editAccountForm" class="form-grid">
        <label>
          <span>Plataforma</span>
          <select name="service">
            <option value="netflix" ${account.service==="netflix"?"selected":""}>
              Netflix
            </option>
            <option value="spotify" ${account.service==="spotify"?"selected":""}>
              Spotify
            </option>
          </select>
        </label>

        <label>
          <span>Tipo</span>
          <select name="account_type"></select>
        </label>

        <label>
          <span>País</span>
          <input
            name="country"
            value="${escapeHtml(account.country||"Sin configurar")}"
            required
          >
          <small class="field-help">
            Solo administración puede modificar el país.
          </small>
        </label>

        <label class="full">
          <span>Correo bloqueado</span>
          <input
            name="current_email"
            type="email"
            value="${escapeHtml(account.current_email)}"
            readonly
            class="locked-field"
          >
          <small class="field-help">
            No puede modificarse desde administración.
          </small>
        </label>

        <label class="full">
          <span>Buscar propietario</span>
          <input
            id="ownerSearchInput"
            list="ownerOptions"
            value="${escapeHtml(
              account.reseller?.business_name||
              account.reseller?.full_name||
              ""
            )}"
            placeholder="Nombre comercial o nombre del distribuidor"
          >

          <datalist id="ownerOptions">
            ${distributorsList.map(user=>`
              <option value="${escapeHtml(
                user.business_name||user.full_name
              )}">
                ${escapeHtml(user.email)}
              </option>
            `).join("")}
          </datalist>
        </label>

        <input
          type="hidden"
          name="owner_id"
          value="${account.current_reseller_id||""}"
        >

        <label>
          <span>Fecha de creación</span>
          <input
            name="starts_on"
            type="date"
            value="${
              assignment?.starts_on||
              new Date(account.created_at).toISOString().slice(0,10)
            }"
            required
          >
        </label>

        <label>
          <span>Duración</span>
          <input value="30 días" readonly>
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="saveAccountChanges" class="btn primary">Guardar</button>
    `
  });

  const form=$("#editAccountForm",modal.root);
  const ownerInput=$("#ownerSearchInput",modal.root);
  const serviceSelect=form.elements.service;
  const typeSelect=form.elements.account_type;

  const refreshTypes=()=>{
    typeSelect.innerHTML=serviceAccountTypeOptions(
      serviceSelect.value,
      serviceSelect.value===account.service
        ?account.account_type
        :""
    );
  };

  serviceSelect.addEventListener("change",refreshTypes);
  refreshTypes();

  ownerInput.oninput=()=>{
    const search=ownerInput.value.trim().toLowerCase();

    const match=distributorsList.find(user=>
      (user.business_name||user.full_name)
        .toLowerCase()===search
    );

    form.elements.owner_id.value=match?.id||"";
  };

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveAccountChanges",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#saveAccountChanges",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      const {data,error}=await supabase.rpc(
        "admin_edit_service_account_v29",
        {
          p_account_id:id,
          p_service:values.service,
          p_account_type:values.account_type,
          p_country:values.country,
          p_owner_id:values.owner_id||null,
          p_starts_on:values.starts_on||null
        }
      );

      if(error)throw error;

      toast(data.message);
      modal.close();

      await Promise.all([
        loadAccounts(),
        loadAssignments()
      ]);
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Guardar";
    }
  };
}

function createStaffTicketModal(){
  const modal=openModal({
    title:"Crear ticket de soporte",
    body:`
      <div class="notice-box">Administración y soporte pueden registrar una incidencia sobre cualquier cuenta visible.</div>
      <form id="staffTicketForm" class="form-grid">
        <label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label>
        <label><span>Categoría</span><select name="category"><option>Caída</option><option>Falla</option><option>Restablecer contraseña</option><option>Contraseña incorrecta</option></select></label>
        <label class="full">
          <span>Correo de la cuenta</span>
          <input
            name="reported_email"
            type="email"
            placeholder="Escribe el correo completo"
            autocomplete="off"
            required
          >
          <small class="field-help">
            El sistema verificará si el correo existe y corresponde a la plataforma seleccionada.
          </small>
        </label>
        <label class="full"><span>Título: ¿qué error tiene?</span><input name="title" required></label>
        <label class="full"><span>Descripción adicional</span><textarea name="description" rows="5"></textarea></label>
      </form>
    `,
    actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveStaffTicket" class="btn primary">Crear ticket</button>`
  });

  const form=$("#staffTicketForm",modal.root);
  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveStaffTicket",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form).entries());

    try{
      const {data,error}=await supabase.rpc("create_support_ticket_v29",{
        p_service:values.service,
        p_reported_email:values.reported_email.trim().toLowerCase(),
        p_title:values.title,
        p_category:values.category,
        p_description:values.description||values.title
      });
      if(error)throw error;
      toast(data.message);
      modal.close();
      await loadTickets();
      renderDashboard();
    }catch(error){
      toast(error.message,"error");
    }
  };
}

async function loadHelpArticles(){
  const {data,error}=await supabase
    .from("help_articles")
    .select("*")
    .order("display_order",{ascending:true})
    .order("created_at",{ascending:false});

  if(error){
    toast(error.message,"error");
    state.helpArticles=[];
    return;
  }

  state.helpArticles=data||[];
  renderHelpAdmin();
}

function helpArticleImageUrl(article){
  return String(
    article?.image_url
    ||(article?.media_type==="image"?article?.media_url:"")
    ||""
  ).trim();
}

function helpArticleVideoUrl(article){
  return String(
    article?.video_url
    ||(article?.media_type==="video"?article?.media_url:"")
    ||""
  ).trim();
}

function renderHelpAdmin(){
  const root=$("#helpAdminGrid");
  if(!root)return;

  const type=$("#helpTypeFilter")?.value||"";
  const rows=state.helpArticles.filter(article=>!type||article.article_type===type);

  root.innerHTML=rows.length?rows.map((article,index)=>{
    const imageUrl=helpArticleImageUrl(article);
    const videoUrl=helpArticleVideoUrl(article);
    const globalPosition=state.helpArticles.findIndex(item=>item.id===article.id)+1;
    const canMoveUp=index>0;
    const canMoveDown=index<rows.length-1;

    return `
      <article class="help-admin-card" data-help-card="${article.id}">
        <div class="help-admin-card-header">
          <span class="status-pill ${article.status==="published"?"green":"orange"}">${article.status==="published"?"Publicado":"Borrador"}</span>
          <span class="help-type-label">${article.article_type==="faq"?"Pregunta frecuente":"Cómo utilizar"}</span>
        </div>
        <div class="help-order-toolbar" aria-label="Controles de orden">
          <span class="help-order-position">Orden ${globalPosition}</span>
          <div class="help-order-buttons">
            <button
              type="button"
              class="action-button help-order-button"
              data-help-move="${article.id}"
              data-help-direction="up"
              ${canMoveUp?"":"disabled"}
              aria-label="Subir ${escapeHtml(article.title)}"
            >↑ Subir</button>
            <button
              type="button"
              class="action-button help-order-button"
              data-help-move="${article.id}"
              data-help-direction="down"
              ${canMoveDown?"":"disabled"}
              aria-label="Bajar ${escapeHtml(article.title)}"
            >↓ Bajar</button>
          </div>
        </div>
        ${imageUrl?`<img class="help-card-media" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(article.title)}">`:""}
        ${videoUrl?`<div class="help-video-placeholder">▶ Video incluido</div>`:""}
        <h3>${escapeHtml(article.title)}</h3>
        <p class="help-admin-text-preview">${escapeHtml(article.answer||article.detail||"")}</p>
        <div class="help-admin-media-summary">
          <span class="status-pill ${imageUrl?"green":"gray"}">${imageUrl?"Imagen añadida":"Sin imagen"}</span>
          <span class="status-pill ${videoUrl?"green":"gray"}">${videoUrl?"Video añadido":"Sin video"}</span>
        </div>
        <div class="help-admin-actions">
          <button type="button" class="action-button yellow" data-help-edit="${article.id}">Editar</button>
          <button type="button" class="action-button red" data-help-delete="${article.id}">Eliminar</button>
        </div>
      </article>
    `;
  }).join(""):`<div class="empty-gallery">No hay contenido de ayuda registrado.</div>`;

  $$('[data-help-move]').forEach(button=>{
    button.onclick=()=>moveHelpArticle(
      button.dataset.helpMove,
      button.dataset.helpDirection
    );
  });
  $$('[data-help-edit]').forEach(button=>{
    button.onclick=()=>helpArticleModal(state.helpArticles.find(article=>article.id===button.dataset.helpEdit));
  });
  $$('[data-help-delete]').forEach(button=>{
    button.onclick=()=>deleteHelpArticle(button.dataset.helpDelete);
  });
}

async function moveHelpArticle(articleId,direction){
  const type=$("#helpTypeFilter")?.value||"";
  const visibleRows=state.helpArticles.filter(
    article=>!type||article.article_type===type
  );
  const visibleIndex=visibleRows.findIndex(article=>article.id===articleId);
  const offset=direction==="up"?-1:1;
  const target=visibleRows[visibleIndex+offset];

  if(visibleIndex<0||!target)return;

  const ordered=[...state.helpArticles];
  const currentIndex=ordered.findIndex(article=>article.id===articleId);
  const targetIndex=ordered.findIndex(article=>article.id===target.id);

  if(currentIndex<0||targetIndex<0)return;

  [ordered[currentIndex],ordered[targetIndex]]=[ordered[targetIndex],ordered[currentIndex]];

  const buttons=$$('[data-help-move]');
  buttons.forEach(button=>button.disabled=true);

  try{
    const {data,error}=await supabase.rpc(
      "admin_reorder_help_articles_v48",
      {p_order:ordered.map(article=>article.id)}
    );

    if(error)throw error;

    state.helpArticles=ordered.map((article,index)=>({
      ...article,
      display_order:index
    }));
    renderHelpAdmin();
    toast(data?.message||"Orden actualizado para todos los usuarios.");
    await loadHelpArticles();
  }catch(error){
    toast(error.message,"error");
    renderHelpAdmin();
  }
}

function helpStorageObjectPath(url){
  const value=String(url||"");
  const marker="/storage/v1/object/public/help-media/";
  const index=value.indexOf(marker);
  if(index<0)return "";

  try{
    return decodeURIComponent(value.slice(index+marker.length).split("?")[0]);
  }catch{
    return value.slice(index+marker.length).split("?")[0];
  }
}

async function removeHelpStoredMedia(url){
  const path=helpStorageObjectPath(url);
  if(!path)return;
  const {error}=await supabase.storage.from("help-media").remove([path]);
  if(error)console.warn("No se pudo eliminar el archivo anterior del centro de ayuda:",error.message);
}

function validateHelpMediaFile(file,kind){
  if(!file)return;

  if(kind==="image"&&!String(file.type||"").startsWith("image/")){
    throw new Error("Selecciona un archivo de imagen válido.");
  }

  if(kind==="video"&&!String(file.type||"").startsWith("video/")){
    throw new Error("Selecciona un archivo de video válido.");
  }
}

function helpArticleModal(existing=null){
  const currentImageUrl=helpArticleImageUrl(existing);
  const currentVideoUrl=helpArticleVideoUrl(existing);

  const modal=openModal({
    title:existing?"Editar contenido de ayuda":"Nuevo contenido de ayuda",
    wide:true,
    body:`
      <form id="helpArticleForm" class="form-grid">
        <label><span>Tipo</span><select name="article_type"><option value="faq" ${existing?.article_type==="faq"?"selected":""}>Pregunta frecuente</option><option value="guide" ${existing?.article_type==="guide"?"selected":""}>Cómo utilizar</option></select></label>
        <label><span>Estado</span><select name="status"><option value="published" ${existing?.status==="published"?"selected":""}>Publicado</option><option value="draft" ${existing?.status==="draft"?"selected":""}>Borrador</option></select></label>
        <label class="full"><span>Título o pregunta</span><input name="title" value="${escapeHtml(existing?.title||"")}" required></label>
        <label class="full"><span>Respuesta o explicación</span><textarea name="answer" rows="8" required placeholder="Los saltos de línea y espacios entre párrafos se mostrarán tal como los escribas.">${escapeHtml(existing?.answer||"")}</textarea><small class="field-help">Se respetarán los saltos de línea y los espacios entre párrafos.</small></label>
        <label class="full"><span>Detalle adicional</span><textarea name="detail" rows="6" placeholder="Opcional">${escapeHtml(existing?.detail||"")}</textarea></label>

        <section class="help-media-editor full">
          <div class="help-media-editor-title">
            <div><strong>Imagen explicativa</strong><small>Opcional. Se podrá ampliar a pantalla completa.</small></div>
            ${currentImageUrl?`<span class="status-pill green">Imagen actual</span>`:""}
          </div>
          ${currentImageUrl?`<img class="help-current-image" src="${escapeHtml(currentImageUrl)}" alt="Imagen actual">`:""}
          <label><span>Seleccionar imagen</span><input name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
          ${currentImageUrl?`<label class="help-remove-media"><input name="remove_image" type="checkbox"> Eliminar la imagen actual al guardar</label>`:""}
        </section>

        <section class="help-media-editor full">
          <div class="help-media-editor-title">
            <div><strong>Video explicativo</strong><small>Opcional. Puedes subirlo desde tu dispositivo o colocar un enlace.</small></div>
            ${currentVideoUrl?`<span class="status-pill green">Video actual</span>`:""}
          </div>
          <label><span>Enlace del video</span><input name="video_url" value="${escapeHtml(currentVideoUrl)}" placeholder="YouTube, Vimeo o enlace directo al video"></label>
          <label><span>Seleccionar video</span><input name="video_file" type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime"></label>
          ${currentVideoUrl?`<label class="help-remove-media"><input name="remove_video" type="checkbox"> Eliminar el video actual al guardar</label>`:""}
        </section>

        <label><span>Orden</span><input name="display_order" type="number" min="0" value="${existing?.display_order??0}"></label>
      </form>
    `,
    actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveHelpArticle" class="btn primary">Guardar</button>`
  });

  const form=$("#helpArticleForm",modal.root);
  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveHelpArticle",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const imageFile=form.elements.image_file.files?.[0]||null;
    const videoFile=form.elements.video_file.files?.[0]||null;
    const removeImage=Boolean(form.elements.remove_image?.checked);
    const removeVideo=Boolean(form.elements.remove_video?.checked);
    const button=$("#saveHelpArticle",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      validateHelpMediaFile(imageFile,"image");
      validateHelpMediaFile(videoFile,"video");

      let imageUrl=removeImage?"":currentImageUrl;
      let videoUrl=removeVideo?"":String(values.video_url||"").trim();

      if(imageFile){
        imageUrl=await uploadPublicImage("help-media",imageFile,state.profile.id);
      }

      if(videoFile){
        videoUrl=await uploadPublicImage("help-media",videoFile,state.profile.id);
      }

      const {data,error}=await supabase.rpc("admin_save_help_article_v46",{
        p_id:existing?.id||null,
        p_article_type:values.article_type,
        p_title:values.title,
        p_answer:values.answer,
        p_detail:values.detail||"",
        p_image_url:imageUrl||null,
        p_video_url:videoUrl||null,
        p_display_order:Number(values.display_order||0),
        p_status:values.status
      });

      if(error)throw error;

      const obsoleteMedia=[
        currentImageUrl&&currentImageUrl!==imageUrl?currentImageUrl:"",
        currentVideoUrl&&currentVideoUrl!==videoUrl?currentVideoUrl:""
      ].filter(Boolean);
      await Promise.allSettled(obsoleteMedia.map(removeHelpStoredMedia));

      toast(data.message||"Contenido guardado.");
      modal.close();
      await loadHelpArticles();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Guardar";
    }
  };
}

async function deleteHelpArticle(id){
  if(!confirm("¿Eliminar esta publicación completa? El texto, la imagen y el video dejarán de mostrarse."))return;

  const article=state.helpArticles.find(item=>item.id===id);
  const mediaToRemove=[
    helpArticleImageUrl(article),
    helpArticleVideoUrl(article)
  ].filter(Boolean);

  try{
    const {data,error}=await supabase.rpc("admin_delete_help_article",{p_id:id});
    if(error)throw error;
    await Promise.allSettled(mediaToRemove.map(removeHelpStoredMedia));
    toast(data.message||"Contenido eliminado.");
    await loadHelpArticles();
  }catch(error){
    toast(error.message,"error");
  }
}

function ticketCategoryMode(category){
  const value=String(category||"").toLowerCase();

  if(value.includes("caída")||value.includes("caida")){
    return "replacement";
  }

  if(
    value.includes("restablecer")
    ||value.includes("contraseña")
    ||value.includes("contrasena")
  ){
    return "password";
  }

  return "failure";
}

function renderTicketMessageContent(message){
  const value=String(message||"");

  if(value.startsWith("[PASSWORD_RESET_LINK]")){
    const link=value.replace("[PASSWORD_RESET_LINK]","").trim();

    return `
      <a
        class="password-reset-message-link"
        href="${escapeHtml(link)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Cambia tu clave dando click aquí
      </a>
    `;
  }

  return `<p>${escapeHtml(value)}</p>`;
}

async function setTicketWorkflowStatus(ticket,status){
  const {data,error}=await supabase.rpc(
    "staff_set_ticket_status_v17",
    {
      p_ticket_id:ticket.id,
      p_status:status
    }
  );

  if(error)throw error;
  return data;
}

function openFailureAccountReplacementModal(ticket){
  const modal=openModal({
    title:"Cambiar cuenta reportada",
    body:`
      <div class="notice-box">
        Esta acción aplicará la garantía, enviará la nueva cuenta al
        distribuidor y cerrará el caso automáticamente, aunque haya sido
        creado con la categoría <strong>Falla</strong>.
      </div>

      <div class="ticket-account-reference">
        <span>Cuenta reportada</span>
        <strong>
          ${escapeHtml(
            ticket.reported_email||
            ticket.account_email_snapshot||
            "—"
          )}
        </strong>
      </div>

      <form id="failureReplacementForm" class="form-grid">
        <label class="full">
          <span>Correo de la cuenta nueva</span>
          <input
            name="new_email"
            type="email"
            placeholder="nuevacuentagarantia@correo.com"
            autocomplete="off"
            required
          >
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">
        Cancelar
      </button>

      <button id="confirmFailureReplacement" class="btn success">
        Cambiar cuenta
      </button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmFailureReplacement",modal.root).onclick=async()=>{
    const form=$("#failureReplacementForm",modal.root);

    if(!form.reportValidity()){
      return;
    }

    const newEmail=String(
      new FormData(form).get("new_email")||""
    ).trim().toLowerCase();

    const button=$("#confirmFailureReplacement",modal.root);
    button.disabled=true;
    button.textContent="Cambiando...";

    try{
      const {data,error}=await supabase.rpc(
        "staff_apply_ticket_replacement_v17",
        {
          p_ticket_id:ticket.id,
          p_new_email:newEmail
        }
      );

      if(error){
        throw error;
      }

      toast(
        data.message||
        "Cuenta asignada y caso cerrado correctamente."
      );

      modal.close();

      await Promise.all([
        loadTickets(),
        loadAccounts(),
        loadHistory()
      ]);

      renderDashboard();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Cambiar cuenta";
    }
  };
}

async function openTicket(id){
  const ticket=state.tickets.find(item=>item.id===id);
  if(!ticket)return;

  const {data:messages,error}=await supabase
    .from("ticket_messages")
    .select("id,message,is_system,created_at,author:author_id(full_name)")
    .eq("ticket_id",id)
    .order("created_at",{ascending:true});

  if(error){
    toast(error.message,"error");
    return;
  }

  const mode=ticketCategoryMode(ticket.category);
  const isClosed=["closed","resolved"].includes(ticket.status);

  const actionPanel=isClosed
    ?`<div class="ticket-closed-notice">
        Este caso ya está cerrado.
      </div>`
    :mode==="replacement"
      ?`
        <div class="ticket-resolution-panel">
          <span class="eyebrow">ACCIÓN PARA CAÍDA</span>
          <h3>Asignar cuenta de garantía</h3>
          <p>
            Escribe el correo de reemplazo. El distribuidor recibirá:
            “Cuenta asignada exitosamente”.
          </p>

          <label>
            <span>Correo de la cuenta nueva</span>
            <input
              id="ticketReplacementEmail"
              type="email"
              placeholder="nuevacuentagarantia@correo.com"
              autocomplete="off"
            >
          </label>

          <button id="applyTicketReplacement" class="btn success">
            Cambiar cuenta y cerrar
          </button>
        </div>
      `
      :mode==="password"
        ?`
          <div class="ticket-resolution-panel">
            <span class="eyebrow">RESTABLECER CONTRASEÑA</span>
            <h3>Enviar enlace de cambio</h3>
            <p>
              El enlace real quedará oculto. El distribuidor solo verá:
              “Cambia tu clave dando click aquí”.
            </p>

            <label>
              <span>Enlace para restablecer contraseña</span>
              <input
                id="ticketPasswordLink"
                type="url"
                placeholder="https://..."
                autocomplete="off"
              >
            </label>

            <button id="sendPasswordResetLink" class="btn primary">
              Enviar enlace
            </button>
          </div>
        `
        :`
          <div class="ticket-resolution-panel">
            <span class="eyebrow">RESPUESTA DE SOPORTE</span>
            <h3>Responder la falla</h3>

            <label>
              <span>Respuesta para el distribuidor</span>
              <textarea
                id="ticketFailureResponse"
                rows="5"
                placeholder="Escribe la solución o las instrucciones..."
              ></textarea>
            </label>

            <div class="failure-ticket-actions">
              <button id="sendFailureResponse" class="btn primary">
                Enviar respuesta
              </button>

              <button id="changeAccountFromFailure" class="btn success">
                Cambiar cuenta
              </button>
            </div>

            <small class="failure-change-help">
              Utiliza “Cambiar cuenta” cuando el distribuidor reportó
              una cuenta caída como Falla. La garantía se enviará y el
              caso se cerrará automáticamente.
            </small>
          </div>
        `;

  const workflowButtons=isClosed
    ?""
    :`
      <div class="ticket-workflow-actions">
        <button
          id="markTicketInProcess"
          class="btn warning"
          ${ticket.status==="in_review"?"disabled":""}
        >
          Marcar en proceso
        </button>

        <button id="closeSupportTicket" class="btn danger">
          Cerrar caso
        </button>
      </div>
    `;

  const modal=openModal({
    title:"Detalle del soporte",
    wide:true,
    body:`
      <div class="ticket-header-card">
        ${serviceBadge(ticket.service)}

        <div>
          <strong>${escapeHtml(ticket.title)}</strong>
          <small>
            ${escapeHtml(ticket.reported_email||ticket.account_email_snapshot)}
          </small>
        </div>

        <span class="status-pill ${statusTone(ticket.status)}">
          ${staffTicketStatusLabel(ticket.status)}
        </span>
      </div>

      <div class="ticket-case-type">
        <span>Caso reportado</span>
        <strong>${escapeHtml(ticket.category)}</strong>
      </div>

      <div class="ticket-description">
        <strong>Descripción</strong>
        <p>${escapeHtml(ticket.description)}</p>
      </div>

      <div class="message-thread">
        ${(messages||[]).map(message=>`
          <article class="message-bubble ${message.is_system?"system":""}">
            <header>
              <strong>
                ${escapeHtml(
                  message.is_system
                    ?"SISTEMA"
                    :(message.author?.full_name||"Usuario")
                )}
              </strong>
              <small>${formatDate(message.created_at,true)}</small>
            </header>

            ${renderTicketMessageContent(message.message)}
          </article>
        `).join("")||`<div class="empty-state">Sin mensajes.</div>`}
      </div>

      ${actionPanel}
      ${workflowButtons}
    `
  });

  $("#markTicketInProcess",modal.root)?.addEventListener("click",async()=>{
    try{
      await setTicketWorkflowStatus(ticket,"in_review");
      toast("Ticket marcado en proceso.");
      modal.close();
      await loadTickets();
      renderDashboard();
    }catch(error){
      toast(error.message,"error");
    }
  });

  $("#changeAccountFromFailure",modal.root)?.addEventListener(
    "click",
    ()=>{
      openFailureAccountReplacementModal(ticket);
    }
  );

  $("#sendFailureResponse",modal.root)?.addEventListener("click",async()=>{
    const message=$("#ticketFailureResponse",modal.root).value.trim();

    if(!message){
      toast("Escribe la respuesta.","error");
      return;
    }

    try{
      const {data,error}=await supabase.rpc(
        "staff_send_ticket_response_v17",
        {
          p_ticket_id:ticket.id,
          p_response_type:"failure",
          p_value:message
        }
      );

      if(error)throw error;

      toast(data.message||"Respuesta enviada.");
      modal.close();
      await loadTickets();
    }catch(error){
      toast(error.message,"error");
    }
  });

  $("#sendPasswordResetLink",modal.root)?.addEventListener("click",async()=>{
    const link=$("#ticketPasswordLink",modal.root).value.trim();

    if(!/^https?:\/\//i.test(link)){
      toast("Coloca un enlace válido que comience con http o https.","error");
      return;
    }

    try{
      const {data,error}=await supabase.rpc(
        "staff_send_ticket_response_v17",
        {
          p_ticket_id:ticket.id,
          p_response_type:"password",
          p_value:link
        }
      );

      if(error)throw error;

      toast(data.message||"Enlace enviado.");
      modal.close();
      await loadTickets();
    }catch(error){
      toast(error.message,"error");
    }
  });

  $("#applyTicketReplacement",modal.root)?.addEventListener("click",async()=>{
    const newEmail=$("#ticketReplacementEmail",modal.root)
      .value.trim().toLowerCase();

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)){
      toast("Coloca un correo válido.","error");
      return;
    }

    try{
      const {data,error}=await supabase.rpc(
        "staff_apply_ticket_replacement_v17",
        {
          p_ticket_id:ticket.id,
          p_new_email:newEmail
        }
      );

      if(error)throw error;

      toast(data.message||"Cuenta de garantía asignada.");
      modal.close();

      await Promise.all([
        loadTickets(),
        loadAccounts(),
        loadHistory()
      ]);
    }catch(error){
      toast(error.message,"error");
    }
  });

  $("#closeSupportTicket",modal.root)?.addEventListener("click",async()=>{
    if(!confirm(
      "¿Cerrar este caso?\n\nEl distribuidor verá Cerrado y recibirá una notificación."
    )){
      return;
    }

    try{
      await setTicketWorkflowStatus(ticket,"closed");
      toast("Caso cerrado y notificación enviada.");
      modal.close();
      await loadTickets();
      renderDashboard();
    }catch(error){
      toast(error.message,"error");
    }
  });
}


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
function trailerModal(title,url,synopsis=""){
  const videoId=getYouTubeVideoId(url);
  const cleanTitle=escapeHtml(title||"Estreno");
  const cleanSynopsis=escapeHtml(
    synopsis||"Sin sinopsis disponible."
  );

  let media="";

  if(videoId){
    media=`
      <iframe
        class="trailer-frame"
        src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0"
        title="${cleanTitle}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    `;
  }else if(String(url||"").trim()){
    media=`
      <video
        class="trailer-frame"
        src="${escapeHtml(url)}"
        controls
        playsinline
      ></video>
    `;
  }else{
    media=`
      <div class="trailer-unavailable">
        <span>▶</span>
        <strong>Tráiler no disponible</strong>
      </div>
    `;
  }

  openModal({
    title:title||"Estreno",
    extraWide:true,
    body:`
      <section class="trailer-detail-layout">
        <div class="trailer-media-shell">
          ${media}
        </div>

        <article class="trailer-synopsis-panel">
          <span class="eyebrow">SINOPSIS</span>
          <h3>${cleanTitle}</h3>
          <p>${cleanSynopsis}</p>
        </article>
      </section>
    `
  });
}
function notificationRoleLabel(user){
  if(user.role==="support")return "Soporte";
  if(user.role==="admin")return "Administrador";
  return "Distribuidor";
}

function renderRecipientList(){
  const root=$("#recipientList");
  if(!root)return;

  const query=($("#recipientSearch")?.value||"").toLowerCase();

  const rows=state.users.filter(user=>{
    if(user.id===state.profile.id)return false;
    if(!["reseller","support","admin"].includes(user.role))return false;
    if(user.status!=="active")return false;

    return `
      ${user.full_name}
      ${user.business_name||""}
      ${user.email}
      ${notificationRoleLabel(user)}
    `.toLowerCase().includes(query);
  });

  root.innerHTML=rows.length
    ?rows.map(user=>`
      <label class="recipient-row">
        <input type="checkbox" value="${user.id}">

        <span class="avatar-small">
          ${escapeHtml(
            (user.business_name||user.full_name||"U")[0].toUpperCase()
          )}
        </span>

        <div>
          <strong>
            ${escapeHtml(user.business_name||user.full_name)}
          </strong>

          <small>
            ${escapeHtml(user.email)} ·
            ${escapeHtml(notificationRoleLabel(user))}
          </small>
        </div>
      </label>
    `).join("")
    :`<div class="empty-state">No se encontraron usuarios.</div>`;

  updateAdminNotificationScope();
}

function updateAdminNotificationScope(){
  const scope=$("#adminNotificationScope")?.value||"selected";
  const panel=$("#adminRecipientPanel");

  if(panel){
    panel.classList.toggle(
      "recipient-panel-disabled",
      scope!=="selected"
    );
  }

  $$("#recipientList input[type=checkbox]").forEach(input=>{
    input.disabled=scope!=="selected";
  });
}

function selectAllRecipients(){
  if($("#adminNotificationScope")?.value!=="selected")return;

  const inputs=$$("#recipientList input[type=checkbox]");
  const shouldSelect=inputs.some(input=>!input.checked);

  inputs.forEach(input=>{
    input.checked=shouldSelect;
  });
}

async function sendNotification(event){
  event.preventDefault();
  if(adminNotificationSending)return;

  const form=event.currentTarget;
  const values=Object.fromEntries(new FormData(form).entries());
  const scope=values.scope||"selected";
  const recipientIds=$$("#recipientList input[type=checkbox]:checked")
    .map(input=>input.value);
  const file=form.elements.image.files?.[0]||null;
  const message=String(values.message||"").trim();

  if(scope==="selected"&&!recipientIds.length){
    toast("Selecciona al menos un usuario.","error");
    return;
  }

  if(!message&&!file){
    toast("Escribe un mensaje o adjunta una imagen.","error");
    return;
  }

  adminNotificationSending=true;
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  button.textContent="Enviando...";

  try{
    const imageUrl=file
      ?await uploadPublicImage(
        "notification-images",
        file,
        state.profile.id
      )
      :null;

    const {data,error}=await supabase.rpc(
      "send_hierarchical_notification_v36",
      {
        p_scope:scope,
        p_recipient_ids:recipientIds,
        p_title:values.title,
        p_message:message,
        p_image_url:imageUrl,
        p_allow_forward:values.allow_forward==="on"
      }
    );

    if(error)throw error;

    toast(
      `Aviso enviado a ${data.recipients||0} usuario(s).`
    );

    form.reset();
    renderRecipientList();
    updateAdminNotificationScope();
    await loadSentNotificationHistory();
  }catch(error){
    toast(error.message,"error");
  }finally{
    adminNotificationSending=false;
    button.disabled=false;
    button.textContent="Enviar aviso";
  }
}


async function loadSentNotificationHistory(){
  const root=$("#sentNotificationHistory");
  if(!root)return false;
  const {data,error}=await supabase.rpc("admin_list_sent_notifications_v42");
  if(error){
    root.innerHTML=`<div class="empty-state">No se pudo cargar el historial: ${escapeHtml(error.message)}</div>`;
    return false;
  }
  state.notificationHistory=data||[];
  root.innerHTML=state.notificationHistory.length?state.notificationHistory.map(item=>`
    <article class="sent-notification-history-card">
      ${item.image_url?`<img src="${escapeHtml(item.image_url)}" alt="">`:""}
      <div class="sent-notification-history-copy">
        <div class="notification-meta"><strong>${escapeHtml(item.title||"Aviso")}</strong><small>${formatDate(item.created_at,true)}</small></div>
        <p>${escapeHtml(item.message||"")}</p>
        <small>Alcance: ${escapeHtml(item.scope_label||"Seleccionado")} · Destinatarios: ${item.recipient_count||0} · Leídas: ${item.read_count||0} · Pendientes: ${item.unread_count||0}</small>
      </div>
    </article>
  `).join(""):`<div class="empty-state">Todavía no se enviaron avisos.</div>`;
  return true;
}

async function loadPanelSettings(){
  const {data,error}=await supabase.rpc("get_panel_settings_v29");
  if(error){
    console.warn("No se pudo cargar la marca:",error.message);
    return false;
  }
  state.panelSettings=data||{
    brand_name:"Centro Premium",
    logo_url:null
  };
  applyPanelSettings();
  return true;
}

function applyPanelSettings(){
  const settings=state.panelSettings||{};
  const name=settings.brand_name||"Centro Premium";
  const logo=settings.logo_url||"";

  $("#panelBrandName")&&( $("#panelBrandName").textContent=name );
  document.title=`Administración · ${name}`;

  const mark=$("#panelBrandMark");
  if(mark){
    mark.innerHTML=logo
      ?`<img src="${escapeHtml(logo)}" alt="">`
      :escapeHtml(name[0]||"P");
  }

  const form=$("#panelBrandForm");
  if(form){
    form.elements.brand_name.value=name;
    form.elements.logo_url.value=logo;
  }
}

async function savePanelBrand(event){
  event.preventDefault();
  const form=event.currentTarget;
  const button=$("#savePanelBrand");
  button.disabled=true;
  button.textContent="Guardando...";

  try{
    let logoUrl=form.elements.logo_url.value.trim();
    const file=form.elements.logo_file.files?.[0];

    if(file){
      if(!String(file.type||"").startsWith("image/")){
        throw new Error("Selecciona un archivo de imagen válido.");
      }

      if(file.size>5*1024*1024){
        throw new Error("El logotipo no puede superar los 5 MB.");
      }

      logoUrl=await uploadPublicImage(
        "panel-branding",
        file,
        state.profile.id
      );
    }

    const {data,error}=await supabase.rpc(
      "admin_update_panel_settings_v29",
      {
        p_brand_name:form.elements.brand_name.value,
        p_logo_url:logoUrl||null
      }
    );

    if(error)throw error;

    state.panelSettings=data;
    applyPanelSettings();
    toast("Marca actualizada.");
  }catch(error){
    toast(error.message,"error");
  }finally{
    button.disabled=false;
    button.textContent="Guardar marca";
  }
}

async function loadServiceCatalog(){
  const {data,error}=await supabase.rpc(
    "list_service_catalog_v29"
  );

  if(error){
    toast(`No se pudieron cargar los servicios: ${error.message}`,"error");
    state.services=[];
    return false;
  }

  state.services=data||[];
  renderAdminServiceCards();
  renderPanelServiceManager();
  return true;
}

function serviceVisual(service){
  if(service.logo_url){
    return `<img src="${escapeHtml(service.logo_url)}" alt="">`;
  }
  if(service.slug==="netflix")return "N";
  if(service.slug==="spotify")return "●";
  return escapeHtml((service.name||"S")[0].toUpperCase());
}

function renderAdminServiceCards(){
  const root=$("#adminServiceCatalogGrid");
  if(!root)return;

  root.innerHTML=state.services
    .filter(service=>service.is_active)
    .map(service=>`
      <button
        class="launch-card service-catalog-card service-${escapeHtml(service.slug)}"
        data-service-launch="${service.id}"
        style="--service-color:${escapeHtml(service.color||'#4a78ff')}"
      >
        <div class="launch-logo">${serviceVisual(service)}</div>
        <span>${escapeHtml(service.name)}</span>
        <p>${escapeHtml(service.description||"")}</p>
        <b>${
          service.mode==="coming_soon"
            ?"Próximamente →"
            :service.mode==="netflix_internal"
              ?`Abrir ${escapeHtml(service.name)} →`
              :"Abrir servicio →"
        }</b>
      </button>
    `).join("")
    ||`<div class="empty-gallery">No hay servicios activos.</div>`;

  $$("[data-service-launch]",root).forEach(button=>{
    button.onclick=()=>{
      const service=state.services.find(
        item=>item.id===button.dataset.serviceLaunch
      );
      if(!service)return;

      if(service.mode==="netflix_internal"){
        openNetflixIntegrated();
        return;
      }

      if(service.mode==="coming_soon"){
        openModal({
          title:service.name,
          body:`<div class="coming-soon-service">
            <strong>Estamos trabajando para darte este servicio</strong>
            <p>${escapeHtml(service.description||"")}</p>
          </div>`
        });
        return;
      }

      if(service.mode==="accounts_filter"){
        showSection("accounts");
        const filter=$("#accountServiceFilter");
        if(filter){
          filter.value=service.slug;
          renderAccounts();
        }
        return;
      }

      if(service.web_url){
        window.open(service.web_url,"_blank","noopener,noreferrer");
      }
    };
  });
}

function renderPanelServiceManager(){
  const root=$("#panelServiceManager");
  if(!root)return;

  root.innerHTML=state.services.map(service=>`
    <article class="service-manager-card" style="--service-color:${escapeHtml(service.color||'#4a78ff')}">
      <div class="service-manager-logo">${serviceVisual(service)}</div>
      <div>
        <strong>${escapeHtml(service.name)}</strong>
        <small><span class="service-color-dot"></span>${escapeHtml(service.mode)} · ${
          service.is_active?"Activo":"Oculto"
        }</small>
        <p>${escapeHtml(service.description||"")}</p>
      </div>
      <div class="action-group">
        <button
          class="action-button yellow"
          data-service-edit="${service.id}"
        >Editar</button>
        ${!["netflix","spotify"].includes(service.slug)
          ?`<button
              class="action-button red"
              data-service-delete="${service.id}"
            >Eliminar</button>`
          :""
        }
      </div>
    </article>
  `).join("");

  $$("[data-service-edit]",root).forEach(button=>{
    button.onclick=()=>panelServiceModal(
      state.services.find(item=>item.id===button.dataset.serviceEdit)
    );
  });

  $$("[data-service-delete]",root).forEach(button=>{
    button.onclick=async()=>{
      if(!confirm("¿Eliminar este servicio?"))return;
      const {error}=await supabase.rpc(
        "admin_delete_service_v29",
        {p_id:button.dataset.serviceDelete}
      );
      if(error)return toast(error.message,"error");
      toast("Servicio eliminado.");
      await loadServiceCatalog();
    };
  });
}

function panelServiceModal(service=null){
  const modal=openModal({
    title:service?"Editar servicio":"Añadir servicio",
    body:`
      <form id="panelServiceForm" class="form-grid">
        <label><span>Nombre</span>
          <input name="name" value="${escapeHtml(service?.name||"")}" required>
        </label>
        <label><span>Identificador</span>
          <input name="slug" value="${escapeHtml(service?.slug||"")}" required>
        </label>
        <label class="full"><span>Descripción</span>
          <textarea name="description">${escapeHtml(service?.description||"")}</textarea>
        </label>
        <label><span>Logotipo del servicio</span>
          <input name="logo_file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
          <small class="field-help">
            ${service?.logo_url
              ?"Selecciona otra imagen solo si deseas reemplazar el logotipo actual."
              :"Selecciona una imagen desde tu dispositivo."
            }
          </small>
        </label>
        <label><span>Color del servicio</span>
          <div class="service-color-control">
            <input name="color" type="color" value="${escapeHtml(service?.color||"#4a78ff")}" required>
            <input name="color_text" value="${escapeHtml(service?.color||"#4a78ff")}" pattern="#[0-9a-fA-F]{6}" maxlength="7" aria-label="Código del color">
          </div>
        </label>
        <label><span>Web del servicio</span>
          <input name="web_url" type="url" value="${escapeHtml(service?.web_url||"")}">
        </label>
        <label><span>Comportamiento</span>
          <select name="mode">
            <option value="coming_soon" ${service?.mode==="coming_soon"?"selected":""}>Próximamente</option>
            <option value="external" ${service?.mode==="external"?"selected":""}>Abrir web</option>
            <option value="accounts_filter" ${service?.mode==="accounts_filter"?"selected":""}>Filtrar cuentas</option>
            <option value="netflix_internal" ${service?.mode==="netflix_internal"?"selected":""}>Netflix / Disney interno</option>
          </select>
        </label>
        <label><span>Orden</span>
          <input name="sort_order" type="number" value="${service?.sort_order??0}">
        </label>
        <label class="inline-check full">
          <input name="is_active" type="checkbox" ${service?.is_active!==false?"checked":""}>
          Mostrar en el panel
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="savePanelService" class="btn primary">Guardar</button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;
  const colorPicker=$("input[name=color]",modal.root);
  const colorText=$("input[name=color_text]",modal.root);
  colorPicker?.addEventListener("input",()=>{colorText.value=colorPicker.value;});
  colorText?.addEventListener("input",()=>{if(/^#[0-9a-fA-F]{6}$/.test(colorText.value))colorPicker.value=colorText.value;});

  $("#savePanelService",modal.root).onclick=async()=>{
    const form=$("#panelServiceForm",modal.root);
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    values.color=form.elements.color_text.value||form.elements.color.value;
    const logoFile=form.elements.logo_file.files?.[0];
    let logoUrl=service?.logo_url||null;

    if(logoFile){
      if(!String(logoFile.type||"").startsWith("image/")){
        return toast("Selecciona un archivo de imagen válido.","error");
      }

      if(logoFile.size>5*1024*1024){
        return toast("El logotipo no puede superar los 5 MB.","error");
      }

      try{
        logoUrl=await uploadPublicImage(
          "panel-branding",
          logoFile,
          `${state.profile.id}/services`
        );
      }catch(error){
        return toast(
          error.message||"No se pudo subir el logotipo del servicio.",
          "error"
        );
      }
    }

    const {error}=await supabase.rpc(
      "admin_upsert_service_v42",
      {
        p_id:service?.id||null,
        p_slug:values.slug,
        p_name:values.name,
        p_description:values.description||"",
        p_logo_url:logoUrl,
        p_color:values.color,
        p_web_url:values.web_url||null,
        p_mode:values.mode,
        p_is_active:form.elements.is_active.checked,
        p_sort_order:Number(values.sort_order)||0
      }
    );

    if(error)return toast(error.message,"error");

    toast("Servicio guardado.");
    modal.close();
    await loadServiceCatalog();
  };
}

function renderAdminFeaturedContent(){
  const root=$("#adminFeaturedContent");
  if(!root)return;

  const rows=state.content
    .filter(item=>item.status==="published")
    .slice(0,6);

  root.innerHTML=rows.map(item=>`
    <button
      class="mini-content-card"
      data-admin-dashboard-trailer="${escapeHtml(item.trailer_url||"")}"
      data-admin-dashboard-title="${escapeHtml(item.title||"Estreno")}"
      data-admin-dashboard-synopsis="${escapeHtml(
        item.synopsis||"Sin sinopsis disponible."
      )}"
    >
      <span style="background-image:url('${escapeHtml(item.cover_url||"")}')"></span>
      <div class="mini-content-info">
        <strong>${escapeHtml(item.title||"Estreno")}</strong>
        <p>${escapeHtml(item.synopsis||"Sin sinopsis.")}</p>
        <small>${item.release_date?formatDate(`${item.release_date}T00:00:00`):""}</small>
      </div>
    </button>
  `).join("")
  ||`<div class="empty-state">Publica estrenos desde la sección Estrenos.</div>`;

  $$("[data-admin-dashboard-trailer]",root).forEach(button=>{
    button.onclick=()=>trailerModal(
      button.dataset.adminDashboardTitle,
      button.dataset.adminDashboardTrailer,
      button.dataset.adminDashboardSynopsis
    );
  });
}
