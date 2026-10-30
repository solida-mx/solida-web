// Servicio de citas de Solida (Agenda Total). Un Worker y una base para todos los negocios.
//
// Públicas (las usa la página del negocio):
//   GET  /api/:negocio/ocupado?desde=AAAA-MM-DD&dias=14   horas ocupadas, sin datos de nadie
//   POST /api/:negocio/citas                              apartar una cita (no deja apartar una hora ocupada)
// De la dueña (con la clave que le da Solida):
//   POST /api/:negocio/entrar {clave}                     → {token} para 30 días
//   GET  /api/:negocio/agenda?desde=&hasta=               citas y bloqueos con sus datos
//   POST /api/:negocio/citas/:folio/estado {estado}       confirmar o cancelar
//   POST /api/:negocio/bloqueos {fecha, fechaFin?, desde?, hasta?} · DELETE /api/:negocio/bloqueos/:id
//   PUT  /api/:negocio/horario {persona, semana}            cuándo trabaja cada quien (Mis tiempos)
//   POST /api/:negocio/repetidos · DELETE /api/:negocio/repetidos/:id   planes que se repiten
//   GET  /api/:negocio/perfil                             nombre, equipo y página (lo que la agenda pinta)
// De Solida (con la clave maestra):
//   POST /api/admin/negocios {id, nombre, equipo?, pagina?}  dar de alta un negocio (o cambiarle la clave)
//   POST /api/admin/negocios/:id/perfil {equipo?, pagina?}  cambiar equipo o página sin tocar la clave
//   GET  /api/admin/negocios
// La agenda de la dueña (una app instalable, aparte de la página del negocio):
//   agenda.solidaaplicaciones.com/:negocio/   ·  /ejemplo/ es la de muestra para el catálogo
// Una vez al día se borran las citas de hace más de 120 días: no guardamos datos de nadie más de lo necesario.

import ARCHIVOS from './agenda.generados.js';

