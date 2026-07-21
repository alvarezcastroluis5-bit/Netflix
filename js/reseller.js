import {supabase,$,$$,escapeHtml,formatDate,statusLabel,statusTone,serviceLabel,serviceBadge,toast,openModal,showSection,wireNavigation,setupLogin,callUserManager,callPublicUserManager,uploadPublicImage,loadNotifications,updateNotificationBadge,showNotificationsModal,maybeShowBrowserNotifications,openNetflixIntegrated} from "./core.js?v=4.5";
const state={profile:null,network:[],accounts:[],assignments:[],tickets:[],history:[],content:[],notifications:[],parent:null};
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
  $("#openBulkUpdateAccounts")?.addEventListener(
    "click",
    bulkUpdateAccountDatesModal
  );
  $("#openCreateTicket")?.addEventListener("click",createTicketModal);
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
  $("#accountSearch")?.addEventListener("input",renderAccounts);
  $("#accountServiceFilter")?.addEventListener("change",renderAccounts);
  $("#profileAvatarFile")?.addEventListener("change",previewAvatar);
  $("#saveProfilePhoto")?.addEventListener("click",saveProfilePhoto);
  $("#saveSettings")?.addEventListener("click",saveSettings);
  $("#notificationBell")?.addEventListener("click",openNotifications);
  $("#viewAllNotifications")?.addEventListener("click",openNotifications);
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
async function loadAll(){await Promise.allSettled([loadNetwork(),loadAccounts(),loadTickets(),loadHistory(),loadContent(),loadParent(),loadMyNotifications()]);renderDashboard();}
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
  if(section==="content")await loadContent();
}
const openNetflix=()=>openNetflixAccountValidation();

