// El ícono de la app de la dueña con la marca de su negocio.
//   node scripts/icono-duena.mjs <negocio> "<Nombre del negocio>" [logo.png|logo.svg]
// Sin logo: su sello (iniciales en dorado sobre negro, como en toda la agenda). Con logo: el logo al centro.
// Deja <negocio>.icono.sql (y las tres imágenes para verlas) en la carpeta actual; se carga con
//   npx wrangler d1 execute solida-citas --remote --file <negocio>.icono.sql
// iPhone y Android guardan el ícono al instalar: para ver el nuevo hay que quitar la app de la pantalla y volver a agregarla.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const [negocio, nombre, logo] = process.argv.slice(2);
if (!/^[a-z0-9-]{2,40}$/.test(negocio || '') || !nombre) { console.error('Uso: node scripts/icono-duena.mjs <negocio> "<Nombre>" [logo]'); process.exit(2); }
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p = nombre.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const ini = ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase();
const centro = logo
  ? `<img src="data:${extname(logo) === '.svg' ? 'image/svg+xml' : 'image/png'};base64,${readFileSync(logo).toString('base64')}" style="width:62%;height:62%;object-fit:contain">`
  : `<div style="width:66%;height:66%;border-radius:50%;border:2.2cqw solid #c9a96e;display:flex;align-items:center;justify-content:center;color:#c9a96e;font:600 26cqw/1 'Cormorant Garamond',Georgia,serif;letter-spacing:-.02em;padding-top:1.5cqw;box-sizing:border-box">${esc(ini)}</div>`;
const nav = await chromium.launch(), png = {};
for (const t of [180, 192, 512]) {
  const pg = await nav.newPage({ viewport: { width: t, height: t } });
  await pg.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&display=swap" rel="stylesheet"></head>` +
    `<body style="margin:0"><div style="width:${t}px;height:${t}px;background:#161412;display:flex;align-items:center;justify-content:center;container-type:size">${centro}</div></body></html>`);
  await pg.waitForTimeout(400);
  const b = await pg.screenshot(); png[t] = b.toString('base64'); writeFileSync(`${negocio}-icono-${t}.png`, b); await pg.close();
}
await nav.close();
writeFileSync(`${negocio}.icono.sql`, `UPDATE negocios SET icono='${JSON.stringify(png)}' WHERE id='${negocio}';\n`);
console.log(`Listo: ${negocio}-icono-180/192/512.png y ${negocio}.icono.sql`);
