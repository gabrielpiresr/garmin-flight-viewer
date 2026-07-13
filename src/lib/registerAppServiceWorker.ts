export function registerAppServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // Em dev o worker não pode interceptar o servidor do Vite: o cache-first servia o
  // CSS do Tailwind desatualizado a cada F5 (telas "sem cores" até um hard reload).
  // Além de não registrar, remove o worker que já estiver instalado no navegador.
  if (import.meta.env.DEV) {
    void navigator.serviceWorker
      .getRegistrations()
      .then(async (registrations) => {
        let removedAppWorker = false;
        for (const registration of registrations) {
          const scriptUrl =
            registration.active?.scriptURL ||
            registration.waiting?.scriptURL ||
            registration.installing?.scriptURL ||
            "";
          if (scriptUrl.endsWith("/app-sw.js")) {
            removedAppWorker = (await registration.unregister()) || removedAppWorker;
          }
        }
        if (removedAppWorker && navigator.serviceWorker.controller) {
          const reloadKey = "gfv-dev-sw-clean-reload";
          if (sessionStorage.getItem(reloadKey) !== "1") {
            sessionStorage.setItem(reloadKey, "1");
            window.location.reload();
          }
        } else {
          sessionStorage.removeItem("gfv-dev-sw-clean-reload");
        }
      })
      .catch(() => {});
    return;
  }
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/app-sw.js").catch(() => {
      // Offline support is best-effort; the app still works online without the worker.
    });
  });
}
