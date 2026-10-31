// La cartera de un negocio a partir de los datos de su página (datos.js), para cargarla en su agenda.
//   node scripts/cartera-de-pagina.mjs ../../Solida-Web/prueba-agenda/datos.js prueba-solida
// Deja <negocio>.cartera.json y <negocio>.cartera.sql junto al datos.js; se carga con
//   npx wrangler d1 execute solida-citas --remote --file <negocio>.cartera.sql
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dirname, join } from 'node:path';
const [archivo, negocio] = process.argv.slice(2);
if (!archivo || !/^[a-z0-9-]{2,40}$/.test(negocio || '')) { console.error('Uso: node scripts/cartera-de-pagina.mjs <datos.js> <negocio>'); process.exit(2); }
const caja = { window: {} }; runInNewContext(readFileSync(archivo, 'utf8'), caja);
const N = caja.window.NEGOCIO;
const cartera = {
  servicios: N.servicios.map((s) => ({ id: s.id, nombre: s.nombre, cat: s.categoria || '', min: s.min, precio: s.precio, desde: !!s.desde, quien: [] })),
  variantes: (N.disenos || []).filter((d) => d.servicio).map((d) => ({ id: d.id, nombre: d.nombre, servicio: d.servicio, extra: d.extra || 0, extraMin: 0 })),
  largos: (N.largos || []).map((l) => ({ nombre: l[0], extra: l[1] || 0 })),
  largosEn: (N.largos || []).length && N.servicios.some((s) => s.categoria === 'Uñas') ? ['Uñas'] : [],   // la plantilla de uñas los aplica en «Uñas»
  anticipo: N.anticipo || 0,
};
const base = join(dirname(archivo), negocio);
writeFileSync(base + '.cartera.json', JSON.stringify(cartera, null, 1));
writeFileSync(base + '.cartera.sql', `UPDATE negocios SET servicios='${JSON.stringify(cartera).replace(/'/g, "''")}' WHERE id='${negocio}';\n`);
console.log(`${cartera.servicios.length} servicios, ${cartera.variantes.length} diseños, ${cartera.largos.length} largos, anticipo $${cartera.anticipo}`);
console.log('Carga con:  npx wrangler d1 execute solida-citas --remote --file ' + base + '.cartera.sql');
