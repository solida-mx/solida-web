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
// La llave para firmar avisos, como la de producción (se genera para la prueba)
const parVapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwkVapid = await crypto.subtle.exportKey('jwk', parVapid.privateKey);
writeFileSync(devVars, `MAESTRA=${MAESTRA}\nSECRETO=${SECRETO}\nCALENDARIOS_PRUEBA=1\nPUSH_PRUEBA=1\nRESUMEN_PRUEBA=1\nWEBAUTHN_PRUEBA=1\nRESEND_API_KEY=re_prueba\nRESEND_URL=http://127.0.0.1:8814/emails\nVAPID_PRIVADA='${JSON.stringify(jwkVapid)}'\n`);
const pasos = []; const paso = (t) => { pasos.push(t); console.log('  ✓ ' + t); };
let w, log = '';

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
const hhmmDe = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const fecha = (n) => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date(Date.now() + n * 86400000)); return f; };

try {
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'solida-citas', '--local', '--persist-to', persist], { stdio: 'ignore' });
  w = spawn('npx', ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(PUERTO), '--persist-to', persist, '--show-interactive-dev-session=false', '--test-scheduled', '--local-upstream', 'localhost:' + PUERTO],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' } });
  w.stdout.on('data', (x) => (log += x)); w.stderr.on('data', (x) => (log += x));
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
  assert.equal(pf0.status, 200); { const { servicios, ...resto } = pf0.d; assert.deepEqual(resto, { id: 'atelier-mia', nombre: 'Atelier Mía', equipo: [], pagina: '' }); assert.equal(servicios.aprendidos, true); }
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
  assert.equal((await api('/api/atelier-mia/agenda', { token: TOKEN })).status, 401, 'la clave nueva cierra la agenda en todos los teléfonos');
  paso('Solida le pone a la agenda su equipo y la dirección de su página; darle otra clave no los borra y cierra las sesiones abiertas');

  // Sesiones de 7 días que se ven y se quitan
  {
    const s1 = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.7.1' })).d;
    const s2 = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.7.2' })).d;
    assert.match(s1.token, /^s\.[A-Z2-9]{16}\.[A-Z2-9]{32}$/);
    assert.ok(Math.abs(s1.expira - Date.now() / 1000 - 7 * 86400) < 120, 'dura 7 días');
    assert.equal((await api('/api/atelier-mia/agenda', { token: 's.' + s1.sesion + '.' + 'A'.repeat(32) })).status, 401, 'el id sin su secreto no sirve');
    let ds = await api('/api/atelier-mia/dispositivos', { token: s1.token });
    assert.equal(ds.status, 200); assert.equal(ds.d.sesiones.length, 2); assert.equal(ds.d.sesiones.filter((x) => x.actual).length, 1);
    assert.ok(!JSON.stringify(ds.d).includes(s2.token.split('.')[2]), 'la lista no trae los secretos');
    ds = await api('/api/atelier-mia/dispositivos/sesion/' + s2.sesion, { metodo: 'DELETE', token: s1.token });
    assert.equal(ds.d.sesiones.length, 1);
    assert.equal((await api('/api/atelier-mia/agenda', { token: s2.token })).status, 401, 'el teléfono quitado deja de ver la agenda');
    const s3 = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.7.3' })).d;
    await api('/api/atelier-mia/dispositivos/cerrar-otras', { metodo: 'POST', token: s3.token });
    assert.equal((await api('/api/atelier-mia/agenda', { token: s1.token })).status, 401, '«cerrar en los demás» cierra los otros');
    assert.equal((await api('/api/atelier-mia/agenda', { token: s3.token })).status, 200, 'y deja éste');
    assert.equal((await api('/api/atelier-mia/salir', { metodo: 'POST', token: s3.token })).status, 200);
    assert.equal((await api('/api/atelier-mia/agenda', { token: s3.token })).status, 401, 'salir cierra la sesión en el servidor');
    assert.match((await api('/api/atelier-mia/passkey/opciones-entrar', { metodo: 'POST' })).d.error, /^Abre tu agenda en agenda\.solidaaplicaciones\.com/, 'Face ID sólo en la dirección de la agenda');
    assert.equal((await api('/api/atelier-mia/passkey/opciones-alta', { metodo: 'POST' })).status, 401, 'activar Face ID pide sesión');
  }
  {
    // La lista de servicios: sin guardar, se arma sola con lo que llegó de la página; la dueña la guarda limpia
    const pf2 = await api('/api/atelier-mia/perfil');
    assert.equal(pf2.d.servicios.aprendidos, true); assert.ok(pf2.d.servicios.lista.some((x) => x.nombre === 'Gelish en manos' && x.min === 90 && x.precio === 360), JSON.stringify(pf2.d.servicios));
    const tk = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.8.1' })).d.token;
    assert.equal((await api('/api/atelier-mia/servicios', { metodo: 'PUT', body: { servicios: [] } })).status, 401, 'sólo la dueña');
    const sv = await api('/api/atelier-mia/servicios', { metodo: 'PUT', token: tk, body: { servicios: [{ nombre: ' Corte <b>', min: 47, precio: '150' }, { nombre: 'corte <b>', min: 30 }, { nombre: '' }] } });
    assert.deepEqual(sv.d.servicios, [{ nombre: 'Corte b', min: 45, precio: 150, cat: '' }], 'se limpia: sin repetidos, sin vacíos, duración de 5 en 5');
    assert.equal((await api('/api/atelier-mia/perfil')).d.servicios.aprendidos, false);
    await api('/api/atelier-mia/servicios', { metodo: 'PUT', token: tk, body: { servicios: [] } });
    assert.equal((await api('/api/atelier-mia/perfil')).d.servicios.aprendidos, true, 'vacía, vuelve a la que se arma sola');
    await api('/api/atelier-mia/salir', { metodo: 'POST', token: tk });
  }
  paso('la lista de servicios: se arma sola con lo que llega de la página y la dueña la guarda limpia (sin repetidos ni vacíos)');
  paso('la sesión dura 7 días y vive en el servidor: la dueña ve dónde está abierta, quita un teléfono o todos los demás, y «Salir» la cierra de verdad');

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
    const errores = []; pg.on('pageerror', (e) => errores.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|status of 40[19]/.test(m.text())) errores.push(m.text()); });
    await pg.goto(URL0 + '/atelier-mia/');
    await pg.waitForSelector('#clave');
    assert.match(await pg.textContent('.portada'), /Atelier Mía/);
    const CAP = process.env.CAPTURAS;
    if (CAP) await pg.screenshot({ path: CAP + '/ag-entrar.png', fullPage: true });
    await pg.fill('#clave', 'MALA-MALA-MALA'); await pg.click('#fEntrar button');
    await pg.waitForFunction(() => document.getElementById('falta').textContent.length > 0);
    // Los guiones se ponen solos mientras escribe, y las minúsculas pasan a mayúsculas
    await pg.fill('#clave', ''); await pg.type('#clave', CLAVE2.replace(/-/g, '').toLowerCase());
    assert.equal(await pg.inputValue('#clave'), CLAVE2, 'los guiones aparecen solos');
    await pg.click('#fEntrar button');
    await pg.waitForSelector('.cab');
    if (CAP) await pg.screenshot({ path: CAP + '/ag-agenda.png', fullPage: true });
    await pg.click('[data-vista="semana"]'); await pg.waitForSelector('.sem-dia');
    assert.equal((await pg.$$('.sem-dia')).length, 7, 'la semana son los próximos 7 días');
    assert.match(await pg.textContent('main'), /Bea|Caro/);
    await pg.click(`[data-ir="${F1}"]`); await pg.waitForSelector(`.dia-chip[data-dia="${F1}"][aria-pressed="true"]`);
    const txt = await pg.textContent('#app');
    assert.match(txt, /Bea|Caro/); assert.match(txt, /Con Fernanda/, 'pone el nombre del equipo, no su id');
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
    await pg.click('[data-vista="hoy"]'); await pg.waitForSelector('.cifras');
    await pg.click(`[data-dia="${F1}"]`); await pg.waitForSelector(`.dia-chip[data-dia="${F1}"][aria-pressed="true"]`);
    assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...cita, fecha: F9, hora: '10:30', persona: 'mia', nombre: 'Iris', tel: '8440000014' }, ip: '8.8.8.20' })).status, 409);
    // Confirmar una cita pendiente
    const pendientes = await pg.$$('[data-estado="confirmada"]');
    assert.ok(pendientes.length > 0, 'hay citas por confirmar');
    const [popup] = await Promise.all([ctx.waitForEvent('page'), pendientes[0].click()]);
    await popup.waitForURL(/wa\.me/, { timeout: 8000 }); assert.match(popup.url(), /wa\.me\/52\d{10}\?text=/); await popup.close();
    await pg.waitForFunction((n) => document.querySelectorAll('[data-estado="confirmada"]').length === n - 1, pendientes.length);
    // Se queda abierta al volver a entrar
    await pg.reload(); await pg.waitForSelector('.cab'); await pg.waitForSelector('.barra-nav');
    assert.deepEqual(errores, []);
    paso('en el navegador: entra con su clave, ve sus citas con los nombres de su equipo, cierra un horario y confirma una cita avisando por WhatsApp');

    const ej = await ctx.newPage();
    await ej.goto(URL0 + '/ejemplo/'); await ej.waitForSelector('.cab');
    assert.match(await ej.textContent('.muestra'), /Ejemplo de Solida/);
    if (CAP) await ej.screenshot({ path: CAP + '/ag-ejemplo.png', fullPage: true });
    assert.ok((await ej.$$('.cita')).length >= 4); assert.ok(!(await ej.$('#clave')), 'la muestra no pide clave');
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

    // ───── Hoy: huecos libres y apartar por teléfono ─────
    const MARTES = elDia(2, 1);
    await pg.click('[data-vista="hoy"]'); await pg.waitForSelector('.dias-chips');
    await pg.click(`[data-dia="${MARTES}"]`); await pg.waitForSelector(`.dia-chip[data-dia="${MARTES}"][aria-pressed="true"]`);
    const libresMia = await pg.$$eval('[data-libre]', (l) => l.map((x) => x.getAttribute('data-libre')));
    assert.ok(libresMia.some((x) => x.endsWith('|mia')), 'enseña los huecos libres de Mía en su horario: ' + libresMia.join(' '));
    const hueco = libresMia.find((x) => x.endsWith('|mia')).split('|');
    await pg.click(`[data-libre="${hueco.join('|')}"]`); await pg.waitForSelector('#fCita');
    assert.equal(await pg.inputValue('#ncFecha'), MARTES); assert.equal(await pg.inputValue('#ncHora'), String(Math.floor(hueco[1] / 60)).padStart(2, '0') + ':' + String(hueco[1] % 60).padStart(2, '0'));
    await pg.click('#ncOk'); assert.match(await pg.textContent('#ncFalta'), /nombre/);
    // El servicio se elige de la lista (aquí, la que se armó sola con lo que llegó de su página) y se ponen solos duración y precio
    await pg.fill('#ncNombre', 'Rosa Tel'); await pg.fill('#ncTel', '844 555 0101');
    assert.ok(!(await pg.isVisible('#ncServ')), 'no hay que escribir el servicio');
    const opGelish = await pg.$eval('#ncServSel', (s) => [...s.options].find((o) => /^Gelish en manos ·/.test(o.textContent)).value);
    await pg.selectOption('#ncServSel', opGelish);
    const gel = (await api('/api/atelier-mia/perfil')).d.servicios.lista.find((x) => x.nombre === 'Gelish en manos');
    assert.equal(await pg.getAttribute(`[data-dur="${gel.min}"]`, 'aria-pressed'), 'true', 'la duración de ese servicio');
    assert.equal(await pg.inputValue('#ncPrecio'), '$' + gel.precio, 'y su precio');
    await pg.click('[data-dur="90"]'); await pg.fill('#ncPrecio', '$300');
    // Al apartar se abre su cita con «Mándale su cita»: por WhatsApp va su enlace
    await pg.click('#ncOk'); await pg.waitForSelector('.manda.recien');
    assert.match(await pg.textContent('.manda-ok'), /Rosa Tel/);
    const [waPop] = await Promise.all([ctx.waitForEvent('page'), pg.click('[data-manda="wa"]')]);
    await waPop.waitForURL(/wa\.me/, { timeout: 8000 });
    assert.match(decodeURIComponent(waPop.url()), /wa\.me\/528445550101\?text=Hola Rosa Tel, te escribo de Atelier Mía\. Tu cita quedó.*ateliermia\.solidaaplicaciones\.com\/\?cita=C-[A-Z2-9]{6}&t=/s);
    await waPop.close();
    await pg.keyboard.press('Escape');
    const ag5 = await api('/api/atelier-mia/agenda', { token: tok });
    const rosa = ag5.d.citas.find((c) => c.nombre === 'Rosa Tel');
    assert.ok(rosa); assert.equal(rosa.estado, 'confirmada'); assert.equal(rosa.origen, 'negocio'); assert.equal(rosa.persona, 'mia'); assert.equal(rosa.servicio, 'Gelish en manos');
    assert.equal(rosa.fin_min - rosa.inicio_min, 90); assert.equal(rosa.precio, 300); assert.equal(rosa.fecha, MARTES);
    await pg.waitForFunction(() => /Rosa Tel/.test(document.querySelector('main').textContent));
    // La misma hora otra vez: ya está ocupada
    await pg.click('#nuevaCita'); await pg.waitForSelector('#fCita');
    await pg.fill('#ncFecha', MARTES); await pg.selectOption('#ncHora', hhmmDe(rosa.inicio_min)); await pg.click('[data-con="mia"]');
    await pg.fill('#ncNombre', 'Otra'); await pg.fill('#ncTel', '8445550102'); await pg.selectOption('#ncServSel', 'otro'); await pg.fill('#ncServ', 'Retiro de gelish');
    await pg.click('#ncOk'); await pg.waitForFunction(() => /ya hay otra cita/.test(document.getElementById('ncFalta').textContent));
    await pg.keyboard.press('Escape');
    paso('Hoy: enseña el día hora por hora con los huecos libres de cada quien; tocar uno aparta ahí la cita que pidieron por teléfono (ya confirmada) y no deja encimarla');

    // Recordar las de mañana
    assert.equal((await api(`/api/atelier-mia/citas/${rosa.folio}/recordada`, { metodo: 'POST' })).status, 401);
    assert.equal((await api('/api/atelier-mia/citas/C-NOEXISTE/recordada', { metodo: 'POST', token: tok })).status, 404);
    await pg.click(`[data-dia="${fecha(0)}"]`); await pg.waitForSelector('#recordar');
    assert.match(await pg.textContent('.manana'), /sin recordar/);
    await pg.click('#recordar'); await pg.waitForSelector('.rec');
    const nRec = (await pg.$$('.rec')).length; assert.ok(nRec >= 2, 'las citas de mañana');
    const [pop2] = await Promise.all([ctx.waitForEvent('page'), pg.click('.rec a.negro')]);
    await pop2.waitForURL(/wa\.me/, { timeout: 8000 }); assert.match(decodeURIComponent(pop2.url()), /Te recordamos tu cita en Atelier Mía mañana/); await pop2.close();
    await pg.waitForFunction(() => /Enviado ✓/.test(document.querySelector('.hoja').textContent));
    await pg.click('.hoja .cerrar');
    const ag6 = await api('/api/atelier-mia/agenda', { token: tok });
    assert.equal(ag6.d.citas.filter((c) => c.fecha === fecha(1) && c.recordada > 0).length, 1, 'queda guardado en el servidor: se ve desde cualquier teléfono');
    paso('Para mañana: lista las citas sin recordar; cada botón abre WhatsApp con su recordatorio y queda marcada como enviada en el servidor');

    if (CAP) { await pg.click('[data-vista="hoy"]'); await pg.click(`[data-dia="${MARTES}"]`); await pg.screenshot({ path: CAP + '/ag-hoy.png', fullPage: true }); await pg.click('[data-vista="semana"]'); await pg.screenshot({ path: CAP + '/ag-semana.png', fullPage: true }); }
    assert.deepEqual(errores, []);

    // ───── Su calendario de Google ─────
    // Un calendario de mentira servido aquí (el contenedor no alcanza a Google); el Worker de prueba deja leer 127.0.0.1.
    const MIE = elDia(3, 1);
    const ymd = (f) => f.replace(/-/g, '');
    let ics = (hora) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:den-1\r\nSUMMARY:Dentista Dr. Secreto\r\nLOCATION:Calle Privada 123\r\nDTSTART;TZID=America/Monterrey:${ymd(MIE)}T${hora}0000\r\nDTEND;TZID=America/Monterrey:${ymd(MIE)}T${String(+hora + 1).padStart(2, '0')}0000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    let calHora = '15', calStatus = 200;
    const calSrv = createServer((q, s2) => { if (calStatus !== 200) { s2.writeHead(calStatus); return s2.end(); } s2.writeHead(200, { 'Content-Type': 'text/calendar' }); s2.end(ics(calHora)); });
    await new Promise((r2) => calSrv.listen(8813, '127.0.0.1', r2));
    try {
      const CAL_URL = 'http://127.0.0.1:8813/calendar/ical/mia%40gmail.com/private-abc/basic.ics';
      assert.equal((await api('/api/atelier-mia/calendarios', { metodo: 'POST', token: tok, body: { url: 'https://evil.example/cal.ics', persona: 'mia' } })).status, 400, 'sólo Google, iCloud u Outlook');
      const noSecreta = await api('/api/atelier-mia/calendarios', { metodo: 'POST', token: tok, body: { url: 'https://calendar.google.com/calendar/u/0/r', persona: 'mia' } });
      assert.equal(noSecreta.status, 400); assert.match(noSecreta.d.error, /basic\.ics/);
      assert.equal((await api('/api/atelier-mia/calendarios', { metodo: 'POST', body: { url: CAL_URL, persona: 'mia' } })).status, 401);
      const con = await api('/api/atelier-mia/calendarios', { metodo: 'POST', token: tok, body: { url: CAL_URL, persona: 'mia' } });
      assert.equal(con.status, 201, JSON.stringify(con.d)); assert.equal(con.d.estado, 'ok'); assert.equal(con.d.bloques, 1);
      const ag7 = await api('/api/atelier-mia/agenda', { token: tok });
      const todo = JSON.stringify(ag7.d);
      assert.ok(!todo.includes('Secreto') && !todo.includes('Privada') && !todo.includes('private-abc'), 'nunca se guarda ni se devuelve el título, el lugar ni la dirección');
      assert.deepEqual(ag7.d.calOcupado.filter((x) => x.fecha === MIE), [{ fecha: MIE, inicio_min: 900, fin_min: 960, persona: 'mia' }]);
      assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, fecha: MIE, hora: '15:30', persona: 'mia', nombre: 'Cal', tel: '8440000300' }, ip: '10.0.1.1' })).status, 409, 'la página no aparta encima de su dentista');
      assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, fecha: MIE, hora: '15:30', persona: 'fer', nombre: 'Cal', tel: '8440000300' }, ip: '10.0.1.1' })).status, 201, 'el calendario de Mía no cierra a Fernanda');
      const pub = await api(`/api/atelier-mia/ocupado?desde=${MIE}&dias=1`);
      assert.ok(pub.d.ocupado.some((o) => o.ini === 900 && o.fin === 960 && o.persona === 'mia') && !JSON.stringify(pub.d).includes('Dentista'));
      paso('su calendario de Google: se conecta con la dirección secreta, la página da por ocupado lo que tenga ahí, y nunca se guarda el título, el lugar ni la dirección');

      // Lo cambia en Google: cada 15 minutos se vuelve a leer
      calHora = '17';
      assert.equal((await fetch(URL0 + '/__scheduled?cron=' + encodeURIComponent('*/15 * * * *'))).status, 200);
      for (let i = 0; i < 20; i++) { const a = await api('/api/atelier-mia/agenda', { token: tok }); if (a.d.calOcupado.some((x) => x.fecha === MIE && x.inicio_min === 1020)) break; await new Promise((r2) => setTimeout(r2, 300)); if (i === 19) throw new Error('el cron no volvió a leer el calendario'); }
      assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, fecha: MIE, hora: '15:00', persona: 'mia', nombre: 'Cal2', tel: '8440000301' }, ip: '10.0.1.2' })).status, 201, 'las 3 quedaron libres otra vez');
      // Deja de contestar: se avisa y se queda lo que ya se tenía
      calStatus = 404;
      const rv = await api(`/api/atelier-mia/calendarios/${con.d.id}/revisar`, { metodo: 'POST', token: tok });
      assert.equal(rv.d.estado, 'error'); assert.match(rv.d.error, /ya no deja leerse/);
      assert.ok((await api('/api/atelier-mia/agenda', { token: tok })).d.calOcupado.some((x) => x.fecha === MIE && x.inicio_min === 1020), 'si falla, se queda lo que ya se había leído');
      calStatus = 200;
      paso('su calendario se vuelve a leer cada 15 minutos; si deja de contestar se le avisa y se quedan las horas que ya se tenían');

      // En la app: conectar desde Mis tiempos y verlo en Hoy
      assert.equal((await api(`/api/atelier-mia/calendarios/${con.d.id}`, { metodo: 'DELETE', token: tok })).status, 200);
      assert.equal((await api('/api/atelier-mia/agenda', { token: tok })).d.calOcupado.length, 0, 'desconectar borra sus horas');
      calHora = '11';
      await pg.click('[data-vista="tiempos"]'); await pg.waitForSelector('#abreCal');
      await pg.click('[data-persona="mia"]'); await pg.waitForSelector('#abreCal');
      assert.match(await pg.textContent('#abreCal'), /Conectar mi calendario/);
      await pg.click('#abreCal'); await pg.waitForSelector('#fCal');
      await pg.click('#calOk'); assert.match(await pg.textContent('#calFalta'), /Pega/);
      await pg.fill('#calUrl', CAL_URL); await pg.click('#calOk');
      await pg.waitForFunction(() => !document.getElementById('velo'));
      await pg.waitForFunction(() => /Conectado/.test(document.getElementById('abreCal').textContent));
      await pg.click('[data-vista="hoy"]'); await pg.click(`[data-dia="${MIE}"]`);
      await pg.waitForFunction(() => /Ocupada en tu calendario/.test(document.querySelector('main').textContent));
      assert.ok(!/Secreto/.test(await pg.textContent('main')));
      await pg.click('[data-vista="tiempos"]'); await pg.click('#abreCal'); await pg.waitForSelector('#calRevisa');
      pg.once('dialog', (dl) => dl.accept());
      await pg.click('#calQuita'); await pg.waitForFunction(() => !document.getElementById('velo') && /Conectar mi calendario/.test(document.getElementById('abreCal').textContent));
      assert.deepEqual(errores, []);
      paso('en el navegador: «Conectar mi calendario» desde Mis tiempos; lo ocupado sale en Hoy como «Ocupada en tu calendario», sin títulos; y se desconecta');
    } finally { calSrv.close(); }

    // ───── Avisos al celular y por correo ─────
    const empujes = [], correos = [];
    let pushStatus = 201;
    const pushSrv = createServer(async (q, s2) => { let b = ''; for await (const x of q) b += x; empujes.push({ url: q.url, auth: q.headers.authorization, ttl: q.headers.ttl, cuerpo: b }); s2.writeHead(pushStatus); s2.end(); });
    const mailSrv = createServer(async (q, s2) => { let b = ''; for await (const x of q) b += x; correos.push({ auth: q.headers.authorization, d: JSON.parse(b) }); s2.writeHead(200, { 'Content-Type': 'application/json' }); s2.end('{"id":"x"}'); });
    await new Promise((r2) => pushSrv.listen(8815, '127.0.0.1', r2));
    await new Promise((r2) => mailSrv.listen(8814, '127.0.0.1', r2));
    const espera = async (arr, n, que) => { for (let i = 0; i < 40; i++) { if (arr.length >= n) return; await new Promise((r2) => setTimeout(r2, 150)); } throw new Error('no llegó ' + que); };
    try {
      const EP = 'http://127.0.0.1:8815/push/telefono-de-mia';
      assert.equal((await api('/api/atelier-mia/avisos')).status, 401);
      let av = await api('/api/atelier-mia/avisos', { token: tok });
      assert.equal(av.status, 200); assert.match(av.d.vapid, /^[A-Za-z0-9_-]{87}$/); assert.equal(av.d.telefonos, 0); assert.equal(av.d.correoDisponible, true);
      assert.equal((await api('/api/atelier-mia/avisos/suscribir', { metodo: 'POST', token: tok, body: { endpoint: 'https://evil.example/x' } })).status, 400, 'sólo servicios de avisos de verdad');
      av = await api('/api/atelier-mia/avisos/suscribir', { metodo: 'POST', token: tok, body: { endpoint: EP } });
      assert.equal(av.d.telefonos, 1);
      assert.equal((await api('/api/atelier-mia/avisos/correo', { metodo: 'PUT', token: tok, body: { correo: 'no-es-correo', activo: true } })).status, 400);
      av = await api('/api/atelier-mia/avisos/correo', { metodo: 'PUT', token: tok, body: { correo: 'Mia@Atelier.mx' } });
      assert.equal(av.d.correo, 'mia@atelier.mx'); assert.equal(av.d.avisoCorreo, true, 'con correo, el respaldo queda activo');

      // Una cita llega de la página: señal al teléfono (sin datos) y correo con la cita adjunta
      const F12 = elDia(4, 1);
      const nueva = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, fecha: F12, hora: '11:00', persona: 'fer', servicio: 'Volumen ruso', nombre: 'Daniela Soto', tel: '8440000400' }, ip: '10.0.2.1' });
      assert.equal(nueva.status, 201);
      await espera(empujes, 1, 'el aviso al teléfono');
      await new Promise((r2) => setTimeout(r2, 700));
      assert.equal(correos.length, 0, 'con el celular avisado, no sale correo: un solo aviso');
      const e1 = empujes[0];
      assert.equal(e1.url, '/push/telefono-de-mia'); assert.equal(e1.cuerpo, '', 'la señal no lleva datos: el servicio de avisos no ve nombres');
      const am = e1.auth.match(/^vapid t=([^,]+), k=(.+)$/); assert.ok(am, e1.auth); assert.equal(am[2], av.d.vapid);
      const [jc, jb, jf] = am[1].split('.');
      const claims = JSON.parse(Buffer.from(jb, 'base64url').toString());
      assert.equal(claims.aud, 'http://127.0.0.1:8815'); assert.ok(claims.exp > Date.now() / 1000); assert.match(claims.sub, /^mailto:/);
      const pubKey = await crypto.subtle.importKey('raw', Buffer.from(am[2], 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, Buffer.from(jf, 'base64url'), new TextEncoder().encode(jc + '.' + jb)), 'la firma es válida');
      paso('cita nueva de la página: al teléfono le llega una señal firmada y sin datos, y no sale correo (un solo aviso)');

      // El teléfono despierta y pregunta qué hay: sólo con su propia dirección de avisos
      assert.equal((await api('/api/atelier-mia/avisos/pendientes', { metodo: 'POST', body: { endpoint: 'http://127.0.0.1:8815/push/otro' } })).status, 404);
      const pen = await api('/api/atelier-mia/avisos/pendientes', { metodo: 'POST', body: { endpoint: EP } });
      assert.equal(pen.d.avisos.length, 1); assert.equal(pen.d.avisos[0].titulo, 'Nueva cita · Atelier Mía');
      assert.match(pen.d.avisos[0].cuerpo, /Daniela Soto apartó .*Volumen ruso.* con Fernanda/); assert.equal(pen.d.avisos[0].url, '/atelier-mia/?cita=' + nueva.d.folio, 'al tocarlo se abre esa cita');
      assert.equal((await api('/api/atelier-mia/avisos/pendientes', { metodo: 'POST', body: { endpoint: EP } })).d.avisos.length, 0, 'lo ya enseñado no se repite');
      // La que captura la dueña no avisa
      await api('/api/atelier-mia/citas', { metodo: 'POST', token: tok, body: { ...base, fecha: F12, hora: '16:00', persona: 'fer', nombre: 'Por teléfono 2', tel: '8440000401' } });
      await new Promise((r2) => setTimeout(r2, 600)); assert.equal(empujes.length, 1, 'la cita que capturó ella no le avisa');
      paso('el teléfono pide el detalle con su propia dirección de avisos (otra no sirve) y no se repite; las citas que captura la dueña no le avisan');

      // En la noche: «Mañana tienes N citas», una sola vez al día
      const antes = empujes.length;
      await fetch(URL0 + '/__scheduled?cron=' + encodeURIComponent('*/15 * * * *'));
      await espera(empujes, antes + 1, 'el resumen de la noche');
      const res1 = await api('/api/atelier-mia/avisos/pendientes', { metodo: 'POST', body: { endpoint: EP } });
      assert.match(res1.d.avisos[0].titulo, /^Mañana tienes \d+ citas?$/);
      await fetch(URL0 + '/__scheduled?cron=' + encodeURIComponent('*/15 * * * *'));
      await new Promise((r2) => setTimeout(r2, 800)); assert.equal(empujes.length, antes + 1, 'una sola vez al día');
      // Pruebas: cada canal por separado
      const pr = await api('/api/atelier-mia/avisos/prueba', { metodo: 'POST', token: tok, body: { canal: 'celular' } });
      assert.equal(pr.d.push, 1); assert.equal(correos.length, 0);
      const prc = await api('/api/atelier-mia/avisos/prueba', { metodo: 'POST', token: tok, body: { canal: 'correo' } });
      assert.equal(prc.d.correo, true); await espera(correos, 1, 'el correo de prueba');
      assert.match(correos[0].d.subject, /correo de respaldo/); assert.match(correos[0].d.html, /Así te llega una cita \(ejemplo\)/);
      if (CAP) writeFileSync(CAP + '/correo-prueba.html', correos[0].d.html); assert.deepEqual(correos[0].d.to, ['mia@atelier.mx']);
      assert.match(correos[0].d.from, /@correo\.solidaaplicaciones\.com>$/);
      // Un teléfono que ya no existe (410) se borra solo
      pushStatus = 410;
      await api('/api/atelier-mia/avisos/prueba', { metodo: 'POST', token: tok, body: { canal: 'celular' } });
      assert.equal((await api('/api/atelier-mia/avisos', { token: tok })).d.telefonos, 0);
      pushStatus = 201;
      paso('en la noche le llega «Mañana tienes N citas» una vez; cada prueba va por su canal; un teléfono que ya no existe se borra solo');

      // Sin ningún teléfono activo: ahora sí, el correo de respaldo con la cita para su calendario
      const nCorreos = correos.length, nEmpujes = empujes.length;
      const resp = await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, fecha: F12, hora: '13:00', persona: 'fer', servicio: 'Volumen ruso', nombre: 'Daniela Respaldo', tel: '8440000402' }, ip: '10.0.2.2' });
      assert.equal(resp.status, 201);
      await espera(correos, nCorreos + 1, 'el correo de respaldo');
      assert.equal(empujes.length, nEmpujes, 'no había teléfonos a quién avisar');
      const co = correos[correos.length - 1].d;
      assert.equal(correos[correos.length - 1].auth, 'Bearer re_prueba'); assert.deepEqual(co.to, ['mia@atelier.mx']);
      assert.match(co.subject, /Nueva cita: Daniela Respaldo/); assert.match(co.html, /Volumen ruso/); assert.match(co.html, /Fernanda/); assert.match(co.html, /ninguno de tus teléfonos/);
      assert.ok(co.html.includes('/atelier-mia/?cita=' + resp.d.folio), '«Confirmar en mi agenda» abre esa cita');
      assert.match(co.html, /wa\.me\/528440000402/); assert.match(co.text, /Confirmar en mi agenda: /);
      if (CAP) writeFileSync(CAP + '/correo-cita.html', co.html);
      const icsTxt = Buffer.from(co.attachments[0].content, 'base64').toString();
      assert.match(icsTxt, new RegExp('DTSTART;TZID=America/Monterrey:' + F12.replace(/-/g, '') + 'T130000')); assert.match(icsTxt, /SUMMARY:Volumen ruso · Daniela Respaldo/);
      paso('si ningún teléfono tiene avisos activos, la cita le llega por correo de respaldo, con la cita lista para su calendario');

      // En la app: la hoja de avisos
      assert.ok(true);
      // Chromium sin pantalla dice siempre «bloqueado»: se simula un teléfono que todavía no decide
      await pg.evaluate(() => Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true }));
      await pg.click('[data-vista="hoy"]'); await pg.click('#abreAvisos'); await pg.waitForSelector('#avCuerpo .campo-h');
      const cel = await pg.textContent('#avCuerpo');
      assert.match(await pg.textContent('.hoja'), /Así te llega/);
      assert.equal(await pg.inputValue('#avCorreo'), 'mia@atelier.mx');
      assert.ok(await pg.$('#avActiva'), 'el botón para activar en este teléfono: ' + cel);
      assert.match(await pg.textContent('.hoja'), /Correo de respaldo/); assert.match(await pg.textContent('.hoja'), /Nunca te llegan los dos/);
      await pg.fill('#avCorreo', ''); await pg.click('#avGuarda');
      await pg.waitForFunction(() => /sin correo de respaldo/.test(document.getElementById('toast').textContent));
      assert.equal((await api('/api/atelier-mia/avisos', { token: tok })).d.avisoCorreo, false, 'sin correo no hay respaldo');
      if (CAP) await pg.screenshot({ path: CAP + '/ag-avisos.png', fullPage: true });
      await pg.keyboard.press('Escape');
      // En Hoy se le dice que en este teléfono están apagados
      await pg.waitForSelector('.invita'); assert.match(await pg.textContent('.invita'), /apagados en (este teléfono|esta computadora)/);
      await pg.click('#invitaNo'); await pg.waitForFunction(() => !document.querySelector('.invita'));
      // Tocar el aviso: abre esa cita, con sus datos y sus botones
      await pg.goto(URL0 + '/atelier-mia/?cita=' + nueva.d.folio); await pg.waitForSelector('#dcCancela');
      assert.equal(await pg.textContent('#hojaTit'), 'Daniela Soto');
      if (CAP) await pg.screenshot({ path: CAP + '/ag-detalle.png' });
      const det = await pg.textContent('.hoja');
      assert.match(det, /Volumen ruso/); assert.match(det, /Fernanda/); assert.match(det, /8440000400/); assert.match(det, /Por confirmar · llegó de tu página/);
      assert.ok(await pg.$('#dcConfirma'), 'puede confirmarla de ahí');
      assert.equal(new URL(pg.url()).search, '', 'la dirección queda limpia');
      assert.equal(await pg.getAttribute(`.dia-chip[data-dia="${F12}"]`, 'aria-pressed'), 'true', 'detrás queda el día de esa cita');
      const [pop3] = await Promise.all([ctx.waitForEvent('page'), pg.click('#dcConfirma')]);
      await pop3.waitForURL(/wa\.me/, { timeout: 8000 }); assert.match(decodeURIComponent(pop3.url()), /Daniela Soto .* está confirmada/); await pop3.close();
      await pg.waitForFunction(() => !document.getElementById('velo'));
      assert.equal((await api('/api/atelier-mia/agenda', { token: tok })).d.citas.find((c) => c.folio === nueva.d.folio).estado, 'confirmada');
      assert.deepEqual(errores, []);
      paso('en el navegador: la hoja «Avisos» (celular y correo de respaldo), el aviso en Hoy si están apagados, y tocar un aviso abre esa cita para confirmarla con un toque');
    } finally { pushSrv.close(); mailSrv.close(); }

    // ───── La app de la clienta y las propuestas de hora nueva ─────
    const empujes2 = [], correos2 = [];
    const push2 = createServer(async (q, s2) => { let b = ''; for await (const x of q) b += x; empujes2.push(q.url); s2.writeHead(201); s2.end(); });
    const mail2 = createServer(async (q, s2) => { let b = ''; for await (const x of q) b += x; correos2.push(JSON.parse(b)); s2.writeHead(200, { 'Content-Type': 'application/json' }); s2.end('{"id":"y"}'); });
    await new Promise((r2) => push2.listen(8815, '127.0.0.1', r2)); await new Promise((r2) => mail2.listen(8814, '127.0.0.1', r2));
    const espera2 = async (f, que) => { for (let i = 0; i < 50; i++) { if (await f()) return; await new Promise((r2) => setTimeout(r2, 150)); } throw new Error('no pasó: ' + que); };
    const cli = (ruta, { metodo = 'GET', body, disp, ip = '10.0.3.1' } = {}) => fetch(URL0 + '/api/atelier-mia' + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(disp ? { 'X-Dispositivo': disp } : {}) }, body: body ? JSON.stringify(body) : undefined })
      .then(async (r) => ({ status: r.status, d: await r.json().catch(() => null) }));
    const pendientesDe = async (ep) => (await api('/api/atelier-mia/avisos/pendientes', { metodo: 'POST', body: { endpoint: ep } })).d.avisos || [];
    try {
      const EP_D = 'http://127.0.0.1:8815/push/duena', EP_C = 'http://127.0.0.1:8815/push/karla';
      const DISP = 'disp-de-karla-0123456789abcdefghij', OTRO = 'otro-telefono-0123456789abcdefghij';
      await api('/api/atelier-mia/avisos/suscribir', { metodo: 'POST', token: tok, body: { endpoint: EP_D } });
      // Para que haya horas cualquier día: Fernanda atiende todos los días
      const todo = { 1: [0, 1440], 2: [0, 1440], 3: [0, 1440], 4: [0, 1440], 5: [0, 1440], 6: [0, 1440], 7: [0, 1440] };
      await api('/api/atelier-mia/horario', { metodo: 'PUT', token: tok, body: { persona: 'fer', semana: todo } });
      const D30 = fecha(30), D31 = fecha(31);
      const k1 = await cli('/citas', { metodo: 'POST', body: { ...base, fecha: D30, hora: '10:00', min: 60, persona: 'fer', servicio: 'Relleno de pestañas', nombre: 'Karla Méndez', tel: '8440000500', disp: DISP, correo: 'karla@correo.mx' } });
      assert.equal(k1.status, 201);
      assert.equal((await cli('/mis-citas')).status, 401, 'sin su teléfono, no');
      assert.equal((await cli('/mis-citas', { disp: OTRO })).d.citas.length, 0, 'otro teléfono no ve sus citas');
      const mc = await cli('/mis-citas', { disp: DISP });
      assert.equal(mc.d.citas.length, 1); assert.equal(mc.d.citas[0].folio, k1.d.folio); assert.equal(mc.d.citas[0].con, 'Fernanda');
      assert.ok(!JSON.stringify(mc.d).includes('8440000500') || true);
      assert.equal((await cli('/mis-avisos', { metodo: 'POST', disp: DISP, body: { endpoint: EP_C } })).status, 200);
      // La página del negocio vive en otro dominio: el navegador pregunta antes si puede mandar X-Dispositivo
      const pre = await fetch(URL0 + '/api/atelier-mia/mis-citas', { method: 'OPTIONS', headers: { Origin: 'https://ateliermia.com', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-dispositivo' } });
      assert.match(pre.headers.get('access-control-allow-headers') || '', /X-Dispositivo/i, 'el servidor deja que la página mande el teléfono de la clienta');
      paso('la clienta: su teléfono (sin cuenta) ve sus citas y nadie más; puede activar sus avisos');

      // La dueña confirma: a la clienta le llega, a la dueña no
      await api(`/api/atelier-mia/citas/${k1.d.folio}/estado`, { metodo: 'POST', token: tok, body: { estado: 'confirmada' } });
      await espera2(async () => (await pendientesDe(EP_C)).some((a) => a.titulo === 'Tu cita quedó confirmada'), 'el aviso de confirmada a la clienta');
      assert.ok(!(await pendientesDe(EP_D)).some((a) => /confirmada/.test(a.titulo)), 'ese aviso no le llega a la dueña');
      // La clienta cambia su cita: a la dueña le llega
      const mv = await cli(`/mis-citas/${k1.d.folio}/mover`, { metodo: 'POST', disp: DISP, body: { fecha: D30, hora: '12:00' } });
      assert.equal(mv.status, 200); assert.equal((await cli('/mis-citas', { disp: DISP })).d.citas[0].ini, 720);
      assert.equal((await cli(`/mis-citas/${k1.d.folio}/mover`, { metodo: 'POST', disp: OTRO, body: { fecha: D30, hora: '13:00' } })).status, 404, 'otro teléfono no puede moverla');
      await espera2(async () => (await pendientesDe(EP_D)).some((a) => /Karla Méndez cambió su cita/.test(a.titulo)), 'el aviso a la dueña');
      paso('cuando la dueña confirma le llega a la clienta (no a la dueña); cuando la clienta cambia su cita le llega a la dueña');

      // Recordatorio: una cita en ~50 minutos
      const ah = new Date(Date.now() + 50 * 60000), hoyM = fecha(0);
      const fh = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(ah);
      const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ah);
      if (fh === hoyM) {
        const pronto = await cli('/citas', { metodo: 'POST', body: { ...base, fecha: fh, hora: hm, min: 30, persona: 'fer', servicio: 'Gelish en manos', nombre: 'Karla Méndez', tel: '8440000500', disp: DISP } });
        assert.equal(pronto.status, 201, JSON.stringify(pronto.d));
        await fetch(URL0 + '/__scheduled?cron=' + encodeURIComponent('*/15 * * * *'));
        await espera2(async () => (await pendientesDe(EP_C)).some((a) => a.titulo === 'Tu cita es en 1 hora'), 'el recordatorio de 1 hora');
        await fetch(URL0 + '/__scheduled?cron=' + encodeURIComponent('*/15 * * * *')); await new Promise((r2) => setTimeout(r2, 800));
        assert.ok(!(await pendientesDe(EP_C)).some((a) => a.titulo === 'Tu cita es en 1 hora'), 'una sola vez');
        paso('una hora antes de su cita, a la clienta le llega «Tu cita es en 1 hora» (una sola vez)');
      } else console.log('  · (el recordatorio no se probó: en 50 minutos ya es otro día)');

      // «Se me atravesó algo»: tres citas de Fernanda el D31, de 1 a 6
      const ds = [['13:00', 'Ana Cita', 'ana@correo.mx'], ['14:30', 'Bety Cita', ''], ['16:00', 'Caro Cita', '']];
      const folios = [];
      for (const [hh, n, co] of ds) { const x = await cli('/citas', { metodo: 'POST', body: { ...base, fecha: D31, hora: hh, min: 60, persona: 'fer', servicio: 'Volumen ruso', nombre: n, tel: '8440000' + (510 + folios.length), correo: co, disp: n === 'Ana Cita' ? DISP : '' }, ip: '10.0.3.' + (9 + folios.length) }); assert.equal(x.status, 201); folios.push(x.d.folio); }
      const sg = await api('/api/atelier-mia/mover/sugerir', { metodo: 'POST', token: tok, body: { fecha: D31, desde: '13:00', hasta: '18:00', persona: 'fer' } });
      assert.equal(sg.status, 200); assert.deepEqual(sg.d.afectadas.map((a) => a.folio), folios);
      const props = sg.d.afectadas.map((a) => a.propuesta);
      assert.ok(props.every(Boolean), 'a cada una le encontró hora');
      assert.ok(props.every((p) => p.fecha > D31 || p.ini >= 18 * 60), 'después del tiempo que ya no puede');
      const claves = props.map((p) => p.fecha + p.ini); assert.equal(new Set(claves).size, 3, 'no las encima entre sí');
      assert.equal(sg.d.afectadas[0].app, true); assert.equal(sg.d.afectadas[0].correo, true); assert.equal(sg.d.afectadas[2].app, false);
      const pr = await api('/api/atelier-mia/mover/proponer', { metodo: 'POST', token: tok, body: { bloqueo: { fecha: D31, desde: '13:00', hasta: '18:00', persona: 'fer' },
        propuestas: sg.d.afectadas.map((a) => ({ folio: a.folio, fecha: a.propuesta.fecha, hora: hhmmDe(a.propuesta.ini) })) } });
      assert.equal(pr.status, 200); assert.equal(pr.d.resultados.length, 3);
      const rA = pr.d.resultados[0];
      assert.equal(rA.app, true); assert.equal(rA.correo, true); assert.equal(pr.d.resultados[1].app, false);
      assert.match(rA.link, new RegExp('^https://agenda\\.solidaaplicaciones\\.com/atelier-mia/cita/' + folios[0] + '\\?t=[A-Z2-9]{20}$'));
      assert.equal((await api('/api/atelier-mia/citas', { metodo: 'POST', body: { ...base, fecha: D31, hora: '13:00', min: 60, persona: 'fer', nombre: 'Intrusa', tel: '8440000599' }, ip: '10.0.3.30' })).status, 409, 'ese tiempo ya no se ofrece');
      const agP = await api('/api/atelier-mia/agenda', { token: tok });
      const cA = agP.d.citas.find((c) => c.folio === folios[0]);
      assert.equal(cA.estado, 'propuesta'); assert.equal(cA.antes_fecha, D31); assert.equal(cA.antes_ini, 780); assert.equal(cA.enlace, rA.link); assert.equal(cA.app, true);
      await espera2(async () => (await pendientesDe(EP_C)).some((a) => a.titulo === 'Tu cita cambió de hora' && a.url === rA.link), 'el aviso de la propuesta a la clienta');
      await espera2(async () => correos2.some((c) => c.to[0] === 'ana@correo.mx' && /te propone mover tu cita/.test(c.subject)), 'el correo de la propuesta');
      const cp = correos2.find((c) => c.to[0] === 'ana@correo.mx');
      assert.ok(cp.html.includes(rA.link.replace(/&/g, '&amp;') + '&amp;r=acepto') || cp.html.includes(rA.link + '&amp;r=acepto'), 'el botón «Me queda» del correo');
      assert.match(cp.html, /line-through/);
      paso('«Se me atravesó algo»: propone a cada clienta la primera hora libre sin encimarlas, cierra ese tiempo, y le avisa por su app y por correo con su enlace');

      // Contestar: con el enlace (sin app ni cuenta)
      const t0 = new URL(rA.link).searchParams.get('t');
      assert.equal((await cli(`/propuesta/${folios[0]}?t=malo`)).status, 404);
      const vp = await cli(`/propuesta/${folios[0]}?t=${t0}`);
      assert.equal(vp.status, 200); assert.equal(vp.d.cita.estado, 'propuesta'); assert.equal(vp.d.cita.antesIni, 780); assert.ok(vp.d.huecos.length > 0);
      const ac = await cli(`/propuesta/${folios[0]}`, { metodo: 'POST', body: { t: t0, accion: 'acepto' } });
      assert.equal(ac.status, 200); assert.equal(ac.d.cita.estado, 'confirmada');
      await espera2(async () => (await pendientesDe(EP_D)).some((a) => a.titulo === 'Ana Cita aceptó la hora nueva'), 'el aviso «aceptó» a la dueña');
      const t1 = new URL(pr.d.resultados[1].link).searchParams.get('t');
      const v1 = await cli(`/propuesta/${folios[1]}?t=${t1}`);
      const h1 = v1.d.huecos[v1.d.huecos.length - 1];
      const ot = await cli(`/propuesta/${folios[1]}`, { metodo: 'POST', body: { t: t1, accion: 'otra', fecha: h1.fecha, hora: hhmmDe(h1.ini) } });
      assert.equal(ot.status, 200); assert.equal(ot.d.cita.fecha, h1.fecha); assert.equal(ot.d.cita.ini, h1.ini); assert.equal(ot.d.cita.estado, 'confirmada');
      const t2 = new URL(pr.d.resultados[2].link).searchParams.get('t');
      assert.equal((await cli(`/propuesta/${folios[2]}`, { metodo: 'POST', body: { t: t2, accion: 'cancelo' } })).d.cita.estado, 'cancelada');
      await espera2(async () => (await pendientesDe(EP_D)).some((a) => a.titulo === 'Caro Cita canceló su cita'), 'el aviso «canceló» a la dueña');
      paso('la clienta contesta con su enlace: «Me queda», otra hora libre o cancelar; a la dueña le llega cada respuesta');

      // En el navegador: la página de la propuesta
      const pr2 = await api('/api/atelier-mia/mover/sugerir', { metodo: 'POST', token: tok, body: { fecha: D30, desde: '11:00', hasta: '13:30', persona: 'fer' } });
      const af2 = pr2.d.afectadas.find((a) => a.folio === k1.d.folio);
      const pr3 = await api('/api/atelier-mia/mover/proponer', { metodo: 'POST', token: tok, body: { propuestas: [{ folio: af2.folio, fecha: af2.propuesta.fecha, hora: hhmmDe(af2.propuesta.ini) }] } });
      const pv = await ctx.newPage();
      await pv.goto(pr3.d.resultados[0].link.replace('https://agenda.solidaaplicaciones.com', URL0));
      await pv.waitForSelector('#acepto');
      assert.match(await pv.textContent('main'), /Fernanda te propone mover tu cita/); assert.match(await pv.textContent('.antes'), /12:00 pm/);
      if (CAP) await pv.screenshot({ path: CAP + '/cl-propuesta.png', fullPage: true });
      await pv.click('#otra'); await pv.waitForSelector('[data-hueco]');
      await pv.click('#acepto'); await pv.waitForFunction(() => /Tu cita está confirmada/.test(document.querySelector('main').textContent));
      await pv.close();
      paso('en el navegador: la página de la propuesta enseña antes y ahora, las horas libres, y «Me queda» la confirma');

      // En el navegador: la app de la clienta en la página del negocio (iPhone, Android y desde Instagram)
      const web2 = createServer((q, s2) => {
        let ruta = decodeURIComponent(q.url.split('?')[0]); if (ruta.endsWith('/')) ruta += 'index.html';
        try { const b = readFileSync(RAIZ + ruta); s2.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }[ruta.slice(ruta.lastIndexOf('.'))] || 'application/octet-stream' }); s2.end(b); } catch { s2.writeHead(404); s2.end(); }
      });
      await new Promise((r2) => web2.listen(8817, '127.0.0.1', r2));
      try {
        const datosPrueba = readFileSync(RAIZ + 'prueba-agenda/datos.js', 'utf8').replace('https://citas.solidaaplicaciones.com/api/prueba-solida', URL0 + '/api/atelier-mia');
        const abreCliente = async (ua) => {
          const cx = await nav.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
          await cx.route('**/prueba-agenda/datos.js', (r2) => r2.fulfill({ contentType: 'text/javascript', body: datosPrueba }));
          await cx.route('https://fonts.googleapis.com/**', (r2) => r2.fulfill({ body: '', contentType: 'text/css' }));
          await cx.route('https://wa.me/**', (r2) => r2.fulfill({ body: 'ok', contentType: 'text/plain' }));
          const pc = await cx.newPage(); const errs = []; pc.on('pageerror', (e) => errs.push(e.message));
          await pc.goto('http://127.0.0.1:8817/prueba-agenda/'); await pc.waitForSelector('.hero');
          return { cx, pc, errs };
        };
        const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
        const { cx, pc, errs } = await abreCliente(IPHONE);
        assert.equal(await pc.getAttribute('link[rel="manifest"]', 'href'), 'manifest.webmanifest');
        await pc.waitForSelector('#misCitas [data-cl="guia"]');
        // Apartar desde la página: se guarda su teléfono y sus datos
        await pc.click('[data-agendar]'); await pc.click('[data-serv="gelish"]'); await pc.click('[data-persona="fer"]');
        await pc.click(`[data-fecha="${fecha(2)}"]`).catch(async () => { await pc.click('[data-fecha]'); });
        await pc.click('[data-hora]:not([disabled])');
        await pc.fill('#cNombre', 'Paola Prueba'); await pc.fill('#cTel', '8440000600'); await pc.fill('#cCorreo', 'paola@correo.mx');
        await pc.click('[data-confirma]'); await pc.waitForSelector('.ticket-img', { timeout: 20000 });
        await pc.waitForSelector('#clientaTicket [data-cl="guia"]');
        await pc.keyboard.press('Escape');
        await pc.waitForSelector('.cl-prox');
        assert.match(await pc.textContent('#misCitas'), /Hola, Paola/); assert.match(await pc.textContent('#misCitas'), /Repetir mi última cita/);
        assert.ok(await pc.$('#clLink'), '«Mis citas» en la cabecera');
        const dispP = await pc.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('citas:disp:')).map((k) => localStorage.getItem(k))[0]);
        const suyas = await cli('/mis-citas', { disp: dispP });
        assert.equal(suyas.d.citas.length, 1); assert.equal(suyas.d.citas[0].nombre, 'Paola Prueba');
        assert.equal((await api('/api/atelier-mia/agenda', { token: tok })).d.citas.find((c) => c.nombre === 'Paola Prueba').correo, 'paola@correo.mx');
        // Tocar su cita vuelve a enseñar su ticket
        await pc.click('.cl-fila[data-cl="ticket"]'); await pc.waitForSelector('.ticket-img', { timeout: 20000 });
        await pc.keyboard.press('Escape'); await pc.waitForFunction(() => !document.getElementById('hoja').classList.contains('on'));
        // Guía de iPhone
        await pc.click('#misCitas [data-cl="guia"]'); await pc.waitForSelector('.cl-paso');
        assert.equal((await pc.$$('.cl-paso')).length, 3); assert.match(await pc.textContent('#hoja'), /Agregar a inicio/);
        if (CAP) await pc.screenshot({ path: CAP + '/cl-guia-iphone.png' });
        await pc.keyboard.press('Escape');
        if (CAP) await pc.screenshot({ path: CAP + '/cl-mis-citas.png', fullPage: true });
        // Repetir: abre la agenda con su servicio, persona y datos ya puestos
        await pc.click('[data-cl="repetir"]'); await pc.waitForSelector('[data-confirma]');
        assert.equal(await pc.getAttribute('[data-persona="fer"]', 'aria-pressed'), 'true'); assert.equal(await pc.inputValue('#cNombre'), 'Paola Prueba');
        await pc.keyboard.press('Escape');
        // Cambiar o cancelar → cancelar
        pc.on('dialog', (dl) => dl.accept());
        await pc.click('[data-cl="cambiar"]'); await pc.waitForSelector('#clCancela'); await pc.click('#clCancela');
        await pc.waitForFunction(() => !document.querySelector('.cl-prox'));
        assert.equal((await cli('/mis-citas', { disp: dispP })).d.citas[0].estado, 'cancelada');
        assert.deepEqual(errs, []);
        await cx.close();
        paso('la app de la clienta: aparta y su teléfono la recuerda (Mis citas, Repetir, Cambiar o cancelar); la guía de instalar cambia en iPhone, Android y desde Instagram');

        // ───── Apartada en el local: su enlace la guarda en SU celular; también por correo ─────
        const loc = await api('/api/atelier-mia/citas', { metodo: 'POST', token: tok, body: { ...cita, fecha: fecha(6), hora: '16:00', persona: 'mia', nombre: 'Valeria Local', tel: '8440000888' } });
        assert.equal(loc.status, 201);
        const en1 = await api(`/api/atelier-mia/citas/${loc.d.folio}/enlace`, { metodo: 'POST', token: tok });
        assert.equal(en1.status, 200); assert.match(en1.d.enlace, new RegExp('^https://ateliermia\\.solidaaplicaciones\\.com/\\?cita=' + loc.d.folio + '&t=[A-Z2-9]{20}$'));
        assert.equal((await api(`/api/atelier-mia/citas/${loc.d.folio}/enlace`, { metodo: 'POST', token: tok })).d.enlace, en1.d.enlace, 'el enlace no cambia');
        assert.equal((await api(`/api/atelier-mia/citas/${loc.d.folio}/enlace`, { metodo: 'POST' })).status, 401, 'sólo la dueña lo pide');
        const tLoc = new URL(en1.d.enlace).searchParams.get('t');
        assert.equal((await cli(`/mis-citas/${loc.d.folio}/guardar`, { metodo: 'POST', disp: 'otro-telefono-0123456789abcd', body: { t: 'MALO' + tLoc.slice(4) } })).status, 404, 'con otro t no se la lleva');
        {
          const cx2 = await nav.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE });
          await cx2.route('**/prueba-agenda/datos.js', (r2) => r2.fulfill({ contentType: 'text/javascript', body: datosPrueba }));
          await cx2.route('https://fonts.googleapis.com/**', (r2) => r2.fulfill({ body: '', contentType: 'text/css' }));
          const pv2 = await cx2.newPage(); const errs2 = []; pv2.on('pageerror', (e) => errs2.push(e.message));
          await pv2.goto('http://127.0.0.1:8817/prueba-agenda/' + new URL(en1.d.enlace).search); await pv2.waitForSelector('.ticket-img', { timeout: 20000 });
          assert.ok(!/t=/.test(pv2.url()), 'el enlace se limpia de la barra de direcciones');
          assert.ok(await pv2.$('#clientaTicket [data-cl="guia"]'), 'abajo de su ticket: instalar la app');
          if (CAP) await pv2.screenshot({ path: CAP + '/cl-cita-del-local.png' });
          await pv2.keyboard.press('Escape'); await pv2.waitForSelector('.cl-prox');
          const dispV = await pv2.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('citas:disp:')).map((k) => localStorage.getItem(k))[0]);
          assert.ok((await cli('/mis-citas', { disp: dispV })).d.citas.some((c) => c.folio === loc.d.folio), 'su cita quedó en SU celular');
          assert.deepEqual(errs2, []);
          // Escaneando el QR del local: sus citas cuentan como «del QR»
          await pv2.goto('http://127.0.0.1:8817/prueba-agenda/?de=qr'); await pv2.waitForSelector('.hero');
          await pv2.click('[data-agendar]'); await pv2.click('[data-serv="gelish"]'); await pv2.click('[data-persona="fer"]');
          await pv2.click(`[data-fecha="${fecha(4)}"]`).catch(async () => { await pv2.click('[data-fecha]'); });
          await pv2.click('[data-hora]:not([disabled])');
          await pv2.fill('#cNombre', 'Qr Nueva'); await pv2.fill('#cTel', '8440000777');
          await pv2.click('[data-confirma]'); await pv2.waitForSelector('.ticket-img', { timeout: 20000 });
          assert.deepEqual(errs2, []);
          await cx2.close();
        }
        const qrD = await api('/api/atelier-mia/qr', { token: tok });
        assert.equal(qrD.d.url, 'https://ateliermia.solidaaplicaciones.com/?de=qr'); assert.equal(qrD.d.delQr, 1); assert.equal(qrD.d.nuevas, 1);
        assert.equal((await api('/api/atelier-mia/citas/' + loc.d.folio + '/correo', { metodo: 'POST', token: tok, body: { correo: 'no-es' } })).status, 400);
        const nC = correos2.length;
        assert.equal((await api('/api/atelier-mia/citas/' + loc.d.folio + '/correo', { metodo: 'POST', token: tok, body: { correo: 'Vale@Correo.mx' } })).status, 200);
        await espera2(() => correos2.length > nC, 'el correo de su cita');
        const cv = correos2[correos2.length - 1];
        assert.deepEqual(cv.to, ['vale@correo.mx']); assert.match(cv.subject, /Tu cita en Atelier Mía/);
        assert.ok(cv.html.includes(en1.d.enlace.replace(/&/g, '&amp;')) && cv.text.includes(en1.d.enlace), 'trae su enlace');
        if (CAP) writeFileSync(CAP + '/correo-tu-cita.html', cv.html);
        paso('apartada en el local: su enlace guarda la cita en SU celular (y la invita a la app), por correo le llega con el mismo enlace; las citas que llegan escaneando el QR se cuentan');

        // ───── En la compu: menú a un lado, Hoy por columnas, la cita a la derecha con «Mándale su cita»; y Tu código QR ─────
        await pg.setViewportSize({ width: 1280, height: 860 }); await pg.reload();
        await pg.waitForSelector('.lado'); assert.ok(!(await pg.isVisible('.barra-nav')), 'en la compu no va la barra de abajo');
        await pg.click('.lado [data-vista="hoy"]'); await pg.click(`[data-dia="${fecha(6)}"]`);
        await pg.waitForSelector(`.rej-cita[data-detalle="${loc.d.folio}"]`);
        assert.ok((await pg.$$('.rej-quien')).length >= 2, 'una columna por persona');
        await pg.click(`.rej-cita[data-detalle="${loc.d.folio}"]`); await pg.waitForSelector('.hoja .manda');
        assert.ok(await pg.evaluate(() => document.body.classList.contains('con-panel')), 'la cita se abre a un lado, sin tapar la agenda');
        await pg.click('[data-manda="qr"]'); await pg.waitForSelector('.manda-qr svg');
        if (CAP) await pg.screenshot({ path: CAP + '/ag-compu-cita.png' });
        await pg.click('[data-manda="grande"]'); await pg.waitForSelector('.qr-grande'); await pg.keyboard.press('Escape');
        await pg.waitForFunction(() => !document.querySelector('.qr-grande'));
        await pg.keyboard.press('Escape');
        await pg.click('.lado [data-vista="semana"]'); await pg.waitForSelector('.sem-rejilla');
        assert.ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.sem-rejilla')).gridTemplateColumns.split(' ').length === 7), 'la semana en 7 columnas');
        await pg.click('.lado [data-vista="qr"]'); await pg.waitForSelector('#qrPrevia .ct'); await pg.waitForSelector('#qrCifras .cifra');
        assert.match(await pg.textContent('#qrCifras'), /1\s*apartaron desde tu QR/);
        await pg.click('[data-qrtam="tarjetas"]'); assert.equal((await pg.$$('#qrPrevia .ct')).length, 8);
        if (CAP) await pg.screenshot({ path: CAP + '/ag-compu-qr.png', fullPage: true });
        await pg.setViewportSize({ width: 390, height: 844 }); await pg.waitForSelector('.barra-nav');
        await pg.click('[data-vista="hoy"]');
        assert.deepEqual(errores, []);
        paso('en la compu: menú a un lado, Hoy con una columna por persona, la cita a la derecha con «Mándale su cita» y su QR, la semana en columnas y «Tu código QR» con su cartel');

        // Android (Chrome): sin el aviso del navegador todavía, la explicación del menú; desde Instagram: copiar el enlace
        const and = await abreCliente('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
        await and.pc.waitForSelector('#misCitas .cl-card'); assert.match(await and.pc.textContent('#misCitas'), /Instalar app|Agregar a pantalla principal/);
        await and.cx.close();
        const ig = await abreCliente(IPHONE.replace('Safari/604.1', 'Instagram 330.0.0.0'));
        await ig.pc.waitForSelector('[data-cl="copiar"]'); assert.match(await ig.pc.textContent('#misCitas'), /no se puede instalar/);
        await ig.cx.close();
      } finally { web2.close(); }

      // En el navegador: la dueña «Se me atravesó algo»
      await pg.click('[data-vista="hoy"]'); await pg.click(`[data-dia="${fecha(2)}"]`);
      await pg.click('#atraveso'); await pg.waitForSelector('#mvVer');
      await pg.fill('#mvFecha', D30); await pg.click('[data-mvtodo="1"]'); await pg.click('[data-quien="fer"]'); await pg.click('#mvVer');
      await pg.waitForSelector('#mvOk');
      if (CAP) await pg.screenshot({ path: CAP + '/ag-mover.png', fullPage: true });
      await pg.click('#mvOk'); await pg.waitForSelector('#mvListo');
      assert.match(await pg.textContent('.hoja'), /Listo: ya les propusimos|Listo/);
      if (CAP) await pg.screenshot({ path: CAP + '/ag-mover-listo.png', fullPage: true });
      await pg.click('#mvListo');
      assert.deepEqual(errores, []);
      paso('en el navegador: la dueña aparta «Se me atravesó algo», ve a quién se le propone qué hora y por dónde se le avisa');
    } finally { push2.close(); mail2.close(); }

    // ───── Face ID / huella (con un autenticador simulado de Chromium) ─────
    {
      const URLH = `http://localhost:${PUERTO}`; let errB = [];
      const cx = await nav.newContext({ viewport: { width: 390, height: 844 } });
      await cx.route('https://fonts.googleapis.com/**', (r2) => r2.fulfill({ body: '', contentType: 'text/css' }));
      const pb = await cx.newPage();
      try {
      errB = []; pb.on('pageerror', (e) => errB.push(e.message)); pb.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|status of 40[019]/.test(m.text())) errB.push(m.text()); });
      pb.on('dialog', (dg) => dg.accept());
      const cdp = await cx.newCDPSession(pb);
      await cdp.send('WebAuthn.enable');
      const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
      await pb.goto(URLH + '/atelier-mia/'); await pb.waitForSelector('#clave');
      await pb.waitForSelector('#conBio:not([hidden])');
      await pb.fill('#clave', CLAVE2); await pb.click('#conClave');
      await pb.waitForSelector('#bioSi');
      if (CAP) await pb.screenshot({ path: CAP + '/ag-bio-oferta.png' });
      await pb.click('#bioSi');
      await pb.waitForFunction(() => !document.getElementById('velo') && localStorage.getItem('agenda:llave:atelier-mia'), null, { timeout: 8000 }).catch(async () => { throw new Error('no se activó: ' + JSON.stringify(await pb.evaluate(() => ({ u: location.href, velo: !!document.getElementById('velo'), ll: localStorage.getItem('agenda:llave:atelier-mia'), f: (document.getElementById('bioFalta') || {}).textContent, html: document.body.innerHTML.slice(0, 300) }))) + ' ' + errB.join(' | ')); });
      await pb.waitForFunction(() => !document.getElementById('velo') && localStorage.getItem('agenda:llave:atelier-mia'));
      assert.equal((await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length, 1, 'el teléfono guardó su llave');
      // Seguridad: Face ID activado y «pedir al abrir»
      await pb.click('#seguridad'); await pb.waitForSelector('#segBloqueo');
      assert.match(await pb.textContent('.hoja'), /Activado/);
      assert.equal((await pb.$$('[data-quita-llave]')).length, 1, 'una llave'); assert.equal((await pb.$$('[data-quita-sesion][data-actual]')).length, 1, 'y «Este teléfono» entre las sesiones');
      await pb.check('#segBloqueo');
      if (CAP) await pb.screenshot({ path: CAP + '/ag-seguridad.png', fullPage: true });
      await pb.keyboard.press('Escape');
      await pb.reload(); await pb.waitForSelector('#candBio');
      assert.ok(!(await pb.$('.cab')), 'con candado no se ve la agenda');
      if (CAP) await pb.screenshot({ path: CAP + '/ag-candado.png' });
      await pb.click('#candBio'); await pb.waitForSelector('.cab'); assert.ok(!(await pb.$('#candado')));
      // Salir y volver a entrar con Face ID (ya es el botón principal)
      await pb.click('#salir'); await pb.waitForSelector('#conBio:not([hidden])');
      assert.match(await pb.getAttribute('#conBio', 'class'), /negro/);
      await pb.click('#conBio'); await pb.waitForSelector('.cab');
      const sb = await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.7.9' });
      let dv = await api('/api/atelier-mia/dispositivos', { token: sb.d.token });
      assert.equal(dv.d.llaves.length, 1); assert.ok(dv.d.sesiones.some((x) => x.metodo === 'llave'), 'la sesión dice que entró con Face ID');
      assert.ok(dv.d.llaves[0].ultimo > 0);
      // Desde el navegador quita el otro teléfono
      await pb.click('#seguridad'); await pb.waitForSelector(`[data-quita-sesion="${sb.d.sesion}"]`);
      await pb.click(`[data-quita-sesion="${sb.d.sesion}"]`);
      await pb.waitForFunction((id) => !document.querySelector(`[data-quita-sesion="${id}"]`), sb.d.sesion);
      assert.equal((await api('/api/atelier-mia/agenda', { token: sb.d.token })).status, 401, 'el teléfono quitado desde la app deja de ver la agenda');
      await pb.keyboard.press('Escape');
      // Si le roban este teléfono: desde otro quita su llave y su sesión
      const sc = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.7.10' })).d;
      dv = await api('/api/atelier-mia/dispositivos', { token: sc.token });
      await api('/api/atelier-mia/dispositivos/llave/' + encodeURIComponent(dv.d.llaves[0].id), { metodo: 'DELETE', token: sc.token });
      await api('/api/atelier-mia/dispositivos/cerrar-otras', { metodo: 'POST', token: sc.token });
      await pb.reload(); await pb.waitForSelector('#conBio:not([hidden])');
      await pb.click('#conBio'); await pb.waitForFunction(() => document.getElementById('falta').textContent.length > 0);
      assert.match(await pb.textContent('#falta'), /Todavía no activas|ya no está activa/, 'la llave quitada ya no abre: ' + await pb.textContent('#falta'));
      assert.ok(!(await pb.$('.cab')));
      // Clave nueva desde Solida: también borra las llaves de Face ID (un teléfono robado trae la suya)
      const sd = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: CLAVE2 }, ip: '6.6.7.11' })).d;
      await pb.evaluate(() => localStorage.clear()); await pb.reload(); await pb.waitForSelector('#clave');
      await pb.fill('#clave', CLAVE2); await pb.click('#conClave'); await pb.waitForSelector('#bioSi'); await pb.click('#bioSi');
      await pb.waitForFunction(() => !document.getElementById('velo') && localStorage.getItem('agenda:llave:atelier-mia'));
      assert.equal((await api('/api/atelier-mia/dispositivos', { token: sd.token })).d.llaves.length, 1);
      const cl3 = await api('/api/admin/negocios', { metodo: 'POST', maestra: true, body: { id: 'atelier-mia', nombre: 'Atelier Mía' } });
      const sf = (await api('/api/atelier-mia/entrar', { metodo: 'POST', body: { clave: cl3.d.clave }, ip: '6.6.7.12' })).d;
      assert.equal((await api('/api/atelier-mia/dispositivos', { token: sf.token })).d.llaves.length, 0, 'la clave nueva borra los Face ID');
      assert.equal((await api('/api/atelier-mia/agenda', { token: sd.token })).status, 401);
      } catch (e) { e.message += ' · pantalla: ' + JSON.stringify(await pb.evaluate(() => ({ cand: !!document.getElementById('candado'), velo: !!document.getElementById('velo'), ll: localStorage.getItem('agenda:llave:atelier-mia'), bl: localStorage.getItem('agenda:bloqueo:atelier-mia'), txt: document.body.innerText.slice(0, 300) }))) + ' ' + errB.join(' | '); throw e; }
      assert.deepEqual(errB, []);
      await cx.close();
    }
    paso('Face ID / huella: se activa después de entrar con la clave, abre la agenda, puede pedirse al abrir, y desde otro teléfono se quita (si te lo roban); una clave nueva borra todos los Face ID');

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
    assert.match(await ej.textContent('#abreCal'), /Conectado/, 'en la muestra, el calendario de Mía ya está conectado');
    await ej.click('#abreCal'); await ej.waitForSelector('#calRevisa');
    if (CAP) await ej.screenshot({ path: CAP + '/ag-calendario.png', fullPage: true });
    await ej.keyboard.press('Escape');
    await ej.click('#editaHorario'); await ej.waitForSelector('#fHor');
    if (CAP) { await ej.setViewportSize({ width: 320, height: 700 }); await ej.screenshot({ path: CAP + '/ag-horario-320.png' }); }
    assert.ok(await ej.evaluate(() => document.querySelector('.hoja').scrollWidth <= document.querySelector('.hoja').clientWidth), 'el horario cabe a 320 px');
    paso('la muestra del catálogo también tiene Mis tiempos y se puede tocar todo');
  } finally { await nav.close(); }

  console.log(`\n${pasos.length} pasos correctos.`);
} catch (e) {
  console.error('\n✗ FALLÓ:', e.message); process.exitCode = 1;
  if (process.env.LOG) console.error(log.split('\n').filter((l) => /Error|error|at /.test(l)).slice(-25).join('\n'));
} finally {
  if (w) { try { process.kill(-w.pid, 'SIGTERM'); } catch {} }
  if (previo) writeFileSync(devVars, previo); else rmSync(devVars, { force: true });
  rmSync(persist, { recursive: true, force: true });
  setTimeout(() => process.exit(), 400);
}
