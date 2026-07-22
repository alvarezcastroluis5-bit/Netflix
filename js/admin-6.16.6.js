import {supabase,$,$$,escapeHtml,formatDate,statusLabel,statusTone,serviceLabel,serviceBadge,toast,openModal,wireNavigation,setupLogin,callUserManager,parseEmailBlock,uploadPublicImage,loadNotifications,updateNotificationBadge,showNotificationsModal,renderPersistentNotificationAlert,openNetflixIntegrated,showSection} from "./core-6.16.6.js";

const state={
  profile:null,
  users:[],
  allUsers:[],
  accounts:[],
  assignments:[],
  tickets:[],
  history:[],
  content:[],
  notifications:[],
  helpArticles:[]
};
const adminAccountPager={page:1,pageSize:25};
const adminTicketPager={page:1,pageSize:25};

setupLogin({
  allowedRoles:["admin","support"],
  onAuthenticated:async({profile})=>{
    state.profile=profile;

    $("#dashboardGreeting").textContent=`Hola, ${profile.full_name}`;

    if(profile.role==="support"){
      document.body.classList.add("support-session");

      const allowedSections=new Set(["dashboard","accounts","tickets","history"]);

      $$(".nav-link").forEach(button=>{
        if(!allowedSections.has(button.dataset.section)){
          button.remove();
        }
      });

      ["services","users","content","help","notifications"].forEach(section=>{
        $(`#section-${section}`)?.remove();
      });

      $("#openCreateUser")?.remove();
      $("#openCreateAccount")?.remove();
      $("#openBulkDeleteAccounts")?.remove();
      $("#openCreateContent")?.remove();
      $("#notificationBell")?.remove();
      $("#exportAdminTickets")?.remove();
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
  $("#openBulkDeleteAccounts")?.addEventListener("click",bulkDeleteAccountsModal);
  $("#openCreateContent")?.addEventListener("click",()=>contentModal());
  $("#adminCreateTicket")?.addEventListener("click",createStaffTicketModal);
  $("#openCreateHelpArticle")?.addEventListener("click",()=>helpArticleModal());
  $("#helpTypeFilter")?.addEventListener("change",renderHelpAdmin);

  $$("[data-ticket-view]").forEach(button=>{
    button.addEventListener("click",()=>{
      $$("[data-ticket-view]").forEach(tab=>tab.classList.remove("active"));
      button.classList.add("active");
      const filter=$("#ticketStatusFilter");
      if(!filter)return;
      filter.value=button.dataset.ticketView==="pending"
        ?"open"
        :button.dataset.ticketView==="resolved"
          ?"closed"
          :"";
      renderTickets();
    });
  });

  $$("[data-support-status]").forEach(button=>{
    button.addEventListener("click",async()=>{
      await showSection("tickets",loadSection);
      const filter=$("#ticketStatusFilter");
      filter.value=button.dataset.supportStatus==="pending"?"open":"resolved";
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

  const openAvailableAccounts=async()=>{
    await showSection("accounts",loadSection);

    const serviceFilter=$("#accountServiceFilter");
    const statusFilter=$("#accountStatusFilter");
    const search=$("#accountSearch");

    if(serviceFilter)serviceFilter.value="";
    if(statusFilter)statusFilter.value="available";
    if(search)search.value="";

    adminAccountPager.page=1;
    renderAccounts();
  };

  $("#availableAccountsMetric")?.addEventListener(
    "click",
    openAvailableAccounts
  );

  $("#availableAccountsMetric")?.addEventListener(
    "keydown",
    event=>{
      if(event.key==="Enter"||event.key===" "){
        event.preventDefault();
        openAvailableAccounts();
      }
    }
  );

  $("#ticketSearch")?.addEventListener("input",()=>{adminTicketPager.page=1;renderTickets();});
  $("#ticketServiceFilter")?.addEventListener("change",()=>{adminTicketPager.page=1;renderTickets();});
  $("#ticketStatusFilter")?.addEventListener("change",()=>{adminTicketPager.page=1;renderTickets();});
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
  $("#notificationForm")?.addEventListener("submit",sendNotification);
  $("#notificationBell")?.addEventListener(
    "click",
    ()=>showNotificationsModal(
      state.notifications,
      loadAdminNotifications
    )
  );
}
async function loadAll(){
  const commonTasks=[
    loadAccounts(),
    loadTickets(),
    loadHistory()
  ];

  if(state.profile.role==="admin"){
    commonTasks.push(
      loadUsers(),
      loadContent(),
      loadHelpArticles(),
      loadAdminNotifications()
    );
  }

  await Promise.allSettled(commonTasks);
  renderDashboard();

  if(state.profile.role==="admin"){
    renderRecipientList();
  }
}

async function loadSection(section){
  if(section==="dashboard"){
    await Promise.allSettled([
      loadAccounts(),
      loadTickets(),
      state.profile.role==="admin"?loadUsers():Promise.resolve()
    ]);
    renderDashboard();
  }

  if(section==="users"&&state.profile.role==="admin")await loadUsers();
  if(section==="accounts")await loadAccounts();
  if(section==="tickets")await loadTickets();
  if(section==="history")await loadHistory();
  if(section==="content"&&state.profile.role==="admin")await loadContent();
  if(section==="help"&&state.profile.role==="admin")await loadHelpArticles();

  if(section==="notifications"&&state.profile.role==="admin"){
    await loadUsers();
    renderRecipientList();
  }
}

async function loadUsers(){
  const {data,error}=await supabase.rpc(
    "staff_list_profiles_v24"
  );

  if(error){
    toast(`No se pudieron cargar los usuarios: ${error.message}`,"error");
    state.allUsers=[];
    state.users=[];
    renderUsers();
    return;
  }

  state.allUsers=data||[];
  state.users=state.allUsers;

  if($("#usersTable")){
    renderUsers();
  }
}

const profileDisplayName=user=>
  user?.business_name||
  user?.full_name||
  "Sin nombre";

const distributors=()=>state.allUsers.filter(user=>
  user.role==="reseller"
  &&user.status==="active"
);

const userName=id=>{
  if(id===state.profile.id){
    return profileDisplayName(state.profile);
  }

  const user=state.allUsers.find(item=>item.id===id);

  return profileDisplayName(user)||
    "Administrador principal";
};

function profileHierarchyPath(user){
  const map=new Map(
    state.allUsers.map(item=>[item.id,item])
  );

  const names=[];
  const visited=new Set();
  let current=user;

  while(
    current
    &&current.id!==state.profile.id
    &&!visited.has(current.id)
  ){
    visited.add(current.id);
    names.unshift(profileDisplayName(current));
    current=map.get(current.parent_id);
  }

  return names;
}

function profileHierarchyDepth(user){
  return Math.max(0,profileHierarchyPath(user).length-1);
}

function profileHierarchyLabel(user){
  return `${
    profileHierarchyPath(user).join(" → ")
  } · ${user.email}`;
}

function hierarchicalProfiles(rows){
  return [...rows].sort((a,b)=>{
    const pathA=profileHierarchyPath(a)
      .join(" / ")
      .toLocaleLowerCase("es");
    const pathB=profileHierarchyPath(b)
      .join(" / ")
      .toLocaleLowerCase("es");

    return pathA.localeCompare(pathB,"es");
  });
}

function renderUsers(){
  const query=($("#userSearch")?.value||"")
    .trim()
    .toLowerCase();

  const role=$("#userRoleFilter")?.value||"";

  const filtered=state.allUsers.filter(user=>{
    if(!["reseller","support"].includes(user.role))return false;

    const haystack=`
      ${user.full_name||""}
      ${user.business_name||""}
      ${user.email||""}
    `.toLowerCase();

    return user.status==="active"
      &&haystack.includes(query)
      &&(!role||user.role===role);
  });

  const rows=hierarchicalProfiles(filtered);

  $("#usersTable").innerHTML=rows.length
    ?rows.map(user=>{
      const isDistributor=user.role==="reseller";
      const displayName=profileDisplayName(user);
      const depth=isDistributor
        ?profileHierarchyDepth(user)
        :0;

      const parentName=isDistributor
        ?userName(user.parent_id)
        :"Administración";

      const actions=isDistributor
        ?`
          <button
            class="action-button blue"
            data-user-accounts="${user.id}"
          >
            Cuentas
          </button>

          <button
            class="action-button cyan"
            data-user-assign="${user.id}"
          >
            Asignar
          </button>

          <button
            class="action-button yellow"
            data-user-edit="${user.id}"
          >
            Editar
          </button>

          <button
            class="action-button red"
            data-user-delete="${user.id}"
          >
            Eliminar
          </button>
        `
        :`
          <button
            class="action-button yellow"
            data-user-edit="${user.id}"
          >
            Editar
          </button>

          <button
            class="action-button red"
            data-user-delete="${user.id}"
          >
            Eliminar
          </button>
        `;

      return `
        <tr>
          <td>
            <div
              class="person-cell hierarchical-person"
              style="padding-left:${depth*22}px"
            >
              ${depth?`
                <span class="hierarchy-branch-mark">↳</span>
              `:""}

              <span class="avatar-small">
                ${escapeHtml(displayName[0].toUpperCase())}
              </span>

              <div>
                <strong>${escapeHtml(displayName)}</strong>
                <small>${escapeHtml(
                  isDistributor
                    ?user.full_name||"Distribuidor"
                    :"Personal de soporte"
                )}</small>
              </div>
            </div>
          </td>

          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(parentName)}</td>

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
    :`<tr>
        <td colspan="5" class="empty-cell">
          No se encontraron usuarios.
        </td>
      </tr>`;

  $$("[data-user-accounts]").forEach(button=>{
    button.onclick=()=>showDistributorAccounts(
      button.dataset.userAccounts
    );
  });

  $$("[data-user-edit]").forEach(button=>{
    button.onclick=()=>editDistributorModal(
      button.dataset.userEdit
    );
  });

  $$("[data-user-delete]").forEach(button=>{
    button.onclick=()=>deleteDistributor(
      button.dataset.userDelete
    );
  });

  $$("[data-user-assign]").forEach(button=>{
    button.onclick=()=>bulkAssignModal(
      button.dataset.userAssign
    );
  });
}

async function loadAccounts(){
  const {data,error}=await supabase.rpc(
    "staff_list_service_accounts_v32"
  );

  if(error){
    const missingRpc=
      /staff_list_service_accounts_v32|schema cache|PGRST202/i
        .test(error.message||"");

    toast(
      missingRpc
        ?"Faltan funciones de la base de datos. Ejecuta completo el Bloque 34 y espera la recarga de Supabase."
        :`No se pudieron cargar las cuentas: ${error.message}`,
      "error"
    );

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

  // El contador del escritorio debe reflejar inmediatamente el mismo
  // conjunto de cuentas que utiliza la tabla y sus filtros.
  if(state.profile){
    renderDashboard();
  }

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

function normalizedAccountStatus(account){
  const raw=String(account?.status||"")
    .trim()
    .toLowerCase();

  // La propiedad real tiene prioridad para evitar contadores falsos.
  if(account?.current_reseller_id||account?.current_client_id){
    return "assigned";
  }

  if(raw==="available")return "available";
  if(raw==="assigned")return "assigned";

  return raw;
}

function isAccountAvailable(account){
  return normalizedAccountStatus(account)==="available";
}

function adminFilteredAccounts(){
  const query=($("#accountSearch")?.value||"").toLowerCase();
  const service=$("#accountServiceFilter")?.value||"";
  const status=$("#accountStatusFilter")?.value||"";

  return state.accounts.filter(account=>{
    const matchesText=`
      ${account.current_email||""}
      ${account.country||""}
      ${account.account_type||""}
      ${ownerDisplay(account)}
    `.toLowerCase().includes(query);

    const operationalStatus=normalizedAccountStatus(account);

    return matchesText
      &&(!service||account.service===service)
      &&(!status||operationalStatus===status);
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
        :`
          <button
            class="action-button yellow"
            data-account-edit="${account.id}"
          >
            Cambiar correo
          </button>
        `;

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
              assignment?.calculated_status||normalizedAccountStatus(account)
            )}">
              ${statusLabel(
                assignment?.calculated_status||normalizedAccountStatus(account)
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
          p_starts_on:values.starts_on
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

async function loadTickets(){
  const {data,error}=await supabase.rpc(
    "staff_list_tickets_v33"
  );

  if(error){
    state.tickets=[];
    renderTickets();
    toast(`No se pudieron cargar los tickets: ${error.message}`,"error");
    return false;
  }

  state.tickets=(data||[]).map(ticket=>({
    ...ticket,
    creator:{
      full_name:ticket.creator_full_name,
      business_name:ticket.creator_business_name,
      parent_id:ticket.creator_parent_id
    }
  }));

  renderTickets();

  const badge=$("#ticketBadge");
  if(badge){
    badge.textContent=state.tickets.filter(
      ticket=>!["closed","resolved"].includes(ticket.status)
    ).length;
  }

  return true;
}

function ticketCreatorDisplay(ticket){
  return (
    ticket?.creator?.business_name||
    ticket?.creator?.full_name||
    ticket?.creator_email||
    "Distribuidor"
  );
}

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
  const query=($("#ticketSearch")?.value||"").toLowerCase();
  const service=$("#ticketServiceFilter")?.value||"";
  const status=$("#ticketStatusFilter")?.value||"";
  return state.tickets.filter(ticket=>`
    ${ticketCreatorDisplay(ticket)} ${ticket.title||""} ${ticket.category||""}
    ${ticket.reported_email||ticket.account_email_snapshot||""}
  `.toLowerCase().includes(query)&&(!service||ticket.service===service)&&(!status||ticket.status===status));
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
  $("#ticketsTable").innerHTML=visible.length?visible.map(ticket=>`<tr><td>${escapeHtml(ticketCreatorDisplay(ticket))}</td><td>${serviceBadge(ticket.service)}</td><td><strong>${escapeHtml(ticket.title)}</strong></td><td>${escapeHtml(ticket.category)}</td><td>${escapeHtml(ticket.reported_email||ticket.account_email_snapshot)}</td><td><span class="status-pill ${statusTone(ticket.status)}">${staffTicketStatusLabel(ticket.status)}</span></td><td><button class="round-action" data-ticket-open="${ticket.id}">Ver</button></td></tr>`).join(""):`<tr><td colspan="7" class="empty-cell">No se encontraron tickets.</td></tr>`;
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
    "Distribuidor":ticketCreatorDisplay(ticket),
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
    $("#statAvailable").textContent=state.accounts.filter(isAccountAvailable).length;
    $("#statTickets").textContent=pending.length;

    $("#recentAccounts").innerHTML=state.accounts.slice(0,7).map(a=>`
      <div class="activity-row">
        ${serviceBadge(a.service)}
        <div><strong>${escapeHtml(a.current_email)}</strong><small>${escapeHtml(ownerDisplay(a))}</small></div>
        <span class="status-pill ${statusTone(normalizedAccountStatus(a))}">${statusLabel(normalizedAccountStatus(a))}</span>
      </div>
    `).join("")||`<div class="empty-state">No existen cuentas.</div>`;

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
    title:`Cuentas asignadas a ${
      user.business_name||user.full_name
    }`,
    extraWide:true,
    body:`
      <div class="notice-box">
        Se muestran todas las cuentas que salieron originalmente de esta
        rama y las que actualmente están en sus subordinados.
        Cada cuenta aparece una sola vez.
      </div>
      <div id="branchAccountsLoading" class="empty-state">
        Cargando cuentas reales de la rama...
      </div>
    `
  });

  try{
    const {data,error}=await supabase.rpc(
      "staff_list_user_branch_accounts_v32",
      {p_distributor_id:id}
    );

    if(error)throw error;

    const rows=data||[];

    $("#branchAccountsLoading",modal.root).outerHTML=`
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Correo</th>
              <th>País</th>
              <th>Tipo</th>
              <th>Propietario</th>
              <th>Fecha de corte</th>
              <th>Días restantes</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length?rows.map(account=>{
              const owner=
                account.reseller_business_name||
                account.reseller_full_name||
                "Disponible";

              const parent=
                account.parent_business_name||
                account.parent_full_name||
                "";

              const ownerPath=parent
                ?`${owner} / ${parent}`
                :owner;

              return `
                <tr>
                  <td>${serviceBadge(account.service)}</td>
                  <td>
                    <strong>${escapeHtml(account.current_email)}</strong>
                  </td>
                  <td>${escapeHtml(
                    account.country||"Sin configurar"
                  )}</td>
                  <td>${escapeHtml(
                    account.account_type||"Cuenta completa"
                  )}</td>
                  <td>${escapeHtml(ownerPath)}</td>
                  <td>${formatDate(account.expires_on)}</td>
                  <td>
                    <span class="days-pill ${statusTone(
                      account.calculated_status
                    )}">
                      ${account.days_remaining??"—"}
                    </span>
                  </td>
                  <td>
                    <span class="status-pill ${statusTone(
                      account.calculated_status||account.status
                    )}">
                      ${statusLabel(
                        account.calculated_status||account.status
                      )}
                    </span>
                  </td>
                  <td>
                    ${state.profile.role==="admin"
                      ?`<button
                          class="action-button yellow"
                          data-branch-account-edit="${account.id}"
                        >
                          Editar
                        </button>`
                      :`<span class="read-only-pill">Solo consulta</span>`
                    }
                  </td>
                </tr>
              `;
            }).join("")
            :`<tr>
                <td colspan="9" class="empty-cell">
                  Esta rama no tiene cuentas.
                </td>
              </tr>`
            }
          </tbody>
        </table>
      </div>
      <div class="accounts-pagination-footer">
        <strong>Total de la rama: ${rows.length} cuentas</strong>
      </div>
    `;

    $$("[data-branch-account-edit]",modal.root).forEach(button=>{
      button.onclick=()=>{
        modal.close();
        editAccountModal(button.dataset.branchAccountEdit);
      };
    });
  }catch(error){
    $("#branchAccountsLoading",modal.root).innerHTML=`
      <div class="danger-notice">
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

function bulkAssignModal(id){
  const user=state.allUsers.find(item=>item.id===id);
  if(!user)return;

  const modal=openModal({
    title:`Asignar cuentas a ${profileDisplayName(user)}`,
    body:`
      <div class="notice-box">
        Pega correos registrados y disponibles.
        La fecha es opcional. Si queda vacía, la fecha de corte y
        los días restantes aparecerán como “—” hasta que sea guardada.
      </div>

      <form id="bulkAssignForm" class="form-grid">
        <label>
          <span>Plataforma</span>
          <select name="service">
            <option value="netflix">Netflix</option>
            <option value="spotify">Spotify</option>
          </select>
        </label>

        <label>
          <span>Fecha de venta / inicio (opcional)</span>
          <input name="starts_on" type="date">
        </label>

        <label class="full">
          <span>Correos</span>
          <textarea
            name="emails"
            rows="12"
            required
          ></textarea>
        </label>

        <div id="assignCounter" class="counter-note full">
          0 correos detectados
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="assignAccounts" class="btn primary">
        Asignar cuentas
      </button>
    `
  });

  const form=$("#bulkAssignForm",modal.root);
  const textarea=form.elements.emails;

  textarea.oninput=()=>{
    $("#assignCounter",modal.root).textContent=
      `${parseEmailBlock(textarea.value).length} correos detectados`;
  };

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#assignAccounts",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(
      new FormData(form).entries()
    );

    const button=$("#assignAccounts",modal.root);
    button.disabled=true;
    button.textContent="Asignando...";

    try{
      const {data,error}=await supabase.rpc(
        "bulk_assign_service_accounts_v33",
        {
          p_service:values.service,
          p_account_emails:parseEmailBlock(values.emails),
          p_distributor_id:id,
          p_starts_on:values.starts_on||null
        }
      );

      if(error)throw error;

      toast(
        `${data.assigned||0} asignadas, `+
        `${data.unavailable||0} no disponibles y `+
        `${data.not_found||0} no encontradas.`+
        (
          data.date_saved
            ?""
            :" La fecha quedó pendiente."
        )
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
        "bulk_add_service_accounts_v30",
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
          <input value="${escapeHtml(formatDate(assignment?.starts_on))}" readonly>
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

  const distributorsList=hierarchicalProfiles(
    distributors()
  );

  const assignment=activeAssignment(account);

  const ownerOptions=distributorsList.map(user=>`
    <option value="${user.id}">
      ${escapeHtml(
        profileHierarchyPath(user).join(" → ")
      )}
      · ${escapeHtml(user.email)}
    </option>
  `).join("");

  const modal=openModal({
    title:"Editar cuenta",
    body:`
      <div class="notice-box">
        Puedes cambiar el propietario a cualquier distribuidor de la
        jerarquía. La fecha es opcional.
      </div>

      <form id="editAccountForm" class="form-grid">
        <label>
          <span>Plataforma</span>
          <select name="service">
            <option
              value="netflix"
              ${account.service==="netflix"?"selected":""}
            >
              Netflix
            </option>
            <option
              value="spotify"
              ${account.service==="spotify"?"selected":""}
            >
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
            value="${escapeHtml(
              account.country||"Sin configurar"
            )}"
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
        </label>

        <label class="full">
          <span>Propietario</span>
          <select name="owner_id">
            <option value="">Disponible / Sin propietario</option>
            ${ownerOptions}
          </select>
          <small class="field-help">
            Los usuarios aparecen ordenados por su jerarquía.
          </small>
        </label>

        <label>
          <span>Fecha de venta / inicio (opcional)</span>
          <input
            name="starts_on"
            type="date"
            value="${assignment?.starts_on||""}"
          >
          <small class="field-help">
            Vacío deja fecha de corte y días restantes pendientes.
          </small>
        </label>

        <label>
          <span>Duración</span>
          <input value="30 días" readonly>
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="saveAccountChanges" class="btn primary">
        Guardar
      </button>
    `
  });

  const form=$("#editAccountForm",modal.root);
  const serviceSelect=form.elements.service;
  const typeSelect=form.elements.account_type;

  form.elements.owner_id.value=
    account.current_reseller_id||"";

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

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveAccountChanges",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(
      new FormData(form).entries()
    );

    const button=$("#saveAccountChanges",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      const {data,error}=await supabase.rpc(
        "admin_edit_service_account_v33",
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

      toast(data.message||"Cuenta actualizada.");
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
      const {data,error}=await supabase.rpc("create_support_ticket_v2",{
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

function renderHelpAdmin(){
  const root=$("#helpAdminGrid");
  if(!root)return;

  const type=$("#helpTypeFilter")?.value||"";
  const rows=state.helpArticles.filter(article=>!type||article.article_type===type);

  root.innerHTML=rows.length?rows.map(article=>`
    <article class="help-admin-card">
      <div class="help-admin-card-header">
        <span class="status-pill ${article.status==="published"?"green":"orange"}">${article.status==="published"?"Publicado":"Borrador"}</span>
        <span class="help-type-label">${article.article_type==="faq"?"Pregunta frecuente":"Cómo utilizar"}</span>
      </div>
      ${article.media_type==="image"&&article.media_url?`<img class="help-card-media" src="${escapeHtml(article.media_url)}" alt="">`:""}
      ${article.media_type==="video"&&article.media_url?`<div class="help-video-placeholder">▶ Video incluido</div>`:""}
      <h3>${escapeHtml(article.title)}</h3>
      <p>${escapeHtml(article.answer||article.detail||"")}</p>
      <div class="help-admin-actions">
        <button class="action-button yellow" data-help-edit="${article.id}">Editar</button>
        <button class="action-button red" data-help-delete="${article.id}">Eliminar</button>
      </div>
    </article>
  `).join(""):`<div class="empty-gallery">No hay contenido de ayuda registrado.</div>`;

  $$("[data-help-edit]").forEach(button=>{
    button.onclick=()=>helpArticleModal(state.helpArticles.find(article=>article.id===button.dataset.helpEdit));
  });
  $$("[data-help-delete]").forEach(button=>{
    button.onclick=()=>deleteHelpArticle(button.dataset.helpDelete);
  });
}

function helpArticleModal(existing=null){
  const modal=openModal({
    title:existing?"Editar contenido de ayuda":"Nuevo contenido de ayuda",
    wide:true,
    body:`
      <form id="helpArticleForm" class="form-grid">
        <label><span>Tipo</span><select name="article_type"><option value="faq" ${existing?.article_type==="faq"?"selected":""}>Pregunta frecuente</option><option value="guide" ${existing?.article_type==="guide"?"selected":""}>Cómo utilizar</option></select></label>
        <label><span>Estado</span><select name="status"><option value="published" ${existing?.status==="published"?"selected":""}>Publicado</option><option value="draft" ${existing?.status==="draft"?"selected":""}>Borrador</option></select></label>
        <label class="full"><span>Título o pregunta</span><input name="title" value="${escapeHtml(existing?.title||"")}" required></label>
        <label class="full"><span>Respuesta o explicación</span><textarea name="answer" rows="5" required>${escapeHtml(existing?.answer||"")}</textarea></label>
        <label class="full"><span>Detalle adicional</span><textarea name="detail" rows="6">${escapeHtml(existing?.detail||"")}</textarea></label>
        <label><span>Contenido visual</span><select name="media_type"><option value="none" ${!existing?.media_type||existing.media_type==="none"?"selected":""}>Sin imagen ni video</option><option value="image" ${existing?.media_type==="image"?"selected":""}>Imagen</option><option value="video" ${existing?.media_type==="video"?"selected":""}>Video</option></select></label>
        <label><span>Orden</span><input name="display_order" type="number" min="0" value="${existing?.display_order??0}"></label>
        <label class="full"><span>URL de imagen o video</span><input name="media_url" value="${escapeHtml(existing?.media_url||"")}" placeholder="YouTube, Vimeo o enlace directo"></label>
        <label class="full"><span>Subir imagen opcional</span><input name="media_file" type="file" accept="image/png,image/jpeg,image/webp"></label>
      </form>
    `,
    actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveHelpArticle" class="btn primary">Guardar</button>`
  });

  const form=$("#helpArticleForm",modal.root);
  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveHelpArticle",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const file=form.elements.media_file.files?.[0]||null;
    const button=$("#saveHelpArticle",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      let mediaUrl=String(values.media_url||"").trim();

      if(file){
        mediaUrl=await uploadPublicImage("help-media",file,state.profile.id);
        values.media_type="image";
      }

      const {data,error}=await supabase.rpc("admin_save_help_article",{
        p_id:existing?.id||null,
        p_article_type:values.article_type,
        p_title:values.title,
        p_answer:values.answer,
        p_detail:values.detail||"",
        p_media_type:values.media_type,
        p_media_url:mediaUrl||null,
        p_display_order:Number(values.display_order||0),
        p_status:values.status
      });

      if(error)throw error;
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
  if(!confirm("¿Eliminar este contenido de ayuda?"))return;

  try{
    const {data,error}=await supabase.rpc("admin_delete_help_article",{p_id:id});
    if(error)throw error;
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

  const {data:messageRows,error}=await supabase.rpc(
    "staff_list_ticket_messages_v33",
    {p_ticket_id:id}
  );

  const messages=(messageRows||[]).map(message=>({
    ...message,
    author:{
      full_name:message.author_full_name,
      business_name:message.author_business_name,
      role:message.author_role
    }
  }));

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
                    :(message.author?.business_name||message.author?.full_name||"Usuario")
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
function trailerModal(title,url){const id=String(url||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/)?.[1];openModal({title,wide:true,body:id?`<iframe class="trailer-frame" src="https://www.youtube.com/embed/${encodeURIComponent(id)}" allowfullscreen></iframe>`:`<video class="trailer-frame" src="${escapeHtml(url)}" controls autoplay></video>`});}
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
    toast("Escribe el texto del aviso o adjunta una imagen.","error");
    return;
  }

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
      "send_hierarchical_notification",
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
  }catch(error){
    toast(error.message,"error");
  }finally{
    button.disabled=false;
    button.textContent="Enviar aviso";
  }
}
