/* UZU — service worker : reçoit les notifications push et ouvre la bonne vue de l'appli.
   À déposer à côté d'index.html (même dossier sur Vercel). Aucun cache : l'appli reste toujours à jour. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "UZU", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "UZU", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: d.url || "", id: d.id || null }
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var go = (e.notification.data && e.notification.data.url) || "";
  var target = self.registration.scope + (go ? "?go=" + encodeURIComponent(go) : "");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) {
        c.postMessage({ type: "uzu-go", go: go });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
