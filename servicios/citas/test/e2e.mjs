// Prueba completa del servicio de citas contra `wrangler dev` (base local, se borra al terminar).
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = 8811, URL0 = `http://127.0.0.1:${PUERTO}`;
const MAESTRA = 'maestra-de-prueba-0123456789abcdef', SECRETO = 'secreto-de-prueba-0123456789abcdef';
const persist = mkdtempSync(join(tmpdir(), 'solida-citas-'));
const devVars = new URL('../.dev.vars', import.meta.url);
const previo = existsSync(devVars) ? readFileSync(devVars) : null;
writeFileSync(devVars, `MAESTRA=${MAESTRA}\nSECRETO=${SECRETO}\n`);
const pasos = []; const paso = (t) => { pasos.push(t); console.log('  ✓ ' + t); };
let w;

async function api(ruta, { metodo = 'GET', body, token, maestra, ip } = {}) {
  const h = { 'Content-Type': 'application/json', Origin: 'https://atelier.ejemplo' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (maestra) h.Authorization = 'Bearer ' + MAESTRA;
  if (ip) h['CF-Connecting-IP'] = ip;
  const r = await fetch(URL0 + ruta, { method: metodo, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), d: await r.json().catch(() => null) };
}
// Un día que exista y no sea hoy: mañana y pasado, en la zona del negocio
// El primer día (desde dentro de n días) que cae en ese día de la semana (1 = lunes … 7 = domingo)
const elDia = (wd, n = 1) => { for (let i = n; i < n + 8; i++) { const f = fecha(i); const d = new Date(f + 'T12:00:00Z').getUTCDay() || 7; if (d === wd) return f; } };
const fecha = (n) => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date(Date.now() + n * 86400000)); return f; };

