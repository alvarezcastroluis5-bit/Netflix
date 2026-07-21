import {supabase,$,$$,escapeHtml,formatDate,statusLabel,statusTone,serviceLabel,serviceBadge,toast,openModal,showSection,wireNavigation,setupLogin,callUserManager,callPublicUserManager,uploadPublicImage,loadNotifications,updateNotificationBadge,showNotificationsModal,renderPersistentNotificationAlert,maybeShowBrowserNotifications,openNetflixIntegrated} from "./core.js?v=6.8";
const state={profile:null,network:[],accounts:[],assignments:[],tickets:[],history:[],content:[],notifications:[],helpArticles:[],parent:null,metrics:null};
const resellerAccountPager={page:1,pageSize:25};
const resellerTicketPager={page:1,pageSize:25};
bindPasswordRecovery();
setupLogin({allowedRoles:["reseller"],onAuthenticated:async({profile})=>{state.profile=profile;applyProfile(profile);wireNavigation(loadSection);bindActions();await loadAll();}});

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
            placeholder="59162212956"
            required
          >
          <small class="field-help">
            Escríbelo sin el signo +, espacios ni guiones.
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

      modal.close();

      $("#loginEmail").value=email;
      $("#loginPassword").value="";
      $("#loginPassword").focus();

      toast(
        result.message||
        "Contraseña actualizada. Ya puedes iniciar sesión."
      );
    }catch(error){
      toast(error.message,"error");
    }finally{
      button.disabled=false;
      button.textContent="Cambiar contraseña";
    }
  };
}

function bindActions(){
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
  $("#resellerNotificationForm")?.addEventListener(
    "submit",
    sendResellerNotification
  );
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
      renderHelpPublic(button.dataset.helpPublicFilter||"");
    });
  });
}

function applyProfile(p){
  const commercialName=
    String(p.business_name||"").trim()||
    String(p.full_name||"").trim()||
    "Distribuidor";

  $("#brandName").textContent=commercialName;
  $("#welcomeTitle").textContent=`¡Bienvenido, ${commercialName}!`;
  $("#profileBusinessName").textContent=commercialName;

  const initial=commercialName.charAt(0).toUpperCase()||"D";

  $("#dashboardAvatarFallback").textContent=initial;
  $("#profileAvatarFallback").textContent=initial;

  const dashboardAvatar=$("#dashboardAvatar");
  const dashboardFallback=$("#dashboardAvatarFallback");
  const profileAvatar=$("#profileAvatarPreview");
  const profileFallback=$("#profileAvatarFallback");

  if(p.avatar_url){
    dashboardAvatar.src=p.avatar_url;
    dashboardAvatar.hidden=false;
    dashboardFallback.hidden=true;

    profileAvatar.src=p.avatar_url;
    profileAvatar.hidden=false;
    profileFallback.hidden=true;
  }else{
    dashboardAvatar.removeAttribute("src");
    dashboardAvatar.hidden=true;
    dashboardFallback.hidden=false;

    profileAvatar.removeAttribute("src");
    profileAvatar.hidden=true;
    profileFallback.hidden=false;
  }

  const settings=p.notification_settings||{};
  $("#inAppNotifications").checked=settings.in_app!==false;
  $("#browserNotifications").checked=settings.browser===true;
}
async function loadAll(){await Promise.allSettled([loadNetwork(),loadAccounts(),loadTickets(),loadDashboardMetrics(),loadHistory(),loadContent(),loadHelpArticles(),loadParent(),loadMyNotifications()]);renderDashboard();}
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
  if(section==="content")await loadContent();if(section==="help")await loadHelpArticles();
}
const openNetflix=()=>openNetflixAccountValidation();

