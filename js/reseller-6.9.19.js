console.info("Centro Premium reseller V6.9.19.17 cargado");
import {supabase,$,$$,escapeHtml,formatDate,statusLabel,statusTone,serviceLabel,serviceBadge,toast,openModal,showSection,wireNavigation,setupLogin,callUserManager,callPublicUserManager,parseEmailBlock,uploadPublicImage,loadNotifications,updateNotificationBadge,showNotificationsModal,renderPersistentNotificationAlert,maybeShowBrowserNotifications,startNotificationWatcher,openNetflixIntegrated} from "./core-6.9.19.js";
import {countryMapByCode,countryMapPoint,countryFlagEmoji,whatsappDigits} from "./country-map-data-6.9.19.13.js";
import {
  configureContractModule,
  ensureRequiredContract,
  bindContractCenter,
  loadContractCenter
} from "./contracts-6.9.19.17.js";

configureContractModule({supabase,$,escapeHtml,formatDate,toast});
const state={profile:null,network:[],accounts:[],assignments:[],tickets:[],history:[],content:[],notifications:[],helpArticles:[],countryDistributors:[],parent:null,metrics:null,panelSettings:null,services:[]};
const resellerAccountPager={page:1,pageSize:25};
const resellerTicketPager={page:1,pageSize:25};
let resellerNotificationSending=false;
let currentHelpPublicFilter="";

function resellerContractConfig(){
  return {
    key:"reseller-contracts",
    profile:state.profile,
    tableSelector:"#resellerContractsTable",
    searchSelector:"#resellerContractSearch",
    countSelector:"#resellerContractsCount",
    refreshSelector:"#refreshResellerContracts"
  };
}
function distributorTicketStatusLabel(status){
  const labels={
    open:"Pendiente de resolver",
    in_review:"En revisión",
    answered:"Respondido",
    waiting_user:"Esperando respuesta",
    resolved:"Resuelto",
    closed:"Cerrado"
  };

  return labels[status]||statusLabel(status);
}

bindPasswordRecovery();
setupLogin({
  allowedRoles:["reseller"],
  beforeEnter:ensureRequiredContract,
  onAuthenticated:async({profile})=>{
    state.profile=profile;
    applyProfile(profile);
    wireNavigation(loadSection);
    bindActions();
    await loadAll();

    startNotificationWatcher({
      userId:profile.id,
      onItems:async(
        items,
        {
          newUnread=[]
        }={}
      )=>{
        state.notifications=items;
        updateNotificationBadge(items);
        renderDashboardNotifications();

        renderPersistentNotificationAlert(
          items,
          {
            onRead:loadMyNotifications,
            onOpen:openNotifications,
            onForward:forwardReceivedNotification
          }
        );

        maybeShowBrowserNotifications(
          newUnread,
          state.profile
        );
      }
    });
    startSilentPanelSync(profile.id);
  }
});

function bindPasswordRecovery(){
  $("#forgotPasswordBtn")?.addEventListener(
    "click",
    openPasswordRecoveryValidation
  );
}

function openPasswordRecoveryValidation(){
  const modal=openModal({
    title:"Recuperar contraseña",
    body:`
      <div class="password-recovery-intro">
        <span class="recovery-step-number">1</span>
        <div>
          <strong>Validación con tu superior</strong>
          <p>
            Coloca el correo que te asignaron y el WhatsApp de tu superior.
          </p>
        </div>
      </div>

      <form id="passwordRecoveryValidationForm" class="form-grid">
        <label class="full">
          <span>Tu correo de acceso</span>
          <input name="email" type="email" required>
        </label>

        <label class="full">
          <span>WhatsApp de tu superior</span>
          <input
            name="superior_whatsapp"
            inputmode="numeric"
            pattern="[0-9]{8,15}"
            placeholder="5917000000"
            required
          >
          <small class="field-help">
            Ejemplo: 5917000000. Coloca el WhatsApp real registrado
            de tu superior, sin el signo +, espacios ni guiones.
          </small>
        </label>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="validatePasswordRecovery" class="btn primary">
        Validar datos
      </button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#validatePasswordRecovery",modal.root).onclick=async()=>{
    const form=$("#passwordRecoveryValidationForm",modal.root);
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#validatePasswordRecovery",modal.root);
    button.disabled=true;
    button.textContent="Validando...";

    try{
      const result=await callPublicUserManager({
        action:"validate_password_recovery",
        email:values.email.trim().toLowerCase(),
        superior_whatsapp:String(values.superior_whatsapp).replace(/\D/g,"")
      });

      modal.close();

      openNewPasswordModal({
        recoveryToken:result.recovery_token,
        email:values.email.trim().toLowerCase(),
        commercialName:result.commercial_name||"Distribuidor"
      });
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Validar datos";
    }
  };
}

function openNewPasswordModal({recoveryToken,email,commercialName}){
  const modal=openModal({
    title:"Crear nueva contraseña",
    body:`
      <div class="password-recovery-intro success">
        <span class="recovery-step-number">2</span>
        <div>
          <strong>Datos validados</strong>
          <p>
            ${escapeHtml(commercialName)} · ${escapeHtml(email)}
          </p>
        </div>
      </div>

      <form id="newPasswordRecoveryForm" class="form-grid">
        <label class="full">
          <span>Nueva contraseña</span>
          <input
            name="new_password"
            type="password"
            minlength="8"
            autocomplete="new-password"
            required
          >
        </label>

        <label class="full">
          <span>Confirmar nueva contraseña</span>
          <input
            name="confirm_password"
            type="password"
            minlength="8"
            autocomplete="new-password"
            required
          >
        </label>

        <div class="notice-box full">
          La contraseña debe tener al menos 8 caracteres.
          Tu superior recibirá una notificación de que realizaste el cambio.
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="confirmPasswordRecovery" class="btn primary">
        Cambiar contraseña
      </button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmPasswordRecovery",modal.root).onclick=async()=>{
    const form=$("#newPasswordRecoveryForm",modal.root);
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());

    if(values.new_password!==values.confirm_password){
      toast("Las contraseñas no coinciden.","error");
      form.elements.confirm_password.focus();
      return;
    }

    const button=$("#confirmPasswordRecovery",modal.root);
    button.disabled=true;
    button.textContent="Actualizando...";

    try{
      const result=await callPublicUserManager({
        action:"confirm_password_recovery",
        recovery_token:recoveryToken,
        new_password:values.new_password
      });

      const {
        error:signInError
      }=await supabase.auth.signInWithPassword({
        email,
        password:values.new_password
      });

      modal.close();

      const loginEmail=$("#loginEmail");
      const loginPassword=$("#loginPassword");

      if(loginEmail){
        loginEmail.value=email;
      }

      if(loginPassword){
        loginPassword.value="";
      }

      if(signInError){
        toast(
          "La contraseña fue actualizada. Ingresa con la nueva clave.",
          "error"
        );

        loginPassword?.focus();
        return;
      }

      toast(
        result.message||
        "Contraseña actualizada. Ingresando al panel..."
      );

      window.setTimeout(()=>{
        location.reload();
      },650);
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Cambiar contraseña";
    }
  };
}

function bindActions(){
  bindContractCenter(resellerContractConfig());
  $("#openNetflixService")?.addEventListener("click",openNetflix);
  $("#openSpotifyService")?.addEventListener("click",showSpotifyComingSoon);
  $("#openCreateDistributor")?.addEventListener("click",createDistributorModal);
  $("#networkSearch")?.addEventListener("input",renderNetwork);
  $("#openBulkUpdateAccounts")?.addEventListener(
    "click",
    bulkUpdateAccountDatesModal
  );
  $("#openCreateTicket")?.addEventListener("click",createTicketModal);
  $("#resellerTicketSearch")?.addEventListener("input",()=>{resellerTicketPager.page=1;renderTickets();});
  $("#resellerTicketServiceFilter")?.addEventListener("change",()=>{resellerTicketPager.page=1;renderTickets();});
  $("#resellerTicketStatusFilter")?.addEventListener("change",()=>{resellerTicketPager.page=1;renderTickets();});
  $("#resellerTicketsPageSize")?.addEventListener("change",event=>{
    resellerTicketPager.pageSize=Math.min(100,Math.max(25,Number(event.target.value)||25));
    resellerTicketPager.page=1;renderTickets();
  });
  $("#resellerRecipientSearch")?.addEventListener(
    "input",
    renderResellerRecipientList
  );
  $("#selectAllDirectRecipients")?.addEventListener(
    "click",
    selectAllDirectRecipients
  );
  $("#resellerNotificationScope")?.addEventListener(
    "change",
    updateResellerNotificationScope
  );
  if($("#resellerNotificationForm")){
    $("#resellerNotificationForm").onsubmit=sendResellerNotification;
  }
  $("#accountSearch")?.addEventListener("input",()=>{
    resellerAccountPager.page=1;
    renderAccounts();
  });

  $("#accountServiceFilter")?.addEventListener("change",()=>{
    resellerAccountPager.page=1;
    renderAccounts();
  });

  $("#resellerAccountsPageSize")?.addEventListener("change",event=>{
    resellerAccountPager.pageSize=Math.min(
      100,
      Math.max(25,Number(event.target.value)||25)
    );
    resellerAccountPager.page=1;
    renderAccounts();
  });

  $("#exportResellerAccounts")?.addEventListener(
    "click",
    exportResellerAccountsToExcel
  );
  $("#profileAvatarFile")?.addEventListener("change",previewAvatar);
  $("#saveProfilePhoto")?.addEventListener("click",saveProfilePhoto);
  $("#saveSettings")?.addEventListener("click",saveSettings);
  $("#notificationBell")?.addEventListener("click",openNotifications);
  $("#viewAllNotifications")?.addEventListener("click",openNotifications);

  $$("[data-help-public-filter]").forEach(button=>{
    button.addEventListener("click",()=>{
      $$("[data-help-public-filter]").forEach(tab=>tab.classList.remove("active"));
      button.classList.add("active");
      currentHelpPublicFilter=button.dataset.helpPublicFilter||"";
      renderHelpPublic(currentHelpPublicFilter);
    });
  });
}

