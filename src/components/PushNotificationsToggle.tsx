import { useEffect, useState } from "react";
import {
  disablePushNotifications,
  enablePushNotifications,
  getCurrentPushSubscription,
  isPushSupported,
} from "../lib/pushNotifications";
import { useToast } from "./ui/ToastProvider";

export function PushNotificationsToggle() {
  const { showToast } = useToast();
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (!ok) return;
    let cancelled = false;
    void getCurrentPushSubscription()
      .then((subscription) => {
        if (!cancelled) setEnabled(Boolean(subscription));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await disablePushNotifications();
        setEnabled(false);
        showToast({ variant: "success", message: "Notificações push desativadas neste navegador." });
      } else {
        await enablePushNotifications();
        setEnabled(true);
        showToast({ variant: "success", message: "Notificações push ativadas neste navegador." });
      }
    } catch (e) {
      showToast({ variant: "error", message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={`inline-flex rounded-lg border px-3 py-1.5 text-xs transition ${
        enabled
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
          : "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      } disabled:opacity-50`}
      title={enabled ? "Desativar notificações push" : "Ativar notificações push"}
    >
      {busy ? "Push..." : enabled ? "Push ativo" : "Ativar push"}
    </button>
  );
}
