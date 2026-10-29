import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoyEn, sumaDias, validaCita, generaClave, normalizaClave } from '../src/index.js';

const Z = 'America/Monterrey';
// 29 oct 2026, 15:00 en Monterrey (21:00 UTC)
const T = Date.UTC(2026, 9, 29, 21, 0);

test('el día y la hora se cuentan en la zona del negocio, no en UTC', () => {
  assert.deepEqual(hoyEn(Z, T), { fecha: '2026-10-29', min: 15 * 60 });
  // a las 23:30 de Monterrey en UTC ya es el día siguiente
  assert.equal(hoyEn(Z, Date.UTC(2026, 9, 30, 5, 30)).fecha, '2026-10-29');
  assert.equal(sumaDias('2026-12-31', 1), '2027-01-01');
});

test('una cita válida se limpia y se acota', () => {
  const c = validaCita({ fecha: '2026-10-30', hora: '10:30', min: 90, nombre: '  Andrea <b>x</b> ', tel: '(844) 000-0000', servicio: 'Gelish', precio: 360, persona: 'Mía!', equipo: ['mia', 'FER'] }, Z, T);
  assert.equal(c.ini, 630); assert.equal(c.fin, 720);
  assert.equal(c.nombre, 'Andrea b x /b');
  assert.equal(c.tel, '8440000000');
  assert.equal(c.persona, 'ma');
  assert.deepEqual(c.equipo, ['mia', 'fer']);
});

test('no se aparta en el pasado, ni muy adelante, ni sin datos', () => {
  const base = { fecha: '2026-10-30', hora: '10:00', min: 60, nombre: 'Ana', tel: '8440000000' };
  assert.throws(() => validaCita({ ...base, fecha: '2026-10-28' }, Z, T), /no se puede/);
  assert.throws(() => validaCita({ ...base, fecha: '2026-10-29', hora: '14:00' }, Z, T), /ya pasó/);
  assert.throws(() => validaCita({ ...base, fecha: '2027-03-01' }, Z, T), /no se puede/);
  assert.throws(() => validaCita({ ...base, tel: '12345' }, Z, T), /10 dígitos/);
  assert.throws(() => validaCita({ ...base, nombre: 'A' }, Z, T), /nombre/);
  assert.throws(() => validaCita({ ...base, min: 0 }, Z, T), /duración/);
  assert.throws(() => validaCita({ ...base, hora: '25:00' }, Z, T), /no válidas/);
});

test('la clave de la dueña no trae letras que se confunden y se escribe como sea', () => {
  for (let i = 0; i < 50; i++) {
    const c = generaClave();
    assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.doesNotMatch(c, /[01OIL]/);
  }
  assert.equal(normalizaClave(' abcd efgh-jkmn '), 'ABCD-EFGH-JKMN');
});
