// Servicio de citas de Solida (Agenda Total). Un Worker y una base para todos los negocios.
//
// Públicas (las usa la página del negocio):
//   GET  /api/:negocio/ocupado?desde=AAAA-MM-DD&dias=14   horas ocupadas, sin datos de nadie
//   POST /api/:negocio/citas                              apartar una cita (no deja apartar una hora ocupada)
// De la dueña (con la clave que le da Solida):
//   POST /api/:negocio/entrar {clave}                     → {token} para 30 días
//   GET  /api/:negocio/agenda?desde=&hasta=               citas y bloqueos con sus datos
//   POST /api/:negocio/citas/:folio/estado {estado}       confirmar o cancelar
//   POST /api/:negocio/bloqueos · DELETE /api/:negocio/bloqueos/:id
// De Solida (con la clave maestra):
//   POST /api/admin/negocios {id, nombre}                 dar de alta un negocio (o cambiarle la clave)
//   GET  /api/admin/negocios
// Una vez al día se borran las citas de hace más de 120 días: no guardamos datos de nadie más de lo necesario.

const DIAS_GUARDADO = 120;
const DIAS_MAX_ADELANTE = 90;
const ahora = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();

export class ErrorHttp extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);
    try {
      return cors(await enrutar(request, env), request);
    } catch (e) {
      if (e instanceof ErrorHttp) return cors(json({ error: e.message }, e.status), request);
      console.error(e);
      return cors(json({ error: 'Error interno' }, 500), request);
    }
  },
  async scheduled(_c, env, ctx) {
    ctx.waitUntil(limpia(env));
  },
};

