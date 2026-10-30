// Mete los archivos de agenda/ (la app de la dueña) dentro del Worker (src/agenda.generados.js),
// así se publica en un solo paso y sin subir archivos aparte. Corre solo antes de dev y deploy.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';

const raiz = new URL('../agenda/', import.meta.url).pathname;
const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const archivos = {};
(function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { recorrer(p); continue; }
    const tipo = tipos[extname(n)];
    if (!tipo) throw new Error(`Tipo de archivo no soportado en agenda/: ${n}`);
    const ruta = '/' + relative(raiz, p).split('\\').join('/');
    archivos[ruta] = extname(n) === '.png' ? { tipo, b64: readFileSync(p).toString('base64') } : { tipo, cuerpo: readFileSync(p, 'utf8') };
  }
})(raiz);
// La versión del service worker es la huella de todo: cambia sola con cualquier cambio de la app.
const huella = createHash('sha256');
for (const r of Object.keys(archivos).sort()) huella.update(r).update(archivos[r].cuerpo ?? archivos[r].b64);
const VERSION = huella.digest('hex').slice(0, 12);
const sw = archivos['/sw.js'];
if (!sw || !sw.cuerpo.includes('__VERSION__')) throw new Error('agenda/sw.js debe llevar __VERSION__');
sw.cuerpo = sw.cuerpo.split('__VERSION__').join(VERSION);
writeFileSync(new URL('../src/agenda.generados.js', import.meta.url),
  `// Generado por scripts/empaquetar.mjs — no editar a mano.\nexport const VERSION = ${JSON.stringify(VERSION)};\nexport default ${JSON.stringify(archivos)};\n`);
console.log(`empaquetados ${Object.keys(archivos).length} archivos de agenda/ · versión ${VERSION}`);
