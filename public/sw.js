// TildaRoom Service Worker
// Handles: push notifications, basic offline caching

const CACHE = "tildaroom-v1";
const STATIC = ["/", "/favicon.ico", "/manifest.json"];

// ── Install: cache static shell ────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, fall back to cache ───────────────────────────────
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Push: show notification ────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: "TildaRoom", body: e.data.text(), icon: "/favicon.ico" };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag || "tildaroom",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: payload.url || "/" },
  };

  e.waitUntil(self.registration.showNotification(payload.title || "TildaRoom", options));
});

// ── Notification click: open / focus the app ──────────────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "/";

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(target);
      } else {
        self.clients.openWindow(target);
      }
    })
  );
});
