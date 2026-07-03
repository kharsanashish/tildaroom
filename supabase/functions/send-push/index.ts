// supabase/functions/send-push/index.ts
// Deno Edge Function — sends a Web Push notification to a user's browser.
// Requires an authenticated caller. Callers may only send:
//   - owner → any tenant
//   - tenant → the owner (from settings.owner_id)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — Deno npm: specifier
import webPush from "npm:web-push@3";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON    = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // ── AuthN: require a Supabase user JWT ──────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const callerId = userData.user.id;

    const { toUserId, title, body, url = "/", tag = "tildaroom" } = await req.json();
    if (!toUserId || !title || !body) {
      return json({ error: "Missing toUserId / title / body" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE);

    // ── AuthZ: caller must be owner, OR a tenant messaging the owner ────
    const { data: isOwner } = await admin.rpc("has_role", {
      _user_id: callerId, _role: "owner",
    });

    let allowed = Boolean(isOwner);
    if (!allowed) {
      // Tenant path: only permit sending to the configured owner_id
      const { data: settings } = await admin
        .from("settings").select("owner_id").eq("id", 1).maybeSingle();
      if (settings?.owner_id && settings.owner_id === toUserId) allowed = true;
    }
    if (!allowed) return json({ error: "Forbidden" }, 403);

    // Look up all browser subscriptions for the target user
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", toUserId);

    if (error || !subscriptions?.length) {
      return json({ error: "No subscription found" }, 404);
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
      return json({ error: message }, stale > 0 ? 409 : 500);
    }

    return json({ ok: true, sent });
  } catch (e) {
    console.error("send-push error:", e);
    return json({ error: String(e) }, 500);
  }
});
