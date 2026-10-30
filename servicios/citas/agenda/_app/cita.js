/* Tu cita · la página donde la clienta contesta cuando la dueña le propone otra hora, o cambia o cancela su cita.
   Se abre desde el aviso de su app, desde el correo o desde el WhatsApp que le manda la dueña (con ?t=, la clave de esa cita).
   Desde la app de la clienta también sirve con la huella de su teléfono. Todo lo que viene del servidor pasa por esc(). */
(function () {
  'use strict';
  var partes = location.pathname.split('/'), ID = partes[1], FOLIO = decodeURIComponent(partes[3] || '');
  var qs = new URLSearchParams(location.search), T = qs.get('t') || '', R = qs.get('r') || '';
  var raiz = document.getElementById('app');
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], DC = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function deIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fechaLarga(f) { var d = deIso(f); var t = DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; return t.charAt(0).toUpperCase() + t.slice(1); }
  function corta(f) { var d = deIso(f); return DC[d.getDay()] + ' ' + d.getDate(); }
  function hora12(m) { var h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + ':' + String(mi).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function iniciales(n) { var p = String(n || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase(); }
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 3000); }
  function disp() { try { return localStorage.getItem('citas:disp') || ''; } catch (e) { return ''; } }
  function api(metodo, cuerpo) {
    var h = { 'Content-Type': 'application/json' }; if (disp()) h['X-Dispositivo'] = disp();
    var u = '/api/' + ID + '/propuesta/' + encodeURIComponent(FOLIO) + (metodo === 'GET' ? '?t=' + encodeURIComponent(T) : '');
    return fetch(u, { method: metodo, headers: h, body: cuerpo ? JSON.stringify(Object.assign({ t: T }, cuerpo)) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; }); });
  }
  var datos = null, eligiendo = false;
  function carga() {
    api('GET').then(function (x) {
      if (x.status !== 200) { raiz.innerHTML = '<div class="envoltura cuerpo"><p class="vacio">' + esc(x.d.error || 'No encontramos esa cita.') + ' Revisa el enlace que te llegó o escríbele al negocio.</p></div>'; return; }
      datos = x.d; pinta();
    }, function () { raiz.innerHTML = '<div class="envoltura cuerpo"><p class="vacio">Sin conexión. Revisa tu internet e inténtalo de nuevo.</p></div>'; });
  }
  function pinta(msg) {
    var n = datos.negocio, c = datos.cita, prop = c.estado === 'propuesta';
    document.title = 'Tu cita · ' + n.nombre;
    var serv = (c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (c.con ? ' con ' + c.con : '');
    var h = '<header class="portada" style="padding:30px 22px 34px"><span class="sello">' + esc(iniciales(n.nombre)) + '</span><div class="etq" style="color:var(--oro);margin-top:12px">' + esc(n.nombre) + '</div></header>' +
      '<main class="envoltura cuerpo" style="padding-top:0"><section class="propuesta">';
    if (c.estado === 'cancelada') {
      h += '<span class="etq" style="color:var(--rojo)">Cita cancelada</span><h1 class="titulo" style="font-size:30px;margin-top:6px">Tu cita ya no está</h1>' +
        '<p class="nota" style="text-align:left">' + esc(fechaLarga(c.fecha) + ' · ' + hora12(c.ini) + ' · ' + serv) + '</p>' +
        (n.pagina ? '<a class="btn negro bloque grande" href="' + esc(n.pagina) + '">Agendar otra vez</a>' : '');
    } else {
      h += '<span class="etq" style="color:var(--oro-txt)">' + (prop ? esc((c.con || n.nombre) + ' te propone mover tu cita') : c.estado === 'confirmada' ? 'Tu cita está confirmada' : 'Tu cita está apartada') + '</span>' +
        '<h1 class="titulo" style="font-size:30px;margin-top:6px">' + (prop ? 'Hola ' + esc(c.nombre) + ', se le atravesó algo' : 'Hola ' + esc(c.nombre)) + '</h1>' +
        (prop ? '<p class="nota" style="text-align:left;margin-top:6px">Te apartó la primera hora libre. Dinos si te queda.</p>' : '') +
        '<div class="cambio">' + (prop && c.antesFecha ? '<div class="antes"><span class="etq">Antes</span><s>' + esc(fechaLarga(c.antesFecha) + ' · ' + hora12(c.antesIni)) + '</s></div>' : '') +
        '<div class="ahora"><span class="etq">' + (prop ? 'Ahora' : 'Tu cita') + '</span><b>' + esc(fechaLarga(c.fecha) + ' · ' + hora12(c.ini)) + '</b></div>' +
        '<span class="nota" style="text-align:left">' + esc(serv) + '</span></div>' +
        '<p class="falta" id="falta" role="alert">' + esc(msg || '') + '</p>' +
        '<div class="botones">' + (prop ? '<button class="btn negro bloque grande" type="button" id="acepto">Me queda</button>' : '') +
        '<button class="btn bloque" type="button" id="otra"' + (eligiendo ? ' aria-expanded="true"' : '') + '>' + (prop ? 'Elegir otra hora' : 'Cambiar a otra hora') + '</button>' +
        '<button class="btn bloque rojo-linea" type="button" id="cancelo">Cancelar mi cita</button></div>';
      if (eligiendo) h += '<div class="huecos" role="group" aria-label="Horas libres">' + (datos.huecos.length ? datos.huecos.map(function (x) {
        return '<button class="btn" type="button" data-hueco="' + esc(x.fecha + '|' + x.ini) + '">' + esc(corta(x.fecha) + ' · ' + hora12(x.ini)) + '</button>';
      }).join('') : '<p class="nota">No hay horas libres en los próximos días. Escríbele al negocio.</p>') + '</div>';
      if (prop && c.hasta) { var d = new Date(c.hasta * 1000); h += '<p class="nota">Te guardamos la hora nueva hasta el ' + esc(DIAS[d.getDay()] + ' a las ' + hora12(d.getHours() * 60 + d.getMinutes())) + '.</p>'; }
    }
    h += '</section></main>';
    raiz.innerHTML = h;
    var a = document.getElementById('acepto'); if (a) a.onclick = function () { contesta({ accion: 'acepto' }, '¡Listo! Tu cita quedó confirmada.'); };
    var o = document.getElementById('otra'); if (o) o.onclick = function () { eligiendo = !eligiendo; pinta(); };
    var x = document.getElementById('cancelo');
    if (x) x.onclick = function () { if (confirm('¿Cancelar tu cita? La hora queda libre para alguien más.')) contesta({ accion: 'cancelo' }, 'Tu cita se canceló.'); };
    raiz.querySelectorAll('[data-hueco]').forEach(function (b) {
      b.onclick = function () { var p = b.getAttribute('data-hueco').split('|'); contesta({ accion: 'otra', fecha: p[0], hora: hhmm(+p[1]) }, 'Listo: tu cita quedó para el ' + fechaLarga(p[0]) + ' a las ' + hora12(+p[1]) + '.'); };
    });
    if (R === 'acepto' && a) { a.focus(); R = ''; }
    if (R === 'cancelo' && x) { x.focus(); R = ''; }
  }
  function contesta(cuerpo, ok) {
    raiz.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    api('POST', cuerpo).then(function (x) {
      if (x.status !== 200) { if (x.status === 409) eligiendo = true; return carga2(x.d.error || 'No se pudo. Inténtalo de nuevo.'); }
      datos.cita = x.d.cita; eligiendo = false; pinta(); toast(ok);
    }, function () { pinta('Sin conexión. Inténtalo de nuevo.'); });
  }
  function carga2(msg) { api('GET').then(function (x) { if (x.status === 200) datos = x.d; pinta(msg); }); }
  carga();
})();
