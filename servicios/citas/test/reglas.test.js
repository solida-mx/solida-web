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

import { diaSemana, tiemposOcupados, fueraDeHorario, limpiaSemana } from '../src/index.js';

test('el día de la semana: 1 = lunes … 7 = domingo', () => {
  assert.equal(diaSemana('2026-11-02'), 1);   // lunes
  assert.equal(diaSemana('2026-11-01'), 7);   // domingo
  assert.equal(diaSemana('2026-10-30'), 5);   // viernes
});

const semana = { 1: [600, 1140], 2: [600, 1140], 3: [600, 1140], 4: [600, 1200], 5: [600, 1200], 6: [540, 900], 7: null };
const neg = (horario, equipo = [{ id: 'mia', nombre: 'Mía' }, { id: 'fer', nombre: 'Fernanda' }]) => ({ id: 'x', nombre: 'X', equipo: JSON.stringify(equipo), horario: JSON.stringify(horario) });

test('sin horario guardado no se restringe nada (la página usa el suyo)', () => {
  const t = tiemposOcupados(neg({}), [], '2026-11-02', '2026-11-09');
  assert.deepEqual(t.ocupado, []); assert.equal(t.horario, null);
  assert.equal(fueraDeHorario(neg({}), '2026-11-01', 0, 60, 'mia'), false);
});

test('el horario de cada quien: lo de antes de entrar, después de salir y su día de descanso sale ocupado', () => {
  const n = neg({ mia: semana });
  const t = tiemposOcupados(n, [], '2026-11-01', '2026-11-03');   // domingo y lunes
  assert.deepEqual(t.ocupado, [
    { fecha: '2026-11-01', ini: 0, fin: 1440, persona: 'mia' },
    { fecha: '2026-11-02', ini: 0, fin: 600, persona: 'mia' }, { fecha: '2026-11-02', ini: 1140, fin: 1440, persona: 'mia' },
  ], 'Fernanda no tiene horario y no se le restringe');
  assert.deepEqual(Object.keys(t.horario), ['mia']);
  assert.equal(fueraDeHorario(n, '2026-11-02', 600, 660, 'mia'), false);
  assert.equal(fueraDeHorario(n, '2026-11-02', 1110, 1170, 'mia'), true, 'termina después de su salida');
  assert.equal(fueraDeHorario(n, '2026-11-01', 600, 660, 'mia'), true, 'domingo descansa');
  assert.equal(fueraDeHorario(n, '2026-11-01', 600, 660, 'fer'), false);
});

test('el horario de todo el negocio vale para quien no tiene el suyo', () => {
  const n = neg({ '': semana, fer: { ...semana, 7: [600, 840] } });
  assert.equal(fueraDeHorario(n, '2026-11-01', 600, 660, 'mia'), true);
  assert.equal(fueraDeHorario(n, '2026-11-01', 600, 660, 'fer'), false, 'Fernanda sí trabaja el domingo');
});

test('un plan que se repite ocupa sólo sus días, desde su fecha y hasta su fin', () => {
  const rep = [{ persona: 'mia', dias: '135', inicio_min: 780, fin_min: 840, desde: '2026-11-03', hasta: '2026-11-13' }];
  const t = tiemposOcupados(neg({}), rep, '2026-11-02', '2026-11-17');
  assert.deepEqual(t.ocupado.map((x) => x.fecha), ['2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'],
    'el lunes 2 es antes de que empiece; el lunes 16 ya terminó');
});

test('el horario se valida', () => {
  assert.deepEqual(limpiaSemana({ 1: { desde: '10:00', hasta: '19:00' }, 7: null })[1], [600, 1140]);
  assert.equal(limpiaSemana({ 1: [600, 1140] })[2], null, 'un día que no viene es día de descanso');
  assert.throws(() => limpiaSemana({ 1: { desde: '19:00', hasta: '10:00' } }), /después/);
  assert.throws(() => limpiaSemana({ 1: [600, 2000] }), /horario/);
});