function applyProfile(p){
  const commercialName=
    String(p.business_name||"").trim()||
    String(p.full_name||"").trim()||
    "Distribuidor";

  const setText=(selector,value)=>{
    const element=$(selector);
    if(element){
      element.textContent=value;
    }
  };

  setText("#brandName",commercialName);
  setText(
    "#welcomeTitle",
    `¡Bienvenido, ${commercialName}!`
  );
  setText("#profileBusinessName",commercialName);
  setText("#topbarUserName",commercialName);
  setText("#topbarUserRole","Distribuidor");

  const initial=
    commercialName.charAt(0).toUpperCase()||"D";

  setText("#dashboardAvatarFallback",initial);
  setText("#profileAvatarFallback",initial);
  setText("#topbarUserAvatar",initial);

  const dashboardAvatar=$("#dashboardAvatar");
  const dashboardFallback=$("#dashboardAvatarFallback");
  const profileAvatar=$("#profileAvatarPreview");
  const profileFallback=$("#profileAvatarFallback");

  if(p.avatar_url){
    if(dashboardAvatar){
      dashboardAvatar.src=p.avatar_url;
      dashboardAvatar.hidden=false;
    }

    if(dashboardFallback){
      dashboardFallback.hidden=true;
    }

    if(profileAvatar){
      profileAvatar.src=p.avatar_url;
      profileAvatar.hidden=false;
    }

    if(profileFallback){
      profileFallback.hidden=true;
    }
  }else{
    if(dashboardAvatar){
      dashboardAvatar.removeAttribute("src");
      dashboardAvatar.hidden=true;
    }

    if(dashboardFallback){
      dashboardFallback.hidden=false;
    }

    if(profileAvatar){
      profileAvatar.removeAttribute("src");
      profileAvatar.hidden=true;
    }

    if(profileFallback){
      profileFallback.hidden=false;
    }
  }

  const settings=p.notification_settings||{};

  if($("#inAppNotifications")){
    $("#inAppNotifications").checked=
      settings.in_app!==false;
  }

  if($("#browserNotifications")){
    $("#browserNotifications").checked=
      settings.browser===true;
  }
}
async function loadAll(){await Promise.allSettled([loadNetwork(),loadAccounts(),loadTickets(),loadDashboardMetrics(),loadHistory(),loadContent(),loadHelpArticles(),loadParent(),loadMyNotifications(),loadPanelSettings(),loadServiceCatalog()]);renderDashboard();}
async function loadSection(section){
  if(section==="network")await loadNetwork();

  if(section==="announcements"){
    await loadNetwork();
    renderResellerRecipientList();
    updateResellerNotificationScope();
  }

  if(section==="accounts")await loadAccounts();
  if(section==="tickets")await loadTickets();
  if(section==="history")await loadHistory();
  if(section==="contracts")await loadContractCenter(resellerContractConfig());
  if(section==="content")await loadContent();if(section==="help")await loadHelpArticles();
}
const openNetflix=()=>openNetflixIntegrated();

function showSpotifyComingSoon(){
  openModal({
    title:"Spotify",
    body:`
      <div class="coming-soon-service">
        <strong>Estamos trabajando para darte este servicio</strong>
        <p>Spotify estará disponible próximamente.</p>
      </div>
    `
  });
}

async function loadNetwork(){
  const {data,error}=await supabase.rpc("reseller_list_network_v25");
  if(error){
    state.network=[];
    renderNetwork();
    renderResellerRecipientList();
    toast(`No se pudo cargar tu red: ${error.message}`,"error");
    return false;
  }
  state.network=data||[];
  renderNetwork();
  renderResellerRecipientList();
  return true;
}
const networkName=id=>id===state.profile.id?state.profile.full_name:(state.network.find(u=>u.id===id)?.full_name||"—");
function networkDisplayName(user){
  return user?.business_name||user?.full_name||"Sin nombre";
}

function networkParentName(user){
  if(user.parent_id===state.profile.id){
    return state.profile.business_name||
      state.profile.full_name||
      "Mi usuario";
  }

  const parent=state.network.find(
    item=>item.id===user.parent_id
  );

  return networkDisplayName(parent);
}

function filteredNetworkUsers(){
  const query=($("#networkSearch")?.value||"")
    .trim()
    .toLowerCase();

  const direct=state.network.filter(
    user=>user.parent_id===state.profile.id
  );

  if(!query)return direct;

  return direct.filter(user=>
    `
      ${user.full_name||""}
      ${user.business_name||""}
      ${user.email||""}
    `.toLowerCase().includes(query)
  );
}

function renderNetwork(){
  const rows=filteredNetworkUsers();

  $("#networkTable").innerHTML=rows.length
    ?rows.map(user=>{
      const isDirect=user.parent_id===state.profile.id;

      const actions=`
        <button
          class="action-button blue"
          data-network-accounts="${user.id}"
        >
          Cuentas
        </button>

        ${isDirect?`
          <button
            class="action-button cyan"
            data-network-bulk-assign="${user.id}"
          >
            Asignar
          </button>

          <button
            class="action-button yellow"
            data-edit-network-user="${user.id}"
          >
            Editar
          </button>

          <button
            class="action-button red"
            data-delete-network-user="${user.id}"
          >
            Eliminar
          </button>
        `:""}
      `;

      const displayName=networkDisplayName(user);

      return `
        <tr>
          <td>
            <div class="person-cell">
              <span class="avatar-small">
                ${escapeHtml(displayName[0].toUpperCase())}
              </span>

              <div>
                <strong>${escapeHtml(displayName)}</strong>
                <small>${escapeHtml(user.full_name||"Distribuidor")}</small>
              </div>
            </div>
          </td>

          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(networkParentName(user))}</td>

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
          No se encontraron distribuidores por correo o nombre.
        </td>
      </tr>`;

  $$("[data-network-accounts]").forEach(button=>{
    button.onclick=()=>showNetworkUserAccounts(
      button.dataset.networkAccounts
    );
  });

  $$("[data-network-bulk-assign]").forEach(button=>{
    button.onclick=()=>bulkAssignNetworkModal(
      button.dataset.networkBulkAssign
    );
  });

  $$("[data-edit-network-user]").forEach(button=>{
    button.onclick=()=>editDirectDistributorModal(
      button.dataset.editNetworkUser
    );
  });

  $$("[data-delete-network-user]").forEach(button=>{
    button.onclick=()=>deleteDirectDistributor(
      button.dataset.deleteNetworkUser
    );
  });
}

async function deleteDirectDistributor(id){
  const user=state.network.find(item=>item.id===id);

  if(!user||user.parent_id!==state.profile.id){
    toast(
      "Solo puedes eliminar distribuidores creados directamente por ti.",
      "error"
    );
    return;
  }

  const visibleName=user.business_name||user.full_name;

  if(!confirm(
    `¿Eliminar completamente la rama de ${visibleName}?\n\n`+
    "También se eliminarán todos los distribuidores que dependan de ese usuario, "+
    "sin importar cuántos niveles existan. Todas las cuentas de la rama volverán "+
    "a tu usuario. Ninguno de los usuarios eliminados podrá iniciar sesión ni "+
    "recuperar su contraseña."
  )){
    return;
  }

  try{
    const result=await callUserManager({
      action:"delete",
      user_id:id
    });

    toast(result.message);

    await Promise.all([
      loadNetwork(),
      loadAccounts()
    ]);
  }catch(error){
    toast(error.message,"error");
  }
}

function directDistributors(){
  return state.network.filter(user=>
    user.parent_id===state.profile.id
    &&user.status==="active"
  );
}

function renderResellerRecipientList(){
  const root=$("#resellerRecipientList");
  if(!root)return;

  const query=($("#resellerRecipientSearch")?.value||"").toLowerCase();

  const rows=directDistributors().filter(user=>
    `
      ${user.full_name}
      ${user.business_name||""}
      ${user.email}
    `.toLowerCase().includes(query)
  );

  root.innerHTML=rows.length
    ?rows.map(user=>`
      <label class="recipient-row">
        <input type="checkbox" value="${user.id}">

        <span class="avatar-small">
          ${escapeHtml(
            (user.business_name||user.full_name||"D")[0].toUpperCase()
          )}
        </span>

        <div>
          <strong>
            ${escapeHtml(user.business_name||user.full_name)}
          </strong>

          <small>
            ${escapeHtml(user.email)} · Distribuidor directo
          </small>
        </div>
      </label>
    `).join("")
    :`<div class="empty-state">
        Aún no tienes distribuidores directos para recibir avisos.
      </div>`;

  updateResellerNotificationScope();
}

function updateResellerNotificationScope(){
  const scope=$("#resellerNotificationScope")?.value||"selected";
  const panel=$("#resellerRecipientPanel");

  if(panel){
    panel.classList.toggle(
      "recipient-panel-disabled",
      scope!=="selected"
    );
  }

  $$("#resellerRecipientList input[type=checkbox]").forEach(input=>{
    input.disabled=scope!=="selected";
  });
}

function selectAllDirectRecipients(){
  if($("#resellerNotificationScope")?.value!=="selected")return;

  const inputs=$$("#resellerRecipientList input[type=checkbox]");
  const shouldSelect=inputs.some(input=>!input.checked);

  inputs.forEach(input=>{
    input.checked=shouldSelect;
  });
}

async function sendResellerNotification(event){
  event.preventDefault();
  if(resellerNotificationSending)return;

  const form=event.currentTarget;
  const values=Object.fromEntries(new FormData(form).entries());
  const scope=values.scope||"selected";
  const recipientIds=$$("#resellerRecipientList input[type=checkbox]:checked")
    .map(input=>input.value);
  const file=form.elements.image.files?.[0]||null;
  const message=String(values.message||"").trim();

  if(scope==="selected"&&!recipientIds.length){
    toast("Selecciona al menos un distribuidor directo.","error");
    return;
  }

  if(scope==="all_direct"&&!directDistributors().length){
    toast("No tienes distribuidores directos para recibir el aviso.","error");
    return;
  }

  if(!message&&!file){
    toast("Escribe un mensaje o adjunta una imagen.","error");
    return;
  }

  resellerNotificationSending=true;
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
      `Aviso enviado a ${data.recipients||0} distribuidor(es).`
    );

    form.reset();
    renderResellerRecipientList();
    updateResellerNotificationScope();
  }catch(error){
    toast(error.message,"error");
  }finally{
    resellerNotificationSending=false;
    button.disabled=false;
    button.textContent="Enviar aviso";
  }
}

