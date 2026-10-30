// Los correos de la agenda, con diseño. Se arman «a la antigua» (tablas y estilos en cada etiqueta) porque así es como
// los entienden Gmail, Outlook y el iPhone. Todo es texto: si el correo esconde imágenes, la cita se sigue leyendo completa.
// Todo lo que viene de afuera (nombres, servicios) pasa por esc().

export const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SERIF = "Georgia,'Times New Roman',serif", SANS = 'Arial,Helvetica,sans-serif';
const C = { negro: '#161412', marfil: '#f7f3ec', papel: '#fffdf9', oro: '#c9a96e', oroTxt: '#86672f', gris: '#6b6157', grisClaro: '#c9bfb1', linea: '#e2d9ca', rojo: '#9a3b2b', verde: '#2f6b45' };
const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const hora12 = (m) => { const h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + ':' + String(mi).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
const duracion = (m) => { const h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r ? r + ' min' : ''); };
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-MX');
export function iniciales(nombre) {
  const p = String(nombre || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase();
}
const telVisible = (t) => { const d = String(t || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d; };

// ── piezas ──
function boton(texto, href, lleno) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td align="center" bgcolor="${lleno ? C.negro : C.papel}" style="border:1px solid ${C.negro};mso-padding-alt:14px 12px">` +
    `<a href="${esc(href)}" target="_blank" style="display:block;padding:15px 12px;font-family:${SANS};font-size:12px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:${lleno ? C.marfil : C.negro};font-weight:bold">${esc(texto)}</a></td></tr></table>`;
}
const separador = () => `<tr><td style="padding:0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:2px dashed #cdbfa8;font-size:0;line-height:0;height:1px">&nbsp;</td></tr></table></td></tr>`;
function fila(et, valor, extra) {
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #efe7da;font-family:${SANS};font-size:14px;color:${C.gris}">${esc(et)}</td>` +
    `<td align="right" style="padding:10px 0;border-bottom:1px solid #efe7da;font-family:${SANS};font-size:14px;font-weight:bold;color:${extra && extra.color || C.negro}">${extra && extra.html ? valor : esc(valor)}</td></tr>`;
}
function marco(neg, contenido, preencabezado, pie) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(neg.nombre)}</title></head>` +
    `<body style="margin:0;padding:0;background:#eceae6"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preencabezado)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eceae6"><tr><td align="center" style="padding:16px 8px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${C.marfil}">` +
    // cabecera negra con el sello
    `<tr><td align="center" bgcolor="${C.negro}" style="padding:28px 20px 40px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="58" height="58" style="width:58px;height:58px;border:2px solid ${C.oro};border-radius:58px;font-family:${SERIF};font-size:24px;color:${C.oro}">${esc(iniciales(neg.nombre))}</td></tr></table>` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.oro};margin-top:12px">${esc(neg.nombre)}</div>` +
    `<div style="font-family:${SANS};font-size:13px;color:${C.grisClaro};margin-top:4px">Tu agenda</div></td></tr>` +
    contenido +
    `<tr><td align="center" style="padding:18px 26px 26px;font-family:${SANS};font-size:12px;line-height:18px;color:${C.gris}">${pie ? esc(pie) + '<br><br>' : ''}Solida Aplicaciones · Tu agenda</td></tr>` +
    `</table></td></tr></table></body></html>`;
}
// El ticket de una cita (lo usa el correo de cita nueva y el ejemplo del correo de prueba)
function ticket(neg, c, quien, links, titulo, subtitulo, etiqueta) {
  const d = new Date(c.fecha + 'T12:00:00Z');
  const servicio = c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.papel}" style="border:1px solid ${C.linea}">` +
    `<tr><td align="center" style="padding:20px 18px 16px"><div style="font-family:${SANS};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.oroTxt}">${esc(etiqueta)}</div>` +
    `<div style="font-family:${SERIF};font-size:28px;line-height:32px;color:${C.negro};margin-top:8px">${esc(titulo)}</div>` +
    (subtitulo ? `<div style="font-family:${SANS};font-size:14px;line-height:20px;color:${C.gris};margin-top:8px">${esc(subtitulo)}</div>` : '') + `</td></tr>` +
    separador() +
    `<tr><td style="padding:16px 18px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.linea}"><tr>` +
    `<td width="76" align="center" bgcolor="${C.negro}" style="width:76px;padding:10px 0"><div style="font-family:${SANS};font-size:10px;letter-spacing:2px;color:${C.oro}">${DIAS[d.getUTCDay()]}</div>` +
    `<div style="font-family:${SERIF};font-size:32px;line-height:34px;color:${C.marfil}">${d.getUTCDate()}</div><div style="font-family:${SANS};font-size:10px;letter-spacing:2px;color:${C.oro}">${MESES[d.getUTCMonth()]}</div></td>` +
    `<td style="padding:10px 14px"><div style="font-family:${SERIF};font-size:21px;color:${C.negro}">${esc(hora12(c.ini) + ' – ' + hora12(c.fin))}</div>` +
    `<div style="font-family:${SANS};font-size:13px;color:${C.gris};margin-top:2px">${esc(servicio + ' · ' + duracion(c.fin - c.ini))}</div></td></tr></table></td></tr>` +
    `<tr><td style="padding:4px 18px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    (quien ? fila('Con', quien) : '') + fila('Precio', pesos(c.precio)) +
    fila('Anticipo', c.anticipo ? pesos(c.anticipo) : 'Todavía no', { color: c.anticipo ? C.negro : C.rojo }) +
    fila('WhatsApp', `<a href="${esc(links.wa)}" target="_blank" style="color:${C.oroTxt};text-decoration:underline">${esc(telVisible(c.tel))}</a>`, { html: true }) +
    fila('Folio', c.folio) + `</table></td></tr>` +
    separador() +
    `<tr><td style="padding:16px 18px 18px">${boton('Confirmar en mi agenda', links.agenda, true)}<div style="height:8px;line-height:8px;font-size:8px">&nbsp;</div>${boton('Escribirle por WhatsApp', links.wa, false)}</td></tr></table>`;
}

// ── los correos ──
export function correoCitaNueva(neg, c, quien, base) {
  const agenda = base + '/' + neg.id + '/?cita=' + encodeURIComponent(c.folio);
  const wa = 'https://wa.me/52' + String(c.tel).replace(/\D/g, '').slice(-10) + '?text=' + encodeURIComponent('Hola ' + c.nombre + ' 👋 ');
  const html = marco(neg, `<tr><td style="padding:0 16px"><div style="margin-top:-18px">` +
    ticket(neg, c, quien, { agenda, wa }, c.nombre + ' apartó contigo', 'Todavía no la confirmas. Un toque y le avisas por WhatsApp.', 'Cita nueva · llegó de tu página') + `</div></td></tr>`,
  c.nombre + ' · ' + hora12(c.ini) + ' · ' + (c.diseno || c.servicio),
  'Te llega por correo porque en ninguno de tus teléfonos están activos los avisos. Actívalos desde la campana de tu agenda y dejamos de escribirte.');
  const texto = 'Cita nueva en ' + neg.nombre + '\n\n' + c.nombre + ' apartó contigo.\nCuándo: ' + c.fecha + ' · ' + hora12(c.ini) + ' a ' + hora12(c.fin) +
    '\nServicio: ' + (c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (quien ? '\nCon: ' + quien : '') + '\nPrecio: ' + pesos(c.precio) +
    '\nAnticipo: ' + (c.anticipo ? pesos(c.anticipo) : 'todavía no') + '\nWhatsApp: ' + telVisible(c.tel) + '\nFolio: ' + c.folio + '\n\nConfirmar en mi agenda: ' + agenda;
  return { html, texto, agenda };
}
export function correoPrueba(neg, telefonos, correo, base) {
  const agenda = base + '/' + neg.id + '/';
  // Un ejemplo de cita para que vea en su correo cómo le llega (con datos inventados, y dicho así)
  const hoy = new Date(); hoy.setUTCDate(hoy.getUTCDate() + 1);
  const ej = { fecha: hoy.toISOString().slice(0, 10), ini: 780, fin: 930, servicio: 'Volumen ruso', diseno: '', precio: 850, anticipo: 0, nombre: 'Daniela Soto', tel: '8445550192', folio: 'C-EJEMPLO' };
  const html = marco(neg,
    `<tr><td style="padding:0 16px"><div style="margin-top:-18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.papel}" style="border:1px solid ${C.linea}">` +
    `<tr><td align="center" style="padding:20px 18px 16px"><div style="font-family:${SANS};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.verde}">Funciona ✓</div>` +
    `<div style="font-family:${SERIF};font-size:28px;line-height:32px;color:${C.negro};margin-top:8px">Éste es tu correo de respaldo</div>` +
    `<div style="font-family:${SANS};font-size:14px;line-height:21px;color:${C.gris};margin-top:8px">Sólo te escribimos aquí si llega una cita y en ninguno de tus teléfonos están activos los avisos. Mientras tu celular te avise, no te llega nada por correo.</div></td></tr>` +
    separador() +
    `<tr><td style="padding:8px 18px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    fila('Avisos al celular', telefonos ? 'Activos en ' + telefonos + (telefonos === 1 ? ' teléfono' : ' teléfonos') : 'Apagados', { color: telefonos ? C.verde : C.rojo }) +
    fila('Respaldo', correo) + `</table></td></tr>` +
    `<tr><td style="padding:16px 18px 18px">${boton('Abrir mi agenda', agenda, true)}</td></tr></table></div></td></tr>` +
    `<tr><td align="center" style="padding:26px 20px 10px;font-family:${SANS};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.oroTxt}">Así te llega una cita (ejemplo)</td></tr>` +
    `<tr><td style="padding:0 16px">` + ticket(neg, ej, '', { agenda, wa: agenda }, 'Daniela Soto apartó contigo', 'Esta cita es un ejemplo: los datos son inventados.', 'Cita nueva · llegó de tu página') + `</td></tr>`,
  'Funciona: así te llega el respaldo', '');
  return { html, texto: 'Éste es el correo de respaldo de tu agenda de ' + neg.nombre + '. Sólo te escribimos aquí si llega una cita y en ninguno de tus teléfonos están activos los avisos.\n\nAbrir mi agenda: ' + agenda };
}
