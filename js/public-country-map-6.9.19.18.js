import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from "./config.js";
import {countryMapPoint,countryFlagEmoji,whatsappDigits} from "./country-map-data-6.9.19.13.js";

const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
});

const pinLayer=document.getElementById("publicCountryPinLayer");
const infoRoot=document.getElementById("publicCountryInfo");
const countRoot=document.getElementById("publicCountryCount");
const loadingRoot=document.getElementById("publicCountryLoading");
const stage=document.getElementById("publicCountryMapStage");
const select=document.getElementById("publicCountrySelect");

let rows=[];
let selectedCode="";
let refreshTimer=null;

function escapeHtml(value){
  return String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function markerSvg(){
  return `
    <svg viewBox="0 0 32 44" aria-hidden="true" focusable="false">
      <path d="M16 1C7.72 1 1 7.72 1 16c0 11.18 15 27 15 27s15-15.82 15-27C31 7.72 24.28 1 16 1Z"></path>
      <circle cx="16" cy="16" r="6.5"></circle>
    </svg>
  `;
}

function renderPins(){
  pinLayer.innerHTML=rows.map(row=>{
    const point=countryMapPoint({
      lat:Number(row.latitude||0),
      lng:Number(row.longitude||0)
    });
    const selected=row.country_code===selectedCode;

    return `
      <button
        type="button"
        class="country-public-pin ${selected?"is-selected":""}"
        style="left:${point.left};top:${point.top}"
        data-country-code="${escapeHtml(row.country_code)}"
        aria-label="Ver distribuidor de ${escapeHtml(row.country_name)}"
        title="${escapeHtml(row.country_name)}"
      >${markerSvg()}</button>
    `;
  }).join("");

  pinLayer.querySelectorAll("[data-country-code]").forEach(button=>{
    button.addEventListener("click",()=>selectCountry(button.dataset.countryCode,true));
  });
}

function renderSelect(){
  select.innerHTML=`<option value="">Selecciona un país</option>${rows.map(row=>`
    <option value="${escapeHtml(row.country_code)}">${escapeHtml(row.country_name)}</option>
  `).join("")}`;
  select.disabled=rows.length===0;
  select.value=selectedCode;
}

function renderInfo(row){
  if(!row){
    infoRoot.innerHTML=rows.length
      ?`<div class="country-public-placeholder">📍 Presiona un pin para ver el distribuidor oficial de ese país.</div>`
      :`<div class="country-public-placeholder">Todavía no existen distribuidores por país publicados.</div>`;
    return;
  }

  const digits=whatsappDigits(row.whatsapp);
  const whatsappUrl=digits
    ?`https://wa.me/${digits}?text=${encodeURIComponent(`Hola, deseo solicitar una cuenta de Centro Premium en ${row.country_name}.`)}`
    :"";

  infoRoot.innerHTML=`
    <article class="country-public-contact-card">
      <span class="country-public-contact-flag">${countryFlagEmoji(row.country_code)}</span>
      <div class="country-public-contact-copy">
        <small>DISTRIBUIDOR OFICIAL</small>
        <h3>${escapeHtml(row.country_name)}</h3>
        <strong>${escapeHtml(row.distributor_name)}</strong>
        <p>WhatsApp: ${escapeHtml(row.whatsapp)}</p>
      </div>
      ${whatsappUrl?`<a class="country-public-whatsapp" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Contactar por WhatsApp</a>`:""}
    </article>
  `;
}

function selectCountry(code,scrollInfo=false){
  const normalized=String(code||"").toUpperCase();
  const row=rows.find(item=>item.country_code===normalized)||null;
  selectedCode=row?.country_code||"";
  renderPins();
  select.value=selectedCode;
  renderInfo(row);

  if(scrollInfo&&window.matchMedia("(max-width: 720px)").matches){
    infoRoot.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
}

async function loadCountries({silent=false}={}){
  if(!silent){
    stage.setAttribute("aria-busy","true");
    loadingRoot.hidden=false;
  }

  const {data,error}=await supabase.rpc("public_list_country_distributors_v51");

  if(error){
    console.error("No se pudo cargar el mapa público:",error);
    if(!silent){
      countRoot.textContent="Mapa no disponible";
      infoRoot.innerHTML=`<div class="country-public-error">No se pudo cargar el mapa. Verifica que el bloque SQL de la versión V6.9.19.18 esté ejecutado.</div>`;
    }
    return;
  }

  rows=(data||[]).map(row=>({
    ...row,
    country_code:String(row.country_code||"").toUpperCase(),
    latitude:Number(row.latitude||0),
    longitude:Number(row.longitude||0)
  }));

  if(selectedCode&&!rows.some(row=>row.country_code===selectedCode))selectedCode="";

  countRoot.textContent=`${rows.length} ${rows.length===1?"país disponible":"países disponibles"}`;
  renderPins();
  renderSelect();
  renderInfo(rows.find(row=>row.country_code===selectedCode)||null);

  stage.setAttribute("aria-busy","false");
  loadingRoot.hidden=true;
}

select.addEventListener("change",()=>selectCountry(select.value,true));

loadCountries();
refreshTimer=window.setInterval(()=>loadCountries({silent:true}),30000);

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")loadCountries({silent:true});
});

window.addEventListener("beforeunload",()=>{
  if(refreshTimer)window.clearInterval(refreshTimer);
});