try {
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'solida-citas', '--local', '--persist-to', persist], { stdio: 'ignore' });
  w = spawn('npx', ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(PUERTO), '--persist-to', persist, '--show-interactive-dev-session=false'],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } });
  let log = ''; w.stdout.on('data', (x) => (log += x)); w.stderr.on('data', (x) => (log += x));
  for (let i = 0; i < 120; i++) { try { if ((await fetch(URL0 + '/')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); if (i === 119) throw new Error('wrangler dev no arrancó\n' + log); }
  console.log('Servicio de citas:');

  // Alta del negocio
  assert.equal((await api('/api/admin/negocios', { metodo: 'POST', body: { id: 'atelier-mia', nombre: 'Atelier Mía' } })).status, 401);
  const alta = await api('/api/admin/negocios', { metodo: 'POST', maestra: true, body: { id: 'atelier-mia', nombre: 'Atelier Mía' } });
  assert.equal(alta.status, 201); assert.match(alta.d.clave, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const CLAVE = alta.d.clave;
  assert.equal((await api('/api/no-existe/ocupado')).status, 404);
  paso('Solida da de alta un negocio con su clave maestra; sin ella, no');

  // Apartar y que la hora quede ocupada (sin datos de nadie)
  const F1 = fecha(1), F2 = fecha(2);
  const cita = { fecha: F1, hora: '11:00', min: 90, persona: 'mia', servicio: 'Gelish en manos', diseno: 'Chrome perla', largo: 'Medio', precio: 360, anticipo: 100, nombre: 'Andrea', tel: '8440000001', equipo: ['mia', 'fer'] };
  const a1 = await api('/api/atelier-mia/citas', { metodo: 'POST', body: cita, ip: '1.1.1.1' });
  assert.equal(a1.status, 201); assert.match(a1.d.folio, /^C-[A-Z2-9]{6}$/); assert.equal(a1.d.estado, 'apartada');
  assert.equal(a1.cors, 'https://atelier.ejemplo');
  const oc = await api(`/api/atelier-mia/ocupado?desde=${F1}&dias=3`);
  assert.deepEqual(oc.d.ocupado, [{ fecha: F1, ini: 660, fin: 750, persona: 'mia' }]);
  assert.ok(!JSON.stringify(oc.d).includes('Andrea') && !JSON.stringify(oc.d).includes('8440000001'), 'lo público no trae nombres ni teléfonos');
  paso('se aparta una cita y la hora sale ocupada en lo público, sin nombre ni teléfono');

  // Choques
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, hora: '12:00', nombre: 'Bea', tel: '8440000002' }, ip: '2.2.2.2' })).status, 409, 'se encima con Mía');
  const otra = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, hora: '12:00', persona: 'fer', nombre: 'Bea', tel: '8440000002' }, ip: '2.2.2.2' });
  assert.equal(otra.status, 201, 'Fer sí está libre a esa hora');
  const cualquiera = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, hora: '15:00', persona: '', nombre: 'Caro', tel: '8440000003' }, ip: '3.3.3.3' });
  assert.equal(cualquiera.status, 201); assert.equal(cualquiera.d.persona, 'mia', '«cualquiera» toma a la primera libre');
  const cualquiera2 = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, hora: '15:30', persona: '', nombre: 'Dani', tel: '8440000004' }, ip: '3.3.3.3' });
  assert.equal(cualquiera2.d.persona, 'fer', 'si Mía ya está ocupada, le toca a Fer');
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, hora: '15:30', persona: '', nombre: 'Eli', tel: '8440000005' }, ip: '3.3.3.3' })).status, 409, 'si las dos están ocupadas, no');
  paso('no deja encimar citas de la misma persona; «cualquiera» toma a la que esté libre');

  // Dos al mismo tiempo por la misma hora: sólo una gana
  const juntas = await Promise.all([1, 2, 3, 4].map((i) => api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: F2, hora: '10:00', nombre: 'Prisa ' + i, tel: '84400001' + i + '0' }, ip: '9.9.9.' + i })));
  assert.deepEqual(juntas.map((x) => x.status).sort(), [201, 409, 409, 409]);
  paso('cuatro personas apartando la misma hora al mismo tiempo: sólo una la obtiene');

  // Validación y límites
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, tel: '123' }, ip: '4.4.4.4' })).status, 400);
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: '2020-01-01' }, ip: '4.4.4.4' })).status, 400);
  const sucio = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, hora: '18:00', persona: 'fer', nombre: '<img src=x onerror=alert(1)>Ana', tel: '8440000009' }, ip: '4.4.4.4' });
  assert.equal(sucio.status, 201);
  let ultimo;
  for (let i = 0; i < 8; i++) ultimo = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: fecha(3 + i), hora: '10:00', nombre: 'Spam', tel: '8440000099' }, ip: '5.5.5.5' });
  assert.equal(ultimo.status, 429, 'una misma conexión no puede apartar sin límite');
  paso('rechaza datos malos, limpia el texto y limita cuántas citas aparta una misma conexión');

  // La dueña
  assert.equal((await api('/api/atelier-mia/agenda')).status, 401);
  assert.equal((await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: 'AAAA-BBBB-CCCC' }, ip: '6.6.6.6' })).status, 401);
  const ent = await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE.toLowerCase().replace(/-/g, ' ') }, ip: '6.6.6.6' });
  assert.equal(ent.status, 200); const TOKEN = ent.d.token;
  assert.equal((await api('/api/atelier-mia/agenda', { token: TOKEN.slice(0, -2) + 'xx' })).status, 401, 'un token alterado no sirve');
  const ag = await api('/api/atelier-mia/agenda', { token: TOKEN });
  assert.equal(ag.status, 200);
  const deAndrea = ag.d.citas.find((x) => x.nombre === 'Andrea');
  assert.equal(deAndrea.tel, '8440000001'); assert.equal(deAndrea.detalle, 'Medio');
  assert.ok(!ag.d.citas.some((x) => /[<>]/.test(x.nombre)), 'lo que se guarda ya viene sin < >');
  paso('la dueña entra con su clave (escrita como sea) y ve sus citas con nombre y WhatsApp; sin clave o con un token alterado, no');

  for (let i = 0; i < 8; i++) await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: 'XXXX-XXXX-XXXX' }, ip: '7.7.7.7' });
  assert.equal((await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE }, ip: '7.7.7.7' })).status, 429);
  paso('tras varios intentos fallidos, esa conexión espera una hora');

  // Confirmar, cancelar y liberar la hora
  assert.equal((await api(`/api/atelier-mia/citas/${a1.d.folio}/estado`, { metodo: 'POST', token: TOKEN, body: { estado: 'confirmada' } })).status, 200);
  assert.equal((await api(`/api/atelier-mia/citas/${a1.d.folio}/estado`, { metodo: 'POST', token: TOKEN, body: { estado: 'cancelada' } })).status, 200);
  assert.ok(!(await api(`/api/atelier-mia/ocupado?desde=${F1}&dias=1`)).d.ocupado.some((x) => x.ini === 660 && x.persona === 'mia'), 'cancelar libera la hora');
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, nombre: 'Fran', tel: '8440000010' }, ip: '8.8.8.8' })).status, 201, 'y otra puede apartarla');
  paso('confirmar y cancelar; cancelar libera la hora para alguien más');

  // Bloqueos
  const bl = await api('/api/atelier-mia/bloqueos', { metodo: 'POST', token: TOKEN, body: { fecha: F2, desde: '13:00', hasta: '15:00', motivo: 'Comida' } });
  assert.equal(bl.status, 201);
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: F2, hora: '13:30', persona: 'fer', nombre: 'Gaby', tel: '8440000011' }, ip: '8.8.8.9' })).status, 409, 'la hora bloqueada no se aparta');
  const dia = await api('/api/atelier-mia/bloqueos', { metodo: 'POST', token: TOKEN, body: { fecha: fecha(20), persona: 'fer', motivo: 'Vacaciones' } });
  assert.equal(dia.status, 201);
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: fecha(20), hora: '10:00', persona: 'fer', nombre: 'Hilda', tel: '8440000012' }, ip: '8.8.8.10' })).status, 409);
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: fecha(20), hora: '10:00', persona: 'mia', nombre: 'Hilda', tel: '8440000012' }, ip: '8.8.8.10' })).status, 201, 'el día de Fer no cierra a Mía');
  assert.equal((await api(`/api/atelier-mia/bloqueos/${bl.d.id}`, { metodo: 'DELETE', token: TOKEN })).status, 200);
  assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: F2, hora: '13:30', persona: 'fer', nombre: 'Gaby', tel: '8440000011' }, ip: '8.8.8.9' })).status, 201, 'quitar el bloqueo vuelve a abrir la hora');
  paso('la dueña bloquea horas o días (de todo el negocio o de una persona) y los vuelve a abrir');

  // Cita capturada por la dueña (por teléfono): sin límite y ya confirmada
  const tel = await api('/api/atelier-mia/citas', { metodo: 'POST', token: TOKEN, body: { ...cita, fecha: fecha(4), hora: '17:00', nombre: 'Por teléfono', tel: '8440000013' } });
  assert.equal(tel.status, 201); assert.equal(tel.d.estado, 'confirmada');
  paso('la dueña puede apartar una cita que le pidieron por teléfono; entra ya confirmada');

  // ───── la agenda de la dueña, aparte de su página ─────
  const crudo = (ruta, op = {}) => fetch(URL0 + ruta, { redirect: 'manual', ...op });
  const pf0 = await api('/api/atelier-mia/perfil');
  assert.equal(pf0.status, 200); assert.deepEqual(pf0.d, { id: 'atelier-mia', nombre: 'Atelier Mía', equipo: [], pagina: '' });
  assert.equal((await api('/api/admin/negocios/atelier-mia/perfil', { metodo: 'POST', body: { equipo: ['x'] } })).status, 401);
  const pf = await api('/api/admin/negocios/atelier-mia/perfil', { metodo: 'POST', maestra: true,
    body: { equipo: ['Mía', { id: 'fer', nombre: 'Fernanda' }, 'Mía', '', '<b>Caro</b>'], pagina: 'https://ateliermia.solidaaplicaciones.com/' } });
  assert.equal(pf.status, 200);
  assert.deepEqual(pf.d.equipo.slice(0, 2), [{ id: 'mia', nombre: 'Mía' }, { id: 'fer', nombre: 'Fernanda' }], 'saca el id del nombre, sin acentos, y no repite');
  assert.equal(pf.d.equipo.length, 3); assert.ok(!/[<>]/.test(pf.d.equipo[2].nombre), 'sin < >');
  assert.equal(pf.d.pagina, 'https://ateliermia.solidaaplicaciones.com/');
  assert.equal((await api('/api/admin/negocios/atelier-mia/perfil', { metodo: 'POST', maestra: true, body: { pagina: 'javascript:alert(1)' } })).d.pagina, '', 'sólo páginas https');
  await api('/api/admin/negocios/atelier-mia/perfil', { metodo: 'POST', maestra: true, body: { pagina: 'https://ateliermia.solidaaplicaciones.com/' } });
  const otraClave = await api('/api/admin/negocios', { metodo: 'POST', maestra: true, body: { id: 'atelier-mia', nombre: 'Atelier Mía' } });
  assert.equal(otraClave.d.agenda, 'https://agenda.solidaaplicaciones.com/atelier-mia/');
  assert.equal((await api('/api/atelier-mia/perfil')).d.equipo.length, 3, 'darle clave nueva no borra su equipo');
  assert.equal((await api('/api/admin/negocios', { metodo: 'POST', maestra: true, body: { id: 'ejemplo', nombre: 'Yo' } })).status, 400, '«ejemplo» está reservado');
  const CLAVE2 = otraClave.d.clave;
  paso('Solida le pone a la agenda su equipo y la dirección de su página; darle otra clave no los borra');

  let r = await crudo('/atelier-mia');
  assert.equal(r.status, 301); assert.match(r.headers.get('location'), /\/atelier-mia\/$/);
  r = await crudo('/atelier-mia/');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await r.text(), /\/_app\/app\.js/);
  const mani = await (await crudo('/atelier-mia/manifest.webmanifest')).json();
  assert.equal(mani.name, 'Agenda · Atelier Mía'); assert.equal(mani.start_url, '/atelier-mia/'); assert.equal(mani.scope, '/atelier-mia/'); assert.equal(mani.display, 'standalone');
  const ico = await crudo('/atelier-mia/icono.svg');
  assert.equal(ico.headers.get('content-type'), 'image/svg+xml'); assert.match(await ico.text(), />AM</);
  for (const f of ['/_app/app.js', '/_app/app.css', '/_app/icono-192.png', '/_app/icono-512.png', '/_app/icono-180.png', '/atelier-mia/sw.js']) assert.equal((await crudo(f)).status, 200, f);
  assert.equal((await crudo('/no-existe/')).status, 404); assert.equal((await crudo('/index.html')).status, 404);
  assert.equal((await crudo('/ejemplo/')).status, 200, 'la muestra del catálogo abre sin estar en la base');
  assert.equal((await crudo('/atelier-mia/', { method: 'POST' })).status, 405);
  paso('la agenda vive en su propia dirección (/atelier-mia/), con manifiesto e icono con su nombre, para instalarla como app');

  // En un navegador de verdad
  const { createRequire } = await import('node:module');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.route('https://wa.me/**', (r) => r.fulfill({ body: 'WhatsApp', contentType: 'text/plain' }));
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    const pg = await ctx.newPage();
    const errores = []; pg.on('pageerror', (e) => errores.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|status of 401/.test(m.text())) errores.push(m.text()); });
    await pg.goto(URL0 + '/atelier-mia/');
    await pg.waitForSelector('#clave');
    assert.match(await pg.textContent('.portada'), /Atelier Mía/);
    const CAP = process.env.CAPTURAS;
    if (CAP) await pg.screenshot({ path: CAP + '/ag-entrar.png', fullPage: true });
    await pg.fill('#clave', 'MALA-MALA-MALA'); await pg.click('#fEntrar button');
    await pg.waitForFunction(() => document.getElementById('falta').textContent.length > 0);
    await pg.fill('#clave', CLAVE2); await pg.click('#fEntrar button');
    await pg.waitForSelector('.cab');
    if (CAP) await pg.screenshot({ path: CAP + '/ag-agenda.png', fullPage: true });
    const txt = await pg.textContent('#app');
    assert.match(txt, /Andrea|Bea|Caro/); assert.match(txt, /Con Fernanda/, 'pone el nombre del equipo, no su id');
    assert.ok(!(await pg.$('img')), 'el nombre con <img> se pinta como texto');
    assert.equal(await pg.getAttribute('a.btn[href^="https://ateliermia"]', 'href'), 'https://ateliermia.solidaaplicaciones.com/');
    // Cerrar un horario desde la app y que la página ya no pueda apartarlo
    const F9 = fecha(9);
    await pg.click('[data-vista="tiempos"]'); await pg.waitForSelector('#apartar');
    await pg.click('#apartar'); await pg.waitForSelector('#fAp');
    await pg.click('[data-tipo="una"]'); await pg.fill('#apFecha', F9); await pg.selectOption('#apDe', '10:00'); await pg.selectOption('#apA', '12:00');
    await pg.fill('#apMotivo', 'Dentista'); await pg.click('[data-quien=""]'); await pg.click('#apOk');
    await pg.waitForFunction(() => !document.getElementById('velo') || document.getElementById('hojaListo'));
    if (await pg.$('#hojaListo')) await pg.click('#hojaListo');
    await pg.waitForFunction(() => /Dentista/.test(document.querySelector('main').textContent));
    await pg.click('[data-vista="citas"]'); await pg.waitForSelector('.cifras');
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: F9, hora: '10:30', persona: 'mia', nombre: 'Iris', tel: '8440000014' }, ip: '8.8.8.20' })).status, 409);
    // Confirmar una cita pendiente
    const pendientes = await pg.$$('[data-estado="confirmada"]');
    assert.ok(pendientes.length > 0, 'hay citas por confirmar');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), pendientes[0].click()]);
    await popup.waitForURL(/wa\.me/, { timeout: 8000 }); assert.match(popup.url(), /wa\.me\/52\d{10}\?text=/); await popup.close();
    await pg.waitForFunction((n) => document.querySelectorAll('[data-estado="confirmada"]').length === n - 1, pendientes.length);
    // Se queda abierta al volver a entrar
    await pg.reload(); await pg.waitForSelector('.cab');
    assert.deepEqual(errores, []);
    paso('en el navegador: entra con su clave, ve sus citas con los nombres de su equipo, cierra un horario y confirma una cita avisando por WhatsApp');

    const ej = await ctx.newPage();
    await ej.goto(URL0 + '/ejemplo/'); await ej.waitForSelector('.cab');
    assert.match(await ej.textContent('.muestra'), /Ejemplo de Solida/);
    if (CAP) await ej.screenshot({ path: CAP + '/ag-ejemplo.png', fullPage: true });
    assert.ok((await ej.$$('.cita')).length >= 6); assert.ok(!(await ej.$('#clave')), 'la muestra no pide clave');
    const ancho = await ej.evaluate(() => document.documentElement.scrollWidth); assert.ok(ancho <= 390, 'sin scroll de lado: ' + ancho);
    paso('la agenda de muestra (/ejemplo/) abre sin clave, con citas de ejemplo, para el catálogo');

    // ───── Mis tiempos ─────
    const L = (k) => ({ fecha: elDia(k, 15), nombre: 'Prueba', tel: '8440000200' });   // días de la semana que viene, lejos de lo de arriba
    const sem = { 1: [600, 1140], 2: [600, 1140], 3: [600, 1140], 4: [600, 1140], 5: [600, 1140], 6: [600, 840], 7: null };
    assert.equal((await api('/api/atelier-mia/horario', { metodo: 'PUT', body: { persona: 'mia', semana: sem } })).status, 401, 'sin clave, no');
    const tok = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.6.7' })).d.token;
    assert.equal((await api('/api/atelier-mia/horario', { metodo: 'PUT', token: tok, body: { persona: 'nadie', semana: sem } })).status, 400, 'sólo personas de su equipo');
    assert.equal((await api('/api/atelier-mia/horario', { metodo: 'PUT', token: tok, body: { persona: 'mia', semana: { ...sem, 1: [700, 600] } } })).status, 400);
    assert.equal((await api('/api/atelier-mia/horario', { metodo: 'PUT', token: tok, body: { persona: 'mia', semana: sem } })).status, 200);
    assert.equal((await api('/api/atelier-mia/horario', { metodo: 'PUT', token: tok, body: { persona: 'fer', semana: { ...sem, 1: null, 7: [600, 840] } } })).status, 200);
    const base = { ...cita, min: 60, equipo: ['mia', 'fer'] };
    const lunes = L(1).fecha, domingo = L(7).fecha;
    let x = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(1), hora: '09:00', persona: 'mia' }, ip: '10.0.0.1' });
    assert.equal(x.status, 409, 'antes de que entre Mía, no');
    assert.match(x.d.error, /ya no está disponible/);
    x = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(1), hora: '18:30', persona: 'mia' }, ip: '10.0.0.1' });
    assert.equal(x.status, 409, 'una cita que termina después de su salida, no');
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(1), hora: '10:00', persona: 'fer' }, ip: '10.0.0.1' })).status, 409, 'Fernanda descansa los lunes');
    x = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(1), hora: '10:00', persona: '' }, ip: '10.0.0.1' });
    assert.equal(x.status, 201); assert.equal(x.d.persona, 'mia', '«cualquiera» el lunes le toca a Mía');
    x = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(7), hora: '11:00', persona: '' }, ip: '10.0.0.2' });
    assert.equal(x.status, 201); assert.equal(x.d.persona, 'fer', 'el domingo sólo trabaja Fernanda');
    x = await api('/api/atelier-mia/citas', { metodo: 'POST', token: tok, body: { ...base, ...L(1), hora: '08:00', persona: 'mia', nombre: 'Por teléfono' } });
    assert.equal(x.status, 201, 'la dueña sí puede apartar fuera de su horario (se lo pidieron por teléfono)');
    const oc2 = await api(`/api/atelier-mia/ocupado?desde=${lunes}&dias=7`);
    assert.deepEqual(oc2.d.horario.mia['7'], null); assert.deepEqual(oc2.d.horario.fer['7'], [600, 840]);
    assert.ok(oc2.d.ocupado.some((o) => o.fecha === lunes && o.persona === 'fer' && o.ini === 0 && o.fin === 1440), 'el lunes de Fernanda sale ocupado todo el día');
    assert.ok(oc2.d.ocupado.some((o) => o.fecha === lunes && o.persona === 'mia' && o.ini === 1140 && o.fin === 1440));
    assert.ok(!JSON.stringify(oc2.d).includes('Prueba'), 'lo público sigue sin nombres');
    paso('Mis tiempos: con su horario guardado, la página no aparta antes de que entre, después de que salga ni en su día de descanso; la dueña sí puede');

    const rep = await api('/api/atelier-mia/repetidos', { metodo: 'POST', token: tok, body: { persona: 'mia', dias: [1, 3, 5], desde: '13:00', hasta: '14:00', motivo: 'Recoger a Santi' } });
    assert.equal(rep.status, 201);
    assert.equal((await api('/api/atelier-mia/repetidos', { metodo: 'POST', token: tok, body: { persona: 'mia', dias: [], desde: '13:00', hasta: '14:00' } })).status, 400);
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(1), hora: '12:30', persona: 'mia' }, ip: '10.0.0.3' })).status, 409, 'se encima con recoger a Santi');
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(2), hora: '13:00', persona: 'mia' }, ip: '10.0.0.3' })).status, 201, 'el martes no se repite');
    const oc3 = await api(`/api/atelier-mia/ocupado?desde=${lunes}&dias=7`);
    assert.ok(oc3.d.ocupado.some((o) => o.fecha === L(3).fecha && o.ini === 780 && o.fin === 840 && o.persona === 'mia'), 'el miércoles sale ocupado');
    assert.ok(!JSON.stringify(oc3.d).includes('Santi'), 'el motivo nunca sale en lo público');
    const ag3 = await api('/api/atelier-mia/agenda', { token: tok });
    assert.equal(ag3.d.repetidos.length, 1); assert.equal(ag3.d.repetidos[0].motivo, 'Recoger a Santi'); assert.deepEqual(ag3.d.horario.mia, { ...sem });
    assert.equal((await api(`/api/atelier-mia/repetidos/${rep.d.id}`, { metodo: 'DELETE', token: tok })).status, 200);
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(3), hora: '13:00', persona: 'mia' }, ip: '10.0.0.4' })).status, 201, 'quitarlo vuelve a abrir esas horas');
    const vac = await api('/api/atelier-mia/bloqueos', { metodo: 'POST', token: tok, body: { fecha: fecha(40), fechaFin: fecha(46), motivo: 'Vacaciones' } });
    assert.equal(vac.status, 201); assert.equal(vac.d.ids.length, 7, 'un renglón por día');
    assert.equal((await api('/api/atelier-mia/bloqueos', { metodo: 'POST', token: tok, body: { fecha: fecha(40), fechaFin: fecha(39) } })).status, 400);
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, fecha: fecha(43), hora: '11:00', persona: '' }, ip: '10.0.0.5' })).status, 409, 'en vacaciones de todo el negocio no se aparta');
    paso('Mis tiempos: un plan que se repite ocupa sus días (sin que el motivo salga en lo público) y se puede quitar; las vacaciones cierran varios días de un jalón');

    // La página de uñas obedece el horario de la agenda: ofrece el domingo de Fernanda aunque su datos.js diga «cerrado»
    const { createServer } = await import('node:http');
    const RAIZ = new URL('../../../Solida-Web/', import.meta.url).pathname;
    const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    const web = createServer((q, s) => {
      let ruta = decodeURIComponent(q.url.split('?')[0]); if (ruta.endsWith('/')) ruta += 'index.html';
      try { const b = readFileSync(RAIZ + ruta); s.writeHead(200, { 'Content-Type': TIPOS[ruta.slice(ruta.lastIndexOf('.'))] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); }
    });
    await new Promise((r) => web.listen(8812, '127.0.0.1', r));
    try {
      const pw = await ctx.newPage();
      await pw.route('**/ejemplos/unas/datos.js', async (r) => {
        const orig = readFileSync(RAIZ + 'ejemplos/unas/datos.js', 'utf8');
        r.fulfill({ contentType: 'text/javascript', body: orig + `\nwindow.NEGOCIO.ejemplo = false; window.NEGOCIO.citasApi = ${JSON.stringify(URL0 + '/api/atelier-mia')};` });
      });
      await pw.goto('http://127.0.0.1:8812/ejemplos/unas/avanzado/');
      await pw.click('[data-agendar]');
      await pw.waitForSelector('[data-serv]');
      await pw.click('[data-serv="gelish"]');
      await pw.waitForSelector('[data-fecha]');
      const dias = await pw.$$eval('[data-fecha]', (b) => b.map((x) => x.getAttribute('data-fecha')));
      const dom1 = elDia(7, 1);
      assert.ok(dias.includes(dom1), 'ofrece el domingo: Fernanda trabaja aunque la página diga cerrado');
      await pw.click(`[data-persona="mia"]`);
      await pw.click(`[data-fecha="${dom1}"]`);
      const libresMiaDom = await pw.$$eval('[data-hora]:not([disabled])', (b) => b.length);
      assert.equal(libresMiaDom, 0, 'con Mía el domingo no hay horas: descansa');
      await pw.click(`[data-persona="fer"]`);
      const horasFer = await pw.$$eval('[data-hora]:not([disabled])', (b) => b.map((x) => x.getAttribute('data-hora')));
      assert.ok(horasFer.length > 0 && horasFer.every((h) => h >= '10:00' && h <= '13:00'), 'el domingo de Fernanda es de 10 a 2: ' + horasFer.join(' '));
      await pw.close();
    } finally { web.close(); }
    paso('la página de uñas ofrece los días y horas del horario que la dueña puso en su agenda, persona por persona');

    // La agenda de la dueña: Mis tiempos en el navegador
    await pg.goto(URL0 + '/atelier-mia/#tiempos'); await pg.reload(); await pg.waitForSelector('#apartar');
    assert.match(await pg.textContent('main'), /Cuándo trabaja Mía/);
    assert.match(await pg.textContent('main'), /Descansas/);
    const barras = await pg.$$eval('.barra i', (l) => l.map((x) => x.getBoundingClientRect().width));
    assert.ok(barras.length >= 5 && barras.every((w) => w > 20), 'las barras de la semana se pintan (la política de seguridad deja sus anchos): ' + barras.join(','));
    await pg.click('[data-persona="fer"]'); await pg.waitForFunction(() => /Cuándo trabaja Fernanda/.test(document.querySelector('main').textContent));
    await pg.click('[data-persona="mia"]');
    // Editar el horario: el sábado deja de trabajar
    await pg.click('#editaHorario'); await pg.waitForSelector('#fHor');
    await pg.uncheck('[data-trabaja="6"]'); await pg.click('#horOk');
    await pg.waitForFunction(() => !document.getElementById('velo') || /Listo/.test(document.getElementById('velo').textContent));
    if (await pg.$('#hojaListo')) await pg.click('#hojaListo');
    const ag4 = await api('/api/atelier-mia/agenda', { token: tok });
    assert.equal(ag4.d.horario.mia['6'], null, 'el sábado quedó como descanso'); assert.deepEqual(ag4.d.horario.mia['1'], [600, 1140]);
    // Apartar tiempo que se repite, y que avise de la cita que ya estaba ahí (la del lunes a las 10:00)
    await pg.click('#apartar'); await pg.waitForSelector('#fAp');
    await pg.fill('#apMotivo', 'Gimnasio');
    await pg.click('[data-dia="1"]');
    await pg.selectOption('#apDe', '09:30'); await pg.selectOption('#apA', '10:30');
    assert.match(await pg.textContent('#apOk'), /1 día por semana/);
    await pg.click('[data-quien="mia"]');
    await pg.click('#apOk');
    await pg.waitForSelector('#hojaListo');
    assert.match(await pg.textContent('.ojo'), /Prueba/, 'avisa de la cita que ya estaba a esa hora');
    assert.ok((await pg.$$eval('.choque a', (l) => l.map((x) => x.href))).some((h) => /wa\.me\/528440000200/.test(h)), 'con su WhatsApp para moverla');
    await pg.click('#hojaListo');
    await pg.waitForFunction(() => /Gimnasio/.test(document.querySelector('main').textContent));
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, ...L(1), hora: '09:30', persona: 'mia', fecha: elDia(1, 22) }, ip: '10.0.0.6' })).status, 409);
    // Quitarlo
    pg.once('dialog', (dl) => dl.accept());
    await pg.click('[data-quitarep]');
    await pg.waitForFunction(() => !/Gimnasio/.test(document.querySelector('main').textContent));
    // Días enteros
    await pg.click('#apartar'); await pg.waitForSelector('#fAp');
    await pg.click('[data-motivo="Vacaciones"]');
    assert.equal(await pg.getAttribute('[data-tipo="dias"]', 'aria-pressed'), 'true', '«Vacaciones» elige días enteros');
    await pg.fill('#apDel', fecha(60)); await pg.fill('#apAl', fecha(62)); await pg.click('[data-quien=""]'); await pg.click('#apOk');
    await pg.waitForFunction(() => !document.getElementById('velo') || document.getElementById('hojaListo'));
    if (await pg.$('#hojaListo')) await pg.click('#hojaListo');
    await pg.waitForFunction(() => /todo el día/.test(document.querySelector('main').textContent));
    const ancho2 = await pg.evaluate(() => document.documentElement.scrollWidth); assert.ok(ancho2 <= 390, 'sin scroll de lado: ' + ancho2);
    if (CAP) await pg.screenshot({ path: CAP + '/ag-tiempos.png', fullPage: true });
    assert.deepEqual(errores, []);
    paso('en el navegador: Mis tiempos enseña la semana de cada quien, edita el horario, aparta tiempo que se repite (avisando de la cita que ya estaba) y vacaciones');

    // La muestra también tiene Mis tiempos
    await ej.click('[data-vista="tiempos"]'); await ej.waitForSelector('#apartar');
    assert.match(await ej.textContent('main'), /Recoger a Santi/); assert.match(await ej.textContent('main'), /Vacaciones/);
    await ej.click('#apartar'); await ej.click('[data-dia="2"]');
    if (CAP) { await ej.setViewportSize({ width: 320, height: 700 }); await ej.screenshot({ path: CAP + '/ag-apartar-320.png' }); await ej.setViewportSize({ width: 390, height: 844 }); }
    const anchoHoja = await ej.evaluate(() => document.querySelector('.hoja').scrollWidth - document.querySelector('.hoja').clientWidth);
    assert.ok(anchoHoja <= 0, 'la hoja no se sale de lado');
    await ej.click('#apOk');
    await ej.waitForFunction(() => !document.getElementById('velo') || document.getElementById('hojaListo'));
    if (await ej.$('#hojaListo')) await ej.click('#hojaListo');
    if (CAP) await ej.screenshot({ path: CAP + '/ag-tiempos-ejemplo.png', fullPage: true });
    await ej.click('#editaHorario'); await ej.waitForSelector('#fHor');
    if (CAP) { await ej.setViewportSize({ width: 320, height: 700 }); await ej.screenshot({ path: CAP + '/ag-horario-320.png' }); }
    assert.ok(await ej.evaluate(() => document.querySelector('.hoja').scrollWidth <= document.querySelector('.hoja').clientWidth), 'el horario cabe a 320 px');
    paso('la muestra del catálogo también tiene Mis tiempos y se puede tocar todo');
  } finally { await nav.close(); }

  console.log(`\n${pasos.length} pasos correctos.`);
} catch (e) {
  console.error('\n✗ FALLÓ:', e.message); process.exitCode = 1;
} finally {
  if (w) { try { process.kill(-w.pid, 'SIGTERM'); } catch {} }
  if (previo) writeFileSync(devVars, previo); else rmSync(devVars, { force: true });
  rmSync(persist, { recursive: true, force: true });
  setTimeout(() => process.exit(), 400);
}