function openNetflixAccountValidation(){
  const modal=openModal({
    title:"Validar cuenta Netflix",
    body:`
      <div class="netflix-account-validation">
        <div class="netflix-validation-icon">N</div>

        <div>
          <span class="eyebrow">CONTROL DE ACCESO</span>
          <h3>Confirma una cuenta asignada a ti</h3>
          <p>
            Antes de solicitar códigos debes colocar el correo de una cuenta
            Netflix que esté actualmente a tu nombre.
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

        <div class="notice-box full">
          Si la cuenta fue devuelta a tu superior o asignada a otro
          distribuidor, el acceso será rechazado.
        </div>
      </form>
    `,
    actions:`
      <button class="btn secondary modal-cancel">Cancelar</button>
      <button id="validateNetflixAccount" class="btn primary">
        Verificar y continuar
      </button>
    `
  });

  const form=$("#netflixAccountValidationForm",modal.root);
  const button=$("#validateNetflixAccount",modal.root);

  $(".modal-cancel",modal.root).onclick=modal.close;

  const validate=async()=>{
    if(!form.reportValidity())return;

    const email=form.elements.email.value.trim().toLowerCase();
    button.disabled=true;
    button.textContent="Verificando...";

    try{
      const {data,error}=await supabase.rpc(
        "verify_my_service_account",
        {
          p_service:"netflix",
          p_email:email
        }
      );

      if(error)throw error;

      if(!data?.allowed){
        throw new Error(
          "Acceso negado. Coloca una cuenta Netflix asignada a tu usuario."
        );
      }

      modal.close();

      openNetflixIntegrated({
        verifiedEmail:data.email||email
      });
    }catch(error){
      toast(
        error.message||
        "Acceso negado. Ese correo no está asignado a tu usuario.",
        "error"
      );

      form.elements.email.select();
    }finally{
      button.disabled=false;
      button.textContent="Verificar y continuar";
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
  const {data,error}=await supabase
    .from("profiles")
    .select(
      "id,full_name,email,whatsapp,status,parent_id,business_name,created_at"
    )
    .eq("role","reseller")
    .eq("status","active")
    .neq("id",state.profile.id)
    .order("created_at",{ascending:false});

  if(error)return toast(error.message,"error");

  state.network=data||[];
  renderNetwork();
  renderResellerRecipientList();
}
const networkName=id=>id===state.profile.id?state.profile.full_name:(state.network.find(u=>u.id===id)?.full_name||"—");
function renderNetwork(){
  $("#networkTable").innerHTML=state.network.length
    ?state.network.map(user=>{
      const isDirect=user.parent_id===state.profile.id;
      const actions=isDirect
        ?`
          <button
            class="action-button red"
            data-delete-network-user="${user.id}"
          >
            Eliminar
          </button>
        `
        :`<span class="read-only-pill">Otra rama</span>`;

      return `
        <tr>
          <td>
            <div class="person-cell">
              <span class="avatar-small">
                ${escapeHtml(user.full_name[0].toUpperCase())}
              </span>

              <div>
                <strong>
                  ${escapeHtml(user.business_name||user.full_name)}
                </strong>
                <small>${escapeHtml(user.full_name)}</small>
              </div>
            </div>
          </td>

          <td>${escapeHtml(user.email)}</td>
          <td>${escapeHtml(user.whatsapp||"—")}</td>
          <td>${escapeHtml(networkName(user.parent_id))}</td>

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
        <td colspan="6" class="empty-cell">
          Aún no existen distribuidores debajo de tu red.
        </td>
      </tr>`;

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
        p_image_url:imageUrl
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
  const [accountsResult,assignmentsResult]=await Promise.all([
    supabase
      .from("netflix_accounts")
      .select(
        "id,service,current_email,account_type,status,current_reseller_id,current_client_id,created_at,reseller:current_reseller_id(full_name,business_name)"
      )
      .order("created_at",{ascending:false}),
    supabase
      .from("account_assignment_summary")
      .select("*")
      .order("created_at",{ascending:false})
  ]);

  if(accountsResult.error){
    toast(accountsResult.error.message,"error");
  }

  if(assignmentsResult.error){
    toast(assignmentsResult.error.message,"error");
  }

  state.accounts=accountsResult.data||[];
  state.assignments=assignmentsResult.data||[];
  renderAccounts();
}

function assignmentFor(a){const rows=state.assignments.filter(x=>x.account_id===a.id&&x.status==="active");return rows.find(x=>x.seller_id===state.profile.id)||rows.find(x=>x.buyer_reseller_id===state.profile.id)||rows[0]||null;}
const target=a=>
  a.reseller?.business_name||
  a.reseller?.full_name||
  "Sin distribuidor";

function renderAccounts(){
  const query=($("#accountSearch")?.value||"").toLowerCase();
  const service=$("#accountServiceFilter")?.value||"";

  const rows=state.accounts.filter(account=>
    `${account.current_email} ${target(account)}`
      .toLowerCase()
      .includes(query)
    &&(!service||account.service===service)
  );

  $("#accountsTable").innerHTML=rows.length
    ?rows.map(account=>{
      const assignment=assignmentFor(account);

      const canAssign=
        account.current_reseller_id===state.profile.id
        &&!account.current_client_id;

      const action=canAssign
        ?`<button class="action-button cyan" data-assign="${account.id}">
            Asignar
          </button>`
        :`<span class="read-only-pill">Solo consulta</span>`;

      return `
        <tr>
          <td>${serviceBadge(account.service)}</td>
          <td><strong>${escapeHtml(account.current_email)}</strong></td>
          <td>${escapeHtml(target(account))}</td>
          <td>${formatDate(assignment?.starts_on)}</td>
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
        <td colspan="8" class="empty-cell">
          No existen cuentas visibles.
        </td>
      </tr>`;

  $$("[data-assign]").forEach(button=>{
    button.onclick=()=>assignAccountModal(button.dataset.assign);
  });
}

async function loadTickets(){const {data,error}=await supabase.from("support_tickets").select("id,ticket_number,service,reported_email,account_email_snapshot,title,category,description,status,created_at,updated_at,account_id,creator:created_by(full_name)").order("updated_at",{ascending:false});if(error)return toast(error.message,"error");state.tickets=data||[];renderTickets();$("#ticketBadge").textContent=state.tickets.filter(t=>!["closed","resolved"].includes(t.status)).length;}
function renderTickets(){$("#ticketsTable").innerHTML=state.tickets.length?state.tickets.map(t=>`<tr><td>#${t.ticket_number}</td><td>${escapeHtml(t.creator?.full_name||"—")}</td><td>${serviceBadge(t.service)}</td><td><strong>${escapeHtml(t.title)}</strong></td><td>${escapeHtml(t.category)}</td><td>${escapeHtml(t.reported_email||t.account_email_snapshot)}</td><td><span class="status-pill ${statusTone(t.status)}">${statusLabel(t.status)}</span></td><td><button class="round-action" data-ticket="${t.id}">◉</button></td></tr>`).join(""):`<tr><td colspan="8" class="empty-cell">No existen tickets.</td></tr>`;$$('[data-ticket]').forEach(b=>b.onclick=()=>openTicket(b.dataset.ticket));}
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
async function loadParent(){const {data,error}=await supabase.rpc("get_my_parent_contact");if(error||!data?.[0]?.whatsapp){$("#parentWhatsappBtn").hidden=true;return;}state.parent=data[0];$("#parentWhatsappBtn").href=`https://wa.me/${state.parent.whatsapp}?text=${encodeURIComponent(`Hola ${state.parent.full_name}, soy ${state.profile.full_name}. Necesito ayuda con una cuenta.`)}`;}
async function loadMyNotifications(){try{state.notifications=await loadNotifications();updateNotificationBadge(state.notifications);renderDashboardNotifications();maybeShowBrowserNotifications(state.notifications,state.profile);}catch{state.notifications=[];}}
function renderDashboardNotifications(){$("#dashboardNotifications").innerHTML=state.notifications.slice(0,5).map(i=>`<button class="stack-row ${i.read_at?"":"unread-row"}" data-open-notifications><div><strong>${escapeHtml(i.notification?.title||"Notificación")}</strong><small>${formatDate(i.notification?.created_at,true)}</small></div>${i.read_at?"":`<span class="unread-dot"></span>`}</button>`).join("")||`<div class="empty-state">No tienes notificaciones.</div>`;$$('[data-open-notifications]').forEach(b=>b.onclick=openNotifications);}
async function openNotifications(){await showNotificationsModal(state.notifications,loadMyNotifications);}
function renderDashboard(){$("#statNetwork").textContent=state.network.length;$("#statAccounts").textContent=state.accounts.length;$("#statExpiring").textContent=state.assignments.filter(x=>x.status==="active"&&x.days_remaining>=0&&x.days_remaining<=3).length;$("#statTickets").textContent=state.tickets.filter(t=>!["closed","resolved"].includes(t.status)).length;$("#dashboardAccountsTable").innerHTML=state.accounts.slice(0,7).map(a=>{const x=assignmentFor(a);return `<tr><td>${serviceBadge(a.service)}</td><td><strong>${escapeHtml(a.current_email)}</strong></td><td>${escapeHtml(target(a))}</td><td>${formatDate(x?.starts_on)}</td><td><span class="days-pill ${statusTone(x?.calculated_status)}">${x?.days_remaining??"—"}</span></td><td><span class="status-pill ${statusTone(x?.calculated_status||a.status)}">${statusLabel(x?.calculated_status||a.status)}</span></td></tr>`;}).join("")||`<tr><td colspan="6" class="empty-cell">No existen cuentas.</td></tr>`;$("#upcomingPayments").innerHTML=state.assignments.filter(x=>x.status==="active").sort((a,b)=>(a.days_remaining??999)-(b.days_remaining??999)).slice(0,6).map(x=>`<div class="stack-row"><div><strong>${formatDate(x.expires_on)}</strong><small>Próximo cobro</small></div><span class="days-pill ${statusTone(x.calculated_status)}">${x.days_remaining} días</span></div>`).join("")||`<div class="empty-state">Sin cobros próximos.</div>`;renderDashboardNotifications();}
function createDistributorModal(){const m=openModal({title:"Crear distribuidor",body:`<form id="createDistributorForm" class="form-grid"><label><span>Nombre completo</span><input name="full_name" required minlength="3"></label><label><span>Nombre comercial</span><input name="business_name"></label><label><span>Correo electrónico</span><input name="email" type="email" required></label><label><span>WhatsApp</span><input name="whatsapp" required></label><label class="full"><span>Contraseña</span><input name="password" type="password" minlength="8" required></label></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveDistributor" class="btn primary">Crear distribuidor</button>`});$(".modal-cancel",m.root).onclick=m.close;$("#saveDistributor",m.root).onclick=async()=>{const f=$("#createDistributorForm",m.root);if(!f.reportValidity())return;try{const r=await callUserManager({action:"create",...Object.fromEntries(new FormData(f).entries()),role:"reseller"});toast(r.message);m.close();await loadNetwork();}catch(e){toast(e.message,"error");}};}
function bulkUpdateAccountDatesModal(){
  const modal=openModal({
    title:"Actualizar cuentas en lote",
    body:`
      <div class="notice-box">
        Solo se actualizará tu propia relación con cada cuenta.
        Las fechas pertenecientes a otros distribuidores no se modificarán.
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
          <span>Fecha de inicio o corte</span>
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
        "bulk_update_my_account_dates",
        {
          p_service:values.service,
          p_account_emails:emails,
          p_starts_on:values.starts_on
        }
      );

      if(error)throw error;

      toast(
        `${data.updated||0} actualizadas, `+
        `${data.not_allowed||0} sin permiso y `+
        `${data.not_found||0} no encontradas.`
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
        "assign_account_to_reseller",
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

function createTicketModal(){const m=openModal({title:"Crear ticket",body:`<form id="createTicketForm" class="form-grid"><label><span>Plataforma</span><select name="service"><option value="netflix">Netflix</option><option value="spotify">Spotify</option></select></label><label><span>Categoría</span><select name="category"><option>Caída</option><option>Falla</option><option>Contraseña incorrecta</option></select></label><label class="full"><span>Correo de la cuenta</span><input name="reported_email" type="email" list="ticketOptions" required><datalist id="ticketOptions"></datalist></label><label class="full"><span>Título: ¿qué error tiene?</span><input name="title" required></label><label class="full"><span>Descripción adicional</span><textarea name="description"></textarea></label></form>`,actions:`<button class="btn secondary modal-cancel">Cancelar</button><button id="saveTicket" class="btn primary">Crear ticket</button>`});const f=$("#createTicketForm",m.root),update=()=>{$("#ticketOptions",m.root).innerHTML=state.accounts.filter(a=>a.service===f.elements.service.value).map(a=>`<option value="${escapeHtml(a.current_email)}"></option>`).join("");};f.elements.service.onchange=update;update();$(".modal-cancel",m.root).onclick=m.close;$("#saveTicket",m.root).onclick=async()=>{if(!f.reportValidity())return;const v=Object.fromEntries(new FormData(f).entries());try{const {data,error}=await supabase.rpc("create_support_ticket_v2",{p_service:v.service,p_reported_email:v.reported_email.trim().toLowerCase(),p_title:v.title,p_category:v.category,p_description:v.description||v.title});if(error)throw error;toast(data.message);m.close();await loadTickets();}catch(e){toast(e.message,"error");}};}
async function openTicket(id){const t=state.tickets.find(x=>x.id===id);if(!t)return;const {data:messages,error}=await supabase.from("ticket_messages").select("id,message,is_system,created_at,author:author_id(full_name)").eq("ticket_id",id).order("created_at",{ascending:true});if(error)return toast(error.message,"error");const m=openModal({title:`Ticket #${t.ticket_number}`,wide:true,body:`<div class="ticket-header-card">${serviceBadge(t.service)}<div><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.reported_email||t.account_email_snapshot)}</small></div><span class="status-pill ${statusTone(t.status)}">${statusLabel(t.status)}</span></div><div class="ticket-description"><strong>Descripción</strong><p>${escapeHtml(t.description)}</p></div><div class="message-thread">${(messages||[]).map(x=>`<article class="message-bubble ${x.is_system?"system":""}"><header><strong>${escapeHtml(x.is_system?"SISTEMA":(x.author?.full_name||"Usuario"))}</strong><small>${formatDate(x.created_at,true)}</small></header><p>${escapeHtml(x.message)}</p></article>`).join("")||`<div class="empty-state">Sin mensajes.</div>`}</div>${["closed","resolved"].includes(t.status)?"":`<form id="ticketReplyForm" class="reply-form distributor-reply"><textarea name="message" required></textarea><button class="btn primary">Enviar</button></form>`}`});$("#ticketReplyForm",m.root)?.addEventListener("submit",async e=>{e.preventDefault();const message=new FormData(e.currentTarget).get("message");try{const {error}=await supabase.from("ticket_messages").insert({ticket_id:id,author_id:state.profile.id,message,is_system:false});if(error)throw error;toast("Mensaje enviado.");m.close();await loadTickets();}catch(err){toast(err.message,"error");}});}
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
