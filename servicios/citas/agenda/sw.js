// La agenda abre aunque la señal esté mala: la app se guarda en el teléfono; las citas siempre se piden al servidor.
const VERSION = 'agenda-__VERSION__';
const APP = ['/_app/app.css', '/_app/qr.js', '/_app/app.js'];
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

// Avisos: llega una señal sin datos; se le pregunta al servidor qué hay de nuevo y se enseña.
const NEGOCIO = new URL(self.registration.scope).pathname.split('/')[1];
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.pushManager.getSubscription()
    .then((sub) => sub ? fetch('/api/' + NEGOCIO + '/avisos/pendientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
      .then((r) => (r.ok ? r.json() : { avisos: [] })) : { avisos: [] })
    .catch(() => ({ avisos: [] }))
    .then((d) => {
      const l = d.avisos || [];
      const op = (a) => ({ body: a.cuerpo, icon: '/' + NEGOCIO + '/icono-192.png', badge: '/' + NEGOCIO + '/icono-192.png', tag: 'aviso-' + a.id, data: { url: a.url || '/' + NEGOCIO + '/' } });
      if (!l.length) return self.registration.showNotification('Tu agenda', { body: 'Tienes novedades en tu agenda.', icon: '/' + NEGOCIO + '/icono-192.png', tag: 'agenda', data: { url: '/' + NEGOCIO + '/' } });
      return Promise.all(l.map((a) => self.registration.showNotification(a.titulo, op(a))));
    }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/' + NEGOCIO + '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => new URL(x.url).pathname.startsWith('/' + NEGOCIO + '/'));
    if (w) return w.focus().then(() => (w.navigate ? w.navigate(url) : null)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