async function loadAccounts(){
  const {data,error}=await supabase.rpc(
    "reseller_list_branch_accounts_v29"
  );

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

function assignmentFor(a){const rows=state.assignments.filter(x=>x.account_id===a.id&&x.status==="active");return rows.find(x=>x.seller_id===state.profile.id)||rows.find(x=>x.buyer_reseller_id===state.profile.id)||rows[0]||null;}
const target=account=>{
  const owner=
    account.reseller?.business_name||
    account.reseller?.full_name||
    "Sin distribuidor";

  const parent=
    account.reseller?.parent_business_name||
    account.reseller?.parent_full_name||
    "";

  return parent?`${owner} / ${parent}`:owner;
};

function resellerFilteredAccounts(){
  const query=($("#accountSearch")?.value||"").toLowerCase();
  const service=$("#accountServiceFilter")?.value||"";

  return state.accounts.filter(account=>
    `
      ${account.current_email||""}
      ${account.country||""}
      ${account.account_type||""}
      ${target(account)}
    `
      .toLowerCase()
      .includes(query)
    &&(!service||account.service===service)
  );
}

function resellerPaginationTokens(current,total){
  if(total<=7){
    return Array.from({length:total},(_,index)=>index+1);
  }

  const tokens=[1];

  if(current>4){
    tokens.push("ellipsis-left");
  }

  for(
    let page=Math.max(2,current-1);
    page<=Math.min(total-1,current+1);
    page+=1
  ){
    tokens.push(page);
  }

  if(current<total-3){
    tokens.push("ellipsis-right");
  }

  tokens.push(total);
  return tokens;
}

function renderResellerAccountPagination(totalRows){
  const root=$("#resellerAccountsPagination");
  if(!root)return;

  const totalPages=Math.max(
    1,
    Math.ceil(totalRows/resellerAccountPager.pageSize)
  );

  resellerAccountPager.page=Math.min(
    Math.max(1,resellerAccountPager.page),
    totalPages
  );

  root.innerHTML=`
    <button
      class="pagination-button"
      data-reseller-page-action="previous"
      ${resellerAccountPager.page===1?"disabled":""}
    >
      Anterior
    </button>

    ${resellerPaginationTokens(
      resellerAccountPager.page,
      totalPages
    ).map(token=>
      typeof token==="number"
        ?`<button
            class="pagination-button ${
              token===resellerAccountPager.page?"active":""
            }"
            data-reseller-page="${token}"
          >
            ${token}
          </button>`
        :`<span class="pagination-ellipsis">…</span>`
    ).join("")}

    <button
      class="pagination-button"
      data-reseller-page-action="next"
      ${resellerAccountPager.page===totalPages?"disabled":""}
    >
      Siguiente
    </button>
  `;

  $$("[data-reseller-page]",root).forEach(button=>{
    button.onclick=()=>{
      resellerAccountPager.page=Number(
        button.dataset.resellerPage
      );
      renderAccounts();
    };
  });

  $("[data-reseller-page-action='previous']",root)
    ?.addEventListener("click",()=>{
      resellerAccountPager.page=Math.max(
        1,
        resellerAccountPager.page-1
      );
      renderAccounts();
    });

  $("[data-reseller-page-action='next']",root)
    ?.addEventListener("click",()=>{
      resellerAccountPager.page=Math.min(
        totalPages,
        resellerAccountPager.page+1
      );
      renderAccounts();
    });
}

function renderAccounts(){
  const rows=resellerFilteredAccounts();
  const totalPages=Math.max(
    1,
    Math.ceil(rows.length/resellerAccountPager.pageSize)
  );

  resellerAccountPager.page=Math.min(
    resellerAccountPager.page,
    totalPages
  );

  const start=
    (resellerAccountPager.page-1)*
    resellerAccountPager.pageSize;

  const visibleRows=rows.slice(
    start,
    start+resellerAccountPager.pageSize
  );

  $("#accountsTable").innerHTML=visibleRows.length
    ?visibleRows.map(account=>{
      const assignment=assignmentFor(account);

      const action=`
        <div class="action-group">
          <button
            class="action-button yellow"
            data-edit-my-date="${account.id}"
          >
            Editar
          </button>
          <button
            class="action-button cyan"
            data-assign="${account.id}"
          >
            Cambiar propietario
          </button>
        </div>
      `;

      return `
        <tr>
          <td>${serviceBadge(account.service)}</td>
          <td><strong>${escapeHtml(account.current_email)}</strong></td>
          <td>${escapeHtml(account.country||"Sin configurar")}</td>
          <td>${escapeHtml(account.account_type||"Cuenta completa")}</td>
          <td>${escapeHtml(target(account))}</td>
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
          <td>${action}</td>
        </tr>
      `;
    }).join("")
    :`<tr>
        <td colspan="9" class="empty-cell">
          No existen cuentas visibles.
        </td>
      </tr>`;

  const from=rows.length?start+1:0;
  const to=Math.min(start+visibleRows.length,rows.length);

  $("#resellerAccountsCount").textContent=
    `Mostrando ${from}–${to} de ${rows.length} cuentas`;

  renderResellerAccountPagination(rows.length);

  $$("[data-edit-my-date]").forEach(button=>{
    button.onclick=()=>editMyAccountDateModal(
      button.dataset.editMyDate
    );
  });

  $$("[data-assign]").forEach(button=>{
    button.onclick=()=>assignAccountModal(button.dataset.assign);
  });
}

