import { WEB_PUSH_PUBLIC_KEY } from "./appwrite";
import { deletePushSubscription, registerPushSubscription } from "./notificationsDb";

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      WEB_PUSH_PUBLIC_KEY,
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/notification-sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/notification-sw.js");
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  return registration.pushManager.getSubscription();
}

function subscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
    userAgent: navigator.userAgent,
  };
}

export async function enablePushNotifications(): Promise<void> {
  if (!isPushSupported() || !WEB_PUSH_PUBLIC_KEY) {
    throw new Error("Push não suportado ou chave pública VAPID ausente.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de push não concedida.");

  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    }));

  const payload = subscriptionPayload(subscription);
  if (!payload.endpoint || !payload.keys.p256dh || !payload.keys.auth) {
    throw new Error("Subscription de push incompleta.");
  }
  await registerPushSubscription(payload);
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  await deletePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
