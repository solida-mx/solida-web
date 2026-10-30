// La agenda abre aunque la señal esté mala: la app se guarda en el teléfono; las citas siempre se piden al servidor.
const VERSION = 'agenda-v1';
const APP = ['/_app/app.css', '/_app/app.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('agenda-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Primero la red (para estrenar cambios); si no hay, lo guardado.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok && (e.request.mode === 'navigate' || APP.includes(u.pathname))) { const c = r.clone(); caches.open(VERSION).then((k) => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
