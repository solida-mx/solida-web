import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horasOcupadas, leeEventos } from '../src/ical.js';

const Z = 'America/Monterrey';   // sin horario de verano (UTC-6)
const cal = (...ev) => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + ev.map((e) => 'BEGIN:VEVENT\r\n' + e.trim().split('\n').map((l) => l.trim()).join('\r\n') + '\r\nEND:VEVENT\r\n').join('') + 'END:VCALENDAR\r\n';

test('un evento con su zona: se pasa a la hora del negocio y nunca guarda el título', () => {
  const t = cal(`UID:a\nSUMMARY:Dentista con el Dr. López\nLOCATION:Consultorio 4\nDTSTART;TZID=America/Monterrey:20261102T150000\nDTEND;TZID=America/Monterrey:20261102T160000`);
  const r = horasOcupadas(t, Z, '2026-11-01', '2026-11-08');
  assert.deepEqual(r, [{ fecha: '2026-11-02', ini: 900, fin: 960 }]);
  assert.ok(!JSON.stringify(r).includes('López') && !JSON.stringify(r).includes('Consultorio'));
});

test('UTC y otra zona se convierten a la del negocio', () => {
  const t = cal(`UID:b\nDTSTART:20261103T190000Z\nDTEND:20261103T200000Z`,
    `UID:c\nDTSTART;TZID=America/Mexico_City:20261104T090000\nDURATION:PT1H30M`,
    `UID:d\nDTSTART;TZID=Central Standard Time (Mexico):20261105T100000\nDTEND;TZID=Central Standard Time (Mexico):20261105T110000`);
  assert.deepEqual(horasOcupadas(t, Z, '2026-11-01', '2026-11-08'), [
    { fecha: '2026-11-03', ini: 780, fin: 840 },
    { fecha: '2026-11-04', ini: 540, fin: 630 },
    { fecha: '2026-11-05', ini: 600, fin: 660 },
  ]);
});

test('día completo y de varios días; uno que cruza la medianoche se parte', () => {
  const t = cal(`UID:e\nDTSTART;VALUE=DATE:20261102\nDTEND;VALUE=DATE:20261104`, `UID:f\nDTSTART;TZID=America/Monterrey:20261105T220000\nDTEND;TZID=America/Monterrey:20261106T013000`);
  assert.deepEqual(horasOcupadas(t, Z, '2026-11-01', '2026-11-08'), [
    { fecha: '2026-11-02', ini: 0, fin: 1440 }, { fecha: '2026-11-03', ini: 0, fin: 1440 },
    { fecha: '2026-11-05', ini: 1320, fin: 1440 }, { fecha: '2026-11-06', ini: 0, fin: 90 },
  ]);
});

test('lo cancelado y lo marcado como «libre» no ocupa', () => {
  const t = cal(`UID:g\nSTATUS:CANCELLED\nDTSTART:20261102T160000Z\nDTEND:20261102T170000Z`, `UID:h\nTRANSP:TRANSPARENT\nDTSTART:20261103T160000Z\nDTEND:20261103T170000Z`);
  assert.deepEqual(horasOcupadas(t, Z, '2026-11-01', '2026-11-08'), []);
});

test('semanal con días, con fecha de fin, con una vez quitada y otra movida', () => {
  const t = cal(
    `UID:s\nDTSTART;TZID=America/Monterrey:20261102T130000\nDTEND;TZID=America/Monterrey:20261102T140000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261113T235959Z\nEXDATE;TZID=America/Monterrey:20261104T130000`,
    `UID:s\nRECURRENCE-ID;TZID=America/Monterrey:20261106T130000\nDTSTART;TZID=America/Monterrey:20261106T170000\nDTEND;TZID=America/Monterrey:20261106T180000`);
  assert.deepEqual(horasOcupadas(t, Z, '2026-11-01', '2026-11-30'), [
    { fecha: '2026-11-02', ini: 780, fin: 840 },
    { fecha: '2026-11-06', ini: 1020, fin: 1080 },   // ese viernes se movió a las 5
    { fecha: '2026-11-09', ini: 780, fin: 840 }, { fecha: '2026-11-11', ini: 780, fin: 840 }, { fecha: '2026-11-13', ini: 780, fin: 840 },
  ], 'el miércoles 4 se quitó y después del 13 ya no sigue');
});

test('diario cada 2 días con número de veces; mensual «el segundo martes»; anual', () => {
  const t = cal(`UID:x\nDTSTART:20261101T150000Z\nDTEND:20261101T153000Z\nRRULE:FREQ=DAILY;INTERVAL=2;COUNT=3`,
    `UID:y\nDTSTART;TZID=America/Monterrey:20261013T100000\nDTEND;TZID=America/Monterrey:20261013T110000\nRRULE:FREQ=MONTHLY;BYDAY=2TU`,
    `UID:z\nDTSTART;VALUE=DATE:20201225\nRRULE:FREQ=YEARLY`);
  const r = horasOcupadas(t, Z, '2026-11-01', '2026-12-31');
  assert.deepEqual(r.filter((x) => x.ini === 540).map((x) => x.fecha), ['2026-11-01', '2026-11-03', '2026-11-05']);
  assert.deepEqual(r.filter((x) => x.ini === 600).map((x) => x.fecha), ['2026-11-10', '2026-12-08']);
  assert.deepEqual(r.filter((x) => x.fin === 1440).map((x) => x.fecha), ['2026-12-25']);
});

test('lo que se encima en el mismo día se junta, y lo de fuera de la ventana no sale', () => {
  const t = cal(`UID:1\nDTSTART:20261102T160000Z\nDTEND:20261102T180000Z`, `UID:2\nDTSTART:20261102T170000Z\nDTEND:20261102T190000Z`, `UID:3\nDTSTART:20270102T170000Z\nDTEND:20270102T190000Z`);
  assert.deepEqual(horasOcupadas(t, Z, '2026-11-01', '2026-11-30'), [{ fecha: '2026-11-02', ini: 600, fin: 780 }]);
});

test('líneas partidas y alarmas dentro del evento no lo confunden', () => {
  const t = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:p\r\nSUMMARY:Algo muy lar\r\n go\r\nDTSTART:20261102T160000Z\r\nDTEND:20261102T170000Z\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nDTSTART:20991231T000000Z\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assert.equal(leeEventos(t).length, 1);
  assert.deepEqual(horasOcupadas(t, Z, '2026-11-01', '2026-11-08'), [{ fecha: '2026-11-02', ini: 600, fin: 660 }]);
});

test('Ciudad de México en el cambio de horario de EE. UU. no se mueve (México ya no tiene horario de verano)', () => {
  const t = cal(`UID:dst\nDTSTART;TZID=America/Mexico_City:20261102T100000\nDTEND;TZID=America/Mexico_City:20261102T110000\nRRULE:FREQ=WEEKLY;COUNT=2`);
  assert.deepEqual(horasOcupadas(t, Z, '2026-11-01', '2026-11-15').map((x) => x.ini), [600, 600]);
});
