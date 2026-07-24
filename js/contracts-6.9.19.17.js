console.info("Centro Premium contratos V6.9.19.17 cargado");

let contractApi=null;

export function configureContractModule(api){
  contractApi=api;
}

function requireApi(){
  if(!contractApi){
    throw new Error("El módulo de contratos no fue configurado.");
  }
  return contractApi;
}

const $=(...args)=>requireApi().$(...args);
const escapeHtml=value=>requireApi().escapeHtml(value);
const formatDate=(...args)=>requireApi().formatDate(...args);
const toast=(...args)=>requireApi().toast(...args);
const supabase=new Proxy({}, {
  get(_target,property){
    const value=requireApi().supabase[property];
    return typeof value==="function"
      ?value.bind(requireApi().supabase)
      :value;
  }
});

const centerState = new Map();

function safeText(value=""){
  return escapeHtml(String(value??""));
}

function bodyToHtml(value=""){
  return safeText(value).replace(/\r?\n/g,"<br>");
}

function normalizeRpcData(data){
  if(Array.isArray(data))return data;
  if(data&&Array.isArray(data.items))return data.items;
  return [];
}

function contractStatusLabel(status){
  return ({
    signed:"Firmado",
    pending:"Pendiente de firma",
    cancelled:"Cancelado"
  })[status]||status||"—";
}

function contractStatusTone(status){
  if(status==="signed")return "green";
  if(status==="pending")return "orange";
  return "gray";
}

function canvasToBlob(canvas,type="image/png",quality=0.95){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>{
      if(blob)resolve(blob);
      else reject(new Error("No se pudo generar la firma digital."));
    },type,quality);
  });
}

function loadJsPdf(){
  const JsPdf=globalThis.jspdf?.jsPDF;
  if(typeof JsPdf!=="function"){
    throw new Error(
      "No se pudo cargar el generador de PDF. Actualiza la página y vuelve a intentarlo."
    );
  }
  return JsPdf;
}

function addWrappedText(doc,text,{x=18,y=20,maxWidth=174,lineHeight=5.2,fontSize=10}={}){
  doc.setFontSize(fontSize);
  const pageHeight=doc.internal.pageSize.getHeight();
  const bottom=18;
  const paragraphs=String(text||"").split(/\r?\n/);

  for(const paragraph of paragraphs){
    if(!paragraph.trim()){
      y+=lineHeight;
      continue;
    }

    const lines=doc.splitTextToSize(paragraph,maxWidth);
    for(const line of lines){
      if(y>pageHeight-bottom){
        doc.addPage();
        y=20;
      }
      doc.text(line,x,y);
      y+=lineHeight;
    }
    y+=1.5;
  }

  return y;
}

function addPdfFooter(doc){
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page+=1){
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(
      `Centro Premium · Documento electrónico · Página ${page} de ${pages}`,
      105,
      289,
      {align:"center"}
    );
  }
}