function openNetflixAccountValidation(){
  const actions=[
    {
      value:"restablecer_contrasena",
      label:"Restablecer contraseña"
    },
    {
      value:"codigo_sesion",
      label:"Código de sesión"
    },
    {
      value:"actualizar_hogar",
      label:"Actualizar hogar"
    },
    {
      value:"acceso_temporal",
      label:"Código de acceso temporal"
    },
    {
      value:"verificacion_6_digitos",
      label:"Código de verificación de 6 dígitos"
    }
  ];

  const modal=openModal({
    title:"Netflix · confirmar cuenta y acción",
    body:`
      <div class="netflix-account-validation">
        <div class="netflix-validation-icon">N</div>
        <div>
          <span class="eyebrow">CONTROL DE ACCESO</span>
          <h3>Confirma que la cuenta está actualmente a tu nombre</h3>
          <p>
            La validación se realizará nuevamente al autorizar la acción.
          </p>
        </div>
      </div>

      <form id="netflixAccountValidationForm" class="form-grid">
        <label class="full">
          <span>Correo de la cuenta Netflix</span>
          <input
            name="email"
            type="email"
            placeholder="correo@ejemplo.com"
            autocomplete="off"
            required
          >
        </label>

        <label class="full">
          <span>¿Qué acción requiere?</span>
          <select name="action" required>
            <option value="">Seleccionar acción</option>
            ${actions.map(action=>`
              <option value="${action.value}">
                ${action.label}
              </option>
            `).join("")}
          </select>
        </label>

        <div class="notice-box full">
          Solo se autorizará una cuenta Netflix activa cuyo propietario
          actual seas tú. La solicitud quedará registrada con fecha,
          cuenta, país y acción.
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="validateNetflixAccount" class="btn primary">
        Confirmar y continuar
      </button>
    `
  });

  const form=$("#netflixAccountValidationForm",modal.root);
  const button=$("#validateNetflixAccount",modal.root);

  $(".modal-cancel",modal.root).onclick=modal.close;

  const validate=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(
      new FormData(form).entries()
    );

    const email=values.email.trim().toLowerCase();
    const action=values.action;

    button.disabled=true;
    button.textContent="Validando...";

    try{
      const {data,error}=await supabase.rpc(
        "authorize_netflix_action_v27",
        {
          p_email:email,
          p_action:action
        }
      );

      if(error)throw error;

      if(!data?.allowed){
        throw new Error(
          "La cuenta no está actualmente a tu nombre."
        );
      }

      const selected=actions.find(
        item=>item.value===data.action
      );

      modal.close();

      openNetflixIntegrated({
        verifiedEmail:data.email||email,
        country:data.country||"Sin configurar",
        actionLabel:selected?.label||"Solicitud Netflix",
        requestId:data.request_id
      });
    }catch(error){
      toast(
        error.message||
        "No se pudo autorizar esta solicitud.",
        "error"
      );
      form.elements.email.select();
    }finally{
      button.disabled=false;
      button.textContent="Confirmar y continuar";
    }
  };

  button.onclick=validate;

  form.addEventListener("submit",event=>{
    event.preventDefault();
    validate();
  });
}

function showSpotifyComingSoon(){
  const modal=openModal({
    title:"Spotify",
    body:`
      <div class="spotify-coming-soon">
        <div class="spotify-coming-icon">
          <svg viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.58 14.43a.75.75 0 0 1-1.03.25c-2.82-1.72-6.38-2.11-10.57-1.16a.75.75 0 1 1-.33-1.46c4.58-1.04 8.51-.59 11.68 1.35.35.21.46.67.25 1.02Zm1.47-3.28a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.55-11.97-1.39a.94.94 0 1 1-.55-1.79c4.37-1.33 9.8-.69 13.5 1.58.44.27.58.85.31 1.29Zm.13-3.42C14.3 7.43 7.9 7.22 4.2 8.34a1.12 1.12 0 1 1-.65-2.14c4.25-1.29 11.32-1.04 15.77 1.6a1.12 1.12 0 0 1-1.14 1.93Z"/>
          </svg>
        </div>
        <span class="eyebrow">PRÓXIMAMENTE</span>
        <h3>Estamos trabajando para darte el servicio</h3>
        <p>
          La integración de Spotify estará disponible próximamente
          dentro de tu panel.
        </p>
      </div>
    `,
    actions:`<button class="btn primary modal-cancel">Entendido</button>`
  });

  $(".modal-cancel",modal.root).onclick=modal.close;
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

  if(!query)return state.network;

  return state.network.filter(user=>
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
      `Aviso enviado a ${data.recipients||0} distribuidor(es).`
    );

    form.reset();
    renderResellerRecipientList();
    updateResellerNotificationScope();
  }catch(error){
    toast(error.message,"error");
  }finally{
    button.disabled=false;
    button.textContent="Enviar aviso";
  }
}