async function enrutar(request, env) {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  let p;
  if (ruta === '' || ruta === '/') return json({ servicio: 'citas de Solida', ok: true });

  if (ruta === '/api/admin/negocios') {
    await exigeMaestra(request, env);
    if (m === 'GET') return json((await env.DB.prepare('SELECT id, nombre, zona, activo, creado FROM negocios ORDER BY creado').all()).results);
    if (m === 'POST') return json(await altaNegocio(env, await cuerpo(request)), 201);
  }

  if (!(p = ruta.match(/^\/api\/([a-z0-9-]{2,40})(\/.*)?$/))) throw new ErrorHttp(404, 'No existe');
  const neg = await env.DB.prepare('SELECT * FROM negocios WHERE id=? AND activo=1').bind(p[1]).first();
  if (!neg) throw new ErrorHttp(404, 'Negocio no encontrado');
  const sub = p[2] || '';

  if (sub === '/ocupado' && m === 'GET') return json(await ocupado(env, neg, url), 200, { 'Cache-Control': 'no-store' });
  if (sub === '/citas' && m === 'POST') {
    const dueña = await tokenValido(request, env, neg.id);
    if (!dueña) await limita(env, 'cita:' + neg.id + ':' + await ipDe(request, env), 6, 3600, 'Ya apartaste varias citas. Si necesitas otra, escríbele al negocio por WhatsApp.');
    return json(await apartar(env, neg, await cuerpo(request), dueña), 201);
  }
  if (sub === '/entrar' && m === 'POST') {
    const ip = await ipDe(request, env);
    await limita(env, 'entrar:' + neg.id + ':' + ip, 8, 3600, 'Demasiados intentos. Espera una hora e inténtalo de nuevo.');
    const d = await cuerpo(request);
    const clave = normalizaClave(d.clave);
    if (!clave || await sha256(clave) !== neg.clave_hash) throw new ErrorHttp(401, 'Esa clave no es la de este negocio.');
    return json({ token: await firmaToken(env, neg.id), nombre: neg.nombre });
  }

  // De aquí en adelante, sólo la dueña
  if (!(await tokenValido(request, env, neg.id))) throw new ErrorHttp(401, 'Entra con tu clave.');
  if (sub === '/agenda' && m === 'GET') return json(await agenda(env, neg, url));
  if ((p = sub.match(/^\/citas\/([A-Z0-9-]{4,20})\/estado$/)) && m === 'POST') {
    const d = await cuerpo(request);
    if (!['confirmada', 'cancelada', 'apartada'].includes(d.estado)) throw new ErrorHttp(400, 'Estado no válido');
    const r = await env.DB.prepare('UPDATE citas SET estado=? WHERE negocio_id=? AND folio=?').bind(d.estado, neg.id, p[1]).run();
    if (!r.meta.changes) throw new ErrorHttp(404, 'No existe esa cita');
    return json({ ok: true });
  }
  if (sub === '/bloqueos' && m === 'POST') return json(await bloquear(env, neg, await cuerpo(request)), 201);
  if ((p = sub.match(/^\/bloqueos\/(\d+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM bloqueos WHERE negocio_id=? AND id=?').bind(neg.id, Number(p[1])).run();
    return json({ ok: true });
  }
  throw new ErrorHttp(404, 'No existe');
}

// ───────── disponibilidad y citas ─────────

export function hoyEn(zona, t = Date.now()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { fecha: `${f.year}-${f.month}-${f.day}`, min: Number(f.hour) * 60 + Number(f.minute) };
}
export function sumaDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const ident = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
const entero = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

async function ocupado(env, neg, url) {
  const hoy = hoyEn(neg.zona).fecha;
  let desde = url.searchParams.get('desde') || hoy;
  if (!FECHA.test(desde) || desde < hoy) desde = hoy;
  const dias = Math.min(DIAS_MAX_ADELANTE, Math.max(1, Number(url.searchParams.get('dias')) || 14));
  const hasta = sumaDias(desde, dias);
  const c = (await env.DB.prepare("SELECT fecha, inicio_min ini, fin_min fin, persona FROM citas WHERE negocio_id=? AND fecha>=? AND fecha<? AND estado<>'cancelada'")
    .bind(neg.id, desde, hasta).all()).results;
  const b = (await env.DB.prepare('SELECT fecha, inicio_min ini, fin_min fin, persona FROM bloqueos WHERE negocio_id=? AND fecha>=? AND fecha<?')
    .bind(neg.id, desde, hasta).all()).results;
  return { desde, hasta, ocupado: c.concat(b) };
}

export function validaCita(d, zona, t = Date.now()) {
  const hoy = hoyEn(zona, t);
  const fecha = String(d.fecha || '');
  if (!FECHA.test(fecha)) throw new ErrorHttp(400, 'Falta el día');
  if (fecha < hoy.fecha || fecha > sumaDias(hoy.fecha, DIAS_MAX_ADELANTE)) throw new ErrorHttp(400, 'Ese día no se puede apartar');
  const hm = String(d.hora || '').match(/^(\d{2}):(\d{2})$/);
  if (!hm) throw new ErrorHttp(400, 'Falta la hora');
  const ini = Number(hm[1]) * 60 + Number(hm[2]);
  const dur = entero(d.min, 10, 600);
  if (ini > 1439 || dur == null) throw new ErrorHttp(400, 'Hora o duración no válidas');
  if (fecha === hoy.fecha && ini <= hoy.min) throw new ErrorHttp(400, 'Esa hora ya pasó');
  const nombre = texto(d.nombre, 60);
  const tel = String(d.tel || '').replace(/\D/g, '').slice(-10);
  if (nombre.length < 2) throw new ErrorHttp(400, 'Falta tu nombre');
  if (tel.length !== 10) throw new ErrorHttp(400, 'Tu WhatsApp debe tener 10 dígitos');
  const equipo = Array.isArray(d.equipo) ? d.equipo.map(ident).filter(Boolean).slice(0, 20) : [];
  return {
    fecha, ini, fin: Math.min(1440, ini + dur), persona: ident(d.persona), equipo,
    servicio: texto(d.servicio, 80) || 'Servicio', diseno: texto(d.diseno, 80), detalle: texto(d.largo || d.detalle, 40),
    precio: entero(d.precio, 0, 1000000) || 0, anticipo: entero(d.anticipo, 0, 1000000) || 0, nombre, tel,
  };
}

async function apartar(env, neg, d, deLaDueña) {
  const c = validaCita(d, neg.zona);
  // Con quién: la que eligió, o la primera del equipo que esté libre. Sin equipo, el negocio es un solo lugar.
  const candidatas = c.persona ? [c.persona] : (c.equipo.length ? c.equipo : ['']);
  const folio = 'C-' + aleatorio(6);
  for (const persona of candidatas) {
    // Un solo INSERT … WHERE NOT EXISTS: dos personas apartando la misma hora al mismo tiempo no pueden ganar las dos.
    const r = await env.DB.prepare(`INSERT INTO citas (negocio_id, folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
      WHERE NOT EXISTS (SELECT 1 FROM citas WHERE negocio_id=?1 AND fecha=?3 AND estado<>'cancelada' AND inicio_min < ?5 AND fin_min > ?4
                          AND (persona=?6 OR persona='' OR ?6=''))
        AND NOT EXISTS (SELECT 1 FROM bloqueos WHERE negocio_id=?1 AND fecha=?3 AND inicio_min < ?5 AND fin_min > ?4 AND (persona=?6 OR persona=''))`)
      .bind(neg.id, folio, c.fecha, c.ini, c.fin, persona, c.servicio, c.diseno, c.detalle, c.precio, c.anticipo, c.nombre, c.tel,
        deLaDueña ? 'confirmada' : 'apartada', deLaDueña ? 'negocio' : 'pagina', ahora()).run();
    if (r.meta.changes) return { folio, persona, estado: deLaDueña ? 'confirmada' : 'apartada' };
  }
  throw new ErrorHttp(409, 'Alguien acaba de apartar esa hora. Elige otra.');
}

async function agenda(env, neg, url) {
  const hoy = hoyEn(neg.zona).fecha;
  const desde = FECHA.test(url.searchParams.get('desde') || '') ? url.searchParams.get('desde') : sumaDias(hoy, -1);
  const hasta = FECHA.test(url.searchParams.get('hasta') || '') ? url.searchParams.get('hasta') : sumaDias(hoy, 60);
  const citas = (await env.DB.prepare(`SELECT folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada
      FROM citas WHERE negocio_id=? AND fecha>=? AND fecha<=? ORDER BY fecha, inicio_min`).bind(neg.id, desde, hasta).all()).results;
  const bloqueos = (await env.DB.prepare('SELECT id, fecha, inicio_min, fin_min, persona, motivo FROM bloqueos WHERE negocio_id=? AND fecha>=? AND fecha<=? ORDER BY fecha, inicio_min')
    .bind(neg.id, desde, hasta).all()).results;
  return { hoy, citas, bloqueos };
}

async function bloquear(env, neg, d) {
  const fecha = String(d.fecha || '');
  if (!FECHA.test(fecha)) throw new ErrorHttp(400, 'Falta el día');
  let ini = 0, fin = 1440;
  if (d.desde || d.hasta) {
    const a = String(d.desde || '').match(/^(\d{2}):(\d{2})$/), b = String(d.hasta || '').match(/^(\d{2}):(\d{2})$/);
    if (!a || !b) throw new ErrorHttp(400, 'Pon la hora de inicio y de fin');
    ini = Number(a[1]) * 60 + Number(a[2]); fin = Number(b[1]) * 60 + Number(b[2]);
    if (fin <= ini) throw new ErrorHttp(400, 'La hora de fin va después de la de inicio');
  }
  const r = await env.DB.prepare('INSERT INTO bloqueos (negocio_id, fecha, inicio_min, fin_min, persona, motivo, creado) VALUES (?,?,?,?,?,?,?)')
    .bind(neg.id, fecha, ini, fin, ident(d.persona), texto(d.motivo, 80), ahora()).run();
  return { id: r.meta.last_row_id };
}

// ───────── alta de negocios (Solida) ─────────

async function altaNegocio(env, d) {
  const id = String(d.id || '').toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new ErrorHttp(400, 'El id va en minúsculas, números y guiones');
  const nombre = texto(d.nombre, 80);
  if (!nombre) throw new ErrorHttp(400, 'Falta el nombre');
  const zona = texto(d.zona, 40) || 'America/Monterrey';
  try { new Intl.DateTimeFormat('es', { timeZone: zona }); } catch { throw new ErrorHttp(400, 'Zona horaria no válida'); }
  const clave = generaClave();
  await env.DB.prepare(`INSERT INTO negocios (id, nombre, clave_hash, zona, activo, creado) VALUES (?,?,?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, clave_hash=excluded.clave_hash, zona=excluded.zona, activo=1`)
    .bind(id, nombre, await sha256(clave), zona, ahora()).run();
  return { id, nombre, clave, aviso: 'Guarda esta clave y dásela a la dueña. No se vuelve a mostrar; si se pierde, se genera otra.' };
}

// ───────── seguridad ─────────

const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sin 0/O, 1/I/L
export function generaClave() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(b, (x) => LETRAS[x % LETRAS.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
export const normalizaClave = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');
function aleatorio(n) { const b = crypto.getRandomValues(new Uint8Array(n)); return Array.from(b, (x) => LETRAS[x % LETRAS.length]).join(''); }
export async function sha256(t) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function hmac(env, t) {
  if (!env.SECRETO || env.SECRETO.length < 24) throw new ErrorHttp(500, 'Falta configurar SECRETO');
  const k = await crypto.subtle.importKey('raw', enc.encode(env.SECRETO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(t))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function firmaToken(env, negocio, dias = 30) { const exp = ahora() + dias * 86400; return `${negocio}.${exp}.${await hmac(env, negocio + '.' + exp)}`; }
export async function tokenValido(request, env, negocio) {
  const a = request.headers.get('Authorization') || '';
  const t = a.startsWith('Bearer ') ? a.slice(7) : '';
  const [n, exp, firma] = t.split('.');
  if (!firma || n !== negocio || Number(exp) < ahora()) return false;
  const bien = await hmac(env, n + '.' + exp);
  if (bien.length !== firma.length) return false;
  let dif = 0; for (let i = 0; i < bien.length; i++) dif |= bien.charCodeAt(i) ^ firma.charCodeAt(i);
  return dif === 0;
}
async function exigeMaestra(request, env) {
  const a = request.headers.get('Authorization') || '';
  if (!env.MAESTRA || env.MAESTRA.length < 24 || a !== 'Bearer ' + env.MAESTRA) throw new ErrorHttp(401, 'No autorizado');
}
async function ipDe(request, env) { return (await sha256((request.headers.get('CF-Connecting-IP') || 'local') + (env.SECRETO || ''))).slice(0, 16); }
async function limita(env, clave, max, ventanaSeg, mensaje) {
  const v = Math.floor(ahora() / ventanaSeg);
  const r = await env.DB.prepare('INSERT INTO intentos (clave, ventana, n) VALUES (?,?,1) ON CONFLICT(clave, ventana) DO UPDATE SET n=n+1 RETURNING n').bind(clave, v).first();
  if (r && r.n > max) throw new ErrorHttp(429, mensaje);
}

async function limpia(env) {
  const corte = sumaDias(hoyEn('America/Monterrey').fecha, -DIAS_GUARDADO);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM citas WHERE fecha < ?').bind(corte),
    env.DB.prepare('DELETE FROM bloqueos WHERE fecha < ?').bind(corte),
    env.DB.prepare('DELETE FROM intentos WHERE ventana < ?').bind(Math.floor(ahora() / 3600) - 48),
  ]);
}

// ───────── utilidades ─────────

async function cuerpo(request) {
  const t = await request.text();
  if (t.length > 8000) throw new ErrorHttp(413, 'Demasiado grande');
  try { const d = JSON.parse(t || '{}'); return d && typeof d === 'object' ? d : {}; } catch { throw new ErrorHttp(400, 'JSON no válido'); }
}
function json(d, status = 200, extra = {}) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
// Cualquier página puede consultar y apartar (las de los clientes viven en sus propios dominios);
// lo privado se protege con el token, no con el origen.
function cors(res, request) {
  const r = new Response(res.body, res);
  r.headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  r.headers.set('Vary', 'Origin');
  r.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  r.headers.set('Access-Control-Max-Age', '86400');
  return r;
}