function buildContractPdf({prepared,signatureDataUrl,signedAt}){
  const JsPdf=loadJsPdf();
  const doc=new JsPdf({unit:"mm",format:"a4",compress:true});
  const pageWidth=doc.internal.pageSize.getWidth();

  doc.setTextColor(14,28,48);
  doc.setFont("helvetica","bold");
  doc.setFontSize(15);
  doc.text(prepared.template_title||"CONTRATO CENTRO PREMIUM",pageWidth/2,18,{align:"center"});

  doc.setFontSize(9);
  doc.setFont("helvetica","normal");
  doc.text(`Contrato: ${prepared.contract_number}`,18,27);
  doc.text(`Versión: ${prepared.template_version}`,18,32);
  doc.text(`Fecha de aceptación: ${signedAt.toLocaleString("es-BO")}`,18,37);

  doc.setDrawColor(190);
  doc.line(18,42,192,42);

  doc.setFont("helvetica","bold");
  doc.setFontSize(10);
  doc.text("DATOS DEL DISTRIBUIDOR",18,49);
  doc.setFont("helvetica","normal");
  doc.text(`Nombre: ${prepared.signer_full_name}`,18,56);
  doc.text(`Documento: ${prepared.identity_document}`,18,62);
  doc.text(`Correo: ${prepared.email}`,18,68);
  doc.text(`WhatsApp: ${prepared.whatsapp}`,18,74);
  if(prepared.business_name){
    doc.text(`Nombre comercial: ${prepared.business_name}`,18,80);
  }

  const bodyStart=prepared.business_name?88:82;
  let y=addWrappedText(doc,prepared.template_body_text,{
    x:18,
    y:bodyStart,
    maxWidth:174,
    lineHeight:5.1,
    fontSize:9.5
  });

  const pageHeight=doc.internal.pageSize.getHeight();
  if(y>pageHeight-70){
    doc.addPage();
    y=24;
  }

  doc.setFont("helvetica","bold");
  doc.setFontSize(10);
  doc.text("ACEPTACIÓN Y FIRMAS",18,y);
  y+=8;

  doc.setDrawColor(210);
  doc.roundedRect(18,y,82,43,3,3);
  doc.setFont("helvetica","normal");
  doc.setFontSize(8.5);
  doc.text("Firma electrónica del distribuidor",22,y+6);
  doc.addImage(signatureDataUrl,"PNG",25,y+9,68,22,undefined,"FAST");
  doc.line(25,y+34,93,y+34);
  doc.text(prepared.signer_full_name,59,y+39,{align:"center"});

  doc.roundedRect(110,y,82,43,3,3);
  doc.text("Firma administrativa incorporada",114,y+6);
  doc.setFont("helvetica","bold");
  doc.setFontSize(13);
  doc.text(prepared.admin_signature_name||"CENTRO PREMIUM",151,y+22,{align:"center"});
  doc.setFontSize(8.5);
  doc.setFont("helvetica","normal");
  doc.line(117,y+34,185,y+34);
  doc.text(prepared.admin_signature_role||"ADMINISTRACIÓN",151,y+39,{align:"center"});

  addPdfFooter(doc);
  return doc.output("blob");
}

function setupSignatureCanvas(canvas,onInkChange){
  const context=canvas.getContext("2d");
  let drawing=false;
  let hasInk=false;

  const resize=()=>{
    const rect=canvas.getBoundingClientRect();
    const ratio=Math.max(1,window.devicePixelRatio||1);
    const snapshot=hasInk?canvas.toDataURL("image/png"):null;
    canvas.width=Math.max(1,Math.round(rect.width*ratio));
    canvas.height=Math.max(1,Math.round(rect.height*ratio));
    context.setTransform(ratio,0,0,ratio,0,0);
    context.lineWidth=2.3;
    context.lineCap="round";
    context.lineJoin="round";
    context.strokeStyle="#08111f";

    if(snapshot){
      const image=new Image();
      image.onload=()=>context.drawImage(image,0,0,rect.width,rect.height);
      image.src=snapshot;
    }
  };

  const point=event=>{
    const rect=canvas.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  };

  canvas.addEventListener("pointerdown",event=>{
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    drawing=true;
    const p=point(event);
    context.beginPath();
    context.moveTo(p.x,p.y);
  });

  canvas.addEventListener("pointermove",event=>{
    if(!drawing)return;
    event.preventDefault();
    const p=point(event);
    context.lineTo(p.x,p.y);
    context.stroke();
    if(!hasInk){
      hasInk=true;
      onInkChange(true);
    }
  });

  const stop=event=>{
    if(!drawing)return;
    drawing=false;
    canvas.releasePointerCapture?.(event.pointerId);
  };

  canvas.addEventListener("pointerup",stop);
  canvas.addEventListener("pointercancel",stop);
  canvas.addEventListener("pointerleave",stop);

  resize();
  window.addEventListener("resize",resize,{passive:true});

  return {
    hasInk:()=>hasInk,
    clear(){
      const rect=canvas.getBoundingClientRect();
      context.clearRect(0,0,rect.width,rect.height);
      hasInk=false;
      onInkChange(false);
    },
    destroy(){
      window.removeEventListener("resize",resize);
    }
  };
}

