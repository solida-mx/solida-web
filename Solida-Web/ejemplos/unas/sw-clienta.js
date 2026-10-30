// El service worker de la página del negocio (la app de la clienta). Cópialo a la raíz de su sitio como sw.js.
// Sólo sirve para los avisos: llega una señal sin datos y se le pregunta al servicio de citas qué hay de nuevo.
const API = new URL(self.location.href).searchParams.get('api') || '';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.pushManager.getSubscription()
    .then((sub) => sub && API ? fetch(API + '/avisos/pendientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
      .then((r) => (r.ok ? r.json() : { avisos: [] })) : { avisos: [] })
    .catch(() => ({ avisos: [] }))
    .then((d) => {
      const l = d.avisos || [], icono = 'https://agenda.solidaaplicaciones.com/_app/icono-192.png';
      if (!l.length) return self.registration.showNotification('Tu cita', { body: 'Hay novedades en tu cita.', icon: icono, tag: 'cita', data: { url: self.registration.scope } });
      return Promise.all(l.map((a) => self.registration.showNotification(a.titulo, { body: a.cuerpo, icon: icono, badge: icono, tag: 'aviso-' + a.id, data: { url: a.url || self.registration.scope } })));
    }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || self.registration.scope, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => x.url.split('#')[0] === url.split('#')[0]);
    return w ? w.focus() : self.clients.openWindow(url);
  }));
});
