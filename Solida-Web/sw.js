/* Service worker de Mi Plan — funciona sin conexión en el gimnasio.
   Sube VERSION cuando cambies index.html o app.js para forzar actualización. */
const VERSION = "mi-plan-v2.0.0";
const SHELL = ["./", "index.html", "app.js", "manifest.json",
               "img/icon-192.png", "img/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // App (html/js/manifest): red primero, caché de respaldo → siempre al día, pero abre sin señal
  const isShell = req.mode === "navigate" || /app\.js$|index\.html$|manifest\.json$/.test(url.pathname);
  if (isShell) {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match("index.html")))
    );
    return;
  }
  // Imágenes y demás: caché primero, se guardan la primera vez que se ven
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => hit))
  );
});