const DIAS_GUARDADO = 120;
const AGENDA = 'https://agenda.solidaaplicaciones.com';
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
  if (!url.pathname.startsWith('/api/')) return app(request, env, url);

  if (ruta === '/api/admin/negocios') {
    await exigeMaestra(request, env);
    if (m === 'GET') return json((await env.DB.prepare('SELECT id, nombre, zona, activo, creado FROM negocios ORDER BY creado').all()).results);
    if (m === 'POST') return json(await altaNegocio(env, await cuerpo(request)), 201);
  }
  if ((p = ruta.match(/^\/api\/admin\/negocios\/([a-z0-9-]{2,40})\/perfil$/)) && m === 'POST') {
    await exigeMaestra(request, env);
    const d = await cuerpo(request);
    const r = await env.DB.prepare('UPDATE negocios SET equipo=COALESCE(?,equipo), pagina=COALESCE(?,pagina) WHERE id=?')
      .bind(d.equipo !== undefined ? JSON.stringify(limpiaEquipo(d.equipo)) : null, d.pagina !== undefined ? limpiaPagina(d.pagina) : null, p[1]).run();
    if (!r.meta.changes) throw new ErrorHttp(404, 'Negocio no encontrado');
    return json(perfilDe(await env.DB.prepare('SELECT * FROM negocios WHERE id=?').bind(p[1]).first()));
  }

  if (!(p = ruta.match(/^\/api\/([a-z0-9-]{2,40})(\/.*)?$/))) throw new ErrorHttp(404, 'No existe');
  const neg = await env.DB.prepare('SELECT * FROM negocios WHERE id=? AND activo=1').bind(p[1]).first();
  if (!neg) throw new ErrorHttp(404, 'Negocio no encontrado');
  const sub = p[2] || '';

  if (sub === '/perfil' && m === 'GET') return json(perfilDe(neg));
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
  if (sub === '/horario' && m === 'PUT') return json(await guardaHorario(env, neg, await cuerpo(request)));
  if (sub === '/repetidos' && m === 'POST') return json(await repetir(env, neg, await cuerpo(request)), 201);
  if ((p = sub.match(/^\/repetidos\/(\d+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM repetidos WHERE negocio_id=? AND id=?').bind(neg.id, Number(p[1])).run();
    return json({ ok: true });
  }
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
  const rep = await repetidosDe(env, neg.id, desde);
  const t = tiemposOcupados(neg, rep, desde, hasta);
  return { desde, hasta, ocupado: c.concat(b, t.ocupado), horario: t.horario };
}

// ───────── Mis tiempos: horario por persona y planes que se repiten ─────────

export const diaSemana = (fecha) => { const d = new Date(fecha + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };   // 1 = lunes … 7 = domingo
const personasDe = (neg) => { const e = perfilDe(neg).equipo.map((x) => x.id); return e.length ? e : ['']; };
export function leeHorario(neg) {
  let h = {}; try { h = JSON.parse(neg.horario || '{}'); } catch {}
  return h && typeof h === 'object' && !Array.isArray(h) ? h : {};
}
// El horario que vale para una persona: el suyo o, si no tiene, el de todo el negocio. null = sin horario (no se restringe).
const horarioPara = (h, persona) => h[persona] || h[''] || null;

// Lo que no se puede apartar por horario y por planes repetidos, día por día, como «ocupado» (sin decir por qué).
// También devuelve el horario de cada quien para que la página ofrezca sólo esos días y horas.
export function tiemposOcupados(neg, repetidos, desde, hasta) {
  const h = leeHorario(neg), personas = personasDe(neg), ocupado = [];
  for (let f = desde; f < hasta; f = sumaDias(f, 1)) {
    const wd = String(diaSemana(f));
    for (const p of personas) {
      const sem = horarioPara(h, p);
      if (!sem) continue;
      const d = sem[wd];
      if (!d) { ocupado.push({ fecha: f, ini: 0, fin: 1440, persona: p }); continue; }
      if (d[0] > 0) ocupado.push({ fecha: f, ini: 0, fin: d[0], persona: p });
      if (d[1] < 1440) ocupado.push({ fecha: f, ini: d[1], fin: 1440, persona: p });
    }
    for (const r of repetidos) {
      if (r.dias.includes(wd) && r.desde <= f && (!r.hasta || r.hasta >= f)) ocupado.push({ fecha: f, ini: r.inicio_min, fin: r.fin_min, persona: r.persona });
    }
  }
  const horario = {};
  for (const p of personas) { const sem = horarioPara(h, p); if (sem) horario[p] = sem; }
  return { ocupado, horario: Object.keys(horario).length ? horario : null };
}
export function fueraDeHorario(neg, fecha, ini, fin, persona) {
  const sem = horarioPara(leeHorario(neg), persona);
  if (!sem) return false;
  const d = sem[String(diaSemana(fecha))];
  return !d || ini < d[0] || fin > d[1];
}
async function repetidosDe(env, negocio, desde) {
  return (await env.DB.prepare("SELECT id, persona, dias, inicio_min, fin_min, desde, hasta, motivo FROM repetidos WHERE negocio_id=? AND (hasta='' OR hasta>=?) ORDER BY inicio_min")
    .bind(negocio, desde).all()).results;
}
const HM = (v) => { const m = String(v || '').match(/^(\d{2}):(\d{2})$/); return m && +m[1] <= 24 && +m[2] < 60 ? Math.min(1440, +m[1] * 60 + +m[2]) : null; };
function personaValida(neg, v) {
  const p = ident(v);
  const eq = perfilDe(neg).equipo;
  if (p && eq.length && !eq.some((x) => x.id === p)) throw new ErrorHttp(400, 'Esa persona no está en tu equipo');
  return p;
}
export function limpiaSemana(sem) {
  if (!sem || typeof sem !== 'object') throw new ErrorHttp(400, 'Falta el horario');
  const out = {};
  for (let i = 1; i <= 7; i++) {
    const d = sem[i] ?? sem[String(i)];
    if (d == null || d === false) { out[i] = null; continue; }
    const a = Array.isArray(d) ? d.map(Number) : [HM(d.desde), HM(d.hasta)];
    if (a.length !== 2 || !a.every((x) => Number.isInteger(x) && x >= 0 && x <= 1440) || a[1] <= a[0]) throw new ErrorHttp(400, 'Revisa el horario: la hora de salida va después de la de entrada');
    out[i] = a;
  }
  return out;
}
async function guardaHorario(env, neg, d) {
  const persona = personaValida(neg, d.persona);
  const h = leeHorario(neg);
  if (d.semana === null) delete h[persona]; else h[persona] = limpiaSemana(d.semana);
  await env.DB.prepare('UPDATE negocios SET horario=? WHERE id=?').bind(JSON.stringify(h), neg.id).run();
  return { horario: h };
}
async function repetir(env, neg, d) {
  const persona = personaValida(neg, d.persona);
  const dias = [...new Set((Array.isArray(d.dias) ? d.dias : []).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 7))].sort().join('');
  if (!dias) throw new ErrorHttp(400, 'Elige qué días se repite');
  const ini = HM(d.desde), fin = HM(d.hasta);
  if (ini == null || fin == null) throw new ErrorHttp(400, 'Pon la hora de inicio y de fin');
  if (fin <= ini) throw new ErrorHttp(400, 'La hora de fin va después de la de inicio');
  const hoy = hoyEn(neg.zona).fecha;
  const desdeF = FECHA.test(d.desdeFecha || '') && d.desdeFecha > hoy ? d.desdeFecha : hoy;
  const hastaF = FECHA.test(d.hastaFecha || '') ? d.hastaFecha : '';
  if (hastaF && hastaF < desdeF) throw new ErrorHttp(400, 'La fecha de fin va después de la de inicio');
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM repetidos WHERE negocio_id=?').bind(neg.id).first();
  if (n && n.n >= 60) throw new ErrorHttp(400, 'Ya tienes muchos planes repetidos. Quita alguno que ya no uses.');
  const r = await env.DB.prepare('INSERT INTO repetidos (negocio_id, persona, dias, inicio_min, fin_min, desde, hasta, motivo, creado) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(neg.id, persona, dias, ini, fin, desdeF, hastaF, texto(d.motivo, 80), ahora()).run();
  return { id: r.meta.last_row_id };
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
  const wd = String(diaSemana(c.fecha));
  for (const persona of candidatas) {
    // La dueña puede apartar fuera de su horario o encima de sus tiempos (se lo pidieron por teléfono y ella sabe); la página no.
    if (!deLaDueña && fueraDeHorario(neg, c.fecha, c.ini, c.fin, persona)) continue;
    // Un solo INSERT … WHERE NOT EXISTS: dos personas apartando la misma hora al mismo tiempo no pueden ganar las dos.
    const r = await env.DB.prepare(`INSERT INTO citas (negocio_id, folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16
      WHERE NOT EXISTS (SELECT 1 FROM citas WHERE negocio_id=?1 AND fecha=?3 AND estado<>'cancelada' AND inicio_min < ?5 AND fin_min > ?4
                          AND (persona=?6 OR persona='' OR ?6=''))
        AND (?17 = 1 OR NOT EXISTS (SELECT 1 FROM bloqueos WHERE negocio_id=?1 AND fecha=?3 AND inicio_min < ?5 AND fin_min > ?4 AND (persona=?6 OR persona='')))
        AND (?17 = 1 OR NOT EXISTS (SELECT 1 FROM repetidos WHERE negocio_id=?1 AND instr(dias, ?18) > 0 AND desde <= ?3 AND (hasta = '' OR hasta >= ?3)
                                      AND inicio_min < ?5 AND fin_min > ?4 AND (persona=?6 OR persona='')))`)
      .bind(neg.id, folio, c.fecha, c.ini, c.fin, persona, c.servicio, c.diseno, c.detalle, c.precio, c.anticipo, c.nombre, c.tel,
        deLaDueña ? 'confirmada' : 'apartada', deLaDueña ? 'negocio' : 'pagina', ahora(), deLaDueña ? 1 : 0, wd).run();
    if (r.meta.changes) return { folio, persona, estado: deLaDueña ? 'confirmada' : 'apartada' };
  }
  throw new ErrorHttp(409, 'Esa hora ya no está disponible. Elige otra.');
}

async function agenda(env, neg, url) {
  const hoy = hoyEn(neg.zona).fecha;
  const desde = FECHA.test(url.searchParams.get('desde') || '') ? url.searchParams.get('desde') : sumaDias(hoy, -1);
  const hasta = FECHA.test(url.searchParams.get('hasta') || '') ? url.searchParams.get('hasta') : sumaDias(hoy, DIAS_MAX_ADELANTE);
  const citas = (await env.DB.prepare(`SELECT folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada
      FROM citas WHERE negocio_id=? AND fecha>=? AND fecha<=? ORDER BY fecha, inicio_min`).bind(neg.id, desde, hasta).all()).results;
  const bloqueos = (await env.DB.prepare('SELECT id, fecha, inicio_min, fin_min, persona, motivo FROM bloqueos WHERE negocio_id=? AND fecha>=? AND fecha<=? ORDER BY fecha, inicio_min')
    .bind(neg.id, desde, hasta).all()).results;
  return { hoy, citas, bloqueos, horario: leeHorario(neg), repetidos: await repetidosDe(env, neg.id, hoy) };
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
  // Varios días seguidos (vacaciones): un renglón por día, hasta dos meses.
  const fechaFin = FECHA.test(d.fechaFin || '') ? d.fechaFin : fecha;
  if (fechaFin < fecha) throw new ErrorHttp(400, 'El último día va después del primero');
  const dias = []; for (let f = fecha; f <= fechaFin; f = sumaDias(f, 1)) { dias.push(f); if (dias.length > 62) throw new ErrorHttp(400, 'Son demasiados días de una vez: máximo dos meses'); }
  const persona = personaValida(neg, d.persona), motivo = texto(d.motivo, 80), t = ahora();
  const st = env.DB.prepare('INSERT INTO bloqueos (negocio_id, fecha, inicio_min, fin_min, persona, motivo, creado) VALUES (?,?,?,?,?,?,?) RETURNING id');
  const res = await env.DB.batch(dias.map((f) => st.bind(neg.id, f, ini, fin, persona, motivo, t)));
  const ids = res.map((x) => x.results[0].id);
  return { id: ids[0], ids };
}

// ───────── alta de negocios (Solida) ─────────

async function altaNegocio(env, d) {
  const id = String(d.id || '').toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new ErrorHttp(400, 'El id va en minúsculas, números y guiones');
  const nombre = texto(d.nombre, 80);
  if (!nombre) throw new ErrorHttp(400, 'Falta el nombre');
  const zona = texto(d.zona, 40) || 'America/Monterrey';
  try { new Intl.DateTimeFormat('es', { timeZone: zona }); } catch { throw new ErrorHttp(400, 'Zona horaria no válida'); }
  if (id === 'ejemplo') throw new ErrorHttp(400, '«ejemplo» está reservado para la agenda de muestra');
  const clave = generaClave();
  await env.DB.prepare(`INSERT INTO negocios (id, nombre, clave_hash, zona, activo, creado) VALUES (?,?,?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, clave_hash=excluded.clave_hash, zona=excluded.zona, activo=1`)
    .bind(id, nombre, await sha256(clave), zona, ahora()).run();
  // Equipo y página sólo si vienen: darle una clave nueva no borra lo que ya tenía.
  if (d.equipo !== undefined || d.pagina !== undefined) {
    await env.DB.prepare('UPDATE negocios SET equipo=COALESCE(?,equipo), pagina=COALESCE(?,pagina) WHERE id=?')
      .bind(d.equipo !== undefined ? JSON.stringify(limpiaEquipo(d.equipo)) : null, d.pagina !== undefined ? limpiaPagina(d.pagina) : null, id).run();
  }
  return { id, nombre, clave, agenda: AGENDA + '/' + id + '/', aviso: 'Guarda esta clave y dásela a la dueña. No se vuelve a mostrar; si se pierde, se genera otra.' };
}

// Quién atiende: ["Mía", "Fernanda"] o [{id, nombre}]. El id es el que usan las citas (persona).
export function limpiaEquipo(v) {
  if (!Array.isArray(v)) return [];
  const vistos = new Set();
  return v.slice(0, 20).map((x) => {
    const nombre = texto(typeof x === 'string' ? x : x && x.nombre, 40);
    const id = ident(typeof x === 'object' && x && x.id ? x.id : nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'));
    return { id, nombre };
  }).filter((x) => x.id && x.nombre && !vistos.has(x.id) && vistos.add(x.id));
}
export function limpiaPagina(v) {
  const t = String(v || '').trim().slice(0, 200);
  if (!t) return '';
  try { const u = new URL(t); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
function perfilDe(neg) {
  let equipo = []; try { equipo = JSON.parse(neg.equipo || '[]'); } catch {}
  return { id: neg.id, nombre: neg.nombre, equipo: Array.isArray(equipo) ? equipo : [], pagina: neg.pagina || '' };
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
    env.DB.prepare("DELETE FROM repetidos WHERE hasta <> '' AND hasta < ?").bind(corte),
    env.DB.prepare('DELETE FROM intentos WHERE ventana < ?').bind(Math.floor(ahora() / 3600) - 48),
  ]);
}

// ───────── la agenda de la dueña (app instalable) ─────────
// /:negocio/ es la app; los archivos comunes viven en /_app/ (carpeta agenda/). El manifiesto y el icono
// se arman por negocio para que, instalada, lleve su nombre y sus iniciales.

const SEGURIDAD = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
};
const EJEMPLO = { id: 'ejemplo', nombre: 'Atelier Mía', activo: 1 };

async function app(request, env, url) {
  const m = request.method;
  if (m !== 'GET' && m !== 'HEAD') throw new ErrorHttp(405, 'No permitido');
  const ruta = url.pathname;
  if (ruta === '/') {
    if (url.hostname.startsWith('agenda.')) return Response.redirect('https://solidaaplicaciones.com/', 302);
    return json({ servicio: 'citas de Solida', ok: true });
  }
  if (ruta.startsWith('/_app/')) {
    if (!ARCHIVOS[ruta]) return paginaNoExiste();
    return archivo(ruta, { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  }
  const p = ruta.match(/^\/([a-z0-9-]{2,40})(\/|\/manifest\.webmanifest|\/icono\.svg|\/sw\.js)?$/);
  if (!p) return paginaNoExiste();
  const neg = p[1] === 'ejemplo' ? EJEMPLO : await env.DB.prepare('SELECT id, nombre FROM negocios WHERE id=? AND activo=1').bind(p[1]).first();
  if (!neg) return paginaNoExiste();
  const que = p[2] || '';
  if (que === '') return Response.redirect(url.origin + '/' + neg.id + '/', 301);
  if (que === '/manifest.webmanifest') return new Response(JSON.stringify(manifiesto(neg)), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...SEGURIDAD } });
  if (que === '/icono.svg') return new Response(iconoSvg(neg.nombre), { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', ...SEGURIDAD } });
  return archivo(que === '/sw.js' ? '/sw.js' : '/index.html', { 'Cache-Control': 'no-cache', ...SEGURIDAD });
}
function archivo(ruta, cabeceras) {
  const a = ARCHIVOS[ruta];
  const cuerpo = a.b64 ? Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)) : a.cuerpo;
  return new Response(cuerpo, { headers: { 'Content-Type': a.tipo, ...cabeceras } });
}
export function iniciales(nombre) {
  const p = String(nombre || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase();
}
function manifiesto(neg) {
  return {
    name: 'Agenda · ' + neg.nombre, short_name: String(neg.nombre).slice(0, 12), id: '/' + neg.id + '/',
    start_url: '/' + neg.id + '/', scope: '/' + neg.id + '/', display: 'standalone', orientation: 'portrait',
    background_color: '#f7f3ec', theme_color: '#161412', lang: 'es-MX',
    icons: [
      { src: '/' + neg.id + '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/_app/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/_app/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
function iconoSvg(nombre) {
  const t = iniciales(nombre).replace(/[<>&"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#161412"/>` +
    `<circle cx="256" cy="256" r="170" fill="none" stroke="#c9a96e" stroke-width="10"/>` +
    `<text x="256" y="300" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="150" fill="#c9a96e">${t}</text></svg>`;
}
function paginaNoExiste() {
  return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agenda no encontrada</title>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f3ec;color:#161412;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center">' +
    '<div><h1 style="font:500 30px Georgia,serif;margin:0 0 8px">Esta agenda no existe</h1><p style="margin:0;color:#6b6157">Revisa la dirección que te mandaron. Si no la encuentras, escríbele a Solida Aplicaciones.</p></div></body></html>',
  { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD } });
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
