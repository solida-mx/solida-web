/* La app de la clienta: la misma página del negocio, instalable, con «Mis citas», avisos y la guía para instalarla.
   La carga plantilla.js sólo cuando la página está conectada al servicio de citas (Agenda Total).
   Sin cuenta: el teléfono guarda un número al azar (X-Dispositivo) y con él ve SUS citas, nada más.
   Todo lo que viene del servidor pasa por esc(). */
(function () {
  'use strict';
  var C = window.__cita, N = window.NEGOCIO;
  if (!C || !N) return;
  var esc = C.esc;
  var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function deIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function corta(f) { var d = deIso(f); return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; }
  var ua = navigator.userAgent || '';
  var esIos = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var esAndroid = /android/i.test(ua);
  var enOtraApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|Snapchat|musical_ly|GSA\//i.test(ua);   // navegadores dentro de otras apps: ahí no se puede instalar
  var instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var avisoInstalar = null, datos = null, suscrito = false;

  // ── manifiesto, icono y service worker (para instalarla y para los avisos) ──
  function link(rel, href) { if (document.querySelector('link[rel="' + rel + '"]')) return; var l = document.createElement('link'); l.rel = rel; l.href = href; document.head.appendChild(l); }
  link('manifest', N.manifiesto || 'manifest.webmanifest');
  link('apple-touch-icon', N.iconoApp || 'https://agenda.solidaaplicaciones.com/_app/icono-180.png');
  if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) { var m = document.createElement('meta'); m.name = 'apple-mobile-web-app-capable'; m.content = 'yes'; document.head.appendChild(m); }
  var API = String(N.citasApi).replace(/\/+$/, '');
  var registro = 'serviceWorker' in navigator ? navigator.serviceWorker.register((N.sw || 'sw.js') + '?api=' + encodeURIComponent(API)).catch(function () { return null; }) : Promise.resolve(null);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); avisoInstalar = e; pinta(); });
  window.addEventListener('appinstalled', function () { instalada = true; avisoInstalar = null; C.toast('Listo: ya la tienes en tu celular'); pinta(); });

  // ── avisos en su teléfono ──
  var puedePush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  function b64aU8(s) { var t = (s + '===='.slice((s.length + 3) % 4 + 1)).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(t), function (c) { return c.charCodeAt(0); }); }
  // Si el teléfono ya tiene avisos, se le vuelve a decir al servidor cada vez que abre (por si alguna vez no le llegó).
  // Así «Te avisamos» sólo sale cuando el servidor de verdad sabe de este teléfono.
  function revisaAvisos() {
    if (!puedePush) return Promise.resolve();
    return registro.then(function (r) { return r ? r.pushManager.getSubscription() : null; }).then(function (s) {
      if (!s || !C.disp()) { suscrito = false; return; }
      return C.pide('/mis-avisos', { metodo: 'POST', disp: true, body: { endpoint: s.endpoint } }).then(function (x) { suscrito = x.status === 200; }, function () { suscrito = false; });
    }).catch(function () { suscrito = false; });
  }
  function activaAvisos() {
    if (!C.disp()) return Promise.reject(new Error('Primero aparta una cita.'));
    var vapid;
    return C.pide('/mis-avisos').then(function (x) { vapid = x.d && x.d.vapid; if (!vapid) throw new Error('Los avisos todavía no están activos.'); return Notification.requestPermission(); })
      .then(function (p) { if (p !== 'granted') throw new Error(p === 'denied' ? 'Bloqueaste los avisos. Actívalos en los ajustes de tu navegador.' : 'No diste permiso para los avisos.'); return registro; })
      .then(function (r) { if (!r) throw new Error('Este navegador no recibe avisos.'); return navigator.serviceWorker.ready; })
      .then(function (r) { return r.pushManager.getSubscription().then(function (s) { return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aU8(vapid) }); }); })
      .then(function (s) { return C.pide('/mis-avisos', { metodo: 'POST', disp: true, body: { endpoint: s.endpoint } }); })
      .then(function (x) { if (x.status !== 200) throw new Error(x.d.error || 'No se pudo'); suscrito = true; });
  }

  // ── «Ten la app»: lo que toca según el teléfono ──
  function bloqueApp(corto) {
    if (instalada) {
      if (!puedePush) return '';
      if (suscrito) return '<p class="cl-ok">🔔 Te avisamos antes de tu cita' + (datos && datos.negocio.recordar === '120' ? ' (2 horas antes).' : datos && datos.negocio.recordar === 'dia60' ? ' (el día anterior y 1 hora antes).' : ' (1 hora antes).') + '</p>';
      return '<div class="cl-card"><b>¿Te avisamos antes de tu cita?</b><span>Te llega al celular, y también si ' + esc(N.nombre) + ' confirma o cambia tu cita.</span>' +
        '<button class="btn btn-negro btn-bloque" type="button" data-cl="avisos">Avisarme</button></div>';
    }
    var cab = '<div class="cl-app"><span class="cl-sello">' + esc(iniciales(N.nombre)) + '</span><div><b>Ten a ' + esc(N.nombre) + ' en tu celular</b><span>Agenda en dos toques y te avisamos antes de tu cita.</span></div></div>';
    if (enOtraApp) return '<div class="cl-card">' + cab + '<p class="cl-nota">Desde aquí no se puede instalar. Ábrela en ' + (esIos ? '<b>Safari</b>' : '<b>Chrome</b>') + ':</p>' +
      '<button class="btn btn-negro btn-bloque" type="button" data-cl="copiar">Copiar el enlace</button><p class="cl-nota">O toca los tres puntitos ⋯ → «Abrir en el navegador».</p></div>';
    if (esIos) return '<div class="cl-card">' + cab + '<button class="btn btn-negro btn-bloque" type="button" data-cl="guia">Instalarla · 3 pasos</button>' +
      (corto ? '' : '<p class="cl-nota">En iPhone los avisos llegan con la app instalada.</p>') + '</div>';
    if (avisoInstalar) return '<div class="cl-card">' + cab + '<button class="btn btn-negro btn-bloque" type="button" data-cl="instalar">Instalar app</button></div>';
    if (esAndroid) return '<div class="cl-card">' + cab + '<p class="cl-nota">Toca el menú <b>⋮</b> de Chrome → «Instalar app» o «Agregar a pantalla principal».</p>' +
      (puedePush && !suscrito ? '<button class="btn btn-linea btn-bloque" type="button" data-cl="avisos">Avisarme antes de mi cita</button>' : '') + '</div>';
    return puedePush && !suscrito && C.disp() ? '<div class="cl-card"><b>¿Te avisamos antes de tu cita?</b><button class="btn btn-negro btn-bloque" type="button" data-cl="avisos">Avisarme</button></div>' : '';
  }
  function iniciales(n) { var p = String(n || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase(); }
  function guiaIphone() {
    C.abre('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Instalarla en iPhone</h2>' + C.CERRAR + '</div>' +
      '<p class="aviso" style="text-align:left;margin:0 0 6px">Apple no deja instalar con un botón; son 3 toques en Safari:</p>' +
      '<div class="cl-paso"><span class="n">1</span><div><b>Toca Compartir</b><span>El cuadrito con la flecha hacia arriba <span class="cl-ico">⇧</span>, abajo en Safari (o arriba, junto a la dirección).</span></div></div>' +
      '<div class="cl-paso"><span class="n">2</span><div><b>Elige «Agregar a inicio»</b><span>Desliza un poco hacia abajo en la lista si no lo ves. <span class="cl-ico">⊞</span></span></div></div>' +
      '<div class="cl-paso"><span class="n">3</span><div><b>Toca «Agregar»</b><span>Ya aparece en tu pantalla de inicio. Ábrela desde ahí: así te llegan los avisos.</span></div></div>' +
      '<p class="aviso" style="text-align:left">¿No ves Compartir? Estás dentro de otra app: abre este enlace en Safari.</p>' +
      '<button class="btn btn-linea btn-bloque" type="button" data-cl="copiar">Copiar el enlace</button>');
    document.querySelector('#hoja .cerrar').onclick = C.cierra;
    ata(document.getElementById('hoja'));
  }

  // ── Mis citas ──
  function refresca() {
    if (!C.disp()) { pinta(); return Promise.resolve(); }
    return Promise.all([C.pide('/mis-citas', { disp: true }), revisaAvisos()]).then(function (r) {
      var x = r[0]; if (x.status === 200) datos = x.d; pinta();
    }, function () { pinta(); });
  }
  function proxima() {
    if (!datos) return null;
    var hoy = datos.hoy, l = datos.citas.filter(function (c) { return c.estado !== 'cancelada' && c.fecha >= hoy; });
    l.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.ini - b.ini; });
    return l[0] || null;
  }
  var ESTADO = { apartada: ['Apartada · falta que te confirmen', '#86672f', '#f3ead8'], confirmada: ['Confirmada', '#2f6b45', '#e6efe8'], propuesta: ['Te proponen otra hora', '#8a4f1d', '#f3e6d8'] };
  function pinta() {
    var sec = document.getElementById('misCitas');
    if (!sec) {
      sec = document.createElement('section'); sec.id = 'misCitas'; sec.className = 'cl-sec';
      var hero = document.querySelector('.hero'); if (hero && hero.parentNode) hero.parentNode.insertBefore(sec, hero.nextSibling);
    }
    var p = proxima(), hoy = datos ? datos.hoy : '';
    var pasadas = datos ? datos.citas.filter(function (c) { return c.estado !== 'cancelada' && c.fecha < hoy; }).slice(0, 4) : [];
    var ultima = datos ? datos.citas.filter(function (c) { return c.estado !== 'cancelada'; })[0] : null;
    var hay = !!(datos && datos.citas.length);
    var h = '';
    if (hay) {
      var y = C.yo();
      h += '<div class="envoltura"><span class="etq" style="color:var(--oro-txt)">Mis citas</span><h2 class="titulo" style="font-size:30px;margin-top:4px">' + (y.nombre ? 'Hola, ' + esc(String(y.nombre).split(' ')[0]) : 'Tus citas') + '</h2>';
      if (p) {
        var e = ESTADO[p.estado] || ESTADO.apartada, d = deIso(p.fecha);
        h += '<div class="cl-prox"><span class="etq" style="color:var(--oro-txt)">Tu próxima cita</span><div class="cl-fila" role="button" tabindex="0" data-cl="ticket" data-folio="' + esc(p.folio) + '" aria-label="Ver mi ticket"><div class="cl-dia"><small>' + esc(DIAS[d.getDay()].toUpperCase()) + '</small><b>' + d.getDate() + '</b><small>' + esc(MESES[d.getMonth()].toUpperCase()) + '</small></div>' +
          '<div style="flex:1;min-width:0"><b class="cl-t">' + esc(C.hora12(p.ini) + ' · ' + (p.diseno ? p.diseno : p.servicio)) + '</b><span class="cl-s">' + esc((p.con ? 'Con ' + p.con + ' · ' : '') + '$' + Number(p.precio || 0).toLocaleString('es-MX')) + '</span>' +
          '<span class="cl-pill" style="color:' + e[1] + ';background:' + e[2] + '">' + esc(e[0]) + '</span></div></div>' +
          (p.estado === 'propuesta' && p.enlace ? '<div class="cl-prop">' + (p.antesFecha ? 'Antes: <s>' + esc(corta(p.antesFecha) + ' · ' + C.hora12(p.antesIni)) + '</s><br>' : '') + esc(N.nombre) + ' te propone esta hora. ' +
            '<a class="btn btn-negro btn-bloque" href="' + esc(p.enlace) + '" style="margin-top:8px">Contestar</a></div>'
            : '<div class="cl-acc"><button class="btn btn-negro" type="button" data-cl="ticket" data-folio="' + esc(p.folio) + '">Ver mi ticket</button>' +
              (N.mapa ? '<a class="btn btn-linea" href="' + esc(N.mapa) + '" target="_blank" rel="noopener">Cómo llegar</a>' : '') + '<button class="btn btn-linea" type="button" data-cl="cambiar" data-folio="' + esc(p.folio) + '">Cambiar o cancelar</button></div>') +
          bloqueApp(true) + '</div>';
      }
      if (ultima) h += '<button class="btn btn-oro btn-bloque cl-repite" type="button" data-cl="repetir">↻ Repetir mi última cita</button><p class="aviso" style="margin:6px 0 0">' + esc((ultima.diseno || ultima.servicio) + (ultima.con ? ' con ' + ultima.con : '')) + ' · sólo eliges día y hora</p>';
      if (pasadas.length) h += '<div class="cl-hist"><span class="etq" style="color:var(--oro-txt)">Tus citas anteriores</span>' + pasadas.map(function (c) {
        return '<div class="cl-h"><span>' + esc(corta(c.fecha)) + '</span><div><b>' + esc(c.diseno || c.servicio) + '</b><small>' + esc((c.con ? 'Con ' + c.con + ' · ' : '') + '$' + Number(c.precio || 0).toLocaleString('es-MX')) + '</small></div></div>';
      }).join('') + '</div>';
      if (!p) h += bloqueApp(false);
      h += '<p class="aviso" style="margin-top:12px">Sin contraseña: este teléfono recuerda tus citas y tus datos.</p></div>';
    } else if (!instalada) {
      var b = bloqueApp(false);
      if (b) h += '<div class="envoltura">' + b + '</div>';
    }
    sec.innerHTML = h; sec.hidden = !h;
    // «Mis citas» en la cabecera
    var cab = document.querySelector('.cab .envoltura');
    if (cab && hay && !document.getElementById('clLink')) {
      var a = document.createElement('a'); a.id = 'clLink'; a.href = '#misCitas'; a.className = 'cl-link'; a.textContent = 'Mis citas';
      cab.insertBefore(a, cab.lastChild);
    }
    ata(sec);
  }
  function ata(raiz) {
    raiz.querySelectorAll('[data-cl]').forEach(function (b) {
      b.onclick = function () {
        var q = b.getAttribute('data-cl');
        if (q === 'instalar' && avisoInstalar) { avisoInstalar.prompt(); avisoInstalar.userChoice.then(function () { avisoInstalar = null; pinta(); }); }
        if (q === 'guia') guiaIphone();
        if (q === 'copiar') copiar(location.href.split('#')[0]);
        if (q === 'avisos') { b.disabled = true; activaAvisos().then(function () { C.toast('Listo: te avisamos antes de tu cita'); pinta(); var t = document.getElementById('clientaTicket'); if (t) enTicket(t); }, function (e) { b.disabled = false; C.toast(e.message || 'No se pudo'); }); }
        if (q === 'repetir') repetir();
        if (q === 'cambiar') cambiar(b.getAttribute('data-folio'));
        if (q === 'ticket') verTicket(b.getAttribute('data-folio'));
      };
    });
  }
  // Volver a ver el ticket de una cita (con el botón de avisos abajo)
  function verTicket(folio) {
    var c = datos && datos.citas.filter(function (x) { return x.folio === folio; })[0]; if (!c || !C.muestraTicket) return;
    var y = C.yo();
    C.muestraTicket({ folio: c.folio, fecha: c.fecha, hora: C.hhmm(c.ini), min: c.fin - c.ini, persona: c.persona || '', servicio: c.servicio, diseno: c.diseno || '',
      largo: c.detalle || '', precio: c.precio || 0, anticipo: c.anticipo || 0, nombre: c.nombre || y.nombre || '', tel: y.tel || '' });
  }
  function copiar(t) {
    var ok = function () { C.toast('Enlace copiado. Pégalo en ' + (esIos ? 'Safari' : 'Chrome') + '.'); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, function () { prompt('Copia este enlace:', t); });
    else prompt('Copia este enlace:', t);
  }
  function aCita(c) {
    var s = N.servicios.filter(function (x) { return x.nombre === c.servicio; })[0];
    var d = c.diseno ? N.disenos.filter(function (x) { return x.nombre === c.diseno; })[0] : null;
    var largo = c.detalle && N.largos ? N.largos.map(function (l) { return l[0]; }).indexOf(c.detalle) : -1;
    return { servicio: s ? s.id : '', diseno: d ? d.id : '', persona: c.persona || '', largo: largo >= 0 ? largo : (s && s.categoria === 'Uñas' ? 1 : null) };
  }
  function repetir() {
    var u = datos && datos.citas.filter(function (c) { return c.estado !== 'cancelada'; })[0]; if (!u) return;
    C.agenda(aCita(u));
  }
  function cambiar(folio) {
    var c = datos && datos.citas.filter(function (x) { return x.folio === folio; })[0]; if (!c) return;
    C.abre('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Tu cita</h2>' + C.CERRAR + '</div>' +
      '<p class="aviso" style="text-align:left;margin:0 0 12px">' + esc(C.fechaLarga(c.fecha) + ' · ' + C.hora12(c.ini) + ' · ' + (c.diseno || c.servicio) + (c.con ? ' con ' + c.con : '')) + '</p>' +
      '<button class="btn btn-negro btn-bloque" type="button" id="clMover">Cambiar el día o la hora</button>' +
      '<button class="btn btn-linea btn-bloque" type="button" id="clCancela" style="margin-top:8px;border-color:#9a3b2b;color:#9a3b2b">Cancelar mi cita</button>');
    document.querySelector('#hoja .cerrar').onclick = C.cierra;
    document.getElementById('clMover').onclick = function () { C.agenda(Object.assign(aCita(c), { mover: c.folio, fecha: c.fecha })); };
    document.getElementById('clCancela').onclick = function () {
      if (!confirm('¿Cancelar tu cita? La hora queda libre para alguien más.')) return;
      C.pide('/mis-citas/' + encodeURIComponent(c.folio) + '/cancelar', { metodo: 'POST', disp: true }).then(function (x) {
        if (x.status !== 200) { C.toast(x.d.error || 'No se pudo'); return; }
        C.cierra(); C.toast('Tu cita se canceló. ' + N.nombre + ' ya lo sabe.'); refresca();
      }, function () { C.toast('Sin conexión'); });
    };
  }
  // Debajo del ticket, recién apartada: instalarla o activar los avisos
  function enTicket(div) {
    if (!div) return;
    var b = bloqueApp(true);
    div.innerHTML = b ? '<div style="margin-top:14px">' + b + '</div>' : '';
    ata(div);
  }

  window.__clienta = { refresca: refresca, enTicket: enTicket };
  if (location.hash === '#mis-citas') location.hash = '#misCitas';
  refresca();
})();
