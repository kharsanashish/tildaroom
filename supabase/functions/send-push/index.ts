// supabase/functions/send-push/index.ts
// Deno Edge Function — sends a Web Push notification to a user's browser.
// Deploy: supabase functions deploy send-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, optional VAPID_SUBJECT email/URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — Deno npm: specifier
import webPush from "npm:web-push@3";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC     = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE    = Deno.env.get("VAPID_PRIVATE_KEY")!;
const rawVapidSubject  = Deno.env.get("VAPID_SUBJECT") ?? "admin@tildaroom.app";
const VAPID_SUBJECT    = rawVapidSubject.includes(":") ? rawVapidSubject : `mailto:${rawVapidSubject}`;

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { toUserId, title, body, url = "/", tag = "tildaroom" } = await req.json();

    if (!toUserId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing toUserId / title / body" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Look up all browser subscriptions for the target user
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", toUserId);

    if (error || !subscriptions?.length) {
      return new Response(JSON.stringify({ error: "No subscription found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body, url, tag, icon: "/favicon.ico" });
    let sent = 0;
    let stale = 0;
    let lastError = "Notification could not be sent";

    for (const sub of subscriptions) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      try {
        await webPush.sendNotification(pushSub, payload);
        sent++;
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 500;
        if (statusCode === 403 || statusCode === 404 || statusCode === 410) {
          stale++;
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          continue;
        }
        lastError = String(error);
      }
    }

    if (sent === 0) {
      const message = stale > 0
        ? "Recipient must reopen the app and allow notifications again"
        : lastError;
      return new Response(JSON.stringify({ error: message }), {
        status: stale > 0 ? 409 : 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