function exportResellerWorkbook(rows,fileName){
  const headers=[
    "Servicio",
    "Cuenta",
    "País",
    "Tipo",
    "Distribuidor",
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
      "Mis cuentas"
    );

    window.XLSX.writeFile(workbook,fileName);
    return;
  }

  const csv=[
    headers,
    ...rows.map(row=>headers.map(header=>row[header]))
  ].map(row=>
    row.map(value=>
      `"${String(value??"").replaceAll('"','""')}"`
    ).join(",")
  ).join("\n");

  const blob=new Blob(["\ufeff"+csv],{
    type:"text/csv;charset=utf-8"
  });

  const link=document.createElement("a");
  link.href=URL.createObjectURL(blob);
  link.download=fileName.replace(/\.xlsx$/i,".csv");
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportResellerAccountsToExcel(){
  const visibleAccounts=state.accounts;

  const rows=visibleAccounts.map(account=>{
    const assignment=assignmentFor(account);

    return {
      "Servicio":serviceLabel(account.service),
      "Cuenta":account.current_email,
      "País":account.country||"Sin configurar",
      "Tipo":account.account_type||"Cuenta completa",
      "Distribuidor":target(account),
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
    toast(
      "No existen cuentas visibles en tu rama para exportar.",
      "error"
    );
    return;
  }

  exportResellerWorkbook(
    rows,
    `cuentas-de-mi-red-${new Date().toISOString().slice(0,10)}.xlsx`
  );

  toast(`${rows.length} cuentas exportadas.`);
}

async function loadTickets(){
  const {data,error}=await supabase.rpc("reseller_list_tickets_v26");
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
  return true;
}

function resellerFilteredTickets(){
  const query=($("#resellerTicketSearch")?.value||"")
    .trim()
    .toLowerCase();

  return state.tickets.filter(ticket=>`
    ${ticket.creator?.full_name||""}
    ${ticket.creator?.business_name||""}
    ${ticket.title||""}
    ${ticket.category||""}
    ${ticket.reported_email||ticket.account_email_snapshot||""}
  `.toLowerCase().includes(query));
}
function renderResellerTicketPagination(totalRows){
  const root=$("#resellerTicketsPagination"); if(!root)return;
  const totalPages=Math.max(1,Math.ceil(totalRows/resellerTicketPager.pageSize));
  resellerTicketPager.page=Math.min(Math.max(1,resellerTicketPager.page),totalPages);
  root.innerHTML=`<button class="pagination-button" data-rt-action="prev" ${resellerTicketPager.page===1?"disabled":""}>Anterior</button>${resellerPaginationTokens(resellerTicketPager.page,totalPages).map(token=>typeof token==="number"?`<button class="pagination-button ${token===resellerTicketPager.page?"active":""}" data-rt-page="${token}">${token}</button>`:`<span class="pagination-ellipsis">…</span>`).join("")}<button class="pagination-button" data-rt-action="next" ${resellerTicketPager.page===totalPages?"disabled":""}>Siguiente</button>`;
  $$("[data-rt-page]",root).forEach(button=>button.onclick=()=>{resellerTicketPager.page=Number(button.dataset.rtPage);renderTickets();});
  $("[data-rt-action='prev']",root)?.addEventListener("click",()=>{resellerTicketPager.page=Math.max(1,resellerTicketPager.page-1);renderTickets();});
  $("[data-rt-action='next']",root)?.addEventListener("click",()=>{resellerTicketPager.page=Math.min(totalPages,resellerTicketPager.page+1);renderTickets();});
}
function renderTickets(){
  const rows=resellerFilteredTickets();
  const totalPages=Math.max(1,Math.ceil(rows.length/resellerTicketPager.pageSize));
  resellerTicketPager.page=Math.min(resellerTicketPager.page,totalPages);
  const start=(resellerTicketPager.page-1)*resellerTicketPager.pageSize;
  const visible=rows.slice(start,start+resellerTicketPager.pageSize);
  $("#ticketsTable").innerHTML=visible.length?visible.map(ticket=>`<tr><td>${escapeHtml(ticket.creator?.business_name||ticket.creator?.full_name||"—")}</td><td>${serviceBadge(ticket.service)}</td><td><strong>${escapeHtml(ticket.title)}</strong></td><td>${escapeHtml(ticket.category)}</td><td>${escapeHtml(ticket.reported_email||ticket.account_email_snapshot)}</td><td><span class="status-pill ${statusTone(ticket.status)}">${distributorTicketStatusLabel(ticket.status)}</span></td><td><button class="round-action" data-ticket="${ticket.id}">Ver</button></td></tr>`).join(""):`<tr><td colspan="7" class="empty-cell">No existen tickets.</td></tr>`;
  const from=rows.length?start+1:0,to=Math.min(start+visible.length,rows.length);
  $("#resellerTicketsCount").textContent=`Mostrando ${from}–${to} de ${rows.length} tickets`;
  renderResellerTicketPagination(rows.length);
  $$("[data-ticket]").forEach(button=>button.onclick=()=>openTicket(button.dataset.ticket));
}

async function loadHistory(){const {data,error}=await supabase.from("account_change_history").select("id,service,old_email,new_email,change_type,created_at,operator:performed_by(full_name)").order("created_at",{ascending:false});if(error)return toast(error.message,"error");state.history=data||[];$("#historyTable").innerHTML=state.history.length?state.history.map(h=>`<tr><td>${serviceBadge(h.service)}</td><td><div class="change-old">Anterior: ${escapeHtml(h.old_email)}</div><div class="change-new">Nueva: ${escapeHtml(h.new_email)}</div></td><td><span class="status-pill orange">${escapeHtml(h.change_type)}</span></td><td>${escapeHtml(h.operator?.full_name||"Sistema")}</td><td>${formatDate(h.created_at,true)}</td></tr>`).join(""):`<tr><td colspan="5" class="empty-cell">No existen cambios.</td></tr>`;}
async function loadContent(){
  const {data,error}=await supabase.rpc("list_published_content_v29");
  if(error){
    state.content=[];
    renderContent();
    return toast(error.message,"error");
  }
  state.content=data||[];
  renderContent();
}
function getYouTubeVideoId(url){
  const value=String(url||"").trim();

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

  return null;
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

function renderContent(){
  const contentGrid=$("#contentGrid");
  const featuredContent=$("#featuredContent");

  if(contentGrid){
    contentGrid.innerHTML=state.content.length
      ?state.content.map(item=>`
        <article class="content-card">
          <div
            class="content-cover"
            style="background-image:url('${escapeHtml(
              item.cover_url
              ||getYouTubeThumbnail(item.trailer_url)
              ||""
            )}')"
          >
            <span class="content-platform">
              ${serviceLabel(item.platform)}
            </span>

            <button
              class="play-button"
              data-trailer="${escapeHtml(item.trailer_url)}"
              data-title="${escapeHtml(item.title)}"
              data-synopsis="${escapeHtml(item.synopsis||"Sin sinopsis disponible.")}"
            >
              ▶
            </button>
          </div>

          <div class="content-info">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.synopsis)}</p>

            <small>
              ${escapeHtml(item.genre||"")}
              ${
                item.content_type
                  ?` · ${escapeHtml(item.content_type)}`
                  :""
              }
            </small>

            <span class="content-release-date">
              ${escapeHtml(contentReleaseLabel(item))}
            </span>
          </div>
        </article>
      `).join("")
      :`<div class="empty-gallery">
          No hay contenido publicado.
        </div>`;
  }

  if(featuredContent){
    featuredContent.innerHTML=
      state.content.slice(0,6).map(item=>`
        <button
          class="mini-content-card"
          data-trailer="${escapeHtml(item.trailer_url)}"
          data-title="${escapeHtml(item.title)}"
          data-synopsis="${escapeHtml(item.synopsis||"Sin sinopsis disponible.")}"
        >
          <span
            style="background-image:url('${escapeHtml(
              item.cover_url
              ||getYouTubeThumbnail(item.trailer_url)
              ||""
            )}')"
          ></span>

          <div class="mini-content-info">
            <strong>${escapeHtml(item.title)}</strong>

            <p class="mini-content-synopsis">
              ${escapeHtml(
                item.synopsis
                ||"Sin sinopsis disponible."
              )}
            </p>

            <small>
              ${escapeHtml(contentReleaseLabel(item))}
            </small>
          </div>
        </button>
      `).join("")
      ||`<div class="empty-state">
          No hay recomendaciones.
        </div>`;
  }

  $$("[data-trailer]").forEach(button=>{
    button.onclick=()=>trailerModal(
      button.dataset.title,
      button.dataset.trailer,
      button.dataset.synopsis
    );
  });
}
async function loadCountryDistributors(){
  const {data,error}=await supabase
    .from("country_distributors")
    .select("*")
    .eq("is_active",true)
    .order("country_name",{ascending:true});

  if(error){
    console.warn("No se pudo cargar el mapa de distribuidores:",error.message);
    state.countryDistributors=[];
    return false;
  }

  state.countryDistributors=data||[];
  return true;
}

async function loadHelpArticles(){
  const {data,error}=await supabase
    .from("help_articles")
    .select("*")
    .eq("status","published")
    .order("display_order",{ascending:true})
    .order("created_at",{ascending:false});

  if(error){
    toast(error.message,"error");
    state.helpArticles=[];
    state.countryDistributors=[];
    renderHelpPublic(currentHelpPublicFilter);
    return;
  }

  state.helpArticles=data||[];

  if(state.helpArticles.some(article=>article.show_country_map)){
    await loadCountryDistributors();
  }else{
    state.countryDistributors=[];
  }

  renderHelpPublic(currentHelpPublicFilter);
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

function safeHelpMediaUrl(value){
  const raw=String(value||"").trim();
  if(!raw)return "";

  try{
    const parsed=new URL(raw,window.location.href);
    return ["http:","https:"].includes(parsed.protocol)?parsed.href:"";
  }catch{
    return "";
  }
}

function youtubeEmbedUrl(url){
  const videoId=getYouTubeVideoId(url);
  return videoId?`https://www.youtube.com/embed/${videoId}?rel=0`:null;
}

function vimeoEmbedUrl(url){
  const value=String(url||"");
  const match=value.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return match?.[1]?`https://player.vimeo.com/video/${match[1]}`:null;
}

function isDirectHelpVideo(url){
  try{
    const pathname=new URL(url,window.location.href).pathname.toLowerCase();
    return /\.(mp4|webm|ogg|ogv|mov|m4v)$/.test(pathname);
  }catch{
    return false;
  }
}

function renderHelpVideo(url,title){
  const safeUrl=safeHelpMediaUrl(url);
  if(!safeUrl)return "";

  const embedUrl=youtubeEmbedUrl(safeUrl)||vimeoEmbedUrl(safeUrl);
  if(embedUrl){
    return `
      <div class="help-video-frame">
        <iframe
          src="${escapeHtml(embedUrl)}"
          title="${escapeHtml(title)}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
    `;
  }

  if(isDirectHelpVideo(safeUrl)){
    return `
      <video class="help-video-player" controls playsinline preload="metadata">
        <source src="${escapeHtml(safeUrl)}">
        Tu navegador no puede reproducir este video.
      </video>
    `;
  }

  return `<a class="btn secondary help-video-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Ver video explicativo</a>`;
}

let helpImageViewerKeyHandler=null;

function closeHelpImageViewer(){
  const viewer=$("#helpImageViewer");
  if(viewer)viewer.remove();

  if(helpImageViewerKeyHandler){
    document.removeEventListener("keydown",helpImageViewerKeyHandler);
    helpImageViewerKeyHandler=null;
  }

  document.body.classList.remove("help-lightbox-open");
}

function openHelpImageViewer(url,title){
  const safeUrl=safeHelpMediaUrl(url);
  if(!safeUrl)return;

  closeHelpImageViewer();

  const viewer=document.createElement("div");
  viewer.id="helpImageViewer";
  viewer.className="help-image-viewer";
  viewer.setAttribute("role","dialog");
  viewer.setAttribute("aria-modal","true");
  viewer.setAttribute("aria-label",title||"Imagen ampliada");

  const image=document.createElement("img");
  image.src=safeUrl;
  image.alt=title||"Imagen explicativa";

  const closeButton=document.createElement("button");
  closeButton.type="button";
  closeButton.className="help-image-viewer-close";
  closeButton.setAttribute("aria-label","Cerrar imagen");
  closeButton.textContent="×";

  viewer.append(image,closeButton);
  document.body.appendChild(viewer);
  document.body.classList.add("help-lightbox-open");

  closeButton.onclick=closeHelpImageViewer;
  viewer.onclick=event=>{
    if(event.target===viewer)closeHelpImageViewer();
  };

  helpImageViewerKeyHandler=event=>{
    if(event.key==="Escape")closeHelpImageViewer();
  };
  document.addEventListener("keydown",helpImageViewerKeyHandler);
}


function publicCountryMapMarker(row,articleId){
  const country=countryMapByCode(row.country_code)||{
    code:row.country_code,
    name:row.country_name,
    lat:Number(row.latitude||0),
    lng:Number(row.longitude||0)
  };
  const point=countryMapPoint(country);

  return `
    <button
      type="button"
      class="country-map-pin is-active"
      style="left:${point.left};top:${point.top}"
      data-public-country-code="${escapeHtml(row.country_code)}"
      data-country-info-target="countryMapInfo-${escapeHtml(articleId)}"
      aria-label="Ver distribuidor de ${escapeHtml(country.name||row.country_name)}"
      title="${escapeHtml(country.name||row.country_name)}"
    ><span></span></button>
  `;
}

function renderPublicCountryMap(article){
  const rows=state.countryDistributors.filter(row=>row.is_active!==false);
  return `
    <section class="country-map-public-module" aria-label="Distribuidores por país">
      <div class="country-map-public-heading">
        <div><small>RED INTERNACIONAL</small><strong>Selecciona un país con pin</strong></div>
        <span>${rows.length} ${rows.length===1?"país disponible":"países disponibles"}</span>
      </div>
      <div class="country-map-stage">
        <img src="./assets/world-map.svg" alt="Mapa mundial con todos los países">
        <div class="country-map-pin-layer">
          ${rows.map(row=>publicCountryMapMarker(row,article.id)).join("")}
        </div>
      </div>
      <div class="country-map-public-info" id="countryMapInfo-${escapeHtml(article.id)}">
        ${rows.length
          ?`<div class="country-map-info-placeholder">📍 Presiona un pin para ver el distribuidor oficial de ese país.</div>`
          :`<div class="country-map-info-placeholder">Todavía no existen distribuidores por país publicados.</div>`}
      </div>
    </section>
  `;
}

function renderCountryDistributorInfo(row){
  const digits=whatsappDigits(row.whatsapp);
  const href=digits
    ?`https://wa.me/${digits}?text=${encodeURIComponent(`Hola, deseo solicitar una cuenta de Centro Premium en ${row.country_name}.`)}`
    :"";

  return `
    <div class="country-map-contact-card">
      <span class="country-map-contact-flag">${countryFlagEmoji(row.country_code)}</span>
      <div class="country-map-contact-copy">
        <small>DISTRIBUIDOR OFICIAL · ${escapeHtml(row.country_name)}</small>
        <strong>${escapeHtml(row.distributor_name)}</strong>
        <p>WhatsApp: ${escapeHtml(row.whatsapp)}</p>
      </div>
      ${href?`<a class="btn country-map-whatsapp" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Contactar por WhatsApp</a>`:""}
    </div>
  `;
}

function bindPublicCountryMaps(){
  $$('[data-public-country-code]').forEach(button=>{
    button.onclick=()=>{
      const row=state.countryDistributors.find(
        item=>item.country_code===button.dataset.publicCountryCode
      );
      const target=document.getElementById(button.dataset.countryInfoTarget);
      if(!row||!target)return;

      const stage=button.closest(".country-map-stage");
      $$('[data-public-country-code]',stage).forEach(pin=>pin.classList.remove("is-selected"));
      button.classList.add("is-selected");
      target.innerHTML=renderCountryDistributorInfo(row);
      target.scrollIntoView({behavior:"smooth",block:"nearest"});
    };
  });
}

function renderHelpPublic(type=""){
  const root=$("#helpPublicGrid");
  if(!root)return;

  const rows=state.helpArticles.filter(article=>!type||article.article_type===type);

  root.innerHTML=rows.length?rows.map(article=>{
    const imageUrl=safeHelpMediaUrl(helpArticleImageUrl(article));
    const videoUrl=helpArticleVideoUrl(article);

    return `
      <article class="help-public-card">
        <button class="help-public-question" type="button" data-help-toggle="${article.id}">
          <span class="help-type-icon">${article.article_type==="faq"?"?":"▶"}</span>
          <span>
            <small>${article.article_type==="faq"?"PREGUNTA FRECUENTE":"CÓMO UTILIZAR"}</small>
            <strong>${escapeHtml(article.title)}</strong>
          </span>
          <b>＋</b>
        </button>

        <div class="help-public-answer" data-help-answer="${article.id}" hidden>
          <div class="help-answer-text">${escapeHtml(article.answer||"")}</div>
          ${article.detail?`<div class="help-detail">${escapeHtml(article.detail)}</div>`:""}
          <div class="help-media-stack">
            ${imageUrl?`
              <button
                class="help-image-button"
                type="button"
                data-help-image="${escapeHtml(imageUrl)}"
                data-help-image-title="${escapeHtml(article.title)}"
                aria-label="Ampliar imagen: ${escapeHtml(article.title)}"
              >
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(article.title)}">
                <span>⛶ Ampliar imagen</span>
              </button>
            `:""}
            ${videoUrl?renderHelpVideo(videoUrl,article.title):""}
          </div>
          ${article.show_country_map?renderPublicCountryMap(article):""}
        </div>
      </article>
    `;
  }).join(""):`<div class="empty-gallery">Administración todavía no publicó contenido de ayuda.</div>`;

  $$('[data-help-toggle]').forEach(button=>{
    button.onclick=()=>{
      const answer=$(`[data-help-answer="${button.dataset.helpToggle}"]`);
      const open=answer.hidden;
      answer.hidden=!open;
      button.classList.toggle("open",open);
      button.querySelector("b").textContent=open?"−":"＋";
    };
  });

  $$('[data-help-image]').forEach(button=>{
    button.onclick=()=>openHelpImageViewer(
      button.dataset.helpImage,
      button.dataset.helpImageTitle
    );
  });

  bindPublicCountryMaps();
}

async function loadParent(){const {data,error}=await supabase.rpc("get_my_parent_contact");if(error||!data?.[0]?.whatsapp){$("#parentWhatsappBtn").hidden=true;return;}state.parent=data[0];$("#parentWhatsappBtn").href=`https://wa.me/${state.parent.whatsapp}?text=${encodeURIComponent(`Hola ${state.parent.full_name}, soy ${state.profile.full_name}. Necesito ayuda con una cuenta.`)}`;}
async function loadMyNotifications(){
  try{
    state.notifications=await loadNotifications();
    updateNotificationBadge(state.notifications);
    renderDashboardNotifications();

    renderPersistentNotificationAlert(
      state.notifications,
      {
        onRead:loadMyNotifications,
        onOpen:openNotifications,
        onForward:forwardReceivedNotification
      }
    );

    maybeShowBrowserNotifications(
      state.notifications,
      state.profile
    );
  }catch{
    state.notifications=[];
    updateNotificationBadge([]);
    renderDashboardNotifications();
    renderPersistentNotificationAlert([]);
  }
}

function renderDashboardNotifications(){
  const root=$("#dashboardNotifications");
  if(!root)return;

  root.innerHTML=
    state.notifications.slice(0,5).map(item=>`
      <button
        class="stack-row ${item.read_at?"":"unread-row"}"
        data-open-notifications
      >
        <div>
          <strong>
            ${escapeHtml(
              item.notification?.title||"Notificación"
            )}
          </strong>

          <small>
            ${formatDate(
              item.notification?.created_at,
              true
            )}
          </small>
        </div>

        ${item.read_at
          ?""
          :`<span class="unread-dot"></span>`
        }
      </button>
    `).join("")
    ||`<div class="empty-state">
        No tienes notificaciones pendientes.
      </div>`;

  $$("[data-open-notifications]").forEach(
    button=>button.onclick=openNotifications
  );
}

async function openNotifications(){
  await showNotificationsModal(
    state.notifications,
    loadMyNotifications,
    forwardReceivedNotification
  );
}

async function forwardReceivedNotification(item){
  if(
    !item?.notification?.allow_forward
    ||item.forwarded_at
  ){
    toast(
      "Este aviso no permite reenvío o ya fue reenviado.",
      "error"
    );
    return;
  }

  if(!directDistributors().length){
    toast(
      "No tienes distribuidores directos para recibir el aviso.",
      "error"
    );
    return;
  }

  const modal=openModal({
    title:"Reenviar aviso a mi red",
    body:`
      <div class="notice-box">
        El aviso se enviará a todos tus distribuidores directos.
      </div>

      <div class="forward-notification-preview">
        <span class="eyebrow">AVISO ORIGINAL</span>
        <strong>
          ${escapeHtml(
            item.notification.title||"Notificación"
          )}
        </strong>
        <p>
          ${escapeHtml(item.notification.message||"")}
        </p>
      </div>

      <label class="notification-forward-control">
        <input id="allowNextForward" type="checkbox">
        <span>
          Permitir que ellos también puedan reenviarlo
          a su propia red.
        </span>
      </label>
    `,
    actions:`
      <button class="btn secondary modal-cancel">
        Cancelar
      </button>

      <button id="confirmForwardNotification" class="btn primary">
        Reenviar
      </button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmForwardNotification",modal.root).onclick=async()=>{
    const button=$("#confirmForwardNotification",modal.root);
    button.disabled=true;
    button.textContent="Reenviando...";

    try{
      const {data,error}=await supabase.rpc(
        "forward_notification_to_my_network",
        {
          p_recipient_id:item.id,
          p_allow_forward:
            $("#allowNextForward",modal.root).checked
        }
      );

      if(error)throw error;

      toast(
        `Aviso reenviado a ${data.recipients||0} distribuidor(es).`
      );

      modal.close();
      await loadMyNotifications();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Reenviar";
    }
  };
}
async function loadDashboardMetrics(){
  const {data,error}=await supabase.rpc(
    "reseller_dashboard_metrics_v26"
  );

  if(error){
    state.metrics=null;
    toast(
      `No se pudo cargar el resumen real: ${error.message}`,
      "error"
    );
    return false;
  }

  state.metrics=data||null;
  return true;
}

function renderDashboard(){
  const metrics=state.metrics||{};

  const availableForSale=Number(
    metrics.direct_accounts??
    state.accounts.filter(
      account=>
        account.current_reseller_id===state.profile.id
        &&account.current_client_id==null
        &&account.status!=="blocked"
    ).length
  );

  const pendingSupportTickets=Number(
    metrics.network_open_tickets??
    state.tickets.filter(
      ticket=>!["closed","resolved"].includes(ticket.status)
    ).length
  );

  const upcomingCollections=Number(
    metrics.expiring_accounts??
    state.assignments.filter(
      assignment=>
        assignment.status==="active"
        &&assignment.days_remaining>=0
        &&assignment.days_remaining<=3
    ).length
  );

  const setDashboardText=(selector,value)=>{
    const element=$(selector);
    if(element){
      element.textContent=String(value);
    }
  };

  setDashboardText(
    "#statAccounts",
    availableForSale
  );

  setDashboardText(
    "#statTickets",
    pendingSupportTickets
  );

  setDashboardText(
    "#statExpiring",
    upcomingCollections
  );

  const dashboardAccountsTable=
    $("#dashboardAccountsTable");

  if(dashboardAccountsTable){
    dashboardAccountsTable.innerHTML=
      state.accounts.slice(0,7).map(account=>{
      const assignment=assignmentFor(account);

      return `
        <tr>
          <td>${serviceBadge(account.service)}</td>
          <td>
            <strong>${escapeHtml(account.current_email)}</strong>
          </td>
          <td>
            ${escapeHtml(target(account))}
          </td>
          <td>${formatDate(assignment?.starts_on)}</td>
          <td>
            <span class="days-pill ${statusTone(
              assignment?.calculated_status
            )}">
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
        </tr>
      `;
      }).join("")
      ||`<tr>
          <td colspan="6" class="empty-cell">
            No tienes cuentas directamente asignadas.
          </td>
        </tr>`;
  }

  const upcomingPayments=$("#upcomingPayments");

  if(upcomingPayments){
    upcomingPayments.innerHTML=
      state.assignments
      .filter(assignment=>assignment.status==="active")
      .sort(
        (a,b)=>
          (a.days_remaining??999)
          -(b.days_remaining??999)
      )
      .slice(0,6)
      .map(assignment=>`
        <div class="stack-row">
          <div>
            <strong>${formatDate(assignment.expires_on)}</strong>
            <small>Próximo corte</small>
          </div>

          <span class="days-pill ${statusTone(
            assignment.calculated_status
          )}">
            ${assignment.days_remaining} días
          </span>
        </div>
      `).join("")
      ||`<div class="empty-state">
          No tienes cuentas próximas a vencer.
        </div>`;
  }

  renderContent();
}



function calculateCutoffDate(startsOn){
  if(!startsOn)return "—";

  const dateValue=new Date(`${startsOn}T00:00:00`);
  if(Number.isNaN(dateValue.getTime()))return "—";

  dateValue.setDate(dateValue.getDate()+30);

  return formatDate(dateValue.toISOString());
}

function branchOwnerOptionLabel(user){
  if(user.id===state.profile.id){
    return `${user.business_name||user.full_name||"Mi usuario"} (mi usuario)`;
  }

  const parent=user.parent_id===state.profile.id
    ?state.profile
    :state.network.find(item=>item.id===user.parent_id);

  const name=user.business_name||user.full_name||user.email||"Sin nombre";
  const parentName=parent?.business_name||parent?.full_name||"";

  return parentName?`${name} · depende de ${parentName}`:name;
}

function branchOwnerOptions(currentOwnerId){
  const rows=[
    {
      id:state.profile.id,
      full_name:state.profile.full_name,
      business_name:state.profile.business_name,
      email:state.profile.email,
      parent_id:state.profile.parent_id,
      status:"active"
    },
    ...state.network.filter(user=>user.status==="active")
  ];

  const uniqueRows=Array.from(
    new Map(rows.map(user=>[user.id,user])).values()
  );

  return uniqueRows.map(user=>`
    <option
      value="${escapeHtml(user.id)}"
      ${user.id===currentOwnerId?"selected":""}
    >
      ${escapeHtml(branchOwnerOptionLabel(user))}
    </option>
  `).join("");
}

function editMyAccountDateModal(id,onSaved=null){
  const account=state.accounts.find(item=>item.id===id);
  if(!account)return;

  const assignment=assignmentFor(account);
  const defaultStart=assignment?.starts_on||"";
  const currentOwnerId=account.current_reseller_id||state.profile.id;

  const modal=openModal({
    title:"Editar cuenta",
    body:`
      <div class="notice-box">
        Puedes cambiar el propietario únicamente dentro de tu propia rama.
        La fecha pertenece solamente a tu usuario y no modificará las fechas
        de tus superiores ni de tus subordinados.
      </div>

      <form id="editMyAccountDateForm" class="form-grid">
        <label class="full">
          <span>Cuenta</span>
          <input
            value="${escapeHtml(account.current_email)}"
            readonly
          >
        </label>

        <label>
          <span>País</span>
          <input
            value="${escapeHtml(account.country||"Sin configurar")}"
            readonly
          >
        </label>

        <label>
          <span>Propietario</span>
          <select name="distributor_id" required>
            ${branchOwnerOptions(currentOwnerId)}
          </select>
        </label>

        <label>
          <span>Fecha de venta / inicio</span>
          <input
            name="starts_on"
            type="date"
            value="${defaultStart}"
          >
        </label>

        <label>
          <span>Fecha de corte</span>
          <input
            id="myAccountCutoffPreview"
            value="${escapeHtml(calculateCutoffDate(defaultStart))}"
            readonly
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
      <button id="saveMyAccountDate" class="btn primary">
        Guardar cambios
      </button>
    `
  });

  const form=$("#editMyAccountDateForm",modal.root);
  const dateInput=form.elements.starts_on;
  const ownerInput=form.elements.distributor_id;
  const preview=$("#myAccountCutoffPreview",modal.root);

  dateInput.addEventListener("change",()=>{
    preview.value=calculateCutoffDate(dateInput.value);
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveMyAccountDate",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const selectedOwnerId=ownerInput.value;
    const selectedStart=dateInput.value||"";
    const ownerChanged=selectedOwnerId!==currentOwnerId;
    const dateChanged=selectedStart!==defaultStart;

    if(!ownerChanged&&!dateChanged){
      toast("No realizaste ningún cambio.");
      return;
    }

    const button=$("#saveMyAccountDate",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      let data;
      let error;

      if(ownerChanged){
        ({data,error}=await supabase.rpc(
          "reassign_account_hierarchical_v29",
          {
            p_account_id:id,
            p_owner_id:selectedOwnerId,
            p_starts_on:selectedStart||null
          }
        ));
      }else{
        ({data,error}=await supabase.rpc(
          "update_my_account_term_v29",
          {
            p_account_id:id,
            p_starts_on:selectedStart||null
          }
        ));
      }

      if(error)throw error;

      toast(
        data?.message||
        (ownerChanged
          ?"Propietario actualizado correctamente."
          :"Tu fecha fue actualizada correctamente.")
      );

      modal.close();
      await loadAccounts();

      if(typeof onSaved==="function"){
        onSaved();
      }
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Guardar cambios";
    }
  };
}

async function showNetworkUserAccounts(id){
  const user=state.network.find(item=>item.id===id);
  if(!user)return;

  const modal=openModal({
    title:`Cuentas de ${networkDisplayName(user)}`,
    extraWide:true,
    body:`
      <div class="notice-box">
        Aquí aparecen todas las cuentas que maneja esta rama, incluso las que
        actualmente están en sus subordinados. Cada cuenta aparece una vez.
      </div>
      <div id="networkBranchAccountsLoading" class="empty-state">
        Cargando cuentas de la rama...
      </div>
    `
  });

  try{
    const {data,error}=await supabase.rpc(
      "reseller_list_user_branch_accounts_v29",
      {p_distributor_id:id}
    );
    if(error)throw error;

    const allRows=data||[];
    let page=1;
    let pageSize=25;
    let search="";
    let service="";

    $("#networkBranchAccountsLoading",modal.root).outerHTML=`
      <section class="branch-accounts-browser">
        <div class="branch-account-controls">
          <input id="networkBranchSearch" class="search-control" placeholder="Buscar correo, propietario, país o tipo">
          <select id="networkBranchPageSize" class="page-size-select compact">
            <option value="25">25 por página</option>
            <option value="50">50 por página</option>
            <option value="100">100 por página</option>
          </select>
          <select id="networkBranchService">
            <option value="">Todas las plataformas</option>
            <option value="netflix">Netflix</option>
            <option value="spotify">Spotify</option>
          </select>
        </div>
        <div class="branch-account-summary">
          <strong id="networkBranchTotal"></strong>
          <span id="networkBranchRange"></span>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Servicio</th><th>Correo</th><th>País</th><th>Tipo</th>
              <th>Propietario</th><th>Fecha de corte</th>
              <th>Días restantes</th><th>Estado</th><th>Acciones</th>
            </tr></thead>
            <tbody id="networkBranchRows"></tbody>
          </table>
        </div>
        <div id="networkBranchPagination" class="pagination"></div>
      </section>
    `;

    const ownerPath=account=>{
      const owner=account.reseller_business_name||account.reseller_full_name||"Sin distribuidor";
      const parent=account.parent_business_name||account.parent_full_name||"";
      return parent?`${owner} / ${parent}`:owner;
    };

    const render=()=>{
      const query=search.trim().toLowerCase();
      const filtered=allRows.filter(account=>{
        if(service&&String(account.service).toLowerCase()!==service)return false;
        if(!query)return true;
        return [account.current_email,account.country,account.account_type,ownerPath(account)]
          .some(value=>String(value||"").toLowerCase().includes(query));
      });
      const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
      page=Math.min(Math.max(1,page),totalPages);
      const start=(page-1)*pageSize;
      const visible=filtered.slice(start,start+pageSize);

      $("#networkBranchRows",modal.root).innerHTML=visible.length
        ?visible.map(account=>`<tr>
          <td>${serviceBadge(account.service)}</td>
          <td><strong>${escapeHtml(account.current_email)}</strong></td>
          <td>${escapeHtml(account.country||"Sin configurar")}</td>
          <td>${escapeHtml(account.account_type||"Cuenta completa")}</td>
          <td>${escapeHtml(ownerPath(account))}</td>
          <td>${formatDate(account.expires_on)}</td>
          <td><span class="days-pill ${statusTone(account.calculated_status)}">${account.days_remaining??"—"}</span></td>
          <td><span class="status-pill ${statusTone(account.calculated_status||account.status)}">${statusLabel(account.calculated_status||account.status)}</span></td>
          <td><button class="action-button yellow" data-network-account-edit="${account.id}">Editar</button></td>
        </tr>`).join("")
        :`<tr><td colspan="9" class="empty-cell">No existen cuentas con estos filtros.</td></tr>`;

      $("#networkBranchTotal",modal.root).textContent=
        service?`Total ${serviceLabel(service)}: ${filtered.length}`:`Total de cuentas: ${filtered.length}`;
      const from=filtered.length?start+1:0;
      const to=Math.min(start+visible.length,filtered.length);
      $("#networkBranchRange",modal.root).textContent=`Mostrando ${from}–${to} de ${filtered.length}`;

      const pagination=$("#networkBranchPagination",modal.root);
      pagination.innerHTML=`
        <button class="pagination-button" data-network-prev ${page===1?"disabled":""}>Anterior</button>
        <span class="pagination-current">Página ${page} de ${totalPages}</span>
        <button class="pagination-button" data-network-next ${page===totalPages?"disabled":""}>Siguiente</button>
      `;
      $("[data-network-prev]",pagination)?.addEventListener("click",()=>{page-=1;render();});
      $("[data-network-next]",pagination)?.addEventListener("click",()=>{page+=1;render();});
      $$('[data-network-account-edit]',modal.root).forEach(button=>{
        button.onclick=()=>{
          modal.close();
          assignAccountModal(button.dataset.networkAccountEdit);
        };
      });
    };

    $("#networkBranchSearch",modal.root).addEventListener("input",event=>{search=event.target.value;page=1;render();});
    $("#networkBranchService",modal.root).addEventListener("change",event=>{service=event.target.value;page=1;render();});
    $("#networkBranchPageSize",modal.root).addEventListener("change",event=>{pageSize=Number(event.target.value)||25;page=1;render();});
    render();
  }catch(error){
    $("#networkBranchAccountsLoading",modal.root).innerHTML=`
      <div class="danger-notice">${escapeHtml(error.message)}</div>
    `;
  }
}

function bulkAssignNetworkModal(id){
  const user=state.network.find(item=>item.id===id);
  if(!user||user.parent_id!==state.profile.id){
    toast("Solo puedes asignar en bloque a distribuidores creados directamente por ti.","error");
    return;
  }

  const modal=openModal({
    title:`Asignar o transferir cuentas a ${networkDisplayName(user)}`,
    body:`
      <div class="notice-box">
        Puedes pegar cuentas que actualmente estén a tu nombre o dentro de tu
        propia rama. Si ya tienen otro propietario de tu rama, serán transferidas.
      </div>
      <form id="networkBulkAssignForm" class="form-grid">
        <label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label>
        <label><span>Mi fecha de venta</span><input name="starts_on" type="date"><small class="field-help">Opcional. No modifica fechas de otros usuarios.</small></label>
        <label class="full"><span>Correos</span><textarea name="emails" rows="12" required></textarea></label>
        <div id="networkAssignCounter" class="counter-note full">0 correos detectados</div>
      </form>
    `,
    actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="networkAssignAccounts" class="btn primary">Asignar cuentas</button>`
  });

  const form=$("#networkBulkAssignForm",modal.root);
  const textarea=form.elements.emails;
  textarea.oninput=()=>{
    $("#networkAssignCounter",modal.root).textContent=`${parseEmailBlock(textarea.value).length} correos detectados`;
  };
  $(".modal-cancel",modal.root).onclick=modal.close;
  $("#networkAssignAccounts",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#networkAssignAccounts",modal.root);
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
      await loadAccounts();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Asignar cuentas";
    }
  };
}

