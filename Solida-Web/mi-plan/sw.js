/* Service worker de Mi Plan — funciona sin conexión en el gimnasio.
   Sube VERSION cuando cambies index.html o app.js.

   Dos cachés a propósito:
     SHELL_CACHE  se versiona y se purga en cada actualización.
     IMG_CACHE    NO se purga: guarda las ~113 fotos de ejercicios y
                  alimentos. Antes todo vivía junto, así que cada
                  actualización borraba la biblioteca de imágenes y
                  volvías al gimnasio sin fotos. */
const VERSION     = "mi-plan-v4.0.0";
const SHELL_CACHE = "shell-" + VERSION;
const IMG_CACHE   = "img-v1";
const SHELL = ["./", "index.html", "app.js", "manifest.json",
               "img/icon-192.png", "img/icon-512.png",
               "img/icon-512-maskable.png", "img/icon-180.png"];

/* Si un archivo del shell falta, antes fallaba addAll completo, el SW nunca
   se activaba y la app se quedaba sin funcionar offline — en silencio. */
async function precacheTolerante(cache, urls){
  const fallidos = [];
  await Promise.all(urls.map(u =>
    cache.add(u).catch(() => fallidos.push(u))
  ));
  if(fallidos.length) console.warn("[sw] no se pudieron precachear:", fallidos);
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await precacheTolerante(c, SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if(k === SHELL_CACHE || k === IMG_CACHE) return null;
      if(k.startsWith("shell-") || k.startsWith("mi-plan-")) return caches.delete(k);
      return null;                       /* cachés ajenas: no las tocamos */
    }));
    await self.clients.claim();
  })());
});

/* Descargar todas las imágenes de golpe, desde Ajustes, antes de ir al gym.
   El SW no puede adivinar la lista, así que la app se la manda. */
self.addEventListener("message", e => {
  const d = e.data || {};
  if(d.tipo !== "precachear-imagenes") return;
  const puerto = e.ports && e.ports[0];
  e.waitUntil((async () => {
    const c = await caches.open(IMG_CACHE);
    let hechas = 0, fallidas = 0;
    const total = d.urls.length;
    for(const u of d.urls){
      try{
        if(await c.match(u)) { hechas++; }
        else { await c.add(u); hechas++; }
      }catch(err){ fallidas++; }
      if(puerto && (hechas + fallidas) % 5 === 0)
        puerto.postMessage({hechas, fallidas, total});
    }
    if(puerto) puerto.postMessage({hechas, fallidas, total, fin:true});
  })());
});

const esImagen = url => /\.(png|jpe?g|webp|svg|gif)$/i.test(url.pathname);

/* Red primero, pero sin quedarse colgado: con una barra de señal en el sótano
   el fetch puede tardar 30 s, y mientras tanto la app no pintaba nada aunque
   tuviera una copia perfecta en caché. */
function redConLimite(req, ms){
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); },
                    e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;

  const esShell = req.mode === "navigate" ||
                  /app\.js$|index\.html$|manifest\.json$/.test(url.pathname);

  if(esShell){
    e.respondWith((async () => {
      try{
        const r = await redConLimite(req, 3000);
        /* Sólo cacheamos respuestas buenas. El wifi del gimnasio con pantalla
           de "acepta los términos" responde 200 con SU html: sin esta guarda
           se guardaba encima de index.html y la app abría el portal. */
        const ct = r.headers.get("content-type") || "";
        const esHtml = req.mode === "navigate" || /index\.html$/.test(url.pathname);
        const sirve = r.ok && r.type !== "opaqueredirect" && !r.redirected &&
                      (!esHtml || ct.includes("text/html"));
        if(sirve){
          const cp = r.clone();
          e.waitUntil(caches.open(SHELL_CACHE).then(c => c.put(req, cp)).catch(()=>{}));
          return r;
        }
        const guardada = await caches.match(req, {cacheName: SHELL_CACHE});
        return guardada || r;
      }catch(err){
        const guardada = await caches.match(req, {cacheName: SHELL_CACHE});
        return guardada ||
               await caches.match("index.html", {cacheName: SHELL_CACHE}) ||
               new Response("Sin conexión y sin copia guardada.",
                 {status:503, headers:{"Content-Type":"text/plain; charset=utf-8"}});
      }
    })());
    return;
  }

  /* Imágenes y demás: caché primero */
  e.respondWith((async () => {
    const nombre = esImagen(url) ? IMG_CACHE : SHELL_CACHE;
    const hit = await caches.match(req, {cacheName: nombre});
    if(hit) return hit;
    try{
      const r = await fetch(req);
      if(r.ok){
        const cp = r.clone();
        e.waitUntil(caches.open(nombre).then(c => c.put(req, cp)).catch(()=>{}));
      }
      return r;
    }catch(err){
      /* Antes aquí se devolvía `hit`, que en esta rama siempre es undefined:
         respondWith recibía undefined y lanzaba TypeError en cada imagen. */
      return new Response("", {status:504, statusText:"Sin conexión"});
    }
  })());
});
