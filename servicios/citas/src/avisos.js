// Avisos a la dueña: al celular (Web Push) y por correo (Resend), con cada cita nueva y un resumen en la noche.
//
// Al celular va una señal SIN datos: el servicio de avisos del teléfono (Google, Apple, Mozilla, Microsoft) nunca ve
// nombres ni teléfonos. El teléfono despierta, le pregunta a este servidor qué hay de nuevo (con la dirección de su
// propia suscripción, que sólo conocen él y nosotros) y lo enseña.
//
// Secretos: VAPID_PRIVADA (la llave para firmar los avisos, en JWK) y, para correo, RESEND_API_KEY y CORREO_DE.
// Sin ellos no se rompe nada: simplemente no se manda ese tipo de aviso.

const enc = new TextEncoder();
const ahora = () => Math.floor(Date.now() / 1000);
const b64url = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// Sólo servicios de avisos de verdad: nunca mandamos peticiones a una dirección cualquiera que nos den.
const HOSTS_PUSH = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];
export function validaEndpoint(v, env = {}) {
  let u; try { u = new URL(String(v || '')); } catch { return null; }
  if (env.PUSH_PRUEBA === '1' && u.protocol === 'http:' && u.hostname === '127.0.0.1') return u.href;
  if (u.protocol !== 'https:' || !HOSTS_PUSH.some((x) => x.test(u.hostname)) || u.href.length > 600) return null;
  return u.href;
}

// ── la firma de los avisos (VAPID) ──
function jwkPrivada(env) {
  try { const j = JSON.parse(env.VAPID_PRIVADA || ''); return j && j.d && j.x && j.y ? j : null; } catch { return null; }
}
export function vapidPublica(env) {
  const j = jwkPrivada(env); if (!j) return '';
  const x = deB64url(j.x), y = deB64url(j.y), k = new Uint8Array(65); k[0] = 4; k.set(x, 1); k.set(y, 33);
  return b64url(k);
}
async function firmaVapid(env, endpoint) {
  const j = jwkPrivada(env); if (!j) throw new Error('Falta VAPID_PRIVADA');
  const llave = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: j.d, x: j.x, y: j.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: ahora() + 12 * 3600, sub: 'mailto:solidaaplicaciones@gmail.com' })));
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, llave, enc.encode(cab + '.' + cuerpo)));
  return cab + '.' + cuerpo + '.' + b64url(firma);
}
async function empuja(env, sub) {
  try {
    const r = await fetch(sub.endpoint, { method: 'POST', headers: {
      Authorization: `vapid t=${await firmaVapid(env, sub.endpoint)}, k=${vapidPublica(env)}`, TTL: '86400', Urgency: 'high', 'Content-Length': '0' } });
    if (r.status === 404 || r.status === 410) { await env.DB.prepare('DELETE FROM suscripciones WHERE id=?').bind(sub.id).run(); return false; }
    if (!r.ok) { await env.DB.prepare('UPDATE suscripciones SET fallos=fallos+1 WHERE id=?').bind(sub.id).run(); await env.DB.prepare('DELETE FROM suscripciones WHERE id=? AND fallos>10').bind(sub.id).run(); return false; }
    await env.DB.prepare('UPDATE suscripciones SET fallos=0 WHERE id=?').bind(sub.id).run();
    return true;
  } catch (e) { console.error('push', e); return false; }
}

// ── un aviso: se guarda y se le avisa a cada teléfono suscrito ──
export async function avisa(env, negocio, aviso) {
  const r = await env.DB.prepare('INSERT INTO avisos (negocio_id, titulo, cuerpo, url, creado) VALUES (?,?,?,?,?)')
    .bind(negocio, String(aviso.titulo).slice(0, 120), String(aviso.cuerpo).slice(0, 400), String(aviso.url || '').slice(0, 200), ahora()).run();
  if (!jwkPrivada(env)) return { id: r.meta.last_row_id, enviados: 0 };
  const subs = (await env.DB.prepare('SELECT id, endpoint FROM suscripciones WHERE negocio_id=?').bind(negocio).all()).results;
  const res = await Promise.all(subs.map((s) => empuja(env, s)));
  return { id: r.meta.last_row_id, enviados: res.filter(Boolean).length };
}
// Lo que el teléfono enseña al despertar: lo nuevo desde la última vez (máximo 5 y de las últimas 48 h).
export async function pendientes(env, negocio, endpoint) {
  const sub = await env.DB.prepare('SELECT id, visto, creado FROM suscripciones WHERE negocio_id=? AND endpoint=?').bind(negocio, endpoint).first();
  if (!sub) return null;
  const l = (await env.DB.prepare('SELECT id, titulo, cuerpo, url FROM avisos WHERE negocio_id=? AND id>? AND creado>=? ORDER BY id DESC LIMIT 5')
    .bind(negocio, sub.visto, Math.max(sub.creado - 60, ahora() - 48 * 3600)).all()).results.reverse();
  if (l.length) await env.DB.prepare('UPDATE suscripciones SET visto=? WHERE id=?').bind(l[l.length - 1].id, sub.id).run();
  return l;
}

