export function registerAppServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // Em dev o worker não pode interceptar o servidor do Vite: o cache-first servia o
  // CSS do Tailwind desatualizado a cada F5 (telas "sem cores" até um hard reload).
  // Além de não registrar, remove o worker que já estiver instalado no navegador.
  if (import.meta.env.DEV) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          const scriptUrl =
            registration.active?.scriptURL ||
            registration.waiting?.scriptURL ||
            registration.installing?.scriptURL ||
            "";
          if (scriptUrl.endsWith("/app-sw.js")) void registration.unregister();
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
