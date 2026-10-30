import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoCitaNueva, correoPrueba } from '../src/correos.js';

const neg = { id: 'atelier-mia', nombre: 'Atelier "Mía" & Co' };
const c = { folio: 'C-ABC123', fecha: '2026-10-30', ini: 780, fin: 930, servicio: 'Volumen <ruso>', diseno: '', precio: 850, anticipo: 0, nombre: 'Ana <img src=x onerror=alert(1)>', tel: '8445550192' };

test('el correo de cita nueva: escapa lo que viene de afuera, trae la cita y sus botones', () => {
  const m = correoCitaNueva(neg, c, 'Fernanda', 'https://agenda.solidaaplicaciones.com');
  assert.ok(!m.html.includes('<img') && !m.html.includes('<ruso>') && !m.html.includes('"Mía"'), 'nada sin escapar');
  assert.match(m.html, /Ana &lt;img/); assert.match(m.html, /Atelier &quot;Mía&quot; &amp; Co/);
  assert.match(m.html, /VIE/); assert.match(m.html, />30</); assert.match(m.html, /OCT/);
  assert.match(m.html, /1:00 pm – 3:30 pm/); assert.match(m.html, /2 h 30 min/);
  assert.match(m.html, /Todavía no/); assert.match(m.html, /844 555 0192/);
  assert.equal(m.agenda, 'https://agenda.solidaaplicaciones.com/atelier-mia/?cita=C-ABC123');
  assert.ok(m.html.includes('href="https://agenda.solidaaplicaciones.com/atelier-mia/?cita=C-ABC123"'));
  assert.ok(m.html.includes('https://wa.me/528445550192'));
  assert.match(m.html, />AC</, 'el sello con sus iniciales, sin imágenes');
  assert.ok(!/<img/i.test(m.html), 'sin imágenes: se lee aunque el correo las esconda');
  assert.match(m.texto, /Ana <img/, 'la versión de texto va tal cual (no es HTML)');
});

test('el correo de prueba dice cómo están sus avisos y trae un ejemplo marcado como ejemplo', () => {
  const m = correoPrueba(neg, 2, 'mia@atelier.mx', 'https://agenda.solidaaplicaciones.com');
  assert.match(m.html, /Activos en 2 teléfonos/); assert.match(m.html, /mia@atelier\.mx/);
  assert.match(m.html, /Así te llega una cita \(ejemplo\)/); assert.match(m.html, /los datos son inventados/);
  assert.match(correoPrueba(neg, 0, 'x@y.mx', 'https://a').html, /Apagados/);
});