// ── correo ──
export const correoValido = (v) => { const t = String(v || '').trim().toLowerCase(); return /^[^\s@<>"']{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,}$/.test(t) ? t : ''; };
export const correoDisponible = (env) => !!env.RESEND_API_KEY;
const escH = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function mandaCorreo(env, para, asunto, html, texto, adjuntos) {
  if (!correoDisponible(env) || !para) return false;
  try {
    const r = await fetch(env.RESEND_URL || 'https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.CORREO_DE || 'Tu agenda <avisos@correo.solidaaplicaciones.com>', to: [para], subject: asunto, html, text: texto, attachments: adjuntos || [] }) });
    if (!r.ok) console.error('correo', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) { console.error('correo', e); return false; }
}

// ── la cita como archivo de calendario (.ics): Gmail y el iPhone la agregan solos ──
const escIcs = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0') + '00';
export function icsDeCita(neg, c, agendaUrl) {
  const f = c.fecha.replace(/-/g, ''), sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Solida Aplicaciones//Tu agenda//ES', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + c.folio + '@agenda.solidaaplicaciones.com', 'DTSTAMP:' + sello,
    'DTSTART;TZID=' + neg.zona + ':' + f + 'T' + hhmm(c.ini), 'DTEND;TZID=' + neg.zona + ':' + f + 'T' + hhmm(Math.min(c.fin, 1439)),
    'SUMMARY:' + escIcs(c.servicio + ' · ' + c.nombre), 'DESCRIPTION:' + escIcs('WhatsApp ' + c.tel + '\nFolio ' + c.folio + '\n' + agendaUrl),
    'URL:' + agendaUrl, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (f) => { const d = new Date(f + 'T12:00:00Z'); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MESES[d.getUTCMonth()]; };
const hora12 = (m) => { const h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + ':' + String(mi).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-MX');

// ── lo que dispara cada aviso ──
export async function avisaCitaNueva(env, neg, c, agendaBase, nombreDe) {
  const url = '/' + neg.id + '/?dia=' + c.fecha;
  const quien = nombreDe(c.persona);
  const titulo = 'Nueva cita · ' + neg.nombre;
  const cuerpo = c.nombre + ' apartó ' + (c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (quien ? ' con ' + quien : '') + ' · ' + fechaCorta(c.fecha) + ' · ' + hora12(c.ini) +
    (c.anticipo ? '' : '. Sin anticipo todavía.');
  await avisa(env, neg.id, { titulo, cuerpo, url });
  if (neg.aviso_correo && neg.correo) {
    const link = agendaBase + url;
    const filas = [['Servicio', c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio], ['Cuándo', fechaCorta(c.fecha) + ' · ' + hora12(c.ini) + ' a ' + hora12(c.fin)],
      quien ? ['Con', quien] : null, ['Precio', pesos(c.precio)], ['Anticipo', c.anticipo ? pesos(c.anticipo) : 'Todavía no'], ['WhatsApp', c.tel], ['Folio', c.folio]].filter(Boolean);
    const html = '<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:24px;background:#f7f3ec;color:#161412">' +
      '<p style="font:600 11px Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#86672f;margin:0">' + escH(neg.nombre) + ' · cita nueva</p>' +
      '<h1 style="font-weight:500;font-size:28px;margin:8px 0 4px">' + escH(c.nombre) + ' apartó contigo</h1>' +
      '<p style="font:14px Arial,sans-serif;color:#6b6157;margin:0 0 16px">Llegó desde tu página. Te adjuntamos la cita para que entre a tu calendario.</p>' +
      '<table style="width:100%;border-collapse:collapse;font:14px Arial,sans-serif">' + filas.map((x) =>
        '<tr><td style="padding:9px 0;border-bottom:1px solid #e2d9ca;color:#6b6157">' + escH(x[0]) + '</td><td style="padding:9px 0;border-bottom:1px solid #e2d9ca;text-align:right;font-weight:600">' + escH(x[1]) + '</td></tr>').join('') + '</table>' +
      '<p style="margin:20px 0 0"><a href="' + escH(link) + '" style="display:inline-block;background:#161412;color:#f7f3ec;padding:14px 22px;font:600 12px Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;text-decoration:none">Abrir mi agenda</a></p>' +
      '<p style="font:12px Arial,sans-serif;color:#6b6157;margin:20px 0 0">Te llega porque tienes los avisos por correo encendidos. Se apagan desde tu agenda.</p></div>';
    const texto = titulo + '\n\n' + filas.map((x) => x[0] + ': ' + x[1]).join('\n') + '\n\nAbrir mi agenda: ' + link;
    await mandaCorreo(env, neg.correo, 'Nueva cita: ' + c.nombre + ' · ' + fechaCorta(c.fecha) + ', ' + hora12(c.ini), html, texto,
      [{ filename: 'cita.ics', content: btoa(String.fromCharCode(...enc.encode(icsDeCita(neg, c, link)))), content_type: 'text/calendar; charset=utf-8; method=PUBLISH' }]);
  }
}
export async function avisaPrueba(env, neg, agendaBase) {
  const a = await avisa(env, neg.id, { titulo: 'Así te van a llegar los avisos', cuerpo: 'Cada vez que alguien aparte en tu página te llega uno como éste. Y en la noche, cuántas citas tienes mañana.', url: '/' + neg.id + '/' });
  let correo = false;
  if (neg.aviso_correo && neg.correo) correo = await mandaCorreo(env, neg.correo, 'Así te van a llegar los avisos de tu agenda',
    '<div style="font-family:Arial,sans-serif;padding:20px"><p>Hola 👋 Este es un correo de prueba de <b>' + escH(neg.nombre) + '</b>.</p><p>Cada vez que alguien aparte una cita en tu página te llegará un correo así, con la cita adjunta para tu calendario.</p><p><a href="' + escH(agendaBase + '/' + neg.id + '/') + '">Abrir mi agenda</a></p></div>',
    'Este es un correo de prueba de tu agenda. Cada cita nueva te llegará así.');
  return { push: a.enviados, correo };
}
