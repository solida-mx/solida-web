// Lee un calendario en formato iCal (la «dirección secreta» de Google, iCloud u Outlook) y devuelve SÓLO
// cuándo está ocupada la dueña: nunca el título, el lugar ni con quién. Entiende eventos que se repiten
// (diario, semanal con días, mensual, anual, con fin o número de veces), excepciones, cancelados,
// eventos marcados como «libre», de día completo y con zona horaria.

const MAX_VUELTAS = 5000;

// ── lectura del archivo ──
export function leeEventos(texto) {
  const lineas = String(texto || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const eventos = []; let ev = null, dentro = 0;
  for (const l of lineas) {
    if (l === 'BEGIN:VEVENT') { ev = { exdates: [] }; dentro = 1; continue; }
    if (l === 'END:VEVENT') { if (ev) eventos.push(ev); ev = null; dentro = 0; continue; }
    if (!dentro || !ev) continue;
    if (/^BEGIN:/.test(l)) { dentro++; continue; }            // VALARM y demás: se brincan
    if (/^END:/.test(l)) { dentro--; continue; }
    if (dentro !== 1) continue;
    const i = l.indexOf(':'); if (i < 0) continue;
    const cab = l.slice(0, i), valor = l.slice(i + 1);
    const [nombre, ...ps] = cab.split(';');
    const params = {}; for (const p of ps) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ''); }
    const n = nombre.toUpperCase();
    if (n === 'DTSTART' || n === 'DTEND' || n === 'RECURRENCE-ID') ev[n] = leeFecha(valor, params);
    else if (n === 'EXDATE') for (const v of valor.split(',')) ev.exdates.push(leeFecha(v, params));
    else if (n === 'RRULE') ev.rrule = leeRegla(valor);
    else if (n === 'DURATION') ev.duracion = leeDuracion(valor);
    else if (n === 'UID' || n === 'STATUS' || n === 'TRANSP') ev[n] = valor.trim();
  }
  return eventos.filter((e) => e.DTSTART);
}
// «20261102» (día completo), «20261102T130000Z» (UTC), «20261102T130000» (con TZID o «flotante»)
function leeFecha(v, params) {
  const m = String(v).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const f = { y: +m[1], mo: +m[2], d: +m[3] };
  if (m[4] == null || params.VALUE === 'DATE') return { ...f, dia: true };
  return { ...f, h: +m[4], mi: +m[5], s: +(m[6] || 0), utc: !!m[7], tz: m[7] ? 'UTC' : zonaIana(params.TZID) };
}
function leeRegla(v) {
  const r = {};
  for (const p of v.split(';')) { const [k, x] = p.split('='); if (k && x != null) r[k.toUpperCase()] = x; }
  return {
    freq: r.FREQ, intervalo: Math.max(1, +r.INTERVAL || 1), veces: r.COUNT ? +r.COUNT : null,
    hasta: r.UNTIL ? leeFecha(r.UNTIL, {}) : null, dias: r.BYDAY ? r.BYDAY.split(',') : null,
    diaMes: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
  };
}
function leeDuracion(v) {
  const m = String(v).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  return (((+m[2] || 0) * 7 + (+m[3] || 0)) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
}
// Outlook manda nombres de Windows; los más comunes en México. Lo que no se reconoce se toma como la zona del negocio.
const WINDOWS = {
  'central standard time (mexico)': 'America/Mexico_City', 'central standard time': 'America/Chicago',
  'mountain standard time (mexico)': 'America/Mazatlan', 'pacific standard time (mexico)': 'America/Tijuana',
  'eastern standard time (mexico)': 'America/Cancun', 'pacific standard time': 'America/Los_Angeles',
  'mountain standard time': 'America/Denver', 'eastern standard time': 'America/New_York', utc: 'UTC',
};
function zonaIana(tz) {
  if (!tz) return null;
  const t = String(tz).replace(/^\/.*\/(?=[A-Za-z]+\/)/, '');   // «/mozilla.org/…/America/Monterrey»
  if (WINDOWS[t.toLowerCase()]) return WINDOWS[t.toLowerCase()];
  try { new Intl.DateTimeFormat('en', { timeZone: t }); return t; } catch { return null; }
}

// ── horas y zonas ──
const partes = (t, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date(t)).reduce((o, x) => (o[x.type] = +x.value, o), {});
function desfase(t, tz) { const p = partes(t, tz); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; }
// Hora de pared en una zona → instante. Dos pasadas para atinarle al cambio de horario.
export function aInstante(f, tz) {
  const pared = Date.UTC(f.y, f.mo - 1, f.d, f.h || 0, f.mi || 0, f.s || 0);
  if (!tz || tz === 'UTC') return pared;
  let t = pared - desfase(pared, tz);
  t = pared - desfase(t, tz);
  return t;
}
const diaIso = (y, mo, d) => new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
const deIso = (s) => { const [y, mo, d] = s.split('-').map(Number); return { y, mo, d }; };
const sumaDiasF = (f, n) => { const x = new Date(Date.UTC(f.y, f.mo - 1, f.d + n)); return { ...f, y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
const sumaMesesF = (f, n) => { const x = new Date(Date.UTC(f.y, f.mo - 1 + n, 1)); return { ...f, y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1 }; };
const diasDelMes = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const CODIGO = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const dow = (f) => new Date(Date.UTC(f.y, f.mo - 1, f.d)).getUTCDay();
const clave = (f) => f.y * 1e10 + f.mo * 1e8 + f.d * 1e6 + (f.h || 0) * 1e4 + (f.mi || 0) * 100 + (f.s || 0);

// ── repetición ──
// Devuelve las fechas de inicio (en hora de pared de la zona del evento) de cada vez que ocurre.
function* ocurrencias(ev, hastaClave) {
  const ini = ev.DTSTART, r = ev.rrule;
  if (!r) { yield ini; return; }
  const limite = r.hasta ? Math.min(clave(r.hasta.utc ? enPared(r.hasta, ini) : r.hasta) + (r.hasta.dia ? 999999 : 0), hastaClave) : hastaClave;
  let n = 0, vueltas = 0;
  const emite = function* (f) { if (clave(f) < clave(ini)) return; if (clave(f) > limite) return 'fin'; n++; yield f; if (r.veces && n >= r.veces) return 'fin'; };
  if (r.freq === 'DAILY') {
    for (let f = ini; vueltas++ < MAX_VUELTAS; f = sumaDiasF(f, r.intervalo)) { if ((yield* emite(f)) === 'fin') return; }
  } else if (r.freq === 'WEEKLY') {
    const dias = (r.dias || [Object.keys(CODIGO).find((k) => CODIGO[k] === dow(ini))]).map((x) => CODIGO[x.slice(-2)]).sort();
    let lunes = sumaDiasF(ini, -((dow(ini) + 6) % 7));
    for (; vueltas++ < MAX_VUELTAS; lunes = sumaDiasF(lunes, 7 * r.intervalo)) {
      for (const dd of dias.map((x) => (x + 6) % 7).sort((a, b) => a - b)) { if ((yield* emite(sumaDiasF(lunes, dd))) === 'fin') return; }
    }
  } else if (r.freq === 'MONTHLY') {
    for (let m = { ...ini, d: 1 }; vueltas++ < MAX_VUELTAS; m = sumaMesesF(m, r.intervalo)) {
      const lista = [];
      if (r.dias) {
        for (const x of r.dias) {
          const mm = x.match(/^([+-]?\d+)?([A-Z]{2})$/); if (!mm) continue;
          const objetivo = CODIGO[mm[2]], orden = mm[1] ? +mm[1] : 0, total = diasDelMes(m.y, m.mo);
          const del = []; for (let d = 1; d <= total; d++) if (dow({ ...m, d }) === objetivo) del.push(d);
          if (!orden) lista.push(...del); else { const d = orden > 0 ? del[orden - 1] : del[del.length + orden]; if (d) lista.push(d); }
        }
      } else for (const d of r.diaMes || [ini.d]) { const total = diasDelMes(m.y, m.mo); const dd = d < 0 ? total + d + 1 : d; if (dd >= 1 && dd <= total) lista.push(dd); }
      for (const d of [...new Set(lista)].sort((a, b) => a - b)) { if ((yield* emite({ ...ini, y: m.y, mo: m.mo, d })) === 'fin') return; }
    }
  } else if (r.freq === 'YEARLY') {
    for (let y = ini.y; vueltas++ < MAX_VUELTAS; y += r.intervalo) {
      if (ini.d > diasDelMes(y, ini.mo)) continue;
      if ((yield* emite({ ...ini, y })) === 'fin') return;
    }
  } else yield ini;   // una regla que no entendemos: al menos la primera vez cuenta
}
// UNTIL viene en UTC; para comparar con fechas de pared se pasa a la zona del evento.
function enPared(fUtc, ini) {
  if (!ini.tz || ini.tz === 'UTC' || ini.dia) return fUtc;
  const p = partes(aInstante(fUtc, 'UTC'), ini.tz);
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

// ── lo que importa: las horas ocupadas, día por día, en la zona del negocio ──
// [{fecha, ini, fin}] con ini/fin en minutos del día. Sólo entre desde (incluido) y hasta (sin incluir).
export function horasOcupadas(texto, zona, desde, hasta) {
  const eventos = leeEventos(texto);
  const tIni = aInstante({ ...deIso(desde), h: 0 }, zona), tFin = aInstante({ ...deIso(hasta), h: 0 }, zona);
  const hastaClave = clave({ ...deIso(hasta), h: 23, mi: 59 }) + 1e6 * 2;
  const reemplazos = new Map();   // UID|inicio → el evento que cambia esa vez
  for (const e of eventos) if (e['RECURRENCE-ID'] && e.UID) reemplazos.set(e.UID + '|' + clave(e['RECURRENCE-ID']), e);
  const salida = [];
  const agrega = (e, inicio) => {
    if (e.STATUS === 'CANCELLED' || e.TRANSP === 'TRANSPARENT') return;
    const z = inicio.dia ? null : (inicio.tz || zona);
    if (inicio.dia) {
      const fin = e.DTEND && e.DTEND.dia ? Math.max(1, diasEntre(e.DTSTART, e.DTEND)) : Math.max(1, Math.round((e.duracion || 86400000) / 86400000));
      for (let i = 0; i < fin; i++) { const f = sumaDiasF(inicio, i), iso = diaIso(f.y, f.mo, f.d); if (iso >= desde && iso < hasta) salida.push({ fecha: iso, ini: 0, fin: 1440 }); }
      return;
    }
    const t0 = aInstante(inicio, z);
    const dur = e.DTEND && !e.DTEND.dia ? aInstante(e.DTEND, e.DTEND.tz || zona) - aInstante(e.DTSTART, e.DTSTART.tz || zona) : (e.duracion || 0);
    const t1 = t0 + Math.max(0, dur);
    if (t1 <= tIni || t0 >= tFin || t1 <= t0) return;
    // Se parte por días en la zona del negocio
    let a = Math.max(t0, tIni); const b = Math.min(t1, tFin);
    for (let vueltas = 0; a < b && vueltas < 400; vueltas++) {
      const p = partes(a, zona), fecha = diaIso(p.year, p.month, p.day);
      const finDia = aInstante({ y: p.year, mo: p.month, d: p.day + 1, h: 0 }, zona);
      const corte = Math.min(b, finDia);
      const ini = p.hour * 60 + p.minute, fin = corte >= finDia ? 1440 : (() => { const q = partes(corte, zona); return q.hour * 60 + q.minute; })();
      if (fin > ini) salida.push({ fecha, ini, fin });
      a = corte;
    }
  };
  for (const e of eventos) {
    if (e['RECURRENCE-ID']) continue;   // las excepciones se usan dentro de su serie
    const ex = new Set(e.exdates.filter(Boolean).map((x) => clave(x.utc && e.DTSTART.tz && e.DTSTART.tz !== 'UTC' ? enPared(x, e.DTSTART) : x)));
    for (const o of ocurrencias(e, hastaClave)) {
      if (o.dia ? diaIso(o.y, o.mo, o.d) >= hasta : aInstante(o, o.tz || zona) >= tFin) break;
      if (ex.has(clave(o))) continue;
      const r = e.UID && reemplazos.get(e.UID + '|' + clave(o));
      if (r) { agrega(r, r.DTSTART); continue; }
      agrega(e, o);
    }
  }
  // Las excepciones cuya serie no estaba (o que se movieron dentro de la ventana) también cuentan una vez
  for (const e of eventos) if (e['RECURRENCE-ID'] && !eventos.some((s) => s.UID === e.UID && !s['RECURRENCE-ID'])) agrega(e, e.DTSTART);
  return juntaDias(salida);
}
function diasEntre(a, b) { return Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86400000); }
// Lo que se encima en el mismo día se junta: menos renglones y nada repetido.
function juntaDias(l) {
  l.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x.ini - y.ini));
  const out = [];
  for (const x of l) { const u = out[out.length - 1]; if (u && u.fecha === x.fecha && x.ini <= u.fin) u.fin = Math.max(u.fin, x.fin); else out.push({ ...x }); }
  return out;
}
