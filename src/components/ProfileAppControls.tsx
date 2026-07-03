import { InstallPwaButton } from "./InstallPwaButton";
import { PushNotificationsToggle } from "./PushNotificationsToggle";

export function ProfileAppControls() {
  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Aplicativo</p>
          <p className="mt-1 text-sm text-slate-300">Instalação e notificações deste navegador.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InstallPwaButton />
          <PushNotificationsToggle />
        </div>
      </div>
    </section>
  );
}
