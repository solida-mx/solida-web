/* Plantilla «Uñas y pestañas». Arma la página entera con los datos de datos.js.
   El nivel lo dice <html data-nivel="basico|intermedio|avanzado|citas">:
   - basico:     galería (hasta 20), servicios, «Agendar» abre WhatsApp.
   - intermedio: + filtros, ficha de cada diseño, agenda paso a paso y ticket de la cita en imagen.
   - avanzado:   + horas ocupadas bloqueadas, anticipo con el enlace de cobro del negocio y lista de citas.
   - citas:      la lista de citas del avanzado (para el dueño).
   Todo lo que viene de datos.js se escapa antes de pintarse. */
(function () {
  var N = window.NEGOCIO;
  if (!N) { console.error('Falta datos.js'); return; }
  var NIVEL = document.documentElement.getAttribute('data-nivel') || 'basico';
  var AGENDA = NIVEL === 'intermedio' || NIVEL === 'avanzado';
  var TOTAL = NIVEL === 'avanzado';
  var CLAVE = 'citas:' + N.nombre;
  // Agenda Total de un cliente real: las citas viven en el servicio de citas de Solida (citasApi en datos.js).
  // En el ejemplo se quedan en el propio teléfono, para que nadie deje sus datos en un negocio que no existe.
  var SERVIDOR = (NIVEL === 'avanzado' || NIVEL === 'citas') && N.citasApi && !N.ejemplo ? String(N.citasApi).replace(/\/+$/, '') : '';
  var ocupadoSrv = null;
  function pide(ruta, op) {
    op = op || {};
    var h = { 'Content-Type': 'application/json' };
    if (op.token) h.Authorization = 'Bearer ' + op.token;
    return fetch(SERVIDOR + ruta, { method: op.metodo || 'GET', headers: h, body: op.body ? JSON.stringify(op.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; }); });
  }
  function cargaOcupado() {
    return pide('/ocupado?dias=31').then(function (x) { ocupadoSrv = x.status === 200 ? x.d.ocupado || [] : []; if (x.status !== 200) throw new Error(x.d.error || 'sin servicio'); });
  }

  // ───── ayudantes ─────
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pesos = function (n) { return '$' + Number(n || 0).toLocaleString('es-MX'); };
  var duracion = function (m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r ? r + ' min' : ''); };
  var wa = function (txt, num) { return 'https://wa.me/' + (num || N.whatsapp) + '?text=' + encodeURIComponent(txt); };
  var servicioDe = function (id) { return N.servicios.filter(function (s) { return s.id === id; })[0]; };
  var personaDe = function (id) { return (N.equipo || []).filter(function (p) { return p.id === id; })[0]; };
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var DIAS3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var hhmm = function (min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); };
  var hora12 = function (s) { var p = s.split(':'), h = +p[0], m = p[1]; return (h % 12 || 12) + ':' + m + (h < 12 ? ' am' : ' pm'); };
  var aMin = function (s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; };
  var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var deIso = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var fechaLarga = function (s) { var d = deIso(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; };
  var horarioDe = function (d) { var i = (d.getDay() + 6) % 7; return N.horarios[i]; };   // horarios empieza en lunes
  function foto(src, nombre, extra) {
    return src ? '<div class="foto ' + (extra || '') + '"><img src="' + esc(src) + '" alt="' + esc(nombre) + '" loading="lazy" decoding="async"></div>'
      : '<div class="foto vacia ' + (extra || '') + '" role="img" aria-label="' + esc(nombre) + '"><span class="nom">' + esc(nombre) + '</span></div>';
  }
  function toast(t) {
    var el = document.getElementById('toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('on'); }, 2600);
  }
  function leeCitas() { try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { return []; } }
  function guardaCitas(l) { try { localStorage.setItem(CLAVE, JSON.stringify(l)); } catch (e) {} }

  var ESTRELLA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  var marcaHtml = N.logo ? '<img src="' + esc(N.logo) + '" alt="' + esc(N.nombre) + '">' : '<b>' + esc(N.nombre) + '</b>';
  document.title = N.nombre + ' · ' + N.giro;

  // ───── la lista de citas del dueño (avanzado/citas) ─────
  if (NIVEL === 'citas') { if (SERVIDOR) pintaCitasSrv(); else pintaCitas(); return; }

  // ───── la página ─────
  var disenos = NIVEL === 'basico' ? N.disenos.slice(0, 20) : N.disenos;
  var tecnicas = disenos.map(function (d) { return d.tecnica; }).filter(function (t, i, a) { return a.indexOf(t) === i; });
  var cats = N.servicios.map(function (s) { return s.categoria; }).filter(function (t, i, a) { return a.indexOf(t) === i; });
  var hoy = new Date();
  var hHoy = horarioDe(hoy);
  var agendarHref = AGENDA ? '#agendar' : wa('Hola ' + N.nombre + ' 👋 Quiero agendar una cita.');

  var h = '';
  h += '<header class="cab"><div class="envoltura"><a class="marca" href="#">' + marcaHtml + '</a>' +
    '<a class="btn btn-claro" href="' + esc(agendarHref) + '" data-agendar' + (AGENDA ? '' : ' target="_blank" rel="noopener"') + '>Agendar</a></div></header>';
  h += '<section class="hero">' + foto(N.fotoPortada, N.nombre) + '<div class="hero-in"><div class="envoltura">' +
    '<span class="etq">' + esc(N.giro) + '</span><h1 class="titulo">' + esc(N.nombre) + '</h1><p>' + esc(N.eslogan) + '</p>' +
    '<div class="hero-acc"><a class="btn btn-oro" href="' + esc(agendarHref) + '" data-agendar' + (AGENDA ? '' : ' target="_blank" rel="noopener"') + '>Agendar mi cita</a>' +
    '<a class="btn btn-claro" href="#disenos">Ver diseños</a></div></div></div></section>';

  h += '<section class="sec" id="disenos"><div class="envoltura"><div class="sec-cab reveal"><span class="etq">Portafolio</span><h2 class="titulo">Nuestros diseños</h2><div class="filete"></div></div>';
  if (AGENDA && tecnicas.length > 1) {
    h += '<div class="filtros" role="group" aria-label="Filtrar diseños"><button class="filtro" data-filtro="" aria-pressed="true">Todos</button>' +
      tecnicas.map(function (t) { return '<button class="filtro" data-filtro="' + esc(t) + '" aria-pressed="false">' + esc(t) + '</button>'; }).join('') + '</div>';
  }
  h += '<div class="galeria">' + disenos.map(function (d) {
    var s = servicioDe(d.servicio) || { precio: 0 };
    var inner = foto(d.foto, d.nombre) + '<div class="t"><b>' + esc(d.nombre) + '</b><span>' + esc(d.tecnica) + ' · ' + pesos(s.precio + (d.extra || 0)) + '</span></div>';
    return AGENDA ? '<button class="diseno reveal" data-diseno="' + esc(d.id) + '" data-tecnica="' + esc(d.tecnica) + '">' + inner + '</button>'
      : '<a class="diseno reveal" target="_blank" rel="noopener" href="' + esc(wa('Hola ' + N.nombre + ' 👋 Me interesa el diseño «' + d.nombre + '». ¿Qué día tienen lugar?')) + '">' + inner + '</a>';
  }).join('') + '</div></div></section>';

  h += '<section class="sec" id="servicios"><div class="envoltura" style="max-width:760px"><div class="sec-cab reveal"><span class="etq">Menú de servicios</span><h2 class="titulo">Servicios</h2><div class="filete"></div></div>' +
    cats.map(function (c) {
      return '<div class="cat reveal"><h3>' + esc(c) + '</h3>' + N.servicios.filter(function (s) { return s.categoria === c; }).map(function (s) {
        return '<div class="serv"><div><b>' + esc(s.nombre) + '</b><p>' + esc(s.desc) + '</p><div class="min">' + esc(duracion(s.min)) + '</div></div>' +
          '<div class="pr">' + (s.desde ? '<small>desde</small>' : '') + pesos(s.precio) + '</div></div>';
      }).join('') + '</div>';
    }).join('') + '</div></section>';

  if (AGENDA) {
    h += '<section class="oscuro"><div class="envoltura"><div class="sec-cab reveal"><span class="etq">Quién te atiende</span><h2 class="titulo">Nuestro equipo</h2><div class="filete"></div></div>' +
      '<div class="equipo">' + (N.equipo || []).map(function (p) {
        return '<div class="persona reveal">' + foto(p.foto, p.nombre) + '<b>' + esc(p.nombre) + '</b><span>' + esc(p.rol) + '</span></div>';
      }).join('') + '</div>' +
      (N.cuidados && N.cuidados.length ? '<div class="sec-cab reveal" style="margin:56px 0 0"><span class="etq">Antes de tu cita</span><h2 class="titulo">Para que dure más</h2><div class="filete"></div></div>' +
        '<ol class="cuidados">' + N.cuidados.map(function (c) { return '<li class="reveal">' + esc(c) + '</li>'; }).join('') + '</ol>' : '') +
      '</div></section>';
  }

  if (N.resenas || N.ejemplo) {
    h += '<section class="sec"><div class="envoltura"><div class="resena reveal"><span class="etq" style="color:var(--oro-txt)">Tu opinión</span>' +
      '<h2 class="titulo" style="font-size:34px;margin-top:8px">¿Cómo te fue en tu cita?</h2><div class="estrellas" aria-hidden="true">' + ESTRELLA + ESTRELLA + ESTRELLA + ESTRELLA + ESTRELLA + '</div>' +
      '<p style="color:var(--suave);font-weight:300;margin-bottom:20px">Tu reseña en Google nos ayuda a que más personas nos encuentren.</p>' +
      '<a class="btn btn-negro" data-resena href="' + esc(N.resenas || '#') + '"' + (N.resenas ? ' target="_blank" rel="noopener"' : '') + '>Califícanos en Google</a></div></div></section>';
  }

  h += '<section class="sec" id="visita"><div class="envoltura"><div class="sec-cab reveal"><span class="etq">Visítanos</span><h2 class="titulo">Dónde estamos</h2><div class="filete"></div></div><div class="visita">' +
    '<div><div class="dato"><span class="etq">Dirección</span><p>' + esc(N.direccion) + '<br>' + esc(N.colonia) + '</p></div>' +
    '<div class="dato"><span class="etq">WhatsApp</span><p>' + esc(N.whatsappVisible) + '</p></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px"><a class="btn btn-linea" href="' + esc(N.mapa) + '" target="_blank" rel="noopener">Cómo llegar</a>' +
    '<a class="btn btn-negro" href="' + esc(wa('Hola ' + N.nombre + ' 👋')) + '" target="_blank" rel="noopener">WhatsApp</a></div></div>' +
    '<div class="dato" style="border-bottom:0"><span class="etq">Horario</span><div class="horas">' + N.horarios.map(function (x, i) {
      var esHoy = ((hoy.getDay() + 6) % 7) === i;
      return '<span class="' + (esHoy ? 'hoy' : '') + '">' + esc(x[0]) + (esHoy ? ' · hoy' : '') + '</span><span class="' + (esHoy ? 'hoy' : '') + '">' +
        (x[1] == null ? 'Cerrado' : esc(hora12(hhmm(x[1] * 60)) + ' – ' + hora12(hhmm(x[2] * 60)))) + '</span>';
    }).join('') + '</div></div></div></div></section>';

  h += '<footer class="pie">' + (TOTAL && N.ejemplo ? '<a href="citas/" style="display:inline-flex;align-items:center;min-height:44px;margin-bottom:10px">Ver la lista de citas (uso del negocio) ›</a><br>' : '') +
    esc(N.nombre) + ' · ' + esc(N.giro) + '<br>Página hecha por <a href="https://solidaaplicaciones.com" target="_blank" rel="noopener">Solida Aplicaciones</a></footer>';
  h += '<div class="velo" id="velo"></div><section class="hoja" id="hoja" role="dialog" aria-modal="true" aria-labelledby="hojaTit"></section><div class="toast" id="toast" role="status" aria-live="polite"></div>';
  document.body.innerHTML = h;

  // aparecer al bajar
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } }); }, { threshold: .12 });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('on'); });

  document.querySelectorAll('[data-resena]').forEach(function (a) {
    if (!N.resenas) a.addEventListener('click', function (e) { e.preventDefault(); toast('En tu página, este botón abre directo tu reseña en Google.'); });
  });
  if (!AGENDA) return;

  // ───── filtros y ficha ─────
  document.querySelectorAll('[data-filtro]').forEach(function (b) {
    b.onclick = function () {
      var f = b.getAttribute('data-filtro');
      document.querySelectorAll('[data-filtro]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      document.querySelectorAll('[data-diseno]').forEach(function (d) { d.hidden = !!f && d.getAttribute('data-tecnica') !== f; });
    };
  });
  var hoja = document.getElementById('hoja'), velo = document.getElementById('velo'), ultimoFoco = null;
  function abre(html) {
    ultimoFoco = document.activeElement;
    hoja.innerHTML = html; hoja.scrollTop = 0;
    velo.classList.add('on'); hoja.classList.add('on'); document.body.style.overflow = 'hidden';
    var c = hoja.querySelector('.cerrar'); if (c) c.focus();
  }
  function cierra() { velo.classList.remove('on'); hoja.classList.remove('on'); document.body.style.overflow = ''; if (ultimoFoco) ultimoFoco.focus(); }
  velo.onclick = cierra;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && hoja.classList.contains('on')) cierra(); });
  var CERRAR = '<button class="cerrar" type="button" aria-label="Cerrar">✕</button>';

  var esUnas = function (s) { return s && s.categoria === 'Uñas'; };
  function precioDe(c) {
    var s = servicioDe(c.servicio); if (!s) return 0;
    var d = c.diseno ? N.disenos.filter(function (x) { return x.id === c.diseno; })[0] : null;
    var l = esUnas(s) && c.largo != null ? (N.largos[c.largo] || [0, 0])[1] : 0;
    return s.precio + (d ? d.extra || 0 : 0) + l;
  }

  function ficha(id) {
    var d = N.disenos.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var s = servicioDe(d.servicio);
    var c = { servicio: d.servicio, diseno: d.id, largo: esUnas(s) ? 1 : null };
    var pinta = function () {
      abre('<div class="ficha"><div class="hoja-cab"><h2 class="titulo" id="hojaTit">' + esc(d.nombre) + '</h2>' + CERRAR + '</div>' + foto(d.foto, d.nombre) +
        '<div class="datos3"><div><b>' + esc(d.tecnica) + '</b><span>Técnica</span></div><div><b>' + esc(duracion(s.min)) + '</b><span>Duración</span></div><div><b>' + esc(d.dura || '—') + '</b><span>Te dura</span></div></div>' +
        (esUnas(s) ? '<span class="etq" style="color:var(--oro-txt)">Largo</span><div class="opciones">' + N.largos.map(function (l, i) {
          return '<button class="op" type="button" data-largo="' + i + '" aria-pressed="' + (c.largo === i) + '">' + esc(l[0]) + (l[1] ? ' +' + pesos(l[1]) : '') + '</button>';
        }).join('') + '</div>' : '') +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin:20px 0 14px"><span class="etq">Total</span><b class="titulo" style="font-size:32px">' + pesos(precioDe(c)) + '</b></div>' +
        '<button class="btn btn-negro btn-bloque" type="button" data-quiero>Quiero este diseño · Agendar</button></div>');
      hoja.querySelector('.cerrar').onclick = cierra;
      hoja.querySelectorAll('[data-largo]').forEach(function (b) { b.onclick = function () { c.largo = +b.getAttribute('data-largo'); var y = hoja.scrollTop; pinta(); hoja.scrollTop = y; }; });
      hoja.querySelector('[data-quiero]').onclick = function () { agenda(c); };
    };
    pinta();
  }
  document.querySelectorAll('[data-diseno]').forEach(function (b) { b.onclick = function () { ficha(b.getAttribute('data-diseno')); }; });
  document.querySelectorAll('[data-agendar]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); agenda({}); }; });

  // ───── agenda ─────
  function diasDisponibles() {
    var l = [], d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = 0; l.length < 14 && i < 40; i++) {
      var x = new Date(d); x.setDate(d.getDate() + i);
      if (horarioDe(x)[1] != null) l.push(iso(x));
    }
    return l;
  }
  function horasDe(c) {
    var s = servicioDe(c.servicio); if (!s || !c.fecha) return [];
    var hx = horarioDe(deIso(c.fecha)); if (hx[1] == null) return [];
    var ahora = new Date(), esHoy = c.fecha === iso(ahora), minAhora = ahora.getHours() * 60 + ahora.getMinutes();
    var guardadas = TOTAL ? leeCitas().filter(function (x) { return x.fecha === c.fecha && (!c.persona || !x.persona || x.persona === c.persona); }) : [];
    var l = [];
    for (var m = hx[1] * 60; m + s.min <= hx[2] * 60; m += N.intervaloMin || 30) {
      var ocupada = false;
      if (TOTAL && SERVIDOR) {
        // Ocupada si TODAS las que pueden atender tienen algo a esa hora («cualquiera» = cualquiera del equipo)
        var quienes = c.persona ? [c.persona] : ((N.equipo || []).length ? N.equipo.map(function (p) { return p.id; }) : ['']);
        var ini = m, fin = m + s.min;
        ocupada = quienes.every(function (q) {
          return (ocupadoSrv || []).some(function (e) { return e.fecha === c.fecha && e.ini < fin && e.fin > ini && (e.persona === q || e.persona === '' || q === ''); });
        });
      } else if (TOTAL) {
        if (N.ejemplo && (N.ocupadasEjemplo || []).indexOf(hhmm(m)) >= 0) ocupada = true;
        guardadas.forEach(function (x) { var a = aMin(x.hora); if (m < a + x.min && a < m + s.min) ocupada = true; });
      }
      if (esHoy && m <= minAhora + 60) continue;   // no ofrecer horas que ya pasaron (y una hora de margen)
      l.push({ hora: hhmm(m), ocupada: ocupada });
    }
    return l;
  }
  function agenda(c0, msgInicial) {
    if (SERVIDOR && ocupadoSrv === null) {
      abre('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Agenda tu cita</h2>' + CERRAR + '</div><p class="aviso">Buscando horas libres…</p>');
      hoja.querySelector('.cerrar').onclick = cierra;
      cargaOcupado().then(function () { agenda(c0, msgInicial); }, function () {
        ocupadoSrv = null;
        abre('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Agenda tu cita</h2>' + CERRAR + '</div><p class="falta">No pudimos ver las horas libres. Revisa tu conexión o escríbenos.</p>' +
          '<a class="btn btn-negro btn-bloque" href="' + esc(wa('Hola ' + N.nombre + ' 👋 Quiero agendar una cita.')) + '" target="_blank" rel="noopener">Escribir por WhatsApp</a>');
        hoja.querySelector('.cerrar').onclick = cierra;
      });
      return;
    }
    var c = Object.assign({ persona: (N.equipo || []).length === 1 ? N.equipo[0].id : '' }, c0);
    var dias = diasDisponibles();
    if (!c.fecha) c.fecha = dias[0];
    var pinta = function (msg) {
      var s = servicioDe(c.servicio);
      var d = c.diseno ? N.disenos.filter(function (x) { return x.id === c.diseno; })[0] : null;
      var horas = horasDe(c);
      if (c.hora && !horas.some(function (x) { return x.hora === c.hora && !x.ocupada; })) c.hora = '';
      var html = '<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Agenda tu cita</h2>' + CERRAR + '</div>';
      // 1 · servicio
      html += '<div class="paso"><span class="etq">1 · ' + (d ? 'Tu diseño' : 'Servicio') + '</span>';
      if (s) {
        html += '<div style="display:flex;gap:12px;align-items:center;border:1px solid var(--linea);padding:10px">' + (d ? '<div style="width:64px;flex:none">' + foto(d.foto, d.nombre) + '</div>' : '') +
          '<div style="flex:1;min-width:0"><b class="titulo" style="font-size:20px">' + esc(d ? d.nombre : s.nombre) + '</b><div style="font-size:13px;color:var(--suave)">' + esc(s.nombre) + ' · ' + esc(duracion(s.min)) + '</div></div>' +
          '<button class="op" type="button" data-cambia style="min-height:44px;padding:0 12px">Cambiar</button></div>';
        if (esUnas(s)) html += '<div class="opciones">' + N.largos.map(function (l, i) {
          return '<button class="op" type="button" data-largo="' + i + '" aria-pressed="' + (c.largo === i) + '">' + esc(l[0]) + (l[1] ? ' +' + pesos(l[1]) : '') + '</button>';
        }).join('') + '</div>';
      } else {
        html += '<div style="display:grid;gap:8px">' + N.servicios.map(function (x) {
          return '<button class="op" type="button" data-serv="' + esc(x.id) + '" style="display:flex;justify-content:space-between;padding:0 14px;text-align:left"><span>' + esc(x.nombre) + '</span><span>' + (x.desde ? 'desde ' : '') + pesos(x.precio) + '</span></button>';
        }).join('') + '</div>';
      }
      html += '</div>';
      if (s) {
        // 2 · persona
        if ((N.equipo || []).length > 1) html += '<div class="paso"><span class="etq">2 · ¿Con quién?</span><div class="opciones">' +
          '<button class="op" type="button" data-persona="" aria-pressed="' + (!c.persona) + '">Cualquiera</button>' + N.equipo.map(function (p) {
            return '<button class="op" type="button" data-persona="' + esc(p.id) + '" aria-pressed="' + (c.persona === p.id) + '">' + esc(p.nombre) + '</button>';
          }).join('') + '</div></div>';
        // 3 · día
        html += '<div class="paso"><span class="etq">3 · Día</span><div class="dias">' + dias.map(function (f) {
          var x = deIso(f); return '<button class="dia" type="button" data-fecha="' + f + '" aria-pressed="' + (c.fecha === f) + '">' + DIAS3[x.getDay()] + '<b>' + x.getDate() + '</b></button>';
        }).join('') + '</div></div>';
        // 4 · hora
        html += '<div class="paso"><span class="etq">4 · Hora</span>' + (horas.length ? '<div class="opciones">' + horas.map(function (x) {
          return '<button class="op" type="button" data-hora="' + x.hora + '" aria-pressed="' + (c.hora === x.hora) + '"' + (x.ocupada ? ' disabled aria-label="' + hora12(x.hora) + ', ocupada"' : '') + '>' + hora12(x.hora) + '</button>';
        }).join('') + '</div>' + (TOTAL ? '<p class="aviso">Las horas tachadas ya están apartadas.</p>' : '') : '<p class="aviso">Ese día ya no hay horas. Elige otro.</p>') + '</div>';
        // 5 · datos
        html += '<div class="paso"><span class="etq">5 · Tus datos</span>' +
          '<label class="campo">Tu nombre<input id="cNombre" autocomplete="name" value="' + esc(c.nombre || '') + '"></label>' +
          '<label class="campo">Tu WhatsApp<input id="cTel" inputmode="tel" autocomplete="tel" placeholder="10 dígitos" value="' + esc(c.tel || '') + '"></label></div>';
        // resumen
        html += '<div class="resumen"><b>' + (c.hora ? esc(fechaLarga(c.fecha)) + ' · ' + hora12(c.hora) : 'Elige día y hora') + '</b>' +
          '<div class="fila"><span>' + esc(d ? d.nombre : s.nombre) + (esUnas(s) && c.largo != null ? ' · ' + esc(N.largos[c.largo][0]) : '') + '</span><span>' + pesos(precioDe(c)) + '</span></div>' +
          (c.persona ? '<div class="fila"><span>Con ' + esc(personaDe(c.persona).nombre) + '</span><span>' + esc(duracion(s.min)) + '</span></div>' : '') +
          (TOTAL && N.anticipo ? '<div class="fila ant"><span>Anticipo para apartar</span><span>' + pesos(N.anticipo) + '</span></div>' : '') + '</div>';
        html += '<p class="falta" id="falta" role="alert">' + esc(msg || '') + '</p>';
        html += '<button class="btn btn-negro btn-bloque" type="button" data-confirma>' + (TOTAL ? 'Apartar mi cita' : 'Pedir mi cita') + '</button>';
        html += '<p class="aviso">' + (TOTAL ? 'Al apartar te damos tu ticket y el enlace para el anticipo.' : 'Te damos tu ticket para mandarlo por WhatsApp y te confirmamos.') + '</p>';
      }
      var y = hoja.classList.contains('on') ? hoja.scrollTop : 0;
      abre(html); hoja.scrollTop = y;
      hoja.querySelector('.cerrar').onclick = cierra;
      var lee = function () { var n = hoja.querySelector('#cNombre'), t = hoja.querySelector('#cTel'); if (n) c.nombre = n.value; if (t) c.tel = t.value; };
      var on = function (sel, f) { hoja.querySelectorAll(sel).forEach(function (b) { b.onclick = function () { lee(); f(b); pinta(); }; }); };
      on('[data-cambia]', function () { c.servicio = ''; c.diseno = ''; c.largo = null; });
      on('[data-serv]', function (b) { c.servicio = b.getAttribute('data-serv'); c.largo = esUnas(servicioDe(c.servicio)) ? 1 : null; });
      on('[data-largo]', function (b) { c.largo = +b.getAttribute('data-largo'); });
      on('[data-persona]', function (b) { c.persona = b.getAttribute('data-persona'); });
      on('[data-fecha]', function (b) { c.fecha = b.getAttribute('data-fecha'); });
      on('[data-hora]', function (b) { c.hora = b.getAttribute('data-hora'); });
      hoja.querySelectorAll('#cNombre,#cTel').forEach(function (i) { i.oninput = function () { var f = hoja.querySelector('#falta'); if (f) f.textContent = ''; }; });
      var conf = hoja.querySelector('[data-confirma]');
      if (conf) conf.onclick = function () {
        lee();
        var tel = String(c.tel || '').replace(/\D/g, '');
        if (!c.hora) return pinta('Elige una hora.');
        if (String(c.nombre || '').trim().length < 2) return pinta('Escribe tu nombre.');
        if (tel.length < 10) return pinta('Escribe tu WhatsApp a 10 dígitos.');
        c.tel = tel.slice(-10);
        confirma(c);
      };
    };
    pinta(msgInicial);
  }

  function confirma(c) {
    var s = servicioDe(c.servicio);
    var d = c.diseno ? N.disenos.filter(function (x) { return x.id === c.diseno; })[0] : null;
    var cita = {
      folio: 'C-' + Date.now().toString(36).slice(-5).toUpperCase(),
      fecha: c.fecha, hora: c.hora, min: s.min, persona: c.persona || '',
      servicio: s.nombre, diseno: d ? d.nombre : '', largo: esUnas(s) && c.largo != null ? N.largos[c.largo][0] : '',
      precio: precioDe(c), anticipo: TOTAL ? N.anticipo || 0 : 0,
      nombre: String(c.nombre).trim().slice(0, 60), tel: c.tel, creada: Date.now()
    };
    if (SERVIDOR) {
      var btn = hoja.querySelector('[data-confirma]'); if (btn) { btn.disabled = true; btn.textContent = 'Apartando…'; }
      pide('/citas', { metodo: 'POST', body: Object.assign({}, cita, { equipo: (N.equipo || []).map(function (p) { return p.id; }) }) }).then(function (x) {
        if (x.status === 201) { cita.folio = x.d.folio; cita.persona = x.d.persona || cita.persona; ocupadoSrv = null; muestraTicket(cita); return; }
        if (x.status === 409) { ocupadoSrv = null; c.hora = ''; agenda(c, x.d.error || 'Esa hora ya se ocupó. Elige otra.'); return; }
        agenda(c, x.d.error || 'No se pudo apartar. Inténtalo de nuevo.');
      }, function () { agenda(c, 'Sin conexión. Inténtalo de nuevo.'); });
      return;
    }
    if (TOTAL) { var l = leeCitas(); l.push(cita); guardaCitas(l); }
    muestraTicket(cita);
  }
  function muestraTicket(cita) {
    var p = cita.persona ? personaDe(cita.persona) : null;
    var texto = 'Hola ' + N.nombre + ' 👋 Quiero mi cita:\n' +
      '📅 ' + fechaLarga(cita.fecha) + ' · ' + hora12(cita.hora) + '\n' +
      '💅 ' + (cita.diseno ? cita.diseno + ' (' + cita.servicio + ')' : cita.servicio) + (cita.largo ? ' · ' + cita.largo : '') + '\n' +
      (p ? '👤 Con ' + p.nombre + '\n' : '') + '💲 ' + pesos(cita.precio) + (cita.anticipo ? ' · anticipo ' + pesos(cita.anticipo) : '') + '\n' +
      'A nombre de ' + cita.nombre + ' · Folio ' + cita.folio;
    abre('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">' + (TOTAL ? 'Tu cita está apartada' : 'Tu ticket está listo') + '</h2>' + CERRAR + '</div>' +
      '<p class="aviso" style="margin:0 0 6px">Preparando tu ticket…</p>');
    hoja.querySelector('.cerrar').onclick = cierra;
    dibujaTicket(cita).then(function (canvas) {
      return new Promise(function (r) { canvas.toBlob(function (b) { r({ canvas: canvas, blob: b }); }, 'image/png'); });
    }).then(function (t) {
      var url = URL.createObjectURL(t.blob);
      var archivo = new File([t.blob], 'cita-' + cita.folio + '.png', { type: 'image/png' });
      var compartible = navigator.canShare && navigator.canShare({ files: [archivo] });
      abre('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">' + (TOTAL ? 'Tu cita está apartada' : 'Tu ticket está listo') + '</h2>' + CERRAR + '</div>' +
        '<img class="ticket-img" src="' + url + '" alt="Ticket de tu cita del ' + esc(fechaLarga(cita.fecha)) + ' a las ' + esc(hora12(cita.hora)) + '">' +
        '<div class="acciones">' +
        (TOTAL && N.anticipo ? (N.enlacePago ? '<a class="btn btn-oro btn-bloque" href="' + esc(N.enlacePago) + '" target="_blank" rel="noopener">Pagar anticipo · ' + pesos(N.anticipo) + '</a>'
          : '<p class="aviso" style="margin:0">En tu página, aquí va el botón para pagar el anticipo a tu cuenta.</p>') : '') +
        '<button class="btn btn-negro btn-bloque" type="button" data-envia>Enviar a ' + esc(N.nombre) + ' por WhatsApp</button>' +
        '<a class="btn btn-linea btn-bloque" href="' + url + '" download="cita-' + esc(cita.folio) + '.png">Guardar mi ticket</a></div>' +
        '<p class="aviso">' + (compartible ? 'Se abre WhatsApp con tu ticket listo para mandar.' : 'Guarda tu ticket y mándalo en el chat que se abre.') + '</p>');
      hoja.querySelector('.cerrar').onclick = cierra;
      hoja.querySelector('[data-envia]').onclick = function () {
        if (compartible) {
          navigator.share({ files: [archivo], text: texto }).catch(function () {});
        } else {
          var a = document.createElement('a'); a.href = url; a.download = 'cita-' + cita.folio + '.png'; document.body.appendChild(a); a.click(); a.remove();
          window.open(wa(texto), '_blank', 'noopener');
        }
      };
    }).catch(function (e) {
      console.error(e);
      window.open(wa(texto), '_blank', 'noopener');
    });
  }

  // ───── el ticket en imagen ─────
  function cargaImg(src) { return new Promise(function (r) { if (!src) return r(null); var i = new Image(); i.onload = function () { r(i); }; i.onerror = function () { r(null); }; i.src = src; }); }
  function dibujaTicket(cita) {
    var fuentes = document.fonts ? Promise.all(['600 40px "Cormorant Garamond"', 'italic 500 30px "Cormorant Garamond"', '400 20px "Jost"', '500 20px "Jost"'].map(function (f) { return document.fonts.load(f).catch(function () {}); })) : Promise.resolve();
    return Promise.all([fuentes, cargaImg(N.logo)]).then(function (r) {
      var logo = r[1];
      var W = 720, H = 1220, S = 2, P = 48;
      var cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
      var x = cv.getContext('2d'); x.scale(S, S);
      var TINTA = '#161412', MARFIL = '#f7f3ec', ORO = '#c9a96e', ORO_TXT = '#86672f', SUAVE = '#6b6157', LINEA = '#e2d9ca';
      var serif = function (w, t) { return w + ' ' + t + 'px "Cormorant Garamond", Georgia, serif'; };
      var sans = function (w, t) { return w + ' ' + t + 'px "Jost", Arial, sans-serif'; };
      var ancho = function (t, sp) { return x.measureText(t).width + (sp || 0) * t.length; };
      var espaciado = function (t, cx, y, sp) { var w = ancho(t, sp), px = cx - w / 2; for (var i = 0; i < t.length; i++) { x.fillText(t[i], px, y); px += x.measureText(t[i]).width + sp; } };
      // fondo y tarjeta con muescas
      x.fillStyle = '#e9e2d6'; x.fillRect(0, 0, W, H);
      var top = 300;
      x.fillStyle = MARFIL; x.beginPath(); x.rect(24, 24, W - 48, H - 48); x.fill();
      x.fillStyle = TINTA; x.fillRect(24, 24, W - 48, top);
      // marco dorado fino
      x.strokeStyle = 'rgba(201,169,110,.55)'; x.lineWidth = 1; x.strokeRect(40, 40, W - 80, top - 32);
      // logo o sello con iniciales
      x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      if (logo) {
        var lh = 92, lw = logo.width / logo.height * lh; if (lw > 300) { lw = 300; lh = logo.height / logo.width * lw; }
        x.drawImage(logo, W / 2 - lw / 2, 70, lw, lh);
      } else {
        x.strokeStyle = ORO; x.lineWidth = 1.5; x.beginPath(); x.arc(W / 2, 116, 46, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.arc(W / 2, 116, 40, 0, Math.PI * 2); x.stroke();
        var ini = N.nombre.split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        x.fillStyle = ORO; x.font = serif('600', 42); x.fillText(ini, W / 2, 131);
      }
      x.fillStyle = MARFIL; x.font = serif('600', 40); x.fillText(N.nombre, W / 2, 222);
      x.fillStyle = ORO; x.font = sans('400', 13); espaciado(N.giro.toUpperCase(), W / 2, 256, 4);
      // fecha y hora
      var y = top + 24 + 64;
      x.fillStyle = ORO_TXT; x.font = sans('500', 14); espaciado((TOTAL ? 'CITA APARTADA' : 'SOLICITUD DE CITA'), W / 2, y, 5);
      x.fillStyle = TINTA; x.font = serif('600', 46); x.fillText(fechaLarga(cita.fecha), W / 2, y + 62);
      x.font = serif('italic 500', 40); x.fillText(hora12(cita.hora), W / 2, y + 112);
      // perforación con muescas
      var py = y + 160;
      x.fillStyle = '#e9e2d6'; x.beginPath(); x.arc(24, py, 18, 0, Math.PI * 2); x.arc(W - 24, py, 18, 0, Math.PI * 2); x.fill();
      x.strokeStyle = LINEA; x.lineWidth = 2; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(52, py); x.lineTo(W - 52, py); x.stroke(); x.setLineDash([]);
      // renglones
      var p = cita.persona ? personaDe(cita.persona) : null;
      var filas = [['Servicio', cita.servicio], cita.diseno ? ['Diseño', cita.diseno] : null, cita.largo ? ['Largo', cita.largo] : null,
        ['Con', p ? p.nombre : 'Quien esté disponible'], ['Duración', duracion(cita.min)], ['A nombre de', cita.nombre]].filter(Boolean);
      var fy = py + 54;
      filas.forEach(function (f) {
        x.textAlign = 'left'; x.fillStyle = SUAVE; x.font = sans('500', 16); x.fillText(f[0].toUpperCase(), P + 24, fy);
        x.textAlign = 'right'; x.fillStyle = TINTA; x.font = serif('600', 28);
        var v = f[1]; while (x.measureText(v).width > W - 2 * P - 220 && v.length > 4) v = v.slice(0, -2) + '…';
        x.fillText(v, W - P - 24, fy + 2);
        x.strokeStyle = LINEA; x.lineWidth = 1; x.beginPath(); x.moveTo(P + 24, fy + 20); x.lineTo(W - P - 24, fy + 20); x.stroke();
        fy += 58;
      });
      // total y anticipo
      fy += 10;
      x.textAlign = 'left'; x.fillStyle = TINTA; x.font = sans('500', 17); x.fillText('TOTAL', P + 24, fy);
      x.textAlign = 'right'; x.font = serif('600', 38); x.fillText(pesos(cita.precio), W - P - 24, fy + 6);
      if (cita.anticipo) {
        fy += 50; x.textAlign = 'left'; x.fillStyle = ORO_TXT; x.font = sans('500', 16); x.fillText('ANTICIPO PARA APARTAR', P + 24, fy);
        x.textAlign = 'right'; x.font = serif('600', 28); x.fillText(pesos(cita.anticipo), W - P - 24, fy + 4);
      }
      // pie
      var by = H - 24 - 150;
      x.fillStyle = TINTA; x.fillRect(24, by, W - 48, 150);
      x.textAlign = 'center'; x.fillStyle = ORO; x.font = sans('500', 13); espaciado('FOLIO ' + cita.folio, W / 2, by + 40, 4);
      x.fillStyle = MARFIL; x.font = sans('400', 18); x.fillText(N.direccion, W / 2, by + 74);
      x.fillStyle = '#cfc6b8'; x.font = sans('400', 15); x.fillText('Llega 10 minutos antes · WhatsApp ' + N.whatsappVisible, W / 2, by + 102);
      x.fillStyle = 'rgba(201,169,110,.7)'; x.font = serif('italic 500', 17); x.fillText('Te esperamos', W / 2, by + 132);
      return cv;
    });
  }

  // ───── la agenda de la dueña con el servicio de citas (Agenda Total de un cliente) ─────
  function pintaCitasSrv() {
    var LLAVE = 'token:' + SERVIDOR;
    var token = ''; try { token = localStorage.getItem(LLAVE) || ''; } catch (e) {}
    var cab = '<header class="cab"><div class="envoltura"><a class="marca" href="../">' + marcaHtml + '</a>' +
      (token ? '<button class="btn btn-claro" type="button" data-salir>Salir</button>' : '<a class="btn btn-claro" href="../">Ver la página</a>') + '</div></header>';
    var pie = '<div class="toast" id="toast" role="status" aria-live="polite"></div>';
    if (!token) {
      document.body.innerHTML = cab + '<main class="envoltura" style="max-width:460px;padding-top:48px;padding-bottom:48px">' +
        '<div class="sec-cab"><span class="etq">Sólo para ' + esc(N.nombre) + '</span><h1 class="titulo" style="font-size:42px;margin-top:8px">Tu agenda</h1><div class="filete"></div></div>' +
        '<form id="fEntrar"><label class="campo">Tu clave<input id="clave" autocomplete="current-password" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX" required></label>' +
        '<p class="falta" id="falta" role="alert"></p><button class="btn btn-negro btn-bloque">Entrar</button></form>' +
        '<p class="aviso">La clave te la da Solida Aplicaciones. Si la perdiste, escríbenos y te damos otra.</p></main>' + pie;
      document.getElementById('fEntrar').onsubmit = function (e) {
        e.preventDefault();
        var b = e.target.querySelector('button'); b.disabled = true;
        pide('/entrar', { metodo: 'POST', body: { clave: document.getElementById('clave').value } }).then(function (x) {
          if (x.status === 200) { try { localStorage.setItem(LLAVE, x.d.token); } catch (er) {} location.reload(); return; }
          document.getElementById('falta').textContent = x.d.error || 'No se pudo entrar.'; b.disabled = false;
        }, function () { document.getElementById('falta').textContent = 'Sin conexión.'; b.disabled = false; });
      };
      return;
    }
    var salir = function () { try { localStorage.removeItem(LLAVE); } catch (e) {} location.reload(); };
    document.body.innerHTML = cab + '<main class="envoltura" style="max-width:720px;padding-top:30px;padding-bottom:48px" id="agendaDueña"><p class="aviso">Cargando tu agenda…</p></main>' + pie;
    document.querySelector('[data-salir]').onclick = salir;
    var ESTADO = { apartada: ['Por confirmar', '#86672f'], confirmada: ['Confirmada', '#2f6b45'], cancelada: ['Cancelada', '#9a3b2b'] };
    var nombreDe = function (id) { var p = personaDe(id); return p ? p.nombre : ''; };
    function carga() {
      pide('/agenda', { token: token }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 200) throw new Error(x.d.error);
        pinta(x.d);
      }).catch(function () { document.getElementById('agendaDueña').innerHTML = '<p class="falta">No se pudo cargar tu agenda. Revisa tu conexión.</p>'; });
    }
    function pinta(d) {
      var man = sumaDia(d.hoy, 1);
      var futuras = d.citas.filter(function (c) { return c.fecha >= d.hoy; });
      var dias = futuras.map(function (c) { return c.fecha; }).filter(function (f, i, a) { return a.indexOf(f) === i; });
      var pendientes = futuras.filter(function (c) { return c.estado === 'apartada'; }).length;
      var h = '<div class="sec-cab"><span class="etq">' + esc(N.nombre) + '</span><h1 class="titulo" style="font-size:42px;margin-top:8px">Tu agenda</h1><div class="filete"></div>' +
        '<p class="aviso" style="margin-top:14px">' + (pendientes ? pendientes + (pendientes === 1 ? ' cita por confirmar' : ' citas por confirmar') : 'Todo confirmado') + ' · se actualiza sola</p></div>';
      h += dias.length ? dias.map(function (f) {
        return '<h2 class="etq" style="color:var(--oro-txt);margin:26px 0 10px">' + (f === d.hoy ? 'Hoy · ' : f === man ? 'Mañana · ' : '') + esc(fechaLarga(f)) + '</h2><div class="citas">' +
          futuras.filter(function (c) { return c.fecha === f; }).map(function (c) {
            var e = ESTADO[c.estado] || ESTADO.apartada, quien = nombreDe(c.persona);
            var rec = 'Hola ' + c.nombre + ' 👋 Te recordamos tu cita en ' + N.nombre + ' el ' + fechaLarga(c.fecha) + ' a las ' + hora12(hhmm(c.inicio_min)) + '. ¡Te esperamos!';
            var conf = 'Hola ' + c.nombre + ' 👋 Tu cita en ' + N.nombre + ' del ' + fechaLarga(c.fecha) + ' a las ' + hora12(hhmm(c.inicio_min)) + ' está confirmada.';
            return '<div class="cita" style="' + (c.estado === 'cancelada' ? 'opacity:.6' : '') + '"><span class="etq" style="color:' + e[1] + '">' + e[0] + ' · Folio ' + esc(c.folio) + '</span>' +
              '<b>' + esc(hora12(hhmm(c.inicio_min))) + ' – ' + esc(hora12(hhmm(c.fin_min))) + ' · ' + esc(c.nombre) + '</b>' +
              '<span>' + esc(c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (c.detalle ? ' · ' + esc(c.detalle) : '') + (quien ? ' · con ' + esc(quien) : '') + ' · ' + pesos(c.precio) +
              (c.anticipo ? ' · anticipo ' + pesos(c.anticipo) : '') + '</span><span>WhatsApp ' + esc(c.tel) + (c.origen === 'negocio' ? ' · la capturaste tú' : '') + '</span>' +
              (c.estado === 'cancelada' ? '' : '<div style="display:grid;grid-template-columns:repeat(' + (c.estado === 'apartada' ? 3 : 2) + ',minmax(0,1fr));gap:8px;margin-top:8px">' +
                (c.estado === 'apartada' ? '<button class="btn btn-negro" type="button" data-estado="confirmada" data-folio="' + esc(c.folio) + '" data-aviso="' + esc(conf) + '" data-tel="' + esc(c.tel) + '" style="padding:0 8px">Confirmar</button>' : '') +
                '<a class="btn btn-linea" href="' + esc(wa(rec, '52' + c.tel)) + '" target="_blank" rel="noopener" style="padding:0 8px">Recordar</a>' +
                '<button class="btn btn-linea" type="button" data-estado="cancelada" data-folio="' + esc(c.folio) + '" style="padding:0 8px">Cancelar</button></div>') + '</div>';
          }).join('') + '</div>';
      }).join('') : '<p class="aviso" style="margin-top:20px">Todavía no hay citas. Las que se aparten en tu página aparecen aquí.</p>';
      // Bloqueos
      var opcPersona = '<option value="">Todo el negocio</option>' + (N.equipo || []).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nombre) + '</option>'; }).join('');
      h += '<section style="margin-top:44px;border-top:1px solid var(--linea);padding-top:26px"><h2 class="titulo" style="font-size:30px">Cerrar horas o días</h2>' +
        '<p class="aviso" style="text-align:left">Comida, un curso, vacaciones: lo que cierres aquí ya no se puede apartar en tu página.</p>' +
        '<form id="fBloqueo" style="display:grid;gap:4px;margin-top:6px"><label class="campo">Día<input type="date" id="bFecha" required min="' + esc(d.hoy) + '"></label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="campo">Desde<input type="time" id="bDesde" step="1800"></label><label class="campo">Hasta<input type="time" id="bHasta" step="1800"></label></div>' +
        '<p class="aviso" style="text-align:left;margin:2px 0 0">Déjalos vacíos para cerrar el día entero.</p>' +
        ((N.equipo || []).length > 1 ? '<label class="campo">¿De quién?<select id="bPersona" style="min-height:50px;border:1px solid var(--linea);background:#fff;padding:0 12px;font:400 16px var(--sans)">' + opcPersona + '</select></label>' : '') +
        '<label class="campo">Motivo (sólo lo ves tú)<input id="bMotivo" maxlength="80" placeholder="Comida, vacaciones…"></label>' +
        '<p class="falta" id="bFalta" role="alert"></p><button class="btn btn-negro btn-bloque">Cerrar ese horario</button></form>' +
        (d.bloqueos.length ? '<div class="citas" style="margin-top:18px">' + d.bloqueos.filter(function (b) { return b.fecha >= d.hoy; }).map(function (b) {
          var todo = b.inicio_min === 0 && b.fin_min === 1440;
          return '<div class="cita"><b>' + esc(fechaLarga(b.fecha)) + '</b><span>' + (todo ? 'Todo el día' : esc(hora12(hhmm(b.inicio_min)) + ' – ' + hora12(hhmm(b.fin_min)))) +
            (b.persona ? ' · ' + esc(nombreDe(b.persona) || b.persona) : ' · todo el negocio') + (b.motivo ? ' · ' + esc(b.motivo) : '') + '</span>' +
            '<button class="btn btn-linea" type="button" data-abre="' + esc(String(b.id)) + '" style="margin-top:6px">Volver a abrir</button></div>';
        }).join('') + '</div>' : '') + '</section>';
      document.getElementById('agendaDueña').innerHTML = h;
      document.querySelectorAll('[data-estado]').forEach(function (b) {
        b.onclick = function () {
          var est = b.getAttribute('data-estado');
          if (est === 'cancelada' && !confirm('¿Cancelar esta cita? Su hora vuelve a quedar libre.')) return;
          b.disabled = true;
          pide('/citas/' + encodeURIComponent(b.getAttribute('data-folio')) + '/estado', { metodo: 'POST', token: token, body: { estado: est } }).then(function (x) {
            if (x.status !== 200) { toast(x.d.error || 'No se pudo'); b.disabled = false; return; }
            if (est === 'confirmada') window.open(wa(b.getAttribute('data-aviso'), '52' + b.getAttribute('data-tel')), '_blank', 'noopener');
            toast(est === 'confirmada' ? 'Confirmada. Avísale por WhatsApp.' : 'Cancelada. La hora quedó libre.'); carga();
          });
        };
      });
      document.querySelectorAll('[data-abre]').forEach(function (b) {
        b.onclick = function () { b.disabled = true; pide('/bloqueos/' + b.getAttribute('data-abre'), { metodo: 'DELETE', token: token }).then(function () { toast('Horario abierto otra vez'); carga(); }); };
      });
      document.getElementById('fBloqueo').onsubmit = function (e) {
        e.preventDefault();
        var cuerpo = { fecha: document.getElementById('bFecha').value, desde: document.getElementById('bDesde').value, hasta: document.getElementById('bHasta').value,
          persona: (document.getElementById('bPersona') || {}).value || '', motivo: document.getElementById('bMotivo').value };
        pide('/bloqueos', { metodo: 'POST', token: token, body: cuerpo }).then(function (x) {
          if (x.status !== 201) { document.getElementById('bFalta').textContent = x.d.error || 'No se pudo'; return; }
          toast('Listo: ese horario ya no se puede apartar'); carga();
        });
      };
    }
    function sumaDia(f, n) { var x = deIso(f); x.setDate(x.getDate() + n); return iso(x); }
    carga();
    setInterval(function () { if (document.visibilityState === 'visible' && !document.activeElement.matches('input,select')) carga(); }, 60000);
  }

  // ───── lista de citas del dueño (sólo avanzado, en /citas/) ─────
  function pintaCitas() {
    var l = leeCitas().sort(function (a, b) { return (a.fecha + a.hora) < (b.fecha + b.hora) ? -1 : 1; });
    var man = new Date(); man.setDate(man.getDate() + 1); var mi = iso(man), hi = iso(new Date());
    var futuras = l.filter(function (c) { return c.fecha >= hi; });
    var h = '<header class="cab"><div class="envoltura"><a class="marca" href="../">' + marcaHtml + '</a><a class="btn btn-claro" href="../">Ver la página</a></div></header>' +
      '<main class="envoltura" style="max-width:680px;padding-top:34px;padding-bottom:40px"><div class="sec-cab"><span class="etq">Uso del negocio</span><h1 class="titulo" style="font-size:42px;margin-top:8px">Tus citas</h1><div class="filete"></div></div>' +
      (N.ejemplo ? '<p class="aviso" style="margin-bottom:18px">En este ejemplo las citas se guardan sólo en este teléfono. En la página de tu negocio llegan a tu lista desde cualquier teléfono.</p>' : '') +
      (futuras.length ? '<div class="citas">' + futuras.map(function (c) {
        var p = c.persona ? personaDe(c.persona) : null;
        var rec = 'Hola ' + c.nombre + ' 👋 Te recordamos tu cita en ' + N.nombre + ' el ' + fechaLarga(c.fecha) + ' a las ' + hora12(c.hora) + '. ¡Te esperamos!';
        return '<div class="cita"><span class="etq" style="color:var(--oro-txt)">' + (c.fecha === mi ? 'Mañana · ' : c.fecha === hi ? 'Hoy · ' : '') + esc(fechaLarga(c.fecha)) + '</span>' +
          '<b>' + esc(hora12(c.hora)) + ' · ' + esc(c.nombre) + '</b><span>' + esc(c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (p ? ' · con ' + esc(p.nombre) : '') + ' · ' + pesos(c.precio) + '</span>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><a class="btn btn-negro" href="' + esc(wa(rec, '52' + c.tel)) + '" target="_blank" rel="noopener">Recordar</a>' +
          '<button class="btn btn-linea" type="button" data-borra="' + esc(c.folio) + '">Quitar</button></div></div>';
      }).join('') + '</div>' : '<p class="aviso">Todavía no hay citas. Las que se aparten en la página aparecen aquí.</p>') + '</main>' +
      '<div class="toast" id="toast" role="status" aria-live="polite"></div>';
    document.body.innerHTML = h;
    document.querySelectorAll('[data-borra]').forEach(function (b) {
      b.onclick = function () { guardaCitas(leeCitas().filter(function (c) { return c.folio !== b.getAttribute('data-borra'); })); location.reload(); };
    });
  }
})();
