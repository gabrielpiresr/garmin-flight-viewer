export function registerAppServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/app-sw.js").catch(() => {
      // Offline support is best-effort; the app still works online without the worker.
    });
  });
}
