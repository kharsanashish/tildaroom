// supabase/functions/send-push/index.ts
// Deno Edge Function — sends Web Push notifications to a tenant's browser subscriptions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — Deno npm: specifier
import webpush from "npm:web-push@3";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC     = Deno.env.get("VAPID_PUBLIC_KEY") ?? Deno.env.get("VITE_VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE    = Deno.env.get("VAPID_PRIVATE_KEY")!;
const rawVapidSubject  = Deno.env.get("VAPID_SUBJECT") ?? "admin@tildaroom.app";
const VAPID_SUBJECT    = rawVapidSubject.includes(":") ? rawVapidSubject : `mailto:${rawVapidSubject}`;

// @ts-ignore — library types
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const requestBody = await req.json();
    if (requestBody?.action === "vapid-public-key") {
      return json({ publicKey: VAPID_PUBLIC });
    }

    const { tenant_id, toUserId, message, body, title, url, tag } = requestBody;
    const tenantId = tenant_id ?? toUserId;
    const pushBody = message ?? body;

    if (!tenantId || !pushBody) {
      return json({ error: "Missing tenant_id or message" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", tenantId);

    if (error) {
      console.error("Failed to load subscriptions:", error);
      return json({ error: error.message }, 500);
    }

    if (!subscriptions?.length) {
      return json({ success: false, sentCount: 0, failedCount: 0, reason: "no_subscription" });
    }

    const notificationPayload = JSON.stringify({
      title: title || "TildaRoom",
      body: pushBody,
      url: url || "/",
      tag: tag || "tildaroom",
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const sub of subscriptions) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        // @ts-ignore — library types
        await webpush.sendNotification(pushSub, notificationPayload);
        sentCount++;
      } catch (err) {
        failedCount++;
        const statusCode = typeof err === "object" && err && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
        if (statusCode === 403 || statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
        console.warn("Push send failed:", statusCode, err);
      }
    }

    return json({
      success: sentCount > 0,
      sentCount,
      failedCount,
      reason: sentCount > 0 ? undefined : "no_deliverable_subscription",
    });
  } catch (e) {
    console.error("send-push error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
