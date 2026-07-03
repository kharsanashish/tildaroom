import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

// ── Convert VAPID public key (URL-safe base64) → Uint8Array ───────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// ── Register service worker once ──────────────────────────────────────────
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (e) {
    console.warn("SW registration failed:", e);
    return null;
  }
}

// ── Subscribe browser to Web Push and store in Supabase ───────────────────
export async function subscribePush(userId: string): Promise<boolean> {
  if (!("PushManager" in window)) return false;
  if ("Notification" in window) {
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") return false;
  }
  if (!VAPID_PUBLIC_KEY) {
    console.warn("VITE_VAPID_PUBLIC_KEY not set — push disabled");
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();

    const existingKey = sub?.options.applicationServerKey;
    if (sub && existingKey) {
      const existing = new Uint8Array(existingKey);
      const keyChanged =
        existing.length !== applicationServerKey.length ||
        existing.some((value, index) => value !== applicationServerKey[index]);

      if (keyChanged) {
        await sub.unsubscribe();
        sub = null;
      }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });
    }

    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      console.warn("Push subscription missing required fields");
      return false;
    }

    // Upsert into Supabase — one row per browser subscription
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) console.warn("Failed to store push subscription:", error.message);
    return !error;
  } catch (e) {
    console.warn("Push subscribe failed:", e);
    return false;
  }
}

// ── Unsubscribe (on sign-out) ─────────────────────────────────────────────
export async function unsubscribePush(userId: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    } else {
      await supabase.from("push_subscriptions").delete().eq("user_id", userId);
    }
  } catch (e) {
    console.warn("Push unsubscribe failed:", e);
  }
}

// ── Send push via Supabase Edge Function ──────────────────────────────────
export async function sendPush(opts: {
  toUserId: string;          // recipient user_id in Supabase auth
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        tenant_id: opts.toUserId,
        title: opts.title,
        message: opts.body,
        url: opts.url,
        tag: opts.tag,
      },
    });
    if (error) {
      let message = error.message;
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const payload = await context.clone().json();
          if (payload?.error) message = payload.error;
        } catch {
          // Keep the original error message.
        }
      }
      console.warn("sendPush error:", message);
      return { ok: false, error: message };
    }
    if (data?.ok) return { ok: true };
    return { ok: false, error: data?.error ?? "Notification could not be sent" };
  } catch (e) {
    console.warn("sendPush failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Notification request failed" };
  }
}