async function loadAccounts(){
  const {data,error}=await supabase.rpc(
    "reseller_list_branch_accounts_v28"
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

      const canAssign=
        account.current_reseller_id===state.profile.id
        &&!account.current_client_id;

      const action=`
        <div class="action-group">
          <button
            class="action-button yellow"
            data-edit-my-date="${account.id}"
          >
            Editar fecha
          </button>

          ${canAssign?`
            <button
              class="action-button cyan"
              data-assign="${account.id}"
            >
              Asignar
            </button>
          `:""}
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
    $("#ticketBadge").textContent="0";
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
  $("#ticketBadge").textContent=state.tickets.filter(
    ticket=>!["closed","resolved"].includes(ticket.status)
  ).length;
  return true;
}

function resellerFilteredTickets(){
  const query=($("#resellerTicketSearch")?.value||"").toLowerCase();
  const service=$("#resellerTicketServiceFilter")?.value||"";
  const status=$("#resellerTicketStatusFilter")?.value||"";
  return state.tickets.filter(ticket=>`
    ${ticket.creator?.full_name||""} ${ticket.title||""} ${ticket.category||""}
    ${ticket.reported_email||ticket.account_email_snapshot||""}
  `.toLowerCase().includes(query)&&(!service||ticket.service===service)&&(!status||ticket.status===status));
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
async function loadContent(){const {data,error}=await supabase.from("entertainment_content").select("*").eq("status","published").order("display_order",{ascending:true});if(error)return toast(error.message,"error");state.content=data||[];renderContent();}
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
  $("#contentGrid").innerHTML=state.content.length
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
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.synopsis)}</p>
          <small>${escapeHtml(item.genre||"")}${item.content_type?` · ${escapeHtml(item.content_type)}`:""}</small>
          <span class="content-release-date">${escapeHtml(contentReleaseLabel(item))}</span>
        </div>
      </article>
    `).join("")
    :`<div class="empty-gallery">No hay contenido publicado.</div>`;

  $("#featuredContent").innerHTML=state.content.slice(0,6).map(item=>`
    <button
      class="mini-content-card"
      data-trailer="${escapeHtml(item.trailer_url)}"
      data-title="${escapeHtml(item.title)}"
    >
      <span
        style="background-image:url('${escapeHtml(item.cover_url||getYouTubeThumbnail(item.trailer_url)||"")}')"
      ></span>
      <div class="mini-content-info">
        <strong>${escapeHtml(item.title)}</strong>
        <p class="mini-content-synopsis">
          ${escapeHtml(item.synopsis||"Sin sinopsis disponible.")}
        </p>
        <small>${escapeHtml(contentReleaseLabel(item))}</small>
      </div>
    </button>
  `).join("")||`<div class="empty-state">No hay recomendaciones.</div>`;

  $$("[data-trailer]").forEach(button=>{
    button.onclick=()=>trailerModal(button.dataset.title,button.dataset.trailer);
  });
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
    renderHelpPublic();
    return;
  }

  state.helpArticles=data||[];
  renderHelpPublic();
}

function youtubeEmbedUrl(url){
  const videoId=getYouTubeVideoId(url);
  return videoId?`https://www.youtube.com/embed/${videoId}?rel=0`:null;
}