function createGateRoot(){
  let root=document.getElementById("contractGateRoot");
  if(root)return root;
  root=document.createElement("div");
  root.id="contractGateRoot";
  document.body.appendChild(root);
  return root;
}

export async function ensureRequiredContract({profile}){
  if(!profile||profile.role!=="reseller")return;

  const {data,error}=await supabase.rpc("get_my_contract_status_v50");
  if(error){
    throw new Error(
      `No se pudo comprobar el contrato obligatorio: ${error.message}`
    );
  }

  if(data?.signed===true)return;

  return new Promise((resolve,reject)=>{
    const root=createGateRoot();
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    document.documentElement.classList.add("contract-gate-active");

    root.innerHTML=`
      <div class="contract-gate" role="dialog" aria-modal="true" aria-labelledby="contractGateTitle">
        <section class="contract-gate-card">
          <header class="contract-gate-header">
            <div>
              <span class="eyebrow">ACEPTACIÓN OBLIGATORIA</span>
              <h1 id="contractGateTitle">${safeText(data?.template_title||"Contrato Centro Premium")}</h1>
              <p>Versión ${safeText(data?.template_version||"1.0")} · Debes firmar para ingresar al panel.</p>
            </div>
            <span class="contract-lock" aria-hidden="true">🔐</span>
          </header>

          <div class="contract-gate-body">
            <article class="contract-document-preview">
              <div class="contract-document-copy">${bodyToHtml(data?.template_body_text||"")}</div>
              <div class="contract-admin-signature">
                <span>Firma administrativa incorporada</span>
                <strong>${safeText(data?.admin_signature_name||"CENTRO PREMIUM")}</strong>
                <small>${safeText(data?.admin_signature_role||"ADMINISTRACIÓN")}</small>
              </div>
            </article>

            <form id="mandatoryContractForm" class="contract-sign-form">
              <div class="contract-form-grid">
                <label>
                  <span>Nombre completo</span>
                  <input name="full_name" value="${safeText(profile.full_name||"")}" minlength="3" required>
                </label>
                <label>
                  <span>Documento de identidad</span>
                  <input name="identity_document" autocomplete="off" minlength="4" maxlength="40" required>
                </label>
                <label>
                  <span>WhatsApp</span>
                  <input name="whatsapp" value="${safeText(profile.whatsapp||"")}" minlength="7" maxlength="25" required>
                </label>
                <label>
                  <span>Correo</span>
                  <input value="${safeText(profile.email||"")}" readonly>
                </label>
              </div>

              <div class="contract-signature-box">
                <div class="contract-signature-heading">
                  <div>
                    <strong>Firma del distribuidor</strong>
                    <span>Dibuja tu firma con el mouse, dedo o lápiz táctil.</span>
                  </div>
                  <button class="btn secondary compact" id="clearContractSignature" type="button">Limpiar firma</button>
                </div>
                <canvas id="contractSignatureCanvas" aria-label="Área para firmar"></canvas>
              </div>

              <label class="contract-acceptance-check disabled" id="contractAcceptanceLabel">
                <input id="contractAcceptance" type="checkbox" disabled>
                <span>Acepto los términos y condiciones, confirmo que los datos son correctos y autorizo la generación del PDF firmado.</span>
              </label>

              <div class="contract-inline-error" id="contractInlineError" hidden></div>

              <button class="btn primary block contract-submit" id="signContractButton" type="submit" disabled>
                Firmar contrato e ingresar
              </button>
            </form>
          </div>
        </section>
      </div>
    `;

    const form=$("#mandatoryContractForm",root);
    const canvas=$("#contractSignatureCanvas",root);
    const acceptance=$("#contractAcceptance",root);
    const acceptanceLabel=$("#contractAcceptanceLabel",root);
    const submit=$("#signContractButton",root);
    const errorBox=$("#contractInlineError",root);

    const refreshSubmit=()=>{
      submit.disabled=!(signature.hasInk()&&acceptance.checked);
    };

    const signature=setupSignatureCanvas(canvas,hasInk=>{
      acceptance.disabled=!hasInk;
      acceptanceLabel.classList.toggle("disabled",!hasInk);
      if(!hasInk)acceptance.checked=false;
      refreshSubmit();
    });

    acceptance.addEventListener("change",refreshSubmit);
    $("#clearContractSignature",root).addEventListener("click",()=>signature.clear());

    form.addEventListener("submit",async event=>{
      event.preventDefault();
      errorBox.hidden=true;

      if(!form.reportValidity())return;
      if(!signature.hasInk()){
        errorBox.hidden=false;
        errorBox.textContent="Debes dibujar tu firma antes de continuar.";
        return;
      }
      if(!acceptance.checked){
        errorBox.hidden=false;
        errorBox.textContent="Debes aceptar los términos y condiciones.";
        return;
      }

      submit.disabled=true;
      submit.textContent="Generando contrato y PDF...";

      try{
        const values=Object.fromEntries(new FormData(form).entries());
        const {data:prepared,error:prepareError}=await supabase.rpc(
          "prepare_my_contract_v50",
          {
            p_full_name:String(values.full_name||"").trim(),
            p_identity_document:String(values.identity_document||"").trim(),
            p_whatsapp:String(values.whatsapp||"").trim()
          }
        );
        if(prepareError)throw prepareError;

        if(prepared?.already_signed===true){
          signature.destroy();
          root.innerHTML="";
          document.body.style.overflow=previousOverflow;
          document.documentElement.classList.remove("contract-gate-active");
          resolve();
          return;
        }

        const signatureDataUrl=canvas.toDataURL("image/png");
        const signatureBlob=await canvasToBlob(canvas);
        const signedAt=new Date();
        const pdfBlob=buildContractPdf({
          prepared,
          signatureDataUrl,
          signedAt
        });

        const basePath=`${profile.id}/${prepared.contract_id}`;
        const signaturePath=`${basePath}/firma.png`;
        const pdfPath=`${basePath}/${prepared.contract_number}.pdf`;

        const signatureUpload=await supabase.storage
          .from("contracts")
          .upload(signaturePath,signatureBlob,{
            upsert:true,
            contentType:"image/png",
            cacheControl:"3600"
          });
        if(signatureUpload.error)throw signatureUpload.error;

        const pdfUpload=await supabase.storage
          .from("contracts")
          .upload(pdfPath,pdfBlob,{
            upsert:true,
            contentType:"application/pdf",
            cacheControl:"3600"
          });
        if(pdfUpload.error)throw pdfUpload.error;

        const {data:finalized,error:finalizeError}=await supabase.rpc(
          "finalize_my_contract_v50",
          {
            p_contract_id:prepared.contract_id,
            p_signature_path:signaturePath,
            p_pdf_path:pdfPath,
            p_accepted:true,
            p_user_agent:navigator.userAgent.slice(0,500)
          }
        );
        if(finalizeError)throw finalizeError;

        root.innerHTML=`
          <div class="contract-gate contract-gate-success">
            <section class="contract-success-card">
              <span class="contract-success-icon">✓</span>
              <h2>Contrato firmado correctamente</h2>
              <p>${safeText(finalized?.contract_number||prepared.contract_number)}</p>
              <small>Tu PDF quedó guardado en el historial de contratos.</small>
            </section>
          </div>
        `;

        window.setTimeout(()=>{
          signature.destroy();
          root.innerHTML="";
          document.body.style.overflow=previousOverflow;
          document.documentElement.classList.remove("contract-gate-active");
          resolve();
        },900);
      }catch(error){
        console.error("No se pudo firmar el contrato:",error);
        errorBox.hidden=false;
        errorBox.textContent=error.message||"No se pudo firmar el contrato.";
        submit.disabled=false;
        submit.textContent="Firmar contrato e ingresar";
      }
    });
  });
}

