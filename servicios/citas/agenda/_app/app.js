/* Tu agenda · la app de la dueña, aparte de la página de sus clientas.
   Vive en agenda.solidaaplicaciones.com/<negocio>/ y habla con el mismo servicio de citas (/api/<negocio>/…).
   /ejemplo/ es la muestra del catálogo: citas inventadas, no entra a ningún servidor ni guarda nada.
   Todo texto que viene del servidor pasa por esc() antes de pintarse. */
(function () {
  'use strict';
  var ID = (location.pathname.split('/')[1] || '').toLowerCase();
  var DEMO = ID === 'ejemplo';
  var LLAVE = 'agenda:token:' + ID;
  var raiz = document.getElementById('app');
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var perfil = { nombre: '', equipo: [], pagina: '' };
  var token = '';
  try { token = localStorage.getItem(LLAVE) || ''; } catch (e) {}

  // ───── utilidades ─────
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pesos(n) { return '$' + Number(n || 0).toLocaleString('es-MX'); }
  function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
  function hora12(min) { var h = Math.floor(min / 60), m = min % 60; return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); }
  function deIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function sumaDia(f, n) { var d = deIso(f); d.setDate(d.getDate() + n); return iso(d); }
  function fechaLarga(f) { var d = deIso(f); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }
  function fechaCorta(f) { var d = deIso(f); return DIAS_C[d.getDay()] + ' ' + d.getDate(); }
  function duracion(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r ? r + ' min' : ''); }
  function wa(tel, txt) { return 'https://wa.me/52' + String(tel || '').replace(/\D/g, '').slice(-10) + '?text=' + encodeURIComponent(txt); }
  function iniciales(n) {
    var p = String(n || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase();
  }
  function nombreDe(id) {
    if (!id) return '';
    var p = (perfil.equipo || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.nombre : id.charAt(0).toUpperCase() + id.slice(1);
  }
  function toast(t) {
    var el = document.getElementById('toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2800);
  }
  function api(ruta, op) {
    op = op || {};
    var h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return fetch('/api/' + ID + ruta, { method: op.metodo || 'GET', headers: h, body: op.body ? JSON.stringify(op.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; }); });
  }

  // ───── instalar como app ─────
  var aviso = null;
  var instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var esIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); aviso = e; pintaInstalar(); });
  window.addEventListener('appinstalled', function () { instalada = true; aviso = null; pintaInstalar(); toast('Listo: ya la tienes en tu pantalla de inicio'); });
  function tarjetaInstalar() {
    return '<section class="instalar" id="instalar" hidden><span class="sello chico">' + esc(iniciales(perfil.nombre)) + '</span>' +
      '<div style="flex:1;min-width:0"><b>Tenla como app</b><span id="instTxt">Con tus iniciales en la pantalla de inicio. Sin tienda de apps.</span></div>' +
      '<button class="btn negro" type="button" id="instBtn">Instalar</button></section>';
  }
  function pintaInstalar() {
    var s = document.getElementById('instalar'); if (!s) return;
    if (instalada || (!aviso && !esIos)) { s.hidden = true; return; }
    s.hidden = false;
    var b = document.getElementById('instBtn');
    if (aviso) { b.hidden = false; b.onclick = function () { aviso.prompt(); aviso.userChoice.then(function () { aviso = null; pintaInstalar(); }); }; }
    else { b.hidden = true; document.getElementById('instTxt').textContent = 'En Safari toca Compartir (el cuadro con la flecha) y luego «Agregar a inicio».'; }
  }
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('/' + ID + '/sw.js', { scope: '/' + ID + '/' }).catch(function () {});

  // ───── entrar ─────
  function pintaEntrar() {
    raiz.innerHTML = '<section class="portada"><span class="sello">' + esc(iniciales(perfil.nombre)) + '</span>' +
      '<div class="etq" style="color:var(--oro);margin-top:14px">' + esc(perfil.nombre) + '</div><h1 class="titulo" style="margin-top:6px">Tu agenda</h1>' +
      '<p>Sólo para ti. Tus clientas apartan en tu página; aquí ves y manejas todo.</p></section>' +
      '<div class="envoltura"><form class="forma" id="fEntrar"><label><span class="etq" style="color:var(--oro-txt)">Tu clave</span>' +
      '<input class="campo clave" id="clave" autocomplete="current-password" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" required></label>' +
      '<p class="falta" id="falta" role="alert"></p><button class="btn negro bloque">Entrar</button>' +
      '<p class="nota">Se queda abierta 30 días en este teléfono. La clave te la da Solida Aplicaciones; si la perdiste, escríbenos y te damos otra.</p></form>' +
      tarjetaInstalar() + '</div>';
    pintaInstalar();
    document.getElementById('fEntrar').onsubmit = function (e) {
      e.preventDefault();
      var b = e.target.querySelector('button'), f = document.getElementById('falta');
      b.disabled = true; f.textContent = '';
      api('/entrar', { metodo: 'POST', body: { clave: document.getElementById('clave').value } }).then(function (x) {
        if (x.status === 200 && x.d.token) { token = x.d.token; try { localStorage.setItem(LLAVE, token); } catch (er) {} carga(); return; }
        f.textContent = x.d.error || 'No se pudo entrar.'; b.disabled = false;
      }, function () { f.textContent = 'Sin conexión. Revisa tu internet.'; b.disabled = false; });
    };
  }
  function salir() { token = ''; try { localStorage.removeItem(LLAVE); } catch (e) {} pintaEntrar(); }

  // ───── la agenda ─────
  var ultimo = null;
  function carga() {
    if (DEMO) { pinta(demo()); return; }
    api('/agenda').then(function (x) {
      if (x.status === 401) return salir();
      if (x.status !== 200) throw new Error(x.d.error);
      ultimo = x.d; pinta(x.d);
    }).catch(function () {
      if (ultimo) { toast('Sin conexión: lo que ves puede no estar al día'); return; }
      raiz.innerHTML = '<div class="envoltura cuerpo"><p class="vacio">No se pudo cargar tu agenda. Revisa tu conexión.</p><button class="btn negro bloque" id="reintenta">Intentar de nuevo</button></div>';
      document.getElementById('reintenta').onclick = carga;
    });
  }
  var ESTADO = { apartada: 'Por confirmar', confirmada: 'Confirmada', cancelada: 'Cancelada' };
  function textoCita(c) {
    return (c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (c.detalle ? ' · ' + c.detalle : '') + ' · ' + duracion(c.fin_min - c.inicio_min);
  }
  function pinta(d) {
    var hoy = d.hoy, man = sumaDia(hoy, 1);
    var futuras = d.citas.filter(function (c) { return c.fecha >= hoy; });
    var vivas = futuras.filter(function (c) { return c.estado !== 'cancelada'; });
    var deHoy = vivas.filter(function (c) { return c.fecha === hoy; });
    var porCobrar = deHoy.reduce(function (s, c) { return s + Math.max(0, (c.precio || 0) - (c.anticipo || 0)); }, 0);
    var porConfirmar = vivas.filter(function (c) { return c.estado === 'apartada'; }).length;
    var dias = futuras.map(function (c) { return c.fecha; }).filter(function (f, i, a) { return a.indexOf(f) === i; });

    var h = (DEMO ? '<div class="muestra"><span>Ejemplo de Solida · así ve su agenda la dueña</span><a href="https://solidaaplicaciones.com/ejemplos/unas/avanzado/">Ver la página de sus clientas ›</a></div>' : '') +
      '<header class="cab"><div class="envoltura"><div class="cab-fila"><span class="sello chico">' + esc(iniciales(perfil.nombre)) + '</span>' +
      '<div class="quien"><span class="etq" style="color:var(--oro)">' + esc(perfil.nombre) + '</span><div>Tu agenda</div></div></div>' +
      '<div class="cifras"><div class="cifra"><b>' + deHoy.length + '</b><span>' + (deHoy.length === 1 ? 'cita hoy' : 'citas hoy') + '</span></div>' +
      '<div class="cifra"><b>' + pesos(porCobrar) + '</b><span>por cobrar hoy</span></div>' +
      '<div class="cifra"><b>' + porConfirmar + '</b><span>por confirmar</span></div></div></div></header>';

    h += '<main class="envoltura cuerpo">';
    h += dias.length ? dias.map(function (f) {
      return '<h2 class="etq dia-tit">' + (f === hoy ? 'Hoy · ' : f === man ? 'Mañana · ' : '') + esc(fechaLarga(f)) + '</h2><div class="lista">' +
        futuras.filter(function (c) { return c.fecha === f; }).map(function (c) { return filaCita(c, f, man); }).join('') + '</div>';
    }).join('') : '<p class="vacio">Todavía no hay citas. Las que se aparten en tu página aparecen aquí al momento.</p>';

    // Cerrar horas o días
    var equipo = perfil.equipo || [];
    h += '<section class="seccion"><h2 class="titulo" style="font-size:30px">Cerrar horas o días</h2>' +
      '<p>Comida, un curso, vacaciones: lo que cierres aquí ya no se puede apartar en tu página.</p>' +
      '<form class="forma" id="fBloqueo" style="padding:0"><label><span class="etq" style="color:var(--oro-txt)">Día</span><input class="campo" type="date" id="bFecha" required min="' + esc(hoy) + '"></label>' +
      '<div class="dos"><label><span class="etq" style="color:var(--oro-txt)">Desde</span><input class="campo" type="time" id="bDesde" step="1800"></label>' +
      '<label><span class="etq" style="color:var(--oro-txt)">Hasta</span><input class="campo" type="time" id="bHasta" step="1800"></label></div>' +
      '<p class="nota" style="text-align:left">Déjalos vacíos para cerrar el día entero.</p>' +
      (equipo.length > 1 ? '<label><span class="etq" style="color:var(--oro-txt)">¿De quién?</span><select class="campo" id="bPersona"><option value="">Todo el negocio</option>' +
        equipo.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nombre) + '</option>'; }).join('') + '</select></label>' : '') +
      '<label><span class="etq" style="color:var(--oro-txt)">Motivo (sólo lo ves tú)</span><input class="campo" id="bMotivo" maxlength="80" placeholder="Comida, vacaciones…"></label>' +
      '<p class="falta" id="bFalta" role="alert"></p><button class="btn negro bloque">Cerrar ese horario</button></form>';
    var bl = (d.bloqueos || []).filter(function (b) { return b.fecha >= hoy; });
    if (bl.length) h += '<div class="lista" style="margin-top:18px">' + bl.map(function (b) {
      var todo = b.inicio_min === 0 && b.fin_min === 1440;
      return '<div class="bloqueo"><div><b>' + esc(fechaLarga(b.fecha)) + '</b><span>' + (todo ? 'Todo el día' : esc(hora12(b.inicio_min) + ' – ' + hora12(b.fin_min))) +
        ' · ' + (b.persona ? esc(nombreDe(b.persona)) : 'todo el negocio') + (b.motivo ? ' · ' + esc(b.motivo) : '') + '</span></div>' +
        '<button class="btn" type="button" data-abre="' + esc(String(b.id)) + '">Abrir</button></div>';
    }).join('') + '</div>';
    h += '</section>';

    h += '<div class="pie">' + (perfil.pagina ? '<a class="btn" href="' + esc(perfil.pagina) + '" target="_blank" rel="noopener">Ver mi página</a>' : '') +
      (DEMO ? '<a class="btn negro" href="https://wa.me/528443604349?text=' + encodeURIComponent('Hola 👋 Vi la agenda de ejemplo y quiero una para mi negocio.') + '" target="_blank" rel="noopener">Quiero una así</a>'
        : '<button class="btn" type="button" id="salir">Salir</button>') +
      '<p class="nota">Se actualiza sola cada minuto.</p></div>' + '</main>' + tarjetaInstalar();
    raiz.innerHTML = h;
    pintaInstalar();
    ata(d);
  }
  function filaCita(c, f, man) {
    var quien = nombreDe(c.persona), ini = hora12(c.inicio_min);
    var rec = 'Hola ' + c.nombre + ' 👋 Te recordamos tu cita en ' + perfil.nombre + ' el ' + fechaLarga(c.fecha) + ' a las ' + ini + '. ¡Te esperamos!';
    var conf = 'Hola ' + c.nombre + ' 👋 Tu cita en ' + perfil.nombre + ' del ' + fechaLarga(c.fecha) + ' a las ' + ini + ' está confirmada. ¡Te esperamos!';
    var acc = '';
    if (c.estado !== 'cancelada') {
      acc = '<div class="acc">' + (c.estado === 'apartada' ? '<button class="btn negro" type="button" data-estado="confirmada" data-folio="' + esc(c.folio) + '" data-aviso="' + esc(conf) + '" data-tel="' + esc(c.tel) + '">Confirmar</button>' : '') +
        '<a class="btn" href="' + esc(wa(c.tel, f === man ? rec : 'Hola ' + c.nombre + ' 👋 ')) + '" target="_blank" rel="noopener">' + (f === man ? 'Recordar' : 'Escribirle') + '</a>' +
        '<button class="btn quitar" type="button" data-estado="cancelada" data-folio="' + esc(c.folio) + '">Cancelar cita</button></div>';
    }
    var pago = c.anticipo ? ' · anticipo ' + pesos(c.anticipo) : '';
    return '<div class="fila"><span class="hora">' + esc(hhmm(c.inicio_min)) + '</span><div class="cita ' + esc(c.estado) + '">' +
      '<span class="pill ' + esc(c.estado) + '">' + esc(ESTADO[c.estado] || c.estado) + (c.origen === 'negocio' ? ' · la capturaste tú' : c.estado === 'apartada' ? ' · llegó de tu página' : '') + '</span>' +
      '<b>' + esc(c.nombre) + '</b><span class="s">' + esc(textoCita(c)) + '</span>' +
      '<span class="s">' + (quien ? 'Con ' + esc(quien) + ' · ' : '') + esc(pesos(c.precio)) + esc(pago) + ' · termina ' + esc(hora12(c.fin_min)) + '</span>' +
      '<span class="s">WhatsApp ' + esc(c.tel) + ' · folio ' + esc(c.folio) + '</span>' + acc + '</div></div>';
  }
  function ata(d) {
    var s = document.getElementById('salir'); if (s) s.onclick = function () { if (confirm('¿Salir de tu agenda en este teléfono?')) salir(); };
    raiz.querySelectorAll('[data-estado]').forEach(function (b) {
      b.onclick = function () {
        var est = b.getAttribute('data-estado'), folio = b.getAttribute('data-folio');
        if (est === 'cancelada' && !confirm('¿Cancelar esta cita? Su hora vuelve a quedar libre en tu página.')) return;
        var avisar = est === 'confirmada' ? wa(b.getAttribute('data-tel'), b.getAttribute('data-aviso')) : '';
        // Se abre antes de esperar al servidor: si se abre después, el teléfono lo bloquea como ventana emergente.
        var ventana = avisar ? window.open('', '_blank') : null;
        if (DEMO) { cambiaDemo(folio, est); if (ventana) ventana.location = avisar; toast(est === 'confirmada' ? 'Confirmada. Avísale por WhatsApp.' : 'Cancelada. La hora quedó libre.'); return; }
        b.disabled = true;
        api('/citas/' + encodeURIComponent(folio) + '/estado', { metodo: 'POST', body: { estado: est } }).then(function (x) {
          if (x.status === 401) return salir();
          if (x.status !== 200) { if (ventana) ventana.close(); toast(x.d.error || 'No se pudo'); b.disabled = false; return; }
          if (ventana) ventana.location = avisar;
          toast(est === 'confirmada' ? 'Confirmada. Avísale por WhatsApp.' : 'Cancelada. La hora quedó libre.'); carga();
        }, function () { if (ventana) ventana.close(); toast('Sin conexión'); b.disabled = false; });
      };
    });
    raiz.querySelectorAll('[data-abre]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-abre');
        if (DEMO) { demoDatos.bloqueos = demoDatos.bloqueos.filter(function (x) { return String(x.id) !== id; }); carga(); toast('Horario abierto otra vez'); return; }
        b.disabled = true;
        api('/bloqueos/' + encodeURIComponent(id), { metodo: 'DELETE' }).then(function () { toast('Horario abierto otra vez'); carga(); }, function () { toast('Sin conexión'); b.disabled = false; });
      };
    });
    document.getElementById('fBloqueo').onsubmit = function (e) {
      e.preventDefault();
      var c = { fecha: document.getElementById('bFecha').value, desde: document.getElementById('bDesde').value, hasta: document.getElementById('bHasta').value,
        persona: (document.getElementById('bPersona') || {}).value || '', motivo: document.getElementById('bMotivo').value };
      var falta = document.getElementById('bFalta');
      if (!!c.desde !== !!c.hasta) { falta.textContent = 'Pon la hora de inicio y la de fin, o deja las dos vacías.'; return; }
      if (c.desde && c.hasta <= c.desde) { falta.textContent = 'La hora de fin va después de la de inicio.'; return; }
      if (DEMO) {
        var a = c.desde ? c.desde.split(':') : null, z = c.hasta ? c.hasta.split(':') : null;
        demoDatos.bloqueos.push({ id: Date.now(), fecha: c.fecha, inicio_min: a ? +a[0] * 60 + +a[1] : 0, fin_min: z ? +z[0] * 60 + +z[1] : 1440, persona: c.persona, motivo: c.motivo });
        carga(); toast('Listo. En el ejemplo no se guarda.'); return;
      }
      var b = e.target.querySelector('button'); b.disabled = true;
      api('/bloqueos', { metodo: 'POST', body: c }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 201) { falta.textContent = x.d.error || 'No se pudo'; b.disabled = false; return; }
        toast('Listo: ese horario ya no se puede apartar'); carga();
      }, function () { falta.textContent = 'Sin conexión.'; b.disabled = false; });
    };
  }

  // ───── muestra del catálogo ─────
  var demoDatos = null;
  function demo() {
    if (demoDatos) return demoDatos;
    var hoy = iso(new Date()), man = sumaDia(hoy, 1), pas = sumaDia(hoy, 2);
    var n = 0;
    function c(fecha, h, dur, nombre, servicio, diseno, persona, precio, anticipo, estado, origen) {
      n++; return { folio: 'C-EJEM' + n, fecha: fecha, inicio_min: h * 60, fin_min: h * 60 + dur, persona: persona, servicio: servicio, diseno: diseno, detalle: '',
        precio: precio, anticipo: anticipo, nombre: nombre, tel: '844000000' + n, estado: estado, origen: origen || 'pagina' };
    }
    demoDatos = {
      hoy: hoy,
      citas: [
        c(hoy, 10, 60, 'Andrea Ruiz', 'Gelish en manos', 'French clásico', 'mia', 320, 100, 'confirmada'),
        c(hoy, 13, 150, 'Daniela Soto', 'Volumen ruso', '', 'fer', 850, 0, 'apartada'),
        c(hoy, 16, 60, 'Karla Méndez', 'Relleno de pestañas', '', 'fer', 450, 0, 'confirmada'),
        c(hoy, 17.5, 120, 'Sofía Lara', 'Acrílico esculpido', 'Negro y oro', 'mia', 600, 0, 'confirmada', 'negocio'),
        c(man, 10, 60, 'Lucía Garza', 'Gelish en manos', '', 'mia', 280, 0, 'confirmada'),
        c(man, 12.5, 90, 'Paola Treviño', 'Lifting de pestañas', '', 'fer', 520, 100, 'confirmada'),
        c(man, 17, 120, 'Ana Villarreal', 'Acrílico esculpido', '', 'mia', 450, 0, 'apartada'),
        c(pas, 11, 75, 'Mariana López', 'Pedicure spa con gelish', '', 'mia', 380, 0, 'confirmada'),
      ],
      bloqueos: [{ id: 1, fecha: pas, inicio_min: 14 * 60, fin_min: 15 * 60, persona: 'mia', motivo: 'Comida' }],
    };
    return demoDatos;
  }
  function cambiaDemo(folio, est) { demoDatos.citas.forEach(function (c) { if (c.folio === folio) c.estado = est; }); carga(); }

  // ───── arranque ─────
  if (DEMO) {
    perfil = { nombre: 'Atelier Mía', equipo: [{ id: 'mia', nombre: 'Mía' }, { id: 'fer', nombre: 'Fernanda' }], pagina: 'https://solidaaplicaciones.com/ejemplos/unas/avanzado/' };
    document.title = 'Agenda · ' + perfil.nombre + ' (ejemplo)';
    carga();
  } else {
    api('/perfil').then(function (x) {
      if (x.status !== 200) throw new Error(x.d.error || 'No existe');
      perfil = x.d; document.title = 'Agenda · ' + perfil.nombre;
      if (token) carga(); else pintaEntrar();
    }).catch(function () {
      raiz.innerHTML = '<div class="envoltura cuerpo"><p class="vacio">No se pudo abrir tu agenda. Revisa tu conexión e inténtalo de nuevo.</p></div>';
    });
  }
  setInterval(function () {
    if (!token || DEMO || document.visibilityState !== 'visible') return;
    var a = document.activeElement;
    if (a && a.matches && a.matches('input,select,textarea')) return;
    carga();
  }, 60000);
})();
