(() => {
  "use strict";

  const MODULE_PATH = "js/reseller-6.16.6.js";
  const PORTAL_NAME = "Distribuidores";

  const SUPABASE_SOURCES = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8",
    "https://unpkg.com/@supabase/supabase-js@2.110.8"
  ];

  const form = document.getElementById("loginForm");
  const button = document.getElementById("loginSubmitBtn");
  const errorBox = document.getElementById("loginError");

  let appLoaded = false;
  let reportedRuntimeError = false;

  function showError(message) {
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

  function setLoading(message) {
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }

    if (button) {
      button.disabled = true;
      button.textContent = message;
      delete button.dataset.loaderFailed;
    }
  }

  function loadClassicScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.crossOrigin = "anonymous";

      script.onload = () => resolve(source);
      script.onerror = () => {
        script.remove();
        reject(
          new Error(`No se pudo cargar ${source}`)
        );
      };

      document.head.appendChild(script);
    });
  }

  async function loadSupabase() {
    if (
      globalThis.supabase &&
      typeof globalThis.supabase.createClient === "function"
    ) {
      return;
    }

    const failures = [];

    for (const source of SUPABASE_SOURCES) {
      try {
        await loadClassicScript(source);

        if (
          globalThis.supabase &&
          typeof globalThis.supabase.createClient === "function"
        ) {
          return;
        }

        failures.push(
          `${source}: no creó window.supabase`
        );
      } catch (error) {
        failures.push(error.message);
      }
    }

    throw new Error(failures.join(" | "));
  }

  function loadPortalModule() {
    return new Promise((resolve, reject) => {
      const moduleScript = document.createElement("script");
      moduleScript.type = "module";
      moduleScript.src = MODULE_PATH;
      moduleScript.dataset.portalModule = PORTAL_NAME;

      moduleScript.onload = () => {
        appLoaded = true;
        globalThis.__LOGIN_APP_READY__ = true;
        resolve();
      };

      moduleScript.onerror = () => {
        reject(
          new Error(
            `No se pudo interpretar ${MODULE_PATH}. ` +
            "El archivo puede estar incompleto o corresponder a otra versión."
          )
        );
      };

      document.body.appendChild(moduleScript);
    });
  }

  window.addEventListener("error", event => {
    if (
      appLoaded ||
      reportedRuntimeError ||
      !event?.message
    ) {
      return;
    }

    const sourceName = event.filename
      ? event.filename.split("/").pop()
      : MODULE_PATH.split("/").pop();

    reportedRuntimeError = true;

    showError(
      `Error al cargar ${sourceName}: ${event.message}. ` +
      "Reemplaza todos los archivos V6.16.6 y presiona Ctrl + F5."
    );
  });

  window.addEventListener(
    "unhandledrejection",
    event => {
      if (appLoaded || reportedRuntimeError) {
        return;
      }

      const detail =
        event.reason?.message ||
        String(event.reason || "Error desconocido");

      reportedRuntimeError = true;

      showError(
        `No se pudo iniciar ${PORTAL_NAME}: ${detail}`
      );
    }
  );

  form?.addEventListener("submit", event => {
    if (globalThis.__LOGIN_APP_READY__) {
      return;
    }

    event.preventDefault();

    if (button?.dataset.loaderFailed === "true") {
      location.reload();
      return;
    }

    showError(
      "El sistema todavía está cargando. Espera unos segundos."
    );
  });

  async function start() {
    setLoading("Cargando conexión...");

    try {
      await loadSupabase();
      await loadPortalModule();

      if (button) {
        button.disabled = false;
        button.textContent = "Ingresar";
        delete button.dataset.loaderFailed;
      }
    } catch (error) {
      console.error(
        `No se pudo iniciar ${PORTAL_NAME}:`,
        error
      );

      showError(
        `No se pudo iniciar ${PORTAL_NAME}. ` +
        `${error?.message || String(error)}`
      );
    }
  }

  start();
})();
