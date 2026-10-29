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

  console.log(`\n${pasos.length} pasos correctos.`);
} catch (e) {
  console.error('\n✗ FALLÓ:', e.message); process.exitCode = 1;
} finally {
  if (w) { try { process.kill(-w.pid, 'SIGTERM'); } catch {} }
  if (previo) writeFileSync(devVars, previo); else rmSync(devVars, { force: true });
  rmSync(persist, { recursive: true, force: true });
  setTimeout(() => process.exit(), 400);
}