function editDirectDistributorModal(id){
  const user=state.network.find(item=>item.id===id);

  if(!user||user.parent_id!==state.profile.id){
    toast(
      "Solo puedes editar distribuidores creados directamente por ti.",
      "error"
    );
    return;
  }

  const modal=openModal({
    title:"Editar distribuidor",
    body:`
      <form id="editDirectDistributorForm" class="form-grid">
        <label>
          <span>Nombre completo</span>
          <input
            name="full_name"
            value="${escapeHtml(user.full_name||"")}"
            required
          >
        </label>

        <label>
          <span>Nombre comercial</span>
          <input
            name="business_name"
            value="${escapeHtml(user.business_name||"")}"
          >
        </label>

        <label>
          <span>Correo electrónico</span>
          <input
            name="email"
            type="email"
            value="${escapeHtml(user.email||"")}"
            required
          >
        </label>

        <label>
          <span>WhatsApp</span>
          <input
            name="whatsapp"
            value="${escapeHtml(user.whatsapp||"")}"
            required
          >
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
      <button id="saveDirectDistributor" class="btn primary">
        Guardar cambios
      </button>
    `
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveDirectDistributor",modal.root).onclick=async()=>{
    const form=$("#editDirectDistributorForm",modal.root);
    if(!form.reportValidity())return;

    const button=$("#saveDirectDistributor",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      const values=Object.fromEntries(
        new FormData(form).entries()
      );

      const result=await callUserManager({
        action:"update",
        user_id:id,
        role:"reseller",
        ...values
      });

      toast(result.message||"Distribuidor actualizado.");
      modal.close();
      await loadNetwork();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Guardar cambios";
    }
  };
}

function createDistributorModal(){const m=openModal({title:"Crear distribuidor",body:`<form id="createDistributorForm" class="form-grid"><label><span>Nombre completo</span><input name="full_name" required minlength="3"></label><label><span>Nombre comercial</span><input name="business_name"></label><label><span>Correo electrónico</span><input name="email" type="email" required></label><label><span>WhatsApp</span><input name="whatsapp" required></label><label class="full"><span>Contraseña</span><input name="password" type="password" minlength="8" required></label></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveDistributor" class="btn primary">Crear distribuidor</button>`});$(".modal-cancel",m.root).onclick=m.close;$("#saveDistributor",m.root).onclick=async()=>{const f=$("#createDistributorForm",m.root);if(!f.reportValidity())return;try{const r=await callUserManager({action:"create",...Object.fromEntries(new FormData(f).entries()),role:"reseller"});toast(r.message);m.close();await loadNetwork();}catch(e){toast(e.message,"error");}};}
function bulkUpdateAccountDatesModal(){
  const modal=openModal({
    title:"Actualizar cuentas en lote",
    body:`
      <div class="notice-box">
        Solo se actualizará tu propia fecha para cada cuenta.
        Las fechas de superiores y subordinados no se modificarán.
      </div>

      <form id="bulkUpdateDatesForm" class="form-grid">
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

        <div id="bulkUpdateCounter" class="counter-note">
          0 cuentas detectadas
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="confirmBulkUpdateDates" class="btn primary">
        Actualizar cuentas
      </button>
    `
  });

  const form=$("#bulkUpdateDatesForm",modal.root);
  const textarea=form.elements.emails;

  const parseLines=value=>[
    ...new Set(
      String(value||"")
        .split(/\r?\n|,|;/)
        .map(item=>item.trim().toLowerCase())
        .filter(Boolean)
    )
  ];

  textarea.addEventListener("input",()=>{
    const count=parseLines(textarea.value).length;
    $("#bulkUpdateCounter",modal.root).textContent=
      `${count} ${count===1?"cuenta detectada":"cuentas detectadas"}`;
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmBulkUpdateDates",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const emails=parseLines(values.emails);
    const button=$("#confirmBulkUpdateDates",modal.root);

    if(!emails.length){
      toast("Coloca al menos una cuenta.","error");
      return;
    }

    button.disabled=true;
    button.textContent="Actualizando...";

    try{
      const {data,error}=await supabase.rpc(
        "bulk_update_my_account_terms_v29",
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
      await loadAccounts();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Actualizar cuentas";
    }
  };
}

function assignAccountModal(id){
  const account=state.accounts.find(item=>item.id===id);
  if(!account)return;

  const allowedUsers=[
    {
      id:state.profile.id,
      full_name:state.profile.full_name,
      business_name:state.profile.business_name,
      parent_id:state.profile.parent_id
    },
    ...state.network.filter(user=>user.status==="active")
  ];

  const modal=openModal({
    title:"Cambiar propietario",
    body:`
      <div class="notice-box">
        Puedes mover esta cuenta únicamente dentro de tu propia rama.
        La fecha es opcional y pertenece solo a tu usuario.
      </div>

      <form id="assignForm" class="form-grid">
        <label class="full">
          <span>Cuenta</span>
          <input value="${escapeHtml(account.current_email)}" readonly>
        </label>

        <label class="full">
          <span>Nuevo propietario</span>
          <select name="distributor_id" required>
            ${allowedUsers.map(user=>`
              <option
                value="${user.id}"
                ${user.id===account.current_reseller_id?"selected":""}
              >
                ${escapeHtml(
                  (user.business_name||user.full_name)+
                  (user.id===state.profile.id?" (mi usuario)":"")
                )}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          <span>Mi fecha de venta</span>
          <input name="starts_on" type="date">
          <small class="field-help">
            Opcional. No modifica la fecha de ningún otro usuario.
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
      <button id="confirmAssign" class="btn primary">Guardar</button>
    `
  });

  const form=$("#assignForm",modal.root);
  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmAssign",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#confirmAssign",modal.root);

    if(
      values.distributor_id===account.current_reseller_id &&
      !values.starts_on
    ){
      toast("La cuenta ya pertenece a ese usuario. No hay cambios por guardar.");
      modal.close();
      return;
    }

    button.disabled=true;
    button.textContent="Guardando...";

    try{
      const {data,error}=await supabase.rpc(
        "reassign_account_hierarchical_v29",
        {
          p_account_id:id,
          p_owner_id:values.distributor_id,
          p_starts_on:values.starts_on||null
        }
      );

      if(error)throw error;

      toast(data.message);
      modal.close();
      await loadAccounts();
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Guardar";
    }
  };
}

function createTicketModal(){const m=openModal({title:"Crear ticket",body:`<form id="createTicketForm" class="form-grid"><label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label><label><span>Categoría</span><select name="category"><option>Caída</option><option>Falla</option><option>Restablecer contraseña</option><option>Contraseña incorrecta</option></select></label><label class="full"><span>Correo de la cuenta</span><input name="reported_email" type="email" autocomplete="off" placeholder="Escribe el correo completo" required></label><label class="full"><span>Título: ¿qué error tiene?</span><input name="title" required></label><label class="full"><span>Descripción adicional</span><textarea name="description"></textarea></label></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveTicket" class="btn primary">Crear ticket</button>`});const f=$("#createTicketForm",m.root);$(".modal-cancel",m.root).onclick=m.close;$("#saveTicket",m.root).onclick=async()=>{if(!f.reportValidity())return;const v=Object.fromEntries(new FormData(f).entries());try{const {data,error}=await supabase.rpc("create_support_ticket_v29",{p_service:v.service,p_reported_email:v.reported_email.trim().toLowerCase(),p_title:v.title,p_category:v.category,p_description:v.description||v.title});if(error)throw error;toast(data.message);m.close();await loadTickets();}catch(e){toast(e.message,"error");}};}
function renderDistributorTicketMessage(message){
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

async function openTicket(id){
  const ticket=state.tickets.find(item=>item.id===id);
  if(!ticket)return;

  const {data:messageRows,error}=await supabase.rpc(
    "reseller_list_ticket_messages_v26",
    {p_ticket_id:id}
  );

  const messages=(messageRows||[]).map(message=>({
    ...message,
    author:{full_name:message.author_full_name}
  }));

  if(error){
    toast(error.message,"error");
    return;
  }

  const isClosed=["closed","resolved"].includes(ticket.status);

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
          ${distributorTicketStatusLabel(ticket.status)}
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
                    ?"SOPORTE"
                    :(message.author?.full_name||"Usuario")
                )}
              </strong>
              <small>${formatDate(message.created_at,true)}</small>
            </header>

            ${renderDistributorTicketMessage(message.message)}
          </article>
        `).join("")||`<div class="empty-state">Sin mensajes.</div>`}
      </div>

      ${isClosed
        ?`<div class="ticket-closed-notice">
            Este caso fue cerrado por soporte.
          </div>`
        :`<form id="ticketReplyForm" class="reply-form distributor-reply">
            <textarea
              name="message"
              required
              placeholder="Agregar información para soporte"
            ></textarea>
            <button class="btn primary">Enviar mensaje</button>
          </form>`
      }
    `
  });

  $("#ticketReplyForm",modal.root)?.addEventListener(
    "submit",
    async event=>{
      event.preventDefault();
      const message=new FormData(event.currentTarget)
        .get("message")
        .trim();

      try{
        const {error}=await supabase
          .from("ticket_messages")
          .insert({
            ticket_id:id,
            author_id:state.profile.id,
            message,
            is_system:false
          });

        if(error)throw error;

        toast("Mensaje enviado.");
        modal.close();
        await loadTickets();
      }catch(error){
        toast(error.message,"error");
      }
    }
  );
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
function previewAvatar(e){
  const file=e.target.files?.[0];
  const saveButton=$("#saveProfilePhoto");

  if(!file){
    if(saveButton)saveButton.disabled=true;
    return;
  }

  if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
    e.target.value="";
    if(saveButton)saveButton.disabled=true;
    toast("Selecciona una imagen JPG, PNG o WEBP.","error");
    return;
  }

  const maximumSize=5*1024*1024;

  if(file.size>maximumSize){
    e.target.value="";
    if(saveButton)saveButton.disabled=true;
    toast("La imagen no puede superar los 5 MB.","error");
    return;
  }

  $("#profileAvatarPreview").src=URL.createObjectURL(file);
  $("#profileAvatarPreview").hidden=false;
  $("#profileAvatarFallback").hidden=true;

  if(saveButton)saveButton.disabled=false;
}

async function saveProfilePhoto(){
  const fileInput=$("#profileAvatarFile");
  const file=fileInput?.files?.[0];
  const button=$("#saveProfilePhoto");

  if(!file){
    toast("Primero selecciona una fotografía.","error");
    return;
  }

  button.disabled=true;
  button.textContent="Guardando...";

  try{
    const avatarUrl=await uploadPublicImage(
      "avatars",
      file,
      state.profile.id
    );

    const {data,error}=await supabase.rpc("update_my_profile",{
      p_full_name:state.profile.full_name,
      p_business_name:state.profile.business_name,
      p_whatsapp:state.profile.whatsapp,
      p_avatar_url:avatarUrl
    });

    if(error)throw error;

    const updatedProfile=Array.isArray(data)?data[0]:data;

    state.profile={
      ...state.profile,
      ...(updatedProfile||{}),
      avatar_url:avatarUrl
    };

    fileInput.value="";
    applyProfile(state.profile);
    toast("Fotografía actualizada correctamente.");
  }catch(error){
    toast(error.message||"No se pudo actualizar la fotografía.","error");
  }finally{
    button.disabled=true;
    button.textContent="Guardar fotografía";
  }
}

async function saveSettings(){try{if($("#browserNotifications").checked&&"Notification"in window&&Notification.permission==="default"){const p=await Notification.requestPermission();if(p!=="granted")$("#browserNotifications").checked=false;}const {data,error}=await supabase.rpc("set_my_notification_preferences",{p_in_app:$("#inAppNotifications").checked,p_browser:$("#browserNotifications").checked});if(error)throw error;state.profile.notification_settings=data;toast("Configuración guardada.");}catch(e){toast(e.message,"error");}}


let silentPanelSyncChannel=null;
let silentPanelSyncTimers=new Map();
let silentGeneralSyncInterval=null;
let silentAccountsSyncInterval=null;
let silentPanelVisibilityHandler=null;
let accountsSyncToken=null;
let accountsSyncTokenReady=false;
let accountsSyncCheckRunning=false;

function activeSectionName(){
  return document.querySelector(".page-section.active")?.id?.replace("section-","")||"dashboard";
}

function scheduleSilentSync(key,task,{showLoaderWhenActive=false,activeSection=""}={}){
  window.clearTimeout(silentPanelSyncTimers.get(key));
  silentPanelSyncTimers.set(key,window.setTimeout(async()=>{
    try{
      if(showLoaderWhenActive&&activeSectionName()===activeSection){
        const {showPageLoader,hidePageLoader}=await import("./core-6.9.19.js");
        showPageLoader("Actualizando información…");
        try{await task();}finally{hidePageLoader();}
      }else{
        await task();
      }
    }catch(error){
      console.warn(`Sincronización silenciosa ${key}:`,error);
    }
  },250));
}

async function readAccountsSyncToken(){
  const {data,error}=await supabase.rpc(
    "reseller_accounts_sync_token_v44"
  );

  if(error)throw error;
  return String(data||"");
}

async function refreshAccountsFromExternalChange(){
  const loaded=await loadAccounts();

  if(!loaded)return false;

  try{
    accountsSyncToken=await readAccountsSyncToken();
    accountsSyncTokenReady=true;
  }catch(error){
    console.warn("No se pudo actualizar la huella de cuentas:",error);
  }

  return true;
}

async function checkAccountsSyncToken(){
  if(accountsSyncCheckRunning||document.visibilityState!=="visible"){
    return;
  }

  accountsSyncCheckRunning=true;

  try{
    const nextToken=await readAccountsSyncToken();

    if(!accountsSyncTokenReady){
      accountsSyncToken=nextToken;
      accountsSyncTokenReady=true;
      return;
    }

    if(nextToken===accountsSyncToken){
      return;
    }

    scheduleSilentSync(
      "accounts-token",
      refreshAccountsFromExternalChange,
      {
        showLoaderWhenActive:true,
        activeSection:"accounts"
      }
    );
  }catch(error){
    console.warn("Comprobación silenciosa de cuentas:",error);
  }finally{
    accountsSyncCheckRunning=false;
  }
}

function stopSilentPanelSync(){
  if(silentPanelSyncChannel){
    supabase.removeChannel(silentPanelSyncChannel);
    silentPanelSyncChannel=null;
  }

  window.clearInterval(silentGeneralSyncInterval);
  window.clearInterval(silentAccountsSyncInterval);
  silentGeneralSyncInterval=null;
  silentAccountsSyncInterval=null;

  if(silentPanelVisibilityHandler){
    document.removeEventListener(
      "visibilitychange",
      silentPanelVisibilityHandler
    );
    silentPanelVisibilityHandler=null;
  }
}

function startSilentPanelSync(userId){
  stopSilentPanelSync();
  accountsSyncToken=null;
  accountsSyncTokenReady=false;

  silentPanelSyncChannel=supabase
    .channel(`panel-sync-${userId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      {event:"*",schema:"public",table:"service_catalog"},
      ()=>scheduleSilentSync(
        "services",
        loadServiceCatalog,
        {showLoaderWhenActive:true,activeSection:"services"}
      )
    )
    .on(
      "postgres_changes",
      {event:"*",schema:"public",table:"panel_settings"},
      ()=>scheduleSilentSync("brand",loadPanelSettings)
    )
    .on(
      "postgres_changes",
      {event:"*",schema:"public",table:"entertainment_content"},
      ()=>scheduleSilentSync(
        "content",
        loadContent,
        {showLoaderWhenActive:true,activeSection:"dashboard"}
      )
    )
    .on(
      "postgres_changes",
      {event:"*",schema:"public",table:"help_articles"},
      ()=>scheduleSilentSync(
        "help-articles",
        loadHelpArticles,
        {showLoaderWhenActive:false}
      )
    )
    .on(
      "postgres_changes",
      {event:"*",schema:"public",table:"country_distributors"},
      ()=>scheduleSilentSync(
        "country-map",
        async()=>{
          await loadCountryDistributors();
          renderHelpPublic(currentHelpPublicFilter);
        },
        {showLoaderWhenActive:false}
      )
    )
    .on(
      "postgres_changes",
      {
        event:"*",
        schema:"public",
        table:"account_assignments",
        filter:`buyer_reseller_id=eq.${userId}`
      },
      ()=>scheduleSilentSync(
        "accounts-realtime",
        refreshAccountsFromExternalChange,
        {showLoaderWhenActive:true,activeSection:"accounts"}
      )
    )
    .subscribe(status=>{
      if(status==="SUBSCRIBED"){
        checkAccountsSyncToken();
        return;
      }

      if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)){
        console.warn(
          "Realtime no está disponible; se mantiene la sincronización de respaldo:",
          status
        );
      }
    });

  // Respaldo de cuentas: consulta una huella ligera cada 8 segundos.
  // Solo recarga la lista cuando realmente detecta un cambio.
  silentAccountsSyncInterval=window.setInterval(
    checkAccountsSyncToken,
    8000
  );

  // Cambios generales que no requieren refresco inmediato.
  silentGeneralSyncInterval=window.setInterval(()=>{
    if(document.visibilityState!=="visible")return;
    scheduleSilentSync(
      "services-poll",
      loadServiceCatalog,
      {showLoaderWhenActive:false}
    );
    scheduleSilentSync(
      "brand-poll",
      loadPanelSettings,
      {showLoaderWhenActive:false}
    );
    scheduleSilentSync(
      "help-poll",
      loadHelpArticles,
      {showLoaderWhenActive:false}
    );
  },60000);

  silentPanelVisibilityHandler=()=>{
    if(document.visibilityState!=="visible")return;
    checkAccountsSyncToken();
  };

  document.addEventListener(
    "visibilitychange",
    silentPanelVisibilityHandler
  );

  checkAccountsSyncToken();
}

async function loadPanelSettings(){
  const {data,error}=await supabase.rpc("get_panel_settings_v29");
  if(error){
    console.warn(error.message);
    return false;
  }

  state.panelSettings=data||{
    brand_name:"Centro Premium",
    logo_url:null
  };

  const name=state.panelSettings.brand_name||"Centro Premium";
  const logo=state.panelSettings.logo_url||"";

  $("#panelBrandName")&&( $("#panelBrandName").textContent=name );
  document.title=`Distribuidores · ${name}`;

  const mark=$("#panelBrandMark");
  if(mark){
    mark.innerHTML=logo
      ?`<img src="${escapeHtml(logo)}" alt="">`
      :escapeHtml(name[0]||"P");
  }

  return true;
}

async function loadServiceCatalog(){
  const {data,error}=await supabase.rpc(
    "list_service_catalog_v29"
  );

  if(error){
    state.services=[];
    return false;
  }

  state.services=(data||[]).filter(service=>service.is_active);
  renderResellerServiceCatalog();
  return true;
}

function resellerServiceVisual(service){
  if(service.logo_url){
    return `<img src="${escapeHtml(service.logo_url)}" alt="">`;
  }
  if(service.slug==="netflix")return "N";
  if(service.slug==="spotify")return "●";
  return escapeHtml((service.name||"S")[0].toUpperCase());
}

function renderResellerServiceCatalog(){
  const root=$("#resellerServiceCatalogGrid");
  if(!root)return;

  root.innerHTML=state.services.map(service=>`
    <button
      class="launch-card service-catalog-card service-${escapeHtml(service.slug)}"
      data-reseller-service="${service.id}"
      style="--service-color:${escapeHtml(service.color||'#4a78ff')}"
    >
      <div class="launch-logo">${resellerServiceVisual(service)}</div>
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
  `).join("");

  $$("[data-reseller-service]",root).forEach(button=>{
    button.onclick=()=>{
      const service=state.services.find(
        item=>item.id===button.dataset.resellerService
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
