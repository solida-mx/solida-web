/* Service worker de Mi Plan — funciona sin conexión en el gimnasio.
   Sube VERSION cuando cambies index.html o app.js.

   Dos cachés a propósito:
     SHELL_CACHE  se versiona y se purga en cada actualización.
     IMG_CACHE    NO se purga: guarda las ~113 fotos de ejercicios y
                  alimentos. Antes todo vivía junto, así que cada
                  actualización borraba la biblioteca de imágenes y
                  volvías al gimnasio sin fotos. */
const APP         = "mi-plan";
const VERSION     = "mi-plan-v6.10.0";
/* Prefijados con el nombre de la app: CacheStorage es POR ORIGEN, no por
   scope. Purgar por "shell-" borraba la caché de las apps hermanas del
   mismo dominio, y "img-v1" era un nombre genérico que compartían. */
const SHELL_CACHE = APP + ":shell-" + VERSION;
const IMG_CACHE   = APP + ":img-v1";
const SHELL = ["./", "index.html", "asistente.js", "finanzas.js", "app.js", "manifest.json",
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
      /* sólo lo nuestro, incluidos los nombres viejos sin prefijo */
      if(k.startsWith(APP + ":") || k.startsWith("shell-mi-plan-") || k.startsWith("mi-plan-"))
        return caches.delete(k);
      return null;                       /* cachés de otras apps: intactas */
    }));
    await self.clients.claim();
  })());
});

/* Descargar todas las imágenes de golpe, desde Ajustes, antes de ir al gym.
   El SW no puede adivinar la lista, así que la app se la manda. */
const TOPE_PRECACHE = 400;        /* hoy son ~113; el tope es el freno */

self.addEventListener("message", e => {
  const d = e.data || {};
  if(d.tipo !== "precachear-imagenes") return;

  /* Sólo una ventana DENTRO de nuestro scope puede pedir esto. Antes
     cualquier página del mismo origen (o un XSS) podía mandar una lista
     enorme y agotar la cuota, lo que además rompe localStorage. */
  const src = e.source;
  if(!src || src.type !== "window") return;
  try{
    const base = new URL(self.registration.scope);
    const quien = new URL(src.url);
    if(quien.origin !== base.origin || !quien.pathname.startsWith(base.pathname)) return;
  }catch(err){ return; }

  if(!Array.isArray(d.urls)) return;
  const puerto = e.ports && e.ports[0];

  /* mismo origen, dentro del scope, sin duplicados y con tope */
  const limpias = [];
  const vistas = new Set();
  for(const u of d.urls){
    if(typeof u !== "string") continue;
    let abs;
    try{ abs = new URL(u, self.registration.scope); }catch(err){ continue; }
    if(abs.origin !== location.origin) continue;
    if(!abs.pathname.startsWith(new URL(self.registration.scope).pathname)) continue;
    if(abs.search || abs.hash) continue;          /* ?x=1 multiplicaba la caché */
    if(!/\.(png|jpe?g|webp|svg|gif)$/i.test(abs.pathname)) continue;
    const clave = abs.href;
    if(vistas.has(clave)) continue;
    vistas.add(clave); limpias.push(clave);
    if(limpias.length >= TOPE_PRECACHE) break;
  }

  e.waitUntil((async () => {
    const c = await caches.open(IMG_CACHE);
    let hechas = 0, fallidas = 0, sinEspacio = false;
    const total = limpias.length;
    for(const u of limpias){
      try{
        if(await c.match(u)) hechas++;
        else { await c.add(u); hechas++; }
      }catch(err){
        fallidas++;
        /* si ya no cabe, cortamos: seguir sólo empeora la cuota del origen */
        if(err && (err.name === "QuotaExceededError" || /quota/i.test(String(err.message)))){
          sinEspacio = true; break;
        }
      }
      if(puerto && (hechas + fallidas) % 5 === 0)
        puerto.postMessage({hechas, fallidas, total});
    }
    if(puerto) puerto.postMessage({hechas, fallidas, total, fin:true, sinEspacio});
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

  /* anclado a nuestro scope: sin esto, /barberia/app.js del mismo dominio
     entraba a nuestra caché de shell */
  const dentro = url.pathname.startsWith(new URL(self.registration.scope).pathname);
  const esShell = dentro && (req.mode === "navigate" ||
                  /(^|\/)(app\.js|finanzas\.js|asistente\.js|index\.html|manifest\.json)$/.test(url.pathname));

  if(esShell){
    e.respondWith((async () => {
      try{
        const r = await redConLimite(req, 3000);
        /* Sólo cacheamos respuestas buenas. El wifi del gimnasio con pantalla
           de "acepta los términos" responde 200 con SU html: sin esta guarda
           se guardaba encima de index.html y la app abría el portal. */
        const ct = r.headers.get("content-type") || "";
        /* cada recurso del shell sólo se cachea si el tipo cuadra: un 200 con
           HTML en /app.js dejaba la app en blanco de forma persistente */
        const esperado = req.mode === "navigate" || /index\.html$/.test(url.pathname) ? "text/html"
                       : /(app|finanzas|asistente)\.js$/.test(url.pathname) ? "javascript"
                       : /manifest\.json$/.test(url.pathname) ? "json" : null;
        const sirve = r.status === 200 && r.type !== "opaqueredirect" && !r.redirected &&
                      (!esperado || ct.includes(esperado));
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