function renderContractRows(key){
  const record=centerState.get(key);
  if(!record)return;
  const {config,rows}=record;
  const table=$(config.tableSelector);
  const count=$(config.countSelector);
  if(!table)return;

  const query=String($(config.searchSelector)?.value||"")
    .trim()
    .toLowerCase();

  const visible=rows.filter(row=>{
    if(!query)return true;
    return `${row.contract_number||""} ${row.full_name||""} ${row.business_name||""} ${row.email||""} ${row.identity_document||""}`
      .toLowerCase()
      .includes(query);
  });

  if(count){
    count.textContent=`${visible.length} contrato${visible.length===1?"":"s"}`;
  }

  table.innerHTML=visible.length
    ?visible.map(row=>`
      <tr>
        <td>
          <strong>${safeText(row.contract_number||"Pendiente")}</strong>
          <small class="table-subline">Versión ${safeText(row.template_version||"—")}</small>
        </td>
        <td>
          <strong>${safeText(row.business_name||row.full_name||"Distribuidor")}</strong>
          <small class="table-subline">${safeText(row.full_name||"")}</small>
        </td>
        <td>${safeText(row.email||"—")}</td>
        <td>${safeText(row.identity_document||"—")}</td>
        <td>${safeText(row.creator_name||"Administración")}</td>
        <td><span class="status-pill ${contractStatusTone(row.status)}">${safeText(contractStatusLabel(row.status))}</span></td>
        <td>${row.accepted_at?formatDate(row.accepted_at,true):"—"}</td>
        <td>
          ${row.status==="signed"&&row.pdf_path
            ?`<button class="action-button blue" data-contract-pdf="${safeText(row.pdf_path)}">Ver PDF</button>`
            :`<span class="table-muted">Sin PDF</span>`
          }
        </td>
      </tr>
    `).join("")
    :`<tr><td colspan="8"><div class="empty-state">No hay contratos para mostrar.</div></td></tr>`;

  table.querySelectorAll("[data-contract-pdf]").forEach(button=>{
    button.addEventListener("click",async()=>{
      button.disabled=true;
      const oldText=button.textContent;
      button.textContent="Abriendo...";
      try{
        const {data,error}=await supabase.storage
          .from("contracts")
          .createSignedUrl(button.dataset.contractPdf,120);
        if(error)throw error;
        if(!data?.signedUrl)throw new Error("No se pudo generar el enlace del PDF.");
        window.open(data.signedUrl,"_blank","noopener,noreferrer");
      }catch(error){
        toast(error.message||"No se pudo abrir el contrato.","error");
      }finally{
        button.disabled=false;
        button.textContent=oldText;
      }
    });
  });
}

export function bindContractCenter(config){
  if(!config?.key)return;
  const existing=centerState.get(config.key)||{rows:[]};
  centerState.set(config.key,{...existing,config});

  $(config.searchSelector)?.addEventListener("input",()=>renderContractRows(config.key));
  $(config.refreshSelector)?.addEventListener("click",()=>loadContractCenter(config));
}

export async function loadContractCenter(config){
  if(!config?.key)return;
  const table=$(config.tableSelector);
  if(table){
    table.innerHTML=`<tr><td colspan="8"><div class="empty-state">Cargando contratos...</div></td></tr>`;
  }

  const {data,error}=await supabase.rpc("list_visible_contracts_v50");
  if(error){
    if(table){
      table.innerHTML=`<tr><td colspan="8"><div class="empty-state">${safeText(error.message)}</div></td></tr>`;
    }
    toast(`No se pudieron cargar los contratos: ${error.message}`,"error");
    return;
  }

  centerState.set(config.key,{config,rows:normalizeRpcData(data)});
  renderContractRows(config.key);
}
