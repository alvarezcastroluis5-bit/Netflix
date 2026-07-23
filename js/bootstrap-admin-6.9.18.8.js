const APP_MODULE = "./admin-6.9.18.8.js";

const SUPABASE_SOURCES = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://esm.sh/@supabase/supabase-js@2",
  "https://cdn.skypack.dev/@supabase/supabase-js"
];

const form = document.getElementById("loginForm");
const button = document.getElementById("loginSubmitBtn");
const errorBox = document.getElementById("loginError");

function showLoaderError(message) {
  if (errorBox) {
    errorBox.hidden = false;
    errorBox.textContent = message;
  }

  if (button) {
    button.disabled = false;
    button.textContent = "Reintentar conexión";
    button.dataset.loaderFailed = "true";
  }
}

async function loadSupabaseLibrary() {
  const errors = [];

  for (const source of SUPABASE_SOURCES) {
    try {
      const module = await import(source);

      if (typeof module.createClient === "function") {
        return module.createClient;
      }

      errors.push(`${source}: no exportó createClient`);
    } catch (error) {
      errors.push(`${source}: ${error?.message || String(error)}`);
    }
  }

  throw new Error(errors.join(" | "));
}

if (button) {
  button.disabled = true;
  button.textContent = "Cargando conexión...";
}

form?.addEventListener("submit", event => {
  if (!globalThis.__LOGIN_APP_READY__) {
    event.preventDefault();

    if (button?.dataset.loaderFailed === "true") {
      button.disabled = true;
      button.textContent = "Reintentando...";
      location.reload();
      return;
    }

    showLoaderError("El sistema todavía está cargando. Espera unos segundos y vuelve a intentar.");
  }
});

try {
  globalThis.__SUPABASE_CREATE_CLIENT__ = await loadSupabaseLibrary();
  await import(APP_MODULE);
  globalThis.__LOGIN_APP_READY__ = true;

  if (button) {
    button.disabled = false;
    button.textContent = "Ingresar";
    delete button.dataset.loaderFailed;
  }
} catch (error) {
  console.error("No se pudo iniciar el portal:", error);
  showLoaderError(
    "No se pudo cargar la conexión con Supabase. Presiona “Reintentar conexión”. " +
    "Detalle: " + (error?.message || String(error))
  );
}