function renderHelpPublic(type=""){
  const root=$("#helpPublicGrid");
  if(!root)return;

  const rows=state.helpArticles.filter(article=>!type||article.article_type===type);

  root.innerHTML=rows.length?rows.map(article=>`
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
        <p>${escapeHtml(article.answer||"")}</p>
        ${article.detail?`<div class="help-detail">${escapeHtml(article.detail)}</div>`:""}
        ${article.media_type==="image"&&article.media_url?`<img src="${escapeHtml(article.media_url)}" alt="${escapeHtml(article.title)}">`:""}
        ${article.media_type==="video"&&article.media_url
          ?youtubeEmbedUrl(article.media_url)
            ?`<div class="help-video-frame"><iframe src="${escapeHtml(youtubeEmbedUrl(article.media_url))}" title="${escapeHtml(article.title)}" allowfullscreen></iframe></div>`
            :`<a class="btn secondary" href="${escapeHtml(article.media_url)}" target="_blank" rel="noopener noreferrer">Ver video</a>`
          :""
        }
      </div>
    </article>
  `).join(""):`<div class="empty-gallery">Administración todavía no publicó contenido de ayuda.</div>`;

  $$("[data-help-toggle]").forEach(button=>{
    button.onclick=()=>{
      const answer=$(`[data-help-answer="${button.dataset.helpToggle}"]`);
      const open=answer.hidden;
      answer.hidden=!open;
      button.classList.toggle("open",open);
      button.querySelector("b").textContent=open?"−":"＋";
    };
  });
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
  $("#dashboardNotifications").innerHTML=
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
        No tienes notificaciones.
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

  const directAccounts=state.accounts.length;

  const directNetwork=Number(
    metrics.direct_distributors??
    state.network.filter(
      user=>user.parent_id===state.profile.id
    ).length
  );

  const expiring=Number(
    metrics.expiring_accounts??
    state.assignments.filter(
      assignment=>
        assignment.status==="active"
        &&assignment.days_remaining>=0
        &&assignment.days_remaining<=3
    ).length
  );

  const networkTickets=Number(
    metrics.network_open_tickets??
    state.tickets.filter(
      ticket=>!["closed","resolved"].includes(ticket.status)
    ).length
  );

  $("#statNetwork").textContent=directNetwork;
  $("#statAccounts").textContent=directAccounts;
  $("#statExpiring").textContent=expiring;
  $("#statTickets").textContent=networkTickets;

  $("#dashboardAccountsTable").innerHTML=
    state.accounts.slice(0,7).map(account=>{
      const assignment=assignmentFor(account);

      return `
        <tr>
          <td>${serviceBadge(account.service)}</td>
          <td>
            <strong>${escapeHtml(account.current_email)}</strong>
          </td>
          <td>
            ${escapeHtml(
              state.profile.business_name||
              state.profile.full_name
            )}
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

  $("#upcomingPayments").innerHTML=
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

  renderDashboardNotifications();
}



function calculateCutoffDate(startsOn){
  if(!startsOn)return "—";

  const dateValue=new Date(`${startsOn}T00:00:00`);
  if(Number.isNaN(dateValue.getTime()))return "—";

  dateValue.setDate(dateValue.getDate()+30);

  return formatDate(dateValue.toISOString());
}

function editMyAccountDateModal(id,onSaved=null){
  const account=state.accounts.find(item=>item.id===id);
  if(!account)return;

  const assignment=assignmentFor(account);

  const defaultStart=
    assignment?.starts_on||
    new Date().toISOString().slice(0,10);

  const modal=openModal({
    title:"Editar mi fecha de la cuenta",
    body:`
      <div class="notice-box">
        Esta fecha pertenece solamente a tu usuario.
        No modificará la fecha de tus superiores ni la de tus subordinados.
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
          <span>Propietario actual</span>
          <input
            value="${escapeHtml(target(account))}"
            readonly
          >
        </label>

        <label>
          <span>Fecha de venta / inicio</span>
          <input
            name="starts_on"
            type="date"
            value="${defaultStart}"
            required
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
        Guardar fecha
      </button>
    `
  });

  const form=$("#editMyAccountDateForm",modal.root);
  const dateInput=form.elements.starts_on;
  const preview=$("#myAccountCutoffPreview",modal.root);

  dateInput.addEventListener("change",()=>{
    preview.value=calculateCutoffDate(dateInput.value);
  });

  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#saveMyAccountDate",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const button=$("#saveMyAccountDate",modal.root);
    button.disabled=true;
    button.textContent="Guardando...";

    try{
      const {data,error}=await supabase.rpc(
        "update_my_account_term_v28",
        {
          p_account_id:id,
          p_starts_on:dateInput.value
        }
      );

      if(error)throw error;

      toast(
        data.message||
        "Tu fecha fue actualizada correctamente."
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
      button.textContent="Guardar fecha";
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
        Aquí aparecen todas las cuentas que actualmente tiene este
        distribuidor y todos sus subordinados.
        La fecha de corte mostrada pertenece a tu propio usuario.
      </div>

      <div id="networkBranchAccountsLoading" class="empty-state">
        Cargando cuentas de la rama...
      </div>
    `
  });

  try{
    const {data,error}=await supabase.rpc(
      "reseller_list_user_branch_accounts_v28",
      {p_distributor_id:id}
    );

    if(error)throw error;

    const rows=data||[];

    $("#networkBranchAccountsLoading",modal.root).outerHTML=`
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
                "Sin distribuidor";

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
                    <button
                      class="action-button yellow"
                      data-network-account-date="${account.id}"
                    >
                      Editar fecha
                    </button>
                  </td>
                </tr>
              `;
            }).join("")
            :`<tr>
                <td colspan="9" class="empty-cell">
                  Este distribuidor no tiene cuentas en su rama.
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

    $$("[data-network-account-date]",modal.root).forEach(button=>{
      button.onclick=()=>{
        const accountId=button.dataset.networkAccountDate;
        editMyAccountDateModal(
          accountId,
          ()=>showNetworkUserAccounts(id)
        );
      };
    });
  }catch(error){
    $("#networkBranchAccountsLoading",modal.root).innerHTML=`
      <div class="danger-notice">
        ${escapeHtml(error.message)}
      </div>
    `;
  }
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

  if(
    account.current_reseller_id!==state.profile.id
    ||account.current_client_id
  ){
    toast(
      "No puedes reasignar una cuenta que ya pertenece a otro distribuidor.",
      "error"
    );
    return;
  }

  const directDistributors=state.network.filter(user=>
    user.parent_id===state.profile.id
    &&user.status==="active"
  );

  if(!directDistributors.length){
    toast(
      "Primero crea un distribuidor directo para poder asignarle la cuenta.",
      "error"
    );
    return;
  }

  const modal=openModal({
    title:"Asignar a un distribuidor",
    body:`
      <div class="notice-box">
        ${serviceLabel(account.service)} ·
        ${escapeHtml(account.current_email)} ·
        regla fija de 30 días.
      </div>

      <form id="assignForm" class="form-grid">
        <label class="full">
          <span>Distribuidor directo</span>
          <select name="distributor_id" required>
            ${directDistributors.map(user=>`
              <option value="${user.id}">
                ${escapeHtml(
                  user.business_name||
                  user.full_name
                )}
              </option>
            `).join("")}
          </select>
        </label>

        <label>
          <span>Fecha de inicio</span>
          <input
            name="starts_on"
            type="date"
            value="${new Date().toISOString().slice(0,10)}"
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
      <button id="confirmAssign" class="btn primary">Asignar</button>
    `
  });

  const form=$("#assignForm",modal.root);
  $(".modal-cancel",modal.root).onclick=modal.close;

  $("#confirmAssign",modal.root).onclick=async()=>{
    if(!form.reportValidity())return;

    const values=Object.fromEntries(new FormData(form).entries());
    const button=$("#confirmAssign",modal.root);
    button.disabled=true;
    button.textContent="Asignando...";

    try{
      const {data,error}=await supabase.rpc(
        "assign_account_to_reseller_v28",
        {
          p_account_id:id,
          p_buyer_reseller_id:values.distributor_id,
          p_starts_on:values.starts_on
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
      button.textContent="Asignar";
    }
  };
}

function createTicketModal(){const m=openModal({title:"Crear ticket",body:`<form id="createTicketForm" class="form-grid"><label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label><label><span>Categoría</span><select name="category"><option>Caída</option><option>Falla</option><option>Restablecer contraseña</option><option>Contraseña incorrecta</option></select></label><label class="full"><span>Correo de la cuenta</span><input name="reported_email" type="email" autocomplete="off" placeholder="Escribe el correo completo" required></label><label class="full"><span>Título: ¿qué error tiene?</span><input name="title" required></label><label class="full"><span>Descripción adicional</span><textarea name="description"></textarea></label></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveTicket" class="btn primary">Crear ticket</button>`});const f=$("#createTicketForm",m.root);$(".modal-cancel",m.root).onclick=m.close;$("#saveTicket",m.root).onclick=async()=>{if(!f.reportValidity())return;const v=Object.fromEntries(new FormData(f).entries());try{const {data,error}=await supabase.rpc("create_support_ticket_v2",{p_service:v.service,p_reported_email:v.reported_email.trim().toLowerCase(),p_title:v.title,p_category:v.category,p_description:v.description||v.title});if(error)throw error;toast(data.message);m.close();await loadTickets();}catch(e){toast(e.message,"error");}};}
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


function trailerModal(title,url){const id=String(url||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^?&/]+)/)?.[1];openModal({title,wide:true,body:id?`<iframe class="trailer-frame" src="https://www.youtube.com/embed/${encodeURIComponent(id)}" allowfullscreen></iframe>`:`<video class="trailer-frame" src="${escapeHtml(url)}" controls autoplay></video>`});}
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
