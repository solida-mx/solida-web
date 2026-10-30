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
  // Tres secciones, en la barra de abajo: «Hoy» (el día, hora por hora), «Semana» (los próximos 7 días)
  // y «Mis tiempos» (cuándo trabaja cada quien y lo que no se puede apartar).
  var vista = location.hash === '#tiempos' ? 'tiempos' : location.hash === '#semana' ? 'semana' : 'hoy';
  var personaSel = null, diaSel = null;
  var ultimo = null;
  var DSEM = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  var DSEM_L = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var MES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function dsem(f) { var d = deIso(f).getDay(); return d === 0 ? 7 : d; }
  function aMin(s) { var p = String(s || '').split(':'); return +p[0] * 60 + +p[1]; }
  function fechaMes(f) { var d = deIso(f); return d.getDate() + ' ' + MES_C[d.getMonth()]; }

  // Lo que escribe la dueña pasa por aquí: al servidor, o a la memoria si es la muestra del catálogo.
  function envia(ruta, op) { return DEMO ? Promise.resolve(demoApi(ruta, op || {})) : api(ruta, op); }

  function carga() {
    if (DEMO) { pinta(demo()); return; }
    api('/agenda').then(function (x) {
      if (x.status === 401) return salir();
      if (x.status !== 200) throw new Error(x.d.error);
      pinta(x.d);
    }).catch(function () {
      if (ultimo) { toast('Sin conexión: lo que ves puede no estar al día'); return; }
      raiz.innerHTML = '<div class="envoltura cuerpo"><p class="vacio">No se pudo cargar tu agenda. Revisa tu conexión.</p><button class="btn negro bloque" id="reintenta">Intentar de nuevo</button></div>';
      document.getElementById('reintenta').onclick = carga;
    });
  }
  function equipo() { return perfil.equipo || []; }
  function personas() { return equipo().length ? equipo() : [{ id: '', nombre: perfil.nombre }]; }
  // ¿Esto (de la persona «de») le toca a la persona «a»? «» = todo el negocio, le toca a todas.
  function tocaA(de, a) { return !de || !a || de === a; }
  function saludo() { var h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; }

  var ICO = {
    hoy: '<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    semana: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    tiempos: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };
  function navHtml() {
    return '<nav class="barra-nav" aria-label="Secciones de tu agenda">' + [['hoy', 'Hoy'], ['semana', 'Semana'], ['tiempos', 'Mis tiempos']].map(function (x) {
      return '<button type="button" data-vista="' + x[0] + '"' + (vista === x[0] ? ' aria-current="page"' : '') + '><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' + ICO[x[0]] + '</svg>' + x[1] + '</button>';
    }).join('') + '</nav>';
  }

  var citaPendiente = null;   // la cita que pidió abrir un aviso; se abre en cuanto haya datos (y sesión)
  function pinta(d) {
    ultimo = d;
    if (citaPendiente) {
      var cp = d.citas.filter(function (x) { return x.folio === citaPendiente; })[0];
      if (cp) diaSel = cp.fecha;
    }
    var y = scrollY;
    var hoy = d.hoy;
    if (!diaSel || diaSel < hoy) diaSel = hoy;
    var vivas = d.citas.filter(function (c) { return c.fecha >= hoy && c.estado !== 'cancelada'; });
    var cab;
    if (vista === 'tiempos') {
      cab = '<div><span class="etq" style="color:var(--oro)">' + esc(perfil.nombre) + '</span><div>Mis tiempos</div></div>';
    } else {
      cab = '<div><span class="etq" style="color:var(--oro)">' + esc(perfil.nombre) + '</span><div>' + (vista === 'semana' ? 'Tu semana' : esc(saludo())) + '</div></div>';
    }
    var cifras = '';
    if (vista === 'hoy') {
      var delDia = vivas.filter(function (c) { return c.fecha === diaSel; });
      var porCobrar = delDia.reduce(function (s, c) { return s + Math.max(0, (c.precio || 0) - (c.anticipo || 0)); }, 0);
      var porConfirmar = vivas.filter(function (c) { return c.estado === 'apartada'; }).length;
      var esHoy = diaSel === hoy;
      cifras = '<div class="cifras"><div class="cifra"><b>' + delDia.length + '</b><span>' + (delDia.length === 1 ? 'cita' : 'citas') + (esHoy ? ' hoy' : ' ese día') + '</span></div>' +
        '<div class="cifra"><b>' + pesos(porCobrar) + '</b><span>por cobrar' + (esHoy ? ' hoy' : '') + '</span></div>' +
        '<div class="cifra"><b>' + porConfirmar + '</b><span>por confirmar</span></div></div>';
    } else if (vista === 'semana') {
      var fin = sumaDia(hoy, 7), deSemana = vivas.filter(function (c) { return c.fecha < fin; });
      cifras = '<div class="cifras"><div class="cifra"><b>' + deSemana.length + '</b><span>citas en 7 días</span></div>' +
        '<div class="cifra"><b>' + pesos(deSemana.reduce(function (s, c) { return s + (c.precio || 0); }, 0)) + '</b><span>en servicios</span></div>' +
        '<div class="cifra"><b>' + deSemana.filter(function (c) { return c.estado === 'apartada'; }).length + '</b><span>por confirmar</span></div></div>';
    } else {
      cifras = '<p class="cab-txt">Tu página sólo ofrece las horas en que de verdad puedes. Lo que apartes aquí, tus clientas lo ven como «no disponible», sin saber por qué.</p>' +
        '<button class="btn oro bloque" type="button" id="apartar" style="margin-top:14px">+ Apartar tiempo para mí</button>';
    }
    var h = (DEMO ? '<div class="muestra"><span>Ejemplo de Solida · así ve su agenda la dueña</span><a href="https://solidaaplicaciones.com/ejemplos/unas/avanzado/">Ver la página de sus clientas ›</a></div>' : '') +
      '<header class="cab"><div class="envoltura"><div class="cab-fila"><span class="sello chico">' + esc(iniciales(perfil.nombre)) + '</span>' +
      '<div class="quien">' + cab + '</div>' +
      '<button type="button" class="mas campana" id="abreAvisos" aria-label="Avisos de citas nuevas"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></button>' +
      (vista !== 'tiempos' ? '<button type="button" class="mas" id="nuevaCita" aria-label="Apartar una cita que te pidieron por teléfono">+</button>' : '') + '</div>' + cifras + '</div></header>';
    h += '<main class="envoltura cuerpo">' + (vista === 'tiempos' ? htmlTiempos(d) : vista === 'semana' ? htmlSemana(d) : htmlHoy(d)) + pie() + '</main>' + tarjetaInstalar() + navHtml();
    var mismo = raiz.getAttribute('data-vista') === vista;
    raiz.setAttribute('data-vista', vista);
    raiz.innerHTML = h;
    if (mismo) scrollTo(0, y);
    pintaInstalar();
    ata(d);
    if (citaPendiente && !document.getElementById('velo')) { var f = citaPendiente; citaPendiente = null; abreCita(f); }
  }
  function pie() {
    return '<div class="pie">' + (perfil.pagina ? '<a class="btn" href="' + esc(perfil.pagina) + '" target="_blank" rel="noopener">Ver mi página</a>' : '') +
      (DEMO ? '<a class="btn negro" href="https://wa.me/528443604349?text=' + encodeURIComponent('Hola 👋 Vi la agenda de ejemplo y quiero una para mi negocio.') + '" target="_blank" rel="noopener">Quiero una así</a>'
        : '<button class="btn" type="button" id="salir">Salir</button>') +
      '<p class="nota">' + (DEMO ? 'Es un ejemplo: puedes tocar todo, nada se guarda.' : 'Se actualiza sola cada minuto.') + '</p></div>';
  }

  // ───── vista: hoy (un día, hora por hora) ─────
  var ESTADO = { apartada: 'Por confirmar', confirmada: 'Confirmada', cancelada: 'Cancelada', propuesta: 'Hora nueva propuesta · esperando respuesta' };
  function msgPropuesta(c) { return 'Hola ' + c.nombre + ' 👋 Te escribo de ' + perfil.nombre + ': se me atravesó algo y te propongo mover tu cita al ' + fechaLarga(c.fecha) + ' a las ' + hora12(c.inicio_min != null ? c.inicio_min : c.ini) + '. Contéstame aquí (me queda, otra hora o cancelar): ' + c.enlace; }
  function textoCita(c) {
    return (c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (c.detalle ? ' · ' + c.detalle : '') + ' · ' + duracion(c.fin_min - c.inicio_min);
  }
  function nombreDia(f, hoy) { return f === hoy ? 'Hoy' : f === sumaDia(hoy, 1) ? 'Mañana' : DSEM[dsem(f)] + ' ' + deIso(f).getDate(); }
  // Lo que la dueña apartó para ella ese día: planes que se repiten y tiempos de una vez.
  function tiemposDelDia(d, f) {
    var l = [];
    (d.repetidos || []).forEach(function (r) {
      if (String(r.dias).indexOf(String(dsem(f))) >= 0 && r.desde <= f && (!r.hasta || r.hasta >= f)) l.push({ ini: r.inicio_min, fin: r.fin_min, persona: r.persona, motivo: r.motivo, rep: true });
    });
    (d.bloqueos || []).forEach(function (b) { if (b.fecha === f) l.push({ ini: b.inicio_min, fin: b.fin_min, persona: b.persona, motivo: b.motivo }); });
    (d.calOcupado || []).forEach(function (b) { if (b.fecha === f) l.push({ ini: b.inicio_min, fin: b.fin_min, persona: b.persona, motivo: 'Ocupada en tu calendario', cal: true }); });
    return l;
  }
  // Huecos libres de cada quien dentro de su horario (de 30 min o más). Sin horario guardado no se calculan.
  function libresDelDia(d, f, tiempos) {
    var l = [], ahoraMin = -1;
    if (f === d.hoy) { var n = new Date(); ahoraMin = Math.ceil((n.getHours() * 60 + n.getMinutes()) / 30) * 30; }
    personas().forEach(function (p) {
      var sem = semanaDe(d, p.id), x = sem && sem[dsem(f)]; if (!x) return;
      var ocup = new Uint8Array(1440);
      var marca = function (a, b) { for (var m = Math.max(0, a); m < Math.min(1440, b); m++) ocup[m] = 1; };
      d.citas.forEach(function (c) { if (c.fecha === f && c.estado !== 'cancelada' && tocaA(c.persona, p.id)) marca(c.inicio_min, c.fin_min); });
      tiempos.forEach(function (t) { if (tocaA(t.persona, p.id)) marca(t.ini, t.fin); });
      var desde = Math.max(x[0], ahoraMin), ini = -1;
      for (var m = desde; m <= x[1]; m++) {
        var libre = m < x[1] && !ocup[m];
        if (libre && ini < 0) ini = m;
        if (!libre && ini >= 0) { if (m - ini >= 30) l.push({ ini: ini, fin: m, persona: p.id }); ini = -1; }
      }
    });
    return l;
  }
  function htmlHoy(d) {
    var hoy = d.hoy, f = diaSel, man = sumaDia(hoy, 1);
    var h = '<div class="dias-chips" role="group" aria-label="Qué día">';
    for (var i = 0; i < 14; i++) {
      var x = sumaDia(hoy, i), n = d.citas.filter(function (c) { return c.fecha === x && c.estado !== 'cancelada'; }).length;
      h += '<button type="button" class="dia-chip" data-dia="' + x + '" aria-pressed="' + (x === f) + '">' + esc(nombreDia(x, hoy)) + (n ? '<small>' + n + '</small>' : '') + '</button>';
    }
    h += '</div><button type="button" class="btn bloque atraveso" id="atraveso">Se me atravesó algo</button>';
    var et = estadoAvisosTel();
    if (et === 'apagado') h += '<section class="invita"><div><b>Los avisos de citas nuevas están apagados en este teléfono</b><span>Actívalos y te llega un aviso en cuanto alguien aparte en tu página.</span></div>' +
      '<div class="dos"><button type="button" class="btn negro" id="invitaSi">Activar</button><button type="button" class="btn" id="invitaNo">Ahora no</button></div></section>';
    else if (et === 'bloqueado' || et === 'instalar') h += '<section class="invita"><div><b>Los avisos de citas nuevas están apagados en este teléfono</b><span>' +
      (et === 'bloqueado' ? 'Los bloqueaste para esta página: actívalos en los ajustes de tu navegador.' : 'En iPhone llegan sólo con tu agenda instalada: Compartir → «Agregar a inicio», y ábrela desde ahí.') +
      '</span></div><button type="button" class="btn" id="invitaNo">Entendido</button></section>';
    h += '<h2 class="etq dia-tit">' + esc(fechaLarga(f)) + '</h2>';
    var tiempos = tiemposDelDia(d, f), libres = libresDelDia(d, f, tiempos);
    var citas = d.citas.filter(function (c) { return c.fecha === f; });
    var items = citas.map(function (c) { return { ini: c.inicio_min, o: c.estado === 'cancelada' ? 3 : 0, html: filaCita(c, f, man) }; })
      .concat(tiempos.map(function (t) {
        return { ini: t.ini, o: 1, html: '<div class="fila"><span class="hora">' + esc(hhmm(t.ini)) + '</span><div class="mio"><b>' + esc(t.motivo || 'Tiempo para ti') + '</b><span>' +
          esc(rango(t.ini, t.fin) + (equipo().length ? ' · ' + (t.persona ? nombreDe(t.persona) : 'todo el negocio') : '') + (t.rep ? ' · se repite' : '') + (t.cal ? ' · de Google' : '')) + ' · sólo tú lo ves</span></div></div>' };
      }))
      .concat(libres.map(function (l) {
        return { ini: l.ini, o: 2, html: '<div class="fila"><span class="hora">' + esc(hhmm(l.ini)) + '</span><button type="button" class="libre" data-libre="' + esc(f + '|' + l.ini + '|' + l.persona) + '">' +
          '<span>Libre hasta ' + ((Math.floor(l.fin / 60) % 12 || 12) === 1 ? 'la ' : 'las ') + esc(hora12(l.fin)) + (equipo().length > 1 ? ' · ' + esc(nombreDe(l.persona)) : '') + '</span><b>Apartar ›</b></button></div>' };
      }))
      .sort(function (a, b) { return a.ini - b.ini || a.o - b.o; });
    if (items.length) h += '<div class="lista">' + items.map(function (x) { return x.html; }).join('') + '</div>';
    else {
      var conHorario = personas().some(function (p) { return semanaDe(d, p.id); });
      h += '<p class="vacio">' + (conHorario ? 'Descansas este día.' : 'No hay citas este día.') + (conHorario ? '' : ' Pon tu horario en «Mis tiempos» y aquí verás tus horas libres.') + '</p>';
    }
    // Para mañana: a quién falta recordarle
    if (f === hoy) {
      var deManana = d.citas.filter(function (c) { return c.fecha === man && c.estado !== 'cancelada'; });
      var faltan = deManana.filter(function (c) { return !c.recordada; }).length;
      if (deManana.length) h += '<section class="manana"><span class="etq" style="color:var(--oro)">Para mañana</span>' +
        '<div class="manana-n">' + (faltan ? faltan + (faltan === 1 ? ' cita sin recordar' : ' citas sin recordar') : 'Ya recordaste a todas') + '</div>' +
        '<p>' + (faltan ? 'Un toque y le llega a cada una su recordatorio por WhatsApp.' : deManana.length + (deManana.length === 1 ? ' cita mañana.' : ' citas mañana.')) + '</p>' +
        '<button type="button" class="btn claro bloque" id="recordar">' + (faltan ? 'Recordar ' + (faltan === 1 ? 'a la que falta' : 'a las ' + faltan) : 'Ver las de mañana') + '</button></section>';
    }
    return h;
  }
  function mensajeRecordar(c) { return 'Hola ' + c.nombre + ' 👋 Te recordamos tu cita en ' + perfil.nombre + ' mañana ' + fechaLarga(c.fecha) + ' a las ' + hora12(c.inicio_min) + '. ¡Te esperamos!'; }
  function filaCita(c, f, man) {
    var quien = nombreDe(c.persona), ini = hora12(c.inicio_min);
    var conf = 'Hola ' + c.nombre + ' 👋 Tu cita en ' + perfil.nombre + ' del ' + fechaLarga(c.fecha) + ' a las ' + ini + ' está confirmada. ¡Te esperamos!';
    var acc = '';
    if (c.estado !== 'cancelada') {
      acc = '<div class="acc">' + (c.estado === 'apartada' ? '<button class="btn negro" type="button" data-estado="confirmada" data-folio="' + esc(c.folio) + '" data-aviso="' + esc(conf) + '" data-tel="' + esc(c.tel) + '">Confirmar</button>' : '') +
        (c.estado === 'propuesta' && c.enlace ? '<a class="btn" href="' + esc(wa(c.tel, msgPropuesta(c))) + '" target="_blank" rel="noopener">Mandarle la propuesta</a>'
          : f === man ? '<a class="btn" href="' + esc(wa(c.tel, mensajeRecordar(c))) + '" target="_blank" rel="noopener" data-recfolio="' + esc(c.folio) + '">' + (c.recordada ? 'Recordada ✓' : 'Recordar') + '</a>'
            : '<a class="btn" href="' + esc(wa(c.tel, 'Hola ' + c.nombre + ' 👋 ')) + '" target="_blank" rel="noopener">Escribirle</a>') +
        '<button class="btn" type="button" data-detalle="' + esc(c.folio) + '">Más</button>' +
        '<button class="btn quitar" type="button" data-estado="cancelada" data-folio="' + esc(c.folio) + '">Cancelar cita</button></div>';
    }
    var pago = c.anticipo ? ' · anticipo ' + pesos(c.anticipo) : '';
    return '<div class="fila"><span class="hora">' + esc(hhmm(c.inicio_min)) + '</span><div class="cita ' + esc(c.estado) + '">' +
      '<span class="pill ' + esc(c.estado) + '">' + esc(ESTADO[c.estado] || c.estado) + (c.origen === 'negocio' ? ' · la capturaste tú' : c.estado === 'apartada' ? ' · llegó de tu página' : '') + (c.recordada && c.estado !== 'cancelada' ? ' · recordada' : '') + '</span>' +
      '<b>' + esc(c.nombre) + '</b><span class="s">' + esc(textoCita(c)) + '</span>' +
      '<span class="s">' + (quien ? 'Con ' + esc(quien) + ' · ' : '') + esc(pesos(c.precio)) + esc(pago) + ' · termina ' + esc(hora12(c.fin_min)) + '</span>' +
      (c.estado === 'propuesta' && c.antes_fecha ? '<span class="s antes-de">Antes: ' + esc(fechaCorta(c.antes_fecha) + ' · ' + hora12(c.antes_ini)) + '</span>' : '') +
      '<span class="s">WhatsApp ' + esc(c.tel) + ' · folio ' + esc(c.folio) + (c.app ? ' · 📱 tiene tu app' : '') + '</span>' + acc + '</div></div>';
  }

  // ───── vista: semana ─────
  function htmlSemana(d) {
    var hoy = d.hoy, h = '';
    for (var i = 0; i < 7; i++) {
      var f = sumaDia(hoy, i);
      var cs = d.citas.filter(function (c) { return c.fecha === f && c.estado !== 'cancelada'; }).sort(function (a, b) { return a.inicio_min - b.inicio_min; });
      var tiempos = tiemposDelDia(d, f), libres = libresDelDia(d, f, tiempos);
      var libreMin = libres.reduce(function (s, l) { return s + l.fin - l.ini; }, 0);
      var trabajan = personas().some(function (p) { var s = semanaDe(d, p.id); return s && s[dsem(f)]; });
      var conHorario = personas().some(function (p) { return semanaDe(d, p.id); });
      h += '<section class="sem-dia"><button type="button" class="sem-cab" data-ir="' + f + '"><span><b>' + esc(i === 0 ? 'Hoy · ' + fechaLarga(f) : i === 1 ? 'Mañana · ' + fechaLarga(f) : fechaLarga(f).charAt(0).toUpperCase() + fechaLarga(f).slice(1)) + '</b>' +
        '<span>' + (cs.length ? cs.length + (cs.length === 1 ? ' cita' : ' citas') + ' · ' + pesos(cs.reduce(function (s, c) { return s + (c.precio || 0); }, 0)) : 'Sin citas') +
        (conHorario ? (trabajan ? (libreMin ? ' · ' + horas(libreMin) + ' libres' : ' · lleno') : ' · descansas') : '') + '</span></span><span aria-hidden="true">›</span></button>' +
        (cs.length ? '<ul class="sem-lista">' + cs.map(function (c) {
          return '<li class="' + (c.estado === 'apartada' ? 'pend' : '') + '"><span class="h">' + esc(hhmm(c.inicio_min)) + '</span><span class="t"><b>' + esc(c.nombre) + '</b> · ' + esc(c.servicio) +
            (equipo().length > 1 && c.persona ? ' · ' + esc(nombreDe(c.persona)) : '') + (c.estado === 'apartada' ? ' · <em>por confirmar</em>' : '') + '</span></li>';
        }).join('') + '</ul>' : '') + '</section>';
    }
    return h;
  }

  // ───── vista: mis tiempos ─────
  function semanaDe(d, p) { var h = d.horario || {}; return h[p] || h[''] || null; }
  function diasTxt(dias) {
    var l = String(dias).split('').map(Number);
    if (l.length === 7) return 'Todos los días';
    if (l.join('') === '12345') return 'Lun a vie';
    if (l.join('') === '123456') return 'Lun a sáb';
    var t = l.map(function (x) { return DSEM[x].toLowerCase(); });
    t[0] = t[0].charAt(0).toUpperCase() + t[0].slice(1);
    return t.length > 1 ? t.slice(0, -1).join(', ') + ' y ' + t[t.length - 1] : t[0];
  }
  function rango(ini, fin) { return ini === 0 && fin === 1440 ? 'todo el día' : hora12(ini) + ' – ' + hora12(fin); }
  // «10 am – 7 pm»: cabe junto a la barra del día.
  function corta(min) { var h = Math.floor(min / 60) % 24, m = min % 60; return (h % 12 || 12) + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm'); }
  // Los bloqueos de días enteros seguidos, con el mismo motivo y de la misma persona, se enseñan como uno («20 – 27 dic»).
  function agrupaBloqueos(lista) {
    var g = [];
    lista.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.inicio_min - b.inicio_min; }).forEach(function (b) {
      var todo = b.inicio_min === 0 && b.fin_min === 1440, u = g[g.length - 1];
      if (todo && u && u.todo && u.persona === b.persona && u.motivo === b.motivo && sumaDia(u.hasta, 1) === b.fecha) { u.hasta = b.fecha; u.ids.push(b.id); return; }
      g.push({ desde: b.fecha, hasta: b.fecha, todo: todo, ini: b.inicio_min, fin: b.fin_min, persona: b.persona, motivo: b.motivo, ids: [b.id] });
    });
    return g;
  }
  function libresDe(d, p) {
    var sem = semanaDe(d, p); if (!sem) return null;
    var trabaja = 0, libres = 0, citas = 0;
    for (var i = 0; i < 7; i++) {
      var f = sumaDia(d.hoy, i), x = sem[dsem(f)]; if (!x) continue;
      var ocup = new Uint8Array(1440);
      var marca = function (a, b) { for (var m = Math.max(a, x[0]); m < Math.min(b, x[1]); m++) ocup[m] = 1; };
      (d.repetidos || []).forEach(function (r) { if (tocaA(r.persona, p) && String(r.dias).indexOf(String(dsem(f))) >= 0 && r.desde <= f && (!r.hasta || r.hasta >= f)) marca(r.inicio_min, r.fin_min); });
      (d.bloqueos || []).forEach(function (b) { if (b.fecha === f && tocaA(b.persona, p)) marca(b.inicio_min, b.fin_min); });
      (d.calOcupado || []).forEach(function (b) { if (b.fecha === f && tocaA(b.persona, p)) marca(b.inicio_min, b.fin_min); });
      var ocupLibre = 0; for (var m = x[0]; m < x[1]; m++) ocupLibre += ocup[m];
      d.citas.forEach(function (c) { if (c.fecha === f && c.estado !== 'cancelada' && tocaA(c.persona, p)) { citas++; marca(c.inicio_min, c.fin_min); } });
      var ocupTodo = 0; for (m = x[0]; m < x[1]; m++) ocupTodo += ocup[m];
      trabaja += x[1] - x[0] - ocupLibre; libres += x[1] - x[0] - ocupTodo;
    }
    return { trabaja: trabaja, libres: libres, citas: citas };
  }
  function horas(min) { var h = Math.round(min / 30) / 2; return (h % 1 ? h.toFixed(1) : String(h)) + (h === 1 ? ' hora' : ' horas'); }
  function htmlTiempos(d) {
    var ps = personas();
    if (personaSel === null || !ps.some(function (x) { return x.id === personaSel; })) personaSel = ps[0].id;
    var p = personaSel, sem = semanaDe(d, p), propia = !!(d.horario || {})[p];
    var h = '';
    if (equipo().length > 1) h += '<div class="tabs" role="group" aria-label="De quién">' + ps.map(function (x) {
      return '<button type="button" class="tab" data-persona="' + esc(x.id) + '" aria-pressed="' + (x.id === p) + '">' + esc(x.nombre) + '</button>';
    }).join('') + '</div>';

    // Cuándo trabaja
    h += '<div class="sec-fila"><h2 class="etq" style="color:var(--oro-txt)">Cuándo ' + (equipo().length > 1 ? 'trabaja ' + esc(nombreDe(p)) : 'trabajas') + '</h2>' +
      '<button type="button" class="enlace" id="editaHorario">' + (sem ? 'Editar' : 'Poner horario') + '</button></div>';
    if (!sem) {
      h += '<p class="vacio" style="margin-top:8px">Todavía no pones tu horario. Mientras, tu página ofrece el horario que trae escrito.</p>';
    } else {
      var minI = 1440, maxF = 0;
      for (var i = 1; i <= 7; i++) if (sem[i]) { minI = Math.min(minI, sem[i][0]); maxF = Math.max(maxF, sem[i][1]); }
      if (maxF <= minI) { minI = 480; maxF = 1200; }
      minI = Math.floor(minI / 60) * 60; maxF = Math.ceil(maxF / 60) * 60;
      var pc = function (m) { return Math.max(0, Math.min(100, (m - minI) / (maxF - minI) * 100)).toFixed(2) + '%'; };
      var ancho = function (a, b) { return Math.max(0, (Math.min(b, maxF) - Math.max(a, minI)) / (maxF - minI) * 100).toFixed(2) + '%'; };
      var marcas = []; for (var m = minI; m <= maxF; m += Math.max(60, Math.ceil((maxF - minI) / 4 / 60) * 60)) marcas.push(m);
      h += '<div class="escala" aria-hidden="true">' + marcas.map(function (m) { return '<span style="left:' + pc(m) + '">' + ((Math.floor(m / 60) % 12) || 12) + '</span>'; }).join('') + '</div>';
      for (i = 1; i <= 7; i++) {
        var x = sem[i];
        var reps = (d.repetidos || []).filter(function (r) { return tocaA(r.persona, p) && String(r.dias).indexOf(String(i)) >= 0 && (!r.hasta || r.hasta >= d.hoy); });
        h += '<div class="dia"><b>' + DSEM[i] + '</b><div class="barra" role="img" aria-label="' + esc(DSEM_L[i] + ': ' + (x ? rango(x[0], x[1]) : 'descansas')) + '">' +
          (x ? '<i style="left:' + pc(x[0]) + ';width:' + ancho(x[0], x[1]) + '"></i>' + reps.map(function (r) { return '<u style="left:' + pc(r.inicio_min) + ';width:' + ancho(r.inicio_min, r.fin_min) + '"></u>'; }).join('') : '') +
          '</div><span' + (x ? '' : ' class="descansa"') + '>' + (x ? esc(corta(x[0]) + ' – ' + corta(x[1])) : 'Descansas') + '</span></div>';
      }
      h += '<div class="leyenda"><span><i class="l-a"></i>Atiendes</span><span><i class="l-t"></i>Tus tiempos</span></div>';
      if (!propia && equipo().length > 1) h += '<p class="nota" style="text-align:left">Usa el horario de todo el negocio. «Editar» le pone uno suyo.</p>';
    }

    // Se repiten
    var reps = (d.repetidos || []).filter(function (r) { return tocaA(r.persona, p); });
    h += '<h2 class="etq sec-tit">Se repiten</h2>' + (reps.length ? '<div class="planes">' + reps.map(function (r) {
      var extra = (r.desde > d.hoy ? ' · desde el ' + fechaMes(r.desde) : '') + (r.hasta ? ' · hasta el ' + fechaMes(r.hasta) : '') + (r.persona ? '' : equipo().length ? ' · todo el negocio' : '');
      return '<div class="plan"><span class="c"></span><div><b>' + esc(r.motivo || 'Tiempo para ti') + '</b><span>' + esc(diasTxt(r.dias) + ' · ' + rango(r.inicio_min, r.fin_min) + extra) + '</span></div>' +
        '<button type="button" class="enlace rojo" data-quitarep="' + esc(String(r.id)) + '" aria-label="Quitar ' + esc(r.motivo || 'este plan') + '">Quitar</button></div>';
    }).join('') + '</div>' : '<p class="nota" style="text-align:left">Nada todavía. La comida diaria o recoger a los niños van aquí: se apartan solos cada semana.</p>');

    // De una vez
    var bl = agrupaBloqueos((d.bloqueos || []).filter(function (b) { return b.fecha >= d.hoy && tocaA(b.persona, p); }));
    h += '<h2 class="etq sec-tit">Próximos, de una vez</h2>' + (bl.length ? '<div class="planes">' + bl.map(function (g) {
      var cuando = g.todo ? (g.desde === g.hasta ? fechaCorta(g.desde) + ' · todo el día' : fechaMes(g.desde) + ' – ' + fechaMes(g.hasta) + ' · todo el día') : fechaCorta(g.desde) + ' · ' + rango(g.ini, g.fin);
      return '<div class="plan una"><span class="c"></span><div><b>' + esc(g.motivo || 'Tiempo para ti') + '</b><span>' + esc(cuando + (g.persona ? '' : equipo().length ? ' · todo el negocio' : '')) + '</span></div>' +
        '<button type="button" class="enlace rojo" data-quitabl="' + esc(g.ids.join(',')) + '" aria-label="Quitar ' + esc(g.motivo || 'este tiempo') + '">Quitar</button></div>';
    }).join('') + '</div>' : '<p class="nota" style="text-align:left">Nada todavía. El dentista, un curso o tus vacaciones van aquí.</p>');

    h += tarjetaCalendario(d, p);
    var lb = libresDe(d, p);
    if (lb) h += '<section class="libres"><span class="etq" style="color:var(--oro-txt)">En los próximos 7 días te quedan libres</span>' +
      '<div class="libres-n">' + esc(horas(lb.libres)) + ' para citas</div><div class="nota" style="text-align:left">De ' + esc(horas(lb.trabaja)) + ' que atiendes · ' + lb.citas + (lb.citas === 1 ? ' cita ya apartada' : ' citas ya apartadas') + '</div></section>';
    return h;
  }

  // ───── su calendario de Google (sólo horas ocupadas) ─────
  function calDe(d, p) { return (d.calendarios || []).filter(function (c) { return c.persona === p; })[0] || null; }
  function haceCuanto(t) {
    var m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
    return m < 1 ? 'hace un momento' : m < 60 ? 'hace ' + m + ' min' : m < 1440 ? 'hace ' + Math.round(m / 60) + ' h' : 'hace ' + Math.round(m / 1440) + ' días';
  }
  function minCalSemana(d, p) {
    var fin = sumaDia(d.hoy, 7);
    return (d.calOcupado || []).filter(function (b) { return b.persona === p && b.fecha >= d.hoy && b.fecha < fin; }).reduce(function (s, b) { return s + b.fin_min - b.inicio_min; }, 0);
  }
  var ICO_CAL = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3"/></svg>';
  function tarjetaCalendario(d, p) {
    var c = calDe(d, p), quien = equipo().length > 1 ? ' de ' + nombreDe(p) : '';
    var estado = !c ? '<span>Si ya anotas tu vida ahí, no la captures dos veces: lo que tengas, tu página lo da por ocupado.</span>'
      : c.estado === 'ok' ? '<span class="ok">Conectado · revisado ' + esc(haceCuanto(c.revisado)) + ' · ' + esc(horas(minCalSemana(d, p))) + ' ocupadas esta semana</span>'
        : '<span class="mal">No pudimos leerlo: ' + esc(c.error) + '</span>';
    return '<button type="button" class="cal-card" id="abreCal"><span class="cal-ico">' + ICO_CAL + '</span><span class="cal-txt"><b>' + (c ? 'Mi calendario' : 'Conectar mi calendario') + esc(quien) + '</b>' + estado + '</span><span aria-hidden="true">›</span></button>';
  }
  function abreCalendario(d, p) {
    var c = calDe(d, p);
    var guardamos = '<section class="guardamos"><span class="etq" style="color:var(--oro)">Lo que guardamos</span>' +
      '<p>Sólo <b>de qué hora a qué hora estás ocupada</b>. Nunca el nombre de tus eventos, ni con quién, ni dónde. La dirección se guarda cifrada.</p>' +
      '<p class="suave">Para cortarlo: «Desconectar» aquí, o en Google le das «Restablecer» a esa dirección y deja de servir al instante.</p>' +
      '<p class="suave"><a href="https://solidaaplicaciones.com/privacidad.html" target="_blank" rel="noopener">Aviso de privacidad ›</a></p></section>';
    var forma = '<form id="fCal" novalidate>' +
      '<div class="paso"><span class="n">1</span><div><b>Abre Google Calendar en la computadora</b><span>Configuración → tu calendario → «Integrar el calendario».</span></div></div>' +
      '<div class="paso"><span class="n">2</span><div><b>Copia la «Dirección secreta en formato iCal»</b><span>Es la que termina en <i>basic.ics</i>. Sólo sirve para leer: con ella no se puede cambiar nada de tu calendario.</span></div></div>' +
      '<div class="paso"><span class="n">3</span><div style="flex:1;min-width:0"><b>Pégala aquí</b><input class="campo" id="calUrl" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" style="margin-top:8px"></div></div>' +
      '<p class="falta" id="calFalta" role="alert"></p><button class="btn negro bloque grande" id="calOk">' + (c ? 'Cambiar por esta' : 'Conectar') + '</button>' +
      '<p class="nota">También funciona con iPhone (iCloud, calendario público) y Outlook.</p></form>';
    var estado = c ? '<div class="filas">' +
      '<div class="fila-dato"><span>Estado</span><b class="' + (c.estado === 'ok' ? 'ok' : 'mal') + '">' + (c.estado === 'ok' ? 'Conectado' : 'No se pudo leer') + '</b></div>' +
      (c.estado !== 'ok' ? '<div class="fila-dato"><span>Qué pasó</span><b>' + esc(c.error) + '</b></div>' : '') +
      '<div class="fila-dato"><span>Revisado</span><b>' + esc(haceCuanto(c.revisado)) + ' · cada 15 min</b></div>' +
      '<div class="fila-dato"><span>Esta semana</span><b>' + esc(horas(minCalSemana(d, p))) + ' ocupadas</b></div>' +
      '<div class="fila-dato"><span>De</span><b>' + esc(c.host) + '</b></div>' +
      '<div class="fila-dato"><span>Ojo</span><b>Lo que anotes en tu calendario tarda hasta 15 min en bloquearse en tu página.</b></div></div>' +
      '<div class="dos" style="margin-top:12px"><button type="button" class="btn" id="calRevisa">Revisar ahora</button><button type="button" class="btn rojo-linea" id="calQuita">Desconectar</button></div>' +
      '<details class="cambiar"><summary>Cambiar la dirección</summary>' + forma + '</details>' : forma;
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Mi calendario' + (equipo().length > 1 ? ' · ' + esc(nombreDe(p)) : '') + '</h2>' + CERRAR + '</div>' +
      '<p class="nota" style="text-align:left;margin-top:2px">Lo que tengas en tu calendario, tu página lo da por ocupado.</p>' + estado + guardamos);
    var f = document.getElementById('fCal');
    f.onsubmit = function (e) {
      e.preventDefault();
      var falta = document.getElementById('calFalta'), b = document.getElementById('calOk'), url = document.getElementById('calUrl').value.trim();
      falta.textContent = '';
      if (!url) { falta.textContent = 'Pega la dirección de tu calendario.'; return; }
      b.disabled = true; b.textContent = 'Leyendo tu calendario…';
      envia('/calendarios', { metodo: 'POST', body: { url: url, persona: p } }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 201) { falta.textContent = x.d.error || 'No se pudo'; b.disabled = false; b.textContent = c ? 'Cambiar por esta' : 'Conectar'; return; }
        cierraHoja(); toast('Listo: tu página ya da por ocupado lo de tu calendario'); carga();
      }, function () { falta.textContent = 'Sin conexión.'; b.disabled = false; b.textContent = 'Conectar'; });
    };
    var rv = document.getElementById('calRevisa');
    if (rv) rv.onclick = function () {
      rv.disabled = true; rv.textContent = 'Revisando…';
      envia('/calendarios/' + c.id + '/revisar', { metodo: 'POST' }).then(function (x) {
        if (x.status !== 200) { toast(x.d.error || 'No se pudo'); rv.disabled = false; rv.textContent = 'Revisar ahora'; return; }
        toast(x.d.estado === 'ok' ? 'Listo: revisado ahora' : 'No pudimos leerlo: ' + x.d.error);
        carga(); cierraHoja();
      }, function () { toast('Sin conexión'); rv.disabled = false; rv.textContent = 'Revisar ahora'; });
    };
    var qt = document.getElementById('calQuita');
    if (qt) qt.onclick = function () {
      if (!confirm('¿Desconectar tu calendario? Lo que tengas ahí deja de bloquear horas en tu página.')) return;
      qt.disabled = true;
      envia('/calendarios/' + c.id, { metodo: 'DELETE' }).then(function () { cierraHoja(); toast('Listo: desconectado'); carga(); }, function () { toast('Sin conexión'); qt.disabled = false; });
    };
  }

  // ───── avisos al celular y por correo ─────
  var puedePush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var suscrito = null;   // null = todavía no se sabe
  // Cómo están los avisos en ESTE teléfono. Si están apagados se le dice en Hoy (y «Ahora no» lo esconde 3 días, no para siempre).
  function estadoAvisosTel() {
    if (DEMO || suscrito === null) return 'ok';
    try { var n = +localStorage.getItem('agenda:noavisos:' + ID) || 0; if (Date.now() - n < 3 * 86400000) return 'ok'; } catch (e) { return 'ok'; }
    if (esIos && !instalada) return 'instalar';
    if (!puedePush) return 'sin';
    if (suscrito) return 'ok';
    return Notification.permission === 'denied' ? 'bloqueado' : 'apagado';
  }
  function b64aU8(s) { var t = (s + '===='.slice((s.length + 3) % 4 + 1)).replace(/-/g, '+').replace(/_/g, '/'); var b = atob(t); return Uint8Array.from(b, function (c) { return c.charCodeAt(0); }); }
  function registro() {
    return Promise.race([navigator.serviceWorker.ready, new Promise(function (_, no) { setTimeout(function () { no(new Error('sin sw')); }, 8000); })]);
  }
  function revisaSuscripcion() {
    if (DEMO || !puedePush) { suscrito = false; return Promise.resolve(false); }
    return registro().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { suscrito = !!s; return s; }).catch(function () { suscrito = false; return null; });
  }
  function activaAvisos(vapid) {
    if (!vapid) return Promise.reject(new Error('Los avisos al celular todavía no están activos. Escríbele a Solida.'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied' ? 'Bloqueaste los avisos. Actívalos en los ajustes de tu navegador para esta página.' : 'No diste permiso para los avisos.');
      return registro();
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (s) { return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aU8(vapid) }); });
    }).then(function (sub) {
      return api('/avisos/suscribir', { metodo: 'POST', body: { endpoint: sub.endpoint } });
    }).then(function (x) {
      if (x.status !== 200) throw new Error(x.d.error || 'No se pudo');
      suscrito = true; return x.d;
    });
  }
  function apagaAvisos() {
    return registro().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) {
      if (!s) return null;
      var ep = s.endpoint;
      return s.unsubscribe().then(function () { return api('/avisos/quitar', { metodo: 'POST', body: { endpoint: ep } }); });
    }).then(function () { suscrito = false; });
  }
  var MUESTRA_AVISO = '<div class="noti-muestra" aria-hidden="true"><span class="sello chico">' + '__INI__' + '</span><div><b>Nueva cita · __NEG__</b><span>Daniela Soto apartó Volumen ruso con Fernanda · vie 30 · 1:00 pm. Sin anticipo todavía.</span></div></div>';
  function abreAvisos() {
    var muestra = MUESTRA_AVISO.replace('__INI__', esc(iniciales(perfil.nombre))).replace('__NEG__', esc(perfil.nombre));
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Avisos</h2>' + CERRAR + '</div>' +
      '<p class="nota" style="text-align:left;margin-top:2px">Te avisamos de cada cita nueva que llegue de tu página, y en la noche cuántas tienes mañana.</p>' +
      '<span class="etq" style="color:var(--oro-txt);display:block;margin-top:14px">Así te llega</span>' + muestra + '<div id="avCuerpo"><p class="nota">Cargando…</p></div>');
    var pintaCuerpo = function (st) {
      var cel = '';
      if (DEMO) cel = '<p class="nota" style="text-align:left">En la agenda de cada negocio, aquí se activan los avisos en su celular con un toque.</p>';
      else if (!puedePush) cel = '<p class="nota" style="text-align:left">Este navegador no recibe avisos. En Android usa Chrome; en iPhone, instala tu agenda en la pantalla de inicio.</p>';
      else if (esIos && !instalada) cel = '<p class="ojo">En iPhone los avisos llegan sólo con tu agenda instalada: en Safari toca Compartir (el cuadro con la flecha) → «Agregar a inicio», ábrela desde ahí y vuelve a esta pantalla.</p>';
      else if (!st.vapid) cel = '<p class="nota" style="text-align:left">Los avisos al celular todavía no están activos. Escríbele a Solida.</p>';
      else if (suscrito) cel = '<div class="fila-dato"><span>Este teléfono</span><b class="ok">Avisos activados</b></div><button type="button" class="btn bloque" id="avApaga" style="margin-top:10px">Apagar en este teléfono</button>';
      else if (Notification.permission === 'denied') cel = '<p class="ojo">Bloqueaste los avisos para esta página. Actívalos en los ajustes de tu navegador y vuelve aquí.</p>';
      else cel = '<button type="button" class="btn negro bloque grande" id="avActiva">Activar en este teléfono</button>';
      // El correo es sólo respaldo: no se enseña si el servicio de correo no está conectado.
      var correo = !st.correoDisponible ? '' : '<section class="campo-h"><span class="etq" style="color:var(--oro-txt)">Correo de respaldo</span>' +
        '<p class="nota" style="text-align:left;margin:0">Sólo te escribimos si llega una cita y en ninguno de tus teléfonos están activos los avisos. Nunca te llegan los dos.</p>' +
        '<form id="fCorreo" novalidate><input class="campo" id="avCorreo" type="email" inputmode="email" autocomplete="email" maxlength="200" value="' + esc(st.correo) + '" placeholder="tu@correo.com" aria-label="Tu correo de respaldo">' +
        '<p class="falta" id="avFalta" role="alert"></p><div class="dos"><button class="btn" id="avGuarda">Guardar</button>' +
        '<button type="button" class="btn" id="avPruebaCorreo"' + (st.correo && !DEMO ? '' : ' disabled') + '>Probar el correo</button></div></form></section>';
      document.getElementById('avCuerpo').innerHTML = '<section class="campo-h"><span class="etq" style="color:var(--oro-txt)">Al celular</span>' + cel +
        (st.telefonos ? '<p class="nota" style="text-align:left">Activos en ' + st.telefonos + (st.telefonos === 1 ? ' teléfono' : ' teléfonos') + '.</p>' : '') +
        (!DEMO && suscrito ? '<button type="button" class="btn bloque" id="avPrueba" style="margin-top:6px">Mandarme un aviso de prueba</button>' : '') + '</section>' + correo +
        '<section class="campo-h"><span class="etq" style="color:var(--oro-txt)">A tus clientas</span>' +
        '<p class="nota" style="text-align:left;margin:0">Las que tienen la app de tu página reciben su recordatorio solas' + (st.clientasConApp != null ? ' (hoy: ' + st.clientasConApp + (st.clientasConApp === 1 ? ' clienta' : ' clientas') + ')' : '') + '. A las demás les recuerdas por WhatsApp, como siempre.</p>' +
        '<div class="chips" role="group" aria-label="Cuándo recordarles">' + [['60', '1 hora antes'], ['120', '2 horas antes'], ['dia60', 'El día anterior + 1 hora antes']].map(function (o) {
          return '<button type="button" class="chip" data-recordar="' + o[0] + '" aria-pressed="' + ((st.recordar || '60') === o[0]) + '">' + o[1] + '</button>';
        }).join('') + '</div><p class="nota" style="text-align:left;margin:0">También les avisamos cuando confirmas, cancelas o les propones otra hora.</p></section>';
      hoja.querySelectorAll('[data-recordar]').forEach(function (b) {
        b.onclick = function () {
          var v = b.getAttribute('data-recordar');
          hoja.querySelectorAll('[data-recordar]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
          if (DEMO) { toast('Listo. En el ejemplo no se guarda.'); return; }
          api('/avisos/clientas', { metodo: 'PUT', body: { recordar: v } }).then(function (x) { toast(x.status === 200 ? 'Listo: les recordamos ' + b.textContent.toLowerCase() : (x.d.error || 'No se pudo')); }, function () { toast('Sin conexión'); });
        };
      });
      var a = document.getElementById('avActiva');
      if (a) a.onclick = function () {
        a.disabled = true; a.textContent = 'Activando…';
        activaAvisos(st.vapid).then(function (nuevo) { toast('Listo: te vamos a avisar en este teléfono'); pintaCuerpo(nuevo); },
          function (e) { a.disabled = false; a.textContent = 'Activar en este teléfono'; toast(e.message || 'No se pudo'); });
      };
      var ap = document.getElementById('avApaga');
      if (ap) ap.onclick = function () { ap.disabled = true; apagaAvisos().then(function () { toast('Avisos apagados en este teléfono'); return api('/avisos'); }).then(function (x) { pintaCuerpo(x.d); }, function () { ap.disabled = false; toast('No se pudo'); }); };
      var fc = document.getElementById('fCorreo');
      if (fc) fc.onsubmit = function (e) {
        e.preventDefault();
        var falta = document.getElementById('avFalta'); falta.textContent = '';
        var c = document.getElementById('avCorreo').value.trim();
        if (DEMO) { toast('Listo. En el ejemplo no se guarda.'); return; }
        api('/avisos/correo', { metodo: 'PUT', body: { correo: c } }).then(function (x) {
          if (x.status !== 200) { falta.textContent = x.d.error || 'No se pudo'; return; }
          toast(x.d.correo ? 'Guardado: tu respaldo es ' + x.d.correo : 'Guardado: sin correo de respaldo'); pintaCuerpo(x.d);
        }, function () { falta.textContent = 'Sin conexión.'; });
      };
      var prueba = function (b, canal) {
        if (!b) return;
        b.onclick = function () {
          b.disabled = true;
          api('/avisos/prueba', { metodo: 'POST', body: { canal: canal } }).then(function (x) {
            b.disabled = false;
            if (x.status !== 200) { toast(x.d.error || 'No se pudo'); return; }
            if (canal === 'correo') toast(x.d.correo ? 'Listo: revisa tu correo (y la carpeta de spam)' : 'No se pudo mandar el correo. Avísale a Solida.');
            else toast(x.d.push ? 'Listo: revisa tu celular' : 'No se pudo mandar. Apaga y vuelve a activar los avisos.');
          }, function () { b.disabled = false; toast('Sin conexión'); });
        };
      };
      prueba(document.getElementById('avPrueba'), 'celular');
      prueba(document.getElementById('avPruebaCorreo'), 'correo');
    };
    if (DEMO) { pintaCuerpo({ vapid: '', telefonos: 0, correo: '', avisoCorreo: false, correoDisponible: true }); return; }
    revisaSuscripcion().then(function () { return api('/avisos'); }).then(function (x) {
      if (x.status === 401) return salir();
      pintaCuerpo(x.status === 200 ? x.d : { vapid: '', telefonos: 0, correoDisponible: false });
    }, function () { document.getElementById('avCuerpo').innerHTML = '<p class="falta">Sin conexión.</p>'; });
  }

  // ───── hoja (lo que se abre desde abajo) ─────
  var focoAntes = null;
  function abreHoja(html) {
    cierraHoja();
    focoAntes = document.activeElement;
    var v = document.createElement('div'); v.className = 'velo'; v.id = 'velo';
    v.innerHTML = '<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="hojaTit"><div class="asa" aria-hidden="true"></div>' + html + '</div>';
    document.body.appendChild(v); document.body.style.overflow = 'hidden';
    v.addEventListener('click', function (e) { if (e.target === v) cierraHoja(); });
    var x = v.querySelector('.cerrar'); if (x) x.onclick = cierraHoja;
    var f = v.querySelector('input,select,button:not(.cerrar)'); if (f) f.focus({ preventScroll: true });
    return v.querySelector('.hoja');
  }
  var alCerrar = null;
  function cierraHoja() {
    var v = document.getElementById('velo'); if (!v) return;
    v.remove(); document.body.style.overflow = '';
    if (alCerrar) { var f = alCerrar; alCerrar = null; f(); }
    if (focoAntes && focoAntes.isConnected) focoAntes.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cierraHoja(); });
  var CERRAR = '<button class="cerrar" type="button" aria-label="Cerrar">✕</button>';
  function opcionesHora(sel, desde, hasta) {
    var o = ''; for (var m = desde; m <= hasta; m += 30) o += '<option value="' + hhmm(m) + '"' + (hhmm(m) === sel ? ' selected' : '') + '>' + (m === 1440 ? '12 am (medianoche)' : corta(m)) + '</option>';
    return o;
  }
  function chipsPersona(sel) {
    if (!equipo().length) return '';
    return '<div class="campo-h"><span class="etq">¿De quién?</span><div class="chips" role="group" aria-label="De quién">' +
      equipo().map(function (x) { return '<button type="button" class="chip" data-quien="' + esc(x.id) + '" aria-pressed="' + (x.id === sel) + '">' + esc(x.nombre) + '</button>'; }).join('') +
      '<button type="button" class="chip" data-quien="" aria-pressed="' + (sel === '') + '">Todo el negocio</button></div></div>';
  }
  function eligeEn(hoja, attr, cb) {
    hoja.querySelectorAll('[' + attr + ']').forEach(function (b) {
      b.onclick = function () {
        hoja.querySelectorAll('[' + attr + ']').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        if (cb) cb(b.getAttribute(attr));
      };
    });
  }

  // Citas que ya estaban apartadas donde ahora se aparta tiempo: se quedan, pero se avisa (y se ofrece escribirles).
  function choques(d, b) {
    return d.citas.filter(function (c) {
      if (c.estado === 'cancelada' || c.fecha < d.hoy || !tocaA(b.persona, c.persona)) return false;
      if (b.tipo === 'dias') return c.fecha >= b.fecha && c.fecha <= b.fechaFin;
      if (b.tipo === 'una') return c.fecha === b.fecha && c.inicio_min < b.fin && c.fin_min > b.ini;
      if (b.tipo === 'rep') return String(b.dias).indexOf(String(dsem(c.fecha))) >= 0 && c.fecha >= b.desdeF && (!b.hastaF || c.fecha <= b.hastaF) && c.inicio_min < b.fin && c.fin_min > b.ini;
      if (b.tipo === 'horario') { var x = b.semana[dsem(c.fecha)]; return !x || c.inicio_min < x[0] || c.fin_min > x[1]; }
      return false;
    }).sort(function (a, c) { return a.fecha < c.fecha ? -1 : a.fecha > c.fecha ? 1 : a.inicio_min - c.inicio_min; });
  }
  function htmlChoques(l) {
    if (!l.length) return '';
    return '<div class="ojo"><b>Ojo:</b> ya tenías ' + (l.length === 1 ? 'esta cita' : 'estas citas') + ' a esa hora. ' + (l.length === 1 ? 'Se queda' : 'Se quedan') +
      '; sólo dejamos de ofrecer esas horas de aquí en adelante.' + l.slice(0, 8).map(function (c) {
        var msg = 'Hola ' + c.nombre + ' 👋 Te escribo de ' + perfil.nombre + ': se me atravesó algo el ' + fechaLarga(c.fecha) + ' a las ' + hora12(c.inicio_min) +
          '. ¿Podemos mover tu cita a otro día?' + (perfil.pagina ? ' Aquí ves mis horas libres: ' + perfil.pagina : '');
        return '<div class="choque"><span>' + esc(fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min) + ' · ' + c.nombre) + '</span><a href="' + esc(wa(c.tel, msg)) + '" target="_blank" rel="noopener">Escribirle para moverla ›</a></div>';
      }).join('') + '</div>';
  }
  function listo(hoja, titulo, ch) {
    if (!ch.length) { cierraHoja(); toast(titulo + (DEMO ? ' En el ejemplo no se guarda.' : '')); return; }
    hoja.innerHTML = '<div class="asa" aria-hidden="true"></div><div class="hoja-cab"><h2 class="titulo" id="hojaTit">' + esc(titulo) + '</h2>' + CERRAR + '</div>' + htmlChoques(ch) +
      '<button class="btn negro bloque" type="button" id="hojaListo" style="margin-top:16px">Listo</button>';
    hoja.querySelector('.cerrar').onclick = cierraHoja; document.getElementById('hojaListo').onclick = cierraHoja;
    document.getElementById('hojaListo').focus();
  }

  function abreApartar(d) {
    var st = { tipo: 'rep', quien: personaSel || '', dias: [] };
    var motivos = ['Comida', 'Escuela', 'Doctor', 'Vacaciones', 'Curso'];
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Apartar tiempo para mí</h2>' + CERRAR + '</div>' +
      '<p class="nota" style="text-align:left;margin-top:2px">Sólo tú ves el motivo. Tus clientas verán «no disponible».</p>' +
      '<form id="fAp" novalidate><div class="campo-h"><label class="etq" for="apMotivo">¿Qué es?</label><input class="campo" id="apMotivo" maxlength="80" placeholder="Recoger a los niños, comida…">' +
      '<div class="chips">' + motivos.map(function (m) { return '<button type="button" class="chip" data-motivo="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div></div>' +
      '<div class="campo-h"><span class="etq">¿Cuándo?</span><div class="chips" role="group" aria-label="Cuándo">' +
      '<button type="button" class="chip" data-tipo="una" aria-pressed="false">Una vez</button><button type="button" class="chip" data-tipo="rep" aria-pressed="true">Se repite</button>' +
      '<button type="button" class="chip" data-tipo="dias" aria-pressed="false">Días enteros</button></div>' +
      '<div data-solo="rep"><div class="semana" role="group" aria-label="Qué días">' + [1, 2, 3, 4, 5, 6, 7].map(function (i) {
        return '<button type="button" class="chip" data-dia="' + i + '" aria-pressed="false" aria-label="' + DSEM_L[i] + '">' + DSEM[i].charAt(0) + '</button>';
      }).join('') + '</div></div>' +
      '<div data-solo="una"><label class="etq" for="apFecha">Día</label><input class="campo" type="date" id="apFecha" value="' + esc(d.hoy) + '" min="' + esc(d.hoy) + '"></div>' +
      '<div data-solo="dias"><div class="dos"><label><span class="etq">Del</span><input class="campo" type="date" id="apDel" value="' + esc(d.hoy) + '" min="' + esc(d.hoy) + '"></label>' +
      '<label><span class="etq">Al</span><input class="campo" type="date" id="apAl" value="' + esc(d.hoy) + '" min="' + esc(d.hoy) + '"></label></div></div>' +
      '<div data-solo="una rep"><div class="dos"><label><span class="etq">De</span><select class="campo" id="apDe">' + opcionesHora('13:00', 360, 1410) + '</select></label>' +
      '<label><span class="etq">A</span><select class="campo" id="apA">' + opcionesHora('14:00', 390, 1440) + '</select></label></div></div>' +
      '<div data-solo="rep"><label class="etq" for="apHasta">Hasta (opcional)</label><input class="campo" type="date" id="apHasta" min="' + esc(d.hoy) + '"><span class="nota" style="text-align:left">Vacío: se repite sin fecha de fin.</span></div>' +
      '</div>' + chipsPersona(st.quien) +
      '<p class="falta" id="apFalta" role="alert"></p><button class="btn negro bloque grande" id="apOk">Apartar</button></form>');
    function muestra() {
      hoja.querySelectorAll('[data-solo]').forEach(function (el) { el.hidden = el.getAttribute('data-solo').split(' ').indexOf(st.tipo) < 0; });
      var b = document.getElementById('apOk');
      b.textContent = st.tipo === 'rep' ? (st.dias.length ? 'Apartar · ' + (st.dias.length === 1 ? '1 día' : st.dias.length + ' días') + ' por semana' : 'Apartar') : 'Apartar';
    }
    eligeEn(hoja, 'data-tipo', function (t) { st.tipo = t; muestra(); });
    eligeEn(hoja, 'data-quien', function (q) { st.quien = q; });
    hoja.querySelectorAll('[data-dia]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-dia'), k = st.dias.indexOf(i);
        if (k >= 0) st.dias.splice(k, 1); else st.dias.push(i);
        b.setAttribute('aria-pressed', String(k < 0)); muestra();
      };
    });
    hoja.querySelectorAll('[data-motivo]').forEach(function (b) {
      b.onclick = function () { var m = b.getAttribute('data-motivo'); document.getElementById('apMotivo').value = m; if (m === 'Vacaciones') hoja.querySelector('[data-tipo="dias"]').click(); };
    });
    muestra();
    document.getElementById('fAp').onsubmit = function (e) {
      e.preventDefault();
      var falta = document.getElementById('apFalta'), motivo = document.getElementById('apMotivo').value.trim();
      var de = document.getElementById('apDe').value, a = document.getElementById('apA').value, ruta, cuerpo, bloque;
      falta.textContent = '';
      if (st.tipo !== 'dias' && aMin(a) <= aMin(de)) { falta.textContent = 'La hora de fin va después de la de inicio.'; return; }
      if (st.tipo === 'rep') {
        if (!st.dias.length) { falta.textContent = 'Elige qué días se repite.'; return; }
        var hastaF = document.getElementById('apHasta').value;
        ruta = '/repetidos'; cuerpo = { persona: st.quien, dias: st.dias, desde: de, hasta: a, hastaFecha: hastaF, motivo: motivo };
        bloque = { tipo: 'rep', persona: st.quien, dias: st.dias.join(''), ini: aMin(de), fin: aMin(a), desdeF: d.hoy, hastaF: hastaF };
      } else if (st.tipo === 'una') {
        var f = document.getElementById('apFecha').value;
        if (!f) { falta.textContent = 'Elige el día.'; return; }
        ruta = '/bloqueos'; cuerpo = { fecha: f, desde: de, hasta: a, persona: st.quien, motivo: motivo };
        bloque = { tipo: 'una', persona: st.quien, fecha: f, ini: aMin(de), fin: aMin(a) };
      } else {
        var del = document.getElementById('apDel').value, al = document.getElementById('apAl').value || del;
        if (!del) { falta.textContent = 'Elige el primer día.'; return; }
        if (al < del) { falta.textContent = 'El último día va después del primero.'; return; }
        ruta = '/bloqueos'; cuerpo = { fecha: del, fechaFin: al, persona: st.quien, motivo: motivo };
        bloque = { tipo: 'dias', persona: st.quien, fecha: del, fechaFin: al };
      }
      var b = document.getElementById('apOk'); b.disabled = true;
      envia(ruta, { metodo: 'POST', body: cuerpo }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 201) { falta.textContent = x.d.error || 'No se pudo'; b.disabled = false; return; }
        var ch = choques(ultimo, bloque);
        listo(hoja, 'Listo: tu página ya no ofrece ese tiempo.', ch);
        carga();
      }, function () { falta.textContent = 'Sin conexión.'; b.disabled = false; });
    };
  }

  function abreHorario(d, p) {
    var sem = semanaDe(d, p) || { 1: [600, 1140], 2: [600, 1140], 3: [600, 1140], 4: [600, 1140], 5: [600, 1140], 6: [600, 840], 7: null };
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">' + (equipo().length > 1 ? 'Horario de ' + esc(nombreDe(p)) : 'Tu horario') + '</h2>' + CERRAR + '</div>' +
      '<p class="nota" style="text-align:left;margin-top:2px">Tu página sólo ofrece citas dentro de este horario.</p><form id="fHor" novalidate>' +
      [1, 2, 3, 4, 5, 6, 7].map(function (i) {
        var x = sem[i];
        return '<div class="hor-dia"><label class="hor-si"><input type="checkbox" data-trabaja="' + i + '"' + (x ? ' checked' : '') + '><span>' + DSEM[i] + '</span></label>' +
          '<div class="hor-horas" data-horas="' + i + '"' + (x ? '' : ' hidden') + '><select class="campo" data-de="' + i + '" aria-label="' + DSEM_L[i] + ': entras">' + opcionesHora(hhmm(x ? x[0] : 600), 360, 1410) + '</select>' +
          '<span aria-hidden="true">a</span><select class="campo" data-a="' + i + '" aria-label="' + DSEM_L[i] + ': sales">' + opcionesHora(hhmm(x ? x[1] : 1140), 390, 1440) + '</select></div>' +
          '<span class="hor-no" data-no="' + i + '"' + (x ? ' hidden' : '') + '>Descansas</span></div>';
      }).join('') + '<p class="falta" id="horFalta" role="alert"></p><button class="btn negro bloque grande" id="horOk">Guardar horario</button></form>');
    hoja.querySelectorAll('[data-trabaja]').forEach(function (c) {
      c.onchange = function () { var i = c.getAttribute('data-trabaja'); hoja.querySelector('[data-horas="' + i + '"]').hidden = !c.checked; hoja.querySelector('[data-no="' + i + '"]').hidden = c.checked; };
    });
    document.getElementById('fHor').onsubmit = function (e) {
      e.preventDefault();
      var nueva = {}, falta = document.getElementById('horFalta');
      for (var i = 1; i <= 7; i++) {
        if (!hoja.querySelector('[data-trabaja="' + i + '"]').checked) { nueva[i] = null; continue; }
        var a = aMin(hoja.querySelector('[data-de="' + i + '"]').value), z = aMin(hoja.querySelector('[data-a="' + i + '"]').value);
        if (z <= a) { falta.textContent = 'El ' + DSEM_L[i] + ' la salida va después de la entrada.'; return; }
        nueva[i] = [a, z];
      }
      var b = document.getElementById('horOk'); b.disabled = true;
      envia('/horario', { metodo: 'PUT', body: { persona: p, semana: nueva } }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 200) { falta.textContent = x.d.error || 'No se pudo'; b.disabled = false; return; }
        listo(hoja, 'Listo: tu página ya ofrece este horario.', choques(ultimo, { tipo: 'horario', persona: p, semana: nueva }));
        carga();
      }, function () { falta.textContent = 'Sin conexión.'; b.disabled = false; });
    };
  }

  // ───── el detalle de una cita (lo que abre el aviso) ─────
  function abreCita(folio) {
    var c = ultimo && ultimo.citas.filter(function (x) { return x.folio === folio; })[0];
    if (!c) { toast('Esa cita ya no está en tu agenda'); return; }
    var man = sumaDia(ultimo.hoy, 1), quien = nombreDe(c.persona), ini = hora12(c.inicio_min);
    var conf = 'Hola ' + c.nombre + ' 👋 Tu cita en ' + perfil.nombre + ' del ' + fechaLarga(c.fecha) + ' a las ' + ini + ' está confirmada. ¡Te esperamos!';
    var filas = [['Servicio', c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio], c.detalle ? ['Detalle', c.detalle] : null,
      ['Cuándo', fechaLarga(c.fecha).charAt(0).toUpperCase() + fechaLarga(c.fecha).slice(1) + ' · ' + ini + ' a ' + hora12(c.fin_min)], quien ? ['Con', quien] : null,
      ['Precio', pesos(c.precio)], ['Anticipo', c.anticipo ? pesos(c.anticipo) : 'Todavía no'], ['WhatsApp', c.tel], ['Folio', c.folio]].filter(Boolean);
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">' + esc(c.nombre) + '</h2>' + CERRAR + '</div>' +
      '<span class="pill ' + esc(c.estado) + '">' + esc(ESTADO[c.estado] || c.estado) + (c.origen === 'pagina' ? ' · llegó de tu página' : ' · la capturaste tú') + '</span>' +
      '<div class="filas">' + filas.map(function (x) { return '<div class="fila-dato"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' +
      (c.estado === 'cancelada' ? '' : '<div class="acc" style="margin-top:14px">' +
        (c.estado === 'apartada' ? '<button class="btn negro" type="button" id="dcConfirma">Confirmar</button>' : '') +
        '<a class="btn" href="' + esc(wa(c.tel, c.fecha === man ? mensajeRecordar(c) : 'Hola ' + c.nombre + ' 👋 ')) + '" target="_blank" rel="noopener"' + (c.fecha === man ? ' data-recfolio="' + esc(c.folio) + '"' : '') + '>' + (c.fecha === man ? 'Recordar' : 'Escribirle') + '</a>' +
        '<button class="btn" type="button" id="dcMover">Proponerle otra hora</button>' +
        '<button class="btn quitar" type="button" id="dcCancela">Cancelar cita</button></div>'));
    var cambia = function (est, aviso) {
      var ventana = aviso ? window.open('', '_blank') : null;
      envia('/citas/' + encodeURIComponent(c.folio) + '/estado', { metodo: 'POST', body: { estado: est } }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 200) { if (ventana) ventana.close(); toast(x.d.error || 'No se pudo'); return; }
        if (ventana) ventana.location = aviso;
        cierraHoja(); toast(est === 'confirmada' ? 'Confirmada. Avísale por WhatsApp.' : 'Cancelada. La hora quedó libre.'); carga();
      }, function () { if (ventana) ventana.close(); toast('Sin conexión'); });
    };
    var bc = document.getElementById('dcConfirma'); if (bc) bc.onclick = function () { bc.disabled = true; cambia('confirmada', wa(c.tel, conf)); };
    var bx = document.getElementById('dcCancela'); if (bx) bx.onclick = function () { if (confirm('¿Cancelar esta cita? Su hora vuelve a quedar libre en tu página.')) cambia('cancelada', ''); };
    var rc = hoja.querySelector('[data-recfolio]'); if (rc) rc.addEventListener('click', function () { marcaRecordada(c.folio); });
    var bm = document.getElementById('dcMover'); if (bm) bm.onclick = function () { abreMover(ultimo, { cita: c }); };
  }

  // ───── «Se me atravesó algo»: proponerles hora nueva ─────
  function abreMover(d, op) {
    op = op || {};
    var una = op.cita || null;
    var st = { fecha: una ? una.fecha : (diaSel || d.hoy), todo: false, de: '13:00', a: '18:00', quien: una ? una.persona : (equipo().length ? (personaSel || equipo()[0].id) : ''), sug: null, elegidas: {} };
    var hoja = abreHoja('<div id="mvCuerpo"></div>');
    var cab = function (t, sub) { return '<div class="hoja-cab"><h2 class="titulo" id="hojaTit">' + esc(t) + '</h2>' + CERRAR + '</div>' + (sub ? '<p class="nota" style="text-align:left;margin-top:2px">' + esc(sub) + '</p>' : ''); };
    var ataCerrar = function () { var x = hoja.querySelector('.cerrar'); if (x) x.onclick = cierraHoja; };
    function paso1(msg) {
      document.getElementById('mvCuerpo').innerHTML = cab('Se me atravesó algo', 'Elige el tiempo que ya no puedes. A cada clienta le proponemos la primera hora libre y le avisamos.') +
        '<div class="campo-h"><label class="etq" for="mvFecha">Día</label><input class="campo" type="date" id="mvFecha" value="' + esc(st.fecha) + '" min="' + esc(d.hoy) + '">' +
        '<div class="chips" role="group" aria-label="Qué tiempo"><button type="button" class="chip" data-mvtodo="0" aria-pressed="' + !st.todo + '">De … a …</button><button type="button" class="chip" data-mvtodo="1" aria-pressed="' + st.todo + '">Todo el día</button></div>' +
        '<div class="dos" id="mvHoras"' + (st.todo ? ' hidden' : '') + '><label><span class="etq">De</span><select class="campo" id="mvDe">' + opcionesHora(st.de, 360, 1410) + '</select></label>' +
        '<label><span class="etq">A</span><select class="campo" id="mvA">' + opcionesHora(st.a, 390, 1440) + '</select></label></div></div>' +
        chipsPersona(st.quien) +
        '<div class="campo-h"><label class="etq" for="mvMotivo">Motivo (sólo lo ves tú)</label><input class="campo" id="mvMotivo" maxlength="80" placeholder="Doctor, un pendiente…"></div>' +
        '<p class="falta" id="mvFalta" role="alert">' + esc(msg || '') + '</p><button class="btn negro bloque grande" type="button" id="mvVer">Ver qué citas se mueven</button>';
      ataCerrar();
      eligeEn(hoja, 'data-mvtodo', function (v) { st.todo = v === '1'; document.getElementById('mvHoras').hidden = st.todo; });
      eligeEn(hoja, 'data-quien', function (q) { st.quien = q; });
      document.getElementById('mvVer').onclick = function () {
        st.fecha = document.getElementById('mvFecha').value; st.de = document.getElementById('mvDe').value; st.a = document.getElementById('mvA').value; st.motivo = document.getElementById('mvMotivo').value;
        if (!st.fecha) { document.getElementById('mvFalta').textContent = 'Elige el día.'; return; }
        if (!st.todo && aMin(st.a) <= aMin(st.de)) { document.getElementById('mvFalta').textContent = 'La hora de fin va después de la de inicio.'; return; }
        sugiere();
      };
    }
    function sugiere() {
      var cuerpo = una ? { fecha: una.fecha, desde: hhmm(una.inicio_min), hasta: hhmm(una.fin_min), persona: una.persona }
        : { fecha: st.fecha, desde: st.todo ? '' : st.de, hasta: st.todo ? '' : st.a, persona: st.quien };
      document.getElementById('mvCuerpo').innerHTML = cab(una ? 'Proponerle otra hora' : 'Se me atravesó algo') + '<p class="nota">Buscando horas libres…</p>'; ataCerrar();
      envia('/mover/sugerir', { metodo: 'POST', body: cuerpo }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 200) return una ? (cierraHoja(), toast(x.d.error || 'No se pudo')) : paso1(x.d.error || 'No se pudo');
        st.sug = x.d; if (una) st.sug.afectadas = st.sug.afectadas.filter(function (a) { return a.folio === una.folio; });
        st.elegidas = {}; st.sug.afectadas.forEach(function (a) { if (a.propuesta) st.elegidas[a.folio] = a.propuesta; });
        paso2();
      }, function () { una ? (cierraHoja(), toast('Sin conexión')) : paso1('Sin conexión.'); });
    }
    function paso2() {
      var l = st.sug.afectadas, n = Object.keys(st.elegidas).length;
      var h = cab(una ? 'Proponerle otra hora' : 'Se me atravesó algo', l.length ? null : 'En ese tiempo no hay citas. Igual lo cerramos para que tu página ya no lo ofrezca.');
      if (l.length) h += '<span class="etq" style="color:var(--oro-txt);display:block;margin-top:12px">' + l.length + (l.length === 1 ? ' cita se mueve' : ' citas se mueven') + ' · a la primera hora libre</span>';
      h += '<div class="lista" style="margin-top:8px">' + l.map(function (a) {
        var e = st.elegidas[a.folio];
        var canales = (a.app ? '<span class="canal">📱 Su app</span>' : '') + (a.correo ? '<span class="canal">✉ Correo</span>' : '') + (!a.app && !a.correo ? '<span class="canal">WhatsApp: tú le mandas</span>' : '');
        return '<div class="mv"><div class="mv-top"><b>' + esc(a.nombre) + '</b><span>' + esc(a.servicio + ' · ' + duracion(a.dur)) + '</span></div>' +
          '<span class="mv-antes">' + esc(fechaCorta(st.sug.fecha) + ' · ' + hora12(a.ini)) + '</span>' +
          (e ? '<span class="mv-ahora">→ ' + esc(fechaCorta(e.fecha) + ' · ' + hora12(e.ini)) + ' <button type="button" class="enlace" data-mvcambia="' + esc(a.folio) + '">cambiar</button></span>'
            : '<span class="mv-sin">No encontramos hora libre en 2 semanas. Escríbele tú.</span>') +
          (st.abierta === a.folio ? '<div class="chips">' + a.alternativas.map(function (x) {
            return '<button type="button" class="chip" data-mvelige="' + esc(a.folio + '|' + x.fecha + '|' + x.ini) + '" aria-pressed="' + (!!e && e.fecha === x.fecha && e.ini === x.ini) + '">' + esc(fechaCorta(x.fecha) + ' ' + hora12(x.ini)) + '</button>';
          }).join('') + '</div>' : '') + '<div class="canales">' + canales + '</div></div>';
      }).join('') + '</div>';
      h += '<div class="ojo">Les <b>proponemos</b> la hora nueva y se la apartamos. Ellas contestan con un toque: <b>me queda</b>, <b>elijo otra</b> o <b>cancelo</b>.' + (una ? '' : ' Ese tiempo ya no se ofrece en tu página.') + '</div>' +
        '<p class="falta" id="mvFalta2" role="alert"></p><button class="btn negro bloque grande" type="button" id="mvOk">' + (una ? 'Proponer y avisarle' : n ? 'Proponer y avisarles' : 'Cerrar ese tiempo') + '</button>' +
        (una ? '' : '<button class="btn bloque" type="button" id="mvAtras" style="margin-top:8px">Atrás</button>');
      document.getElementById('mvCuerpo').innerHTML = h; ataCerrar();
      hoja.querySelectorAll('[data-mvcambia]').forEach(function (b) { b.onclick = function () { st.abierta = st.abierta === b.getAttribute('data-mvcambia') ? null : b.getAttribute('data-mvcambia'); paso2(); }; });
      hoja.querySelectorAll('[data-mvelige]').forEach(function (b) { b.onclick = function () { var p = b.getAttribute('data-mvelige').split('|'); st.elegidas[p[0]] = { fecha: p[1], ini: +p[2] }; st.abierta = null; paso2(); }; });
      var at = document.getElementById('mvAtras'); if (at) at.onclick = function () { paso1(); };
      document.getElementById('mvOk').onclick = function () {
        var b = document.getElementById('mvOk'); b.disabled = true;
        var cuerpo = { propuestas: Object.keys(st.elegidas).map(function (f) { return { folio: f, fecha: st.elegidas[f].fecha, hora: hhmm(st.elegidas[f].ini) }; }) };
        if (!una) cuerpo.bloqueo = { fecha: st.sug.fecha, desde: st.todo ? '' : st.de, hasta: st.todo ? '' : st.a, persona: st.quien, motivo: st.motivo || '' };
        envia('/mover/proponer', { metodo: 'POST', body: cuerpo }).then(function (x) {
          if (x.status === 401) return salir();
          if (x.status !== 200) { b.disabled = false; document.getElementById('mvFalta2').textContent = x.d.error || 'No se pudo'; return; }
          paso3(x.d.resultados || []); carga();
        }, function () { b.disabled = false; document.getElementById('mvFalta2').textContent = 'Sin conexión.'; });
      };
    }
    function paso3(res) {
      var h = cab(res.length ? 'Listo: ya les propusimos' : 'Listo', res.length ? 'Te avisamos en cuanto contesten.' : (una ? '' : 'Tu página ya no ofrece ese tiempo.'));
      h += '<div class="lista" style="margin-top:10px">' + res.map(function (r) {
        if (r.error) return '<div class="mv"><b>' + esc(r.folio) + '</b><span class="mv-sin">' + esc(r.error) + '</span></div>';
        var c = { nombre: r.nombre, fecha: r.fecha, ini: r.ini, enlace: r.link };
        var dijo = r.app && r.correo ? 'Le avisamos en su app y por correo ✓' : r.app ? 'Le avisamos en su app ✓' : r.correo ? 'Le mandamos un correo ✓' : '';
        return '<div class="mv"><div class="mv-top"><b>' + esc(r.nombre) + '</b><span>→ ' + esc(fechaCorta(r.fecha) + ' · ' + hora12(r.ini)) + '</span></div>' +
          (dijo ? '<span class="mv-ahora" style="font-weight:400">' + esc(dijo) + '</span>' : '') +
          '<a class="btn' + (dijo ? '' : ' negro') + '" href="' + esc(wa(r.tel, msgPropuesta(c))) + '" target="_blank" rel="noopener">' + (dijo ? 'También por WhatsApp' : 'Mandarle por WhatsApp') + '</a></div>';
      }).join('') + '</div><button class="btn bloque" type="button" id="mvListo" style="margin-top:12px">Listo</button>';
      document.getElementById('mvCuerpo').innerHTML = h; ataCerrar();
      document.getElementById('mvListo').onclick = cierraHoja;
    }
    if (una) sugiere(); else paso1();
  }

  // ───── apartar una cita que pidieron por teléfono ─────
  var DURACIONES = [30, 45, 60, 90, 120, 150, 180];
  function abreNuevaCita(d, pre) {
    pre = pre || {};
    var st = { min: 60, persona: pre.persona != null ? pre.persona : (equipo().length ? (personaSel || equipo()[0].id) : '') };
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Apartar una cita</h2>' + CERRAR + '</div>' +
      '<p class="nota" style="text-align:left;margin-top:2px">La que te pidieron por teléfono o en persona. Entra ya confirmada.</p>' +
      '<form id="fCita" novalidate><div class="campo-h"><label class="etq" for="ncNombre">Nombre</label><input class="campo" id="ncNombre" maxlength="60" autocomplete="off" required>' +
      '<label class="etq" for="ncTel">WhatsApp (10 dígitos)</label><input class="campo" id="ncTel" inputmode="tel" maxlength="14" autocomplete="off" required placeholder="844 123 4567"></div>' +
      '<div class="campo-h"><label class="etq" for="ncServ">Servicio</label><input class="campo" id="ncServ" maxlength="80" required placeholder="Gelish, corte, consulta…">' +
      '<span class="etq">Dura</span><div class="chips" role="group" aria-label="Cuánto dura">' + DURACIONES.map(function (m) {
        return '<button type="button" class="chip" data-dur="' + m + '" aria-pressed="' + (m === st.min) + '">' + esc(duracion(m)) + '</button>';
      }).join('') + '</div>' +
      '<label class="etq" for="ncPrecio">Precio (opcional)</label><input class="campo" id="ncPrecio" inputmode="numeric" maxlength="7" placeholder="$"></div>' +
      '<div class="campo-h"><div class="dos"><label><span class="etq">Día</span><input class="campo" type="date" id="ncFecha" value="' + esc(pre.fecha || diaSel || d.hoy) + '" min="' + esc(d.hoy) + '"></label>' +
      '<label><span class="etq">Hora</span><select class="campo" id="ncHora">' + opcionesHora(hhmm(pre.ini != null ? pre.ini : 600), 360, 1380) + '</select></label></div></div>' +
      (equipo().length ? '<div class="campo-h"><span class="etq">¿Con quién?</span><div class="chips" role="group" aria-label="Con quién">' +
        equipo().map(function (x) { return '<button type="button" class="chip" data-con="' + esc(x.id) + '" aria-pressed="' + (x.id === st.persona) + '">' + esc(x.nombre) + '</button>'; }).join('') + '</div></div>' : '') +
      '<p class="falta" id="ncFalta" role="alert"></p><button class="btn negro bloque grande" id="ncOk">Apartar cita</button></form>');
    eligeEn(hoja, 'data-dur', function (m) { st.min = +m; });
    eligeEn(hoja, 'data-con', function (p) { st.persona = p; });
    document.getElementById('fCita').onsubmit = function (e) {
      e.preventDefault();
      var falta = document.getElementById('ncFalta');
      var c = { nombre: document.getElementById('ncNombre').value.trim(), tel: document.getElementById('ncTel').value.replace(/\D/g, '').slice(-10),
        servicio: document.getElementById('ncServ').value.trim(), precio: +String(document.getElementById('ncPrecio').value).replace(/\D/g, '') || 0,
        fecha: document.getElementById('ncFecha').value, hora: document.getElementById('ncHora').value, min: st.min, persona: st.persona };
      falta.textContent = '';
      if (c.nombre.length < 2) { falta.textContent = 'Escribe su nombre.'; return; }
      if (c.tel.length !== 10) { falta.textContent = 'Su WhatsApp debe tener 10 dígitos (para recordarle su cita).'; return; }
      if (!c.servicio) { falta.textContent = 'Escribe qué servicio es.'; return; }
      if (!c.fecha) { falta.textContent = 'Elige el día.'; return; }
      var b = document.getElementById('ncOk'); b.disabled = true;
      envia('/citas', { metodo: 'POST', body: c }).then(function (x) {
        if (x.status === 401) return salir();
        if (x.status !== 201) { falta.textContent = x.status === 409 ? 'A esa hora ya hay otra cita' + (c.persona ? ' con ' + nombreDe(c.persona) : '') + '. Elige otra hora.' : (x.d.error || 'No se pudo'); b.disabled = false; return; }
        var msg = 'Hola ' + c.nombre + ' 👋 Quedó tu cita en ' + perfil.nombre + ' el ' + fechaLarga(c.fecha) + ' a las ' + hora12(aMin(c.hora)) + ' (' + c.servicio + '). ¡Te esperamos!';
        diaSel = c.fecha; carga();
        hoja.innerHTML = '<div class="asa" aria-hidden="true"></div><div class="hoja-cab"><h2 class="titulo" id="hojaTit">Cita apartada</h2>' + CERRAR + '</div>' +
          '<p class="nota" style="text-align:left">' + esc(c.nombre + ' · ' + fechaLarga(c.fecha) + ' · ' + hora12(aMin(c.hora))) + '. Ya no se puede apartar esa hora en tu página.</p>' +
          '<a class="btn negro bloque grande" id="ncAvisar" href="' + esc(wa(c.tel, msg)) + '" target="_blank" rel="noopener">Mandarle su cita por WhatsApp</a>' +
          '<button class="btn bloque" type="button" id="hojaListo" style="margin-top:8px">Listo</button>';
        hoja.querySelector('.cerrar').onclick = cierraHoja; document.getElementById('hojaListo').onclick = cierraHoja;
        document.getElementById('ncAvisar').focus();
      }, function () { falta.textContent = 'Sin conexión.'; b.disabled = false; });
    };
  }

  // ───── recordar las de mañana ─────
  function marcaRecordada(folio) {
    var c = ultimo && ultimo.citas.filter(function (x) { return x.folio === folio; })[0];
    if (c) c.recordada = Math.floor(Date.now() / 1000);
    envia('/citas/' + encodeURIComponent(folio) + '/recordada', { metodo: 'POST' }).catch(function () {});
  }
  function abreRecordar(d) {
    var man = sumaDia(d.hoy, 1);
    var pintaHoja = function () {
      var l = ultimo.citas.filter(function (c) { return c.fecha === man && c.estado !== 'cancelada'; }).sort(function (a, b) { return a.inicio_min - b.inicio_min; });
      return '<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Recordar las de mañana</h2>' + CERRAR + '</div>' +
        '<p class="nota" style="text-align:left;margin-top:2px">Cada botón abre WhatsApp con su recordatorio ya escrito. Tú sólo le das enviar.</p>' +
        l.map(function (c) {
          return '<div class="rec"><div><b>' + esc(c.nombre) + '</b><span>' + esc(hora12(c.inicio_min) + ' · ' + c.servicio + (equipo().length > 1 && c.persona ? ' · ' + nombreDe(c.persona) : '')) + '</span></div>' +
            (c.recordada ? '<a class="btn hecho" href="' + esc(wa(c.tel, mensajeRecordar(c))) + '" target="_blank" rel="noopener" data-recfolio="' + esc(c.folio) + '">Enviado ✓</a>'
              : '<a class="btn negro" href="' + esc(wa(c.tel, mensajeRecordar(c))) + '" target="_blank" rel="noopener" data-recfolio="' + esc(c.folio) + '">Recordar</a>') + '</div>';
        }).join('') + '<p class="cita-msg">«' + esc(l.length ? mensajeRecordar(l[0]) : '') + '»</p>';
    };
    var hoja = abreHoja(pintaHoja());
    alCerrar = function () { pinta(ultimo); };
    var ataHoja = function () {
      hoja.querySelector('.cerrar').onclick = cierraHoja;
      hoja.querySelectorAll('[data-recfolio]').forEach(function (a) {
        a.addEventListener('click', function () {
          marcaRecordada(a.getAttribute('data-recfolio'));
          setTimeout(function () { hoja.innerHTML = '<div class="asa" aria-hidden="true"></div>' + pintaHoja(); ataHoja(); }, 50);
        });
      });
    };
    ataHoja();
  }

  function ata(d) {
    var s = document.getElementById('salir'); if (s) s.onclick = function () { if (confirm('¿Salir de tu agenda en este teléfono?')) salir(); };
    raiz.querySelectorAll('[data-vista]').forEach(function (b) {
      b.onclick = function () { irA(b.getAttribute('data-vista')); };
    });
    raiz.querySelectorAll('[data-dia]').forEach(function (b) { if (b.classList.contains('dia-chip')) b.onclick = function () { diaSel = b.getAttribute('data-dia'); pinta(ultimo); }; });
    raiz.querySelectorAll('[data-ir]').forEach(function (b) { b.onclick = function () { diaSel = b.getAttribute('data-ir'); irA('hoy'); }; });
    var nc = document.getElementById('nuevaCita'); if (nc) nc.onclick = function () { abreNuevaCita(ultimo); };
    var av = document.getElementById('abreAvisos'); if (av) av.onclick = abreAvisos;
    var atr = document.getElementById('atraveso'); if (atr) atr.onclick = function () { abreMover(ultimo); };
    raiz.querySelectorAll('[data-detalle]').forEach(function (b) { b.onclick = function () { abreCita(b.getAttribute('data-detalle')); }; });
    var iSi = document.getElementById('invitaSi');
    if (iSi) iSi.onclick = function () {
      iSi.disabled = true;
      api('/avisos').then(function (x) { return activaAvisos(x.d && x.d.vapid); }).then(function () { toast('Listo: te vamos a avisar en este teléfono'); pinta(ultimo); },
        function (e) { iSi.disabled = false; toast(e.message || 'No se pudo'); });
    };
    var iNo = document.getElementById('invitaNo');
    if (iNo) iNo.onclick = function () { try { localStorage.setItem('agenda:noavisos:' + ID, String(Date.now())); } catch (e) {} pinta(ultimo); };
    raiz.querySelectorAll('[data-libre]').forEach(function (b) {
      b.onclick = function () { var p = b.getAttribute('data-libre').split('|'); abreNuevaCita(ultimo, { fecha: p[0], ini: +p[1], persona: p[2] }); };
    });
    var rc = document.getElementById('recordar'); if (rc) rc.onclick = function () { abreRecordar(ultimo); };
    raiz.querySelectorAll('[data-recfolio]').forEach(function (a) { a.addEventListener('click', function () { marcaRecordada(a.getAttribute('data-recfolio')); setTimeout(function () { pinta(ultimo); }, 50); }); });
    raiz.querySelectorAll('[data-persona]').forEach(function (b) { b.onclick = function () { personaSel = b.getAttribute('data-persona'); pinta(ultimo); }; });
    var ap = document.getElementById('apartar'); if (ap) ap.onclick = function () { abreApartar(ultimo); };
    var eh = document.getElementById('editaHorario'); if (eh) eh.onclick = function () { abreHorario(ultimo, personaSel); };
    var ac = document.getElementById('abreCal'); if (ac) ac.onclick = function () { abreCalendario(ultimo, personaSel); };
    raiz.querySelectorAll('[data-estado]').forEach(function (b) {
      b.onclick = function () {
        var est = b.getAttribute('data-estado'), folio = b.getAttribute('data-folio');
        if (est === 'cancelada' && !confirm('¿Cancelar esta cita? Su hora vuelve a quedar libre en tu página.')) return;
        var avisar = est === 'confirmada' ? wa(b.getAttribute('data-tel'), b.getAttribute('data-aviso')) : '';
        // Se abre antes de esperar al servidor: si se abre después, el teléfono lo bloquea como ventana emergente.
        var ventana = avisar ? window.open('', '_blank') : null;
        b.disabled = true;
        envia('/citas/' + encodeURIComponent(folio) + '/estado', { metodo: 'POST', body: { estado: est } }).then(function (x) {
          if (x.status === 401) return salir();
          if (x.status !== 200) { if (ventana) ventana.close(); toast(x.d.error || 'No se pudo'); b.disabled = false; return; }
          if (ventana) ventana.location = avisar;
          toast(est === 'confirmada' ? 'Confirmada. Avísale por WhatsApp.' : 'Cancelada. La hora quedó libre.'); carga();
        }, function () { if (ventana) ventana.close(); toast('Sin conexión'); b.disabled = false; });
      };
    });
    raiz.querySelectorAll('[data-quitarep]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('¿Quitar este plan? Esas horas vuelven a ofrecerse en tu página.')) return;
        b.disabled = true;
        envia('/repetidos/' + encodeURIComponent(b.getAttribute('data-quitarep')), { metodo: 'DELETE' }).then(function () { toast('Listo: esas horas vuelven a estar libres'); carga(); }, function () { toast('Sin conexión'); b.disabled = false; });
      };
    });
    raiz.querySelectorAll('[data-quitabl]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('¿Quitar este tiempo? Esas horas vuelven a ofrecerse en tu página.')) return;
        b.disabled = true;
        Promise.all(b.getAttribute('data-quitabl').split(',').map(function (id) { return envia('/bloqueos/' + encodeURIComponent(id), { metodo: 'DELETE' }); }))
          .then(function () { toast('Listo: esas horas vuelven a estar libres'); carga(); }, function () { toast('Sin conexión'); b.disabled = false; });
      };
    });
  }

  function irA(v) {
    vista = v;
    history.replaceState(null, '', v === 'tiempos' ? '#tiempos' : v === 'semana' ? '#semana' : location.pathname);
    pinta(ultimo); scrollTo(0, 0);
  }

  // ───── muestra del catálogo ─────
  var demoDatos = null, demoId = 100;
  function demo() {
    if (demoDatos) return demoDatos;
    var hoy = iso(new Date()), man = sumaDia(hoy, 1), pas = sumaDia(hoy, 2);
    var n = 0;
    function c(fecha, h, dur, nombre, servicio, diseno, persona, precio, anticipo, estado, origen) {
      n++; return { folio: 'C-EJEM' + n, fecha: fecha, inicio_min: h * 60, fin_min: h * 60 + dur, persona: persona, servicio: servicio, diseno: diseno, detalle: '',
        precio: precio, anticipo: anticipo, nombre: nombre, tel: '844000000' + n, estado: estado, origen: origen || 'pagina' };
    }
    var lv = [600, 1140], jv = [600, 1200];
    var proxLunes = hoy; while (dsem(proxLunes) !== 1) proxLunes = sumaDia(proxLunes, 1);
    demoDatos = {
      hoy: hoy,
      citas: [
        c(hoy, 10, 60, 'Andrea Ruiz', 'Gelish en manos', 'French clásico', 'mia', 320, 100, 'confirmada'),
        c(hoy, 13, 150, 'Daniela Soto', 'Volumen ruso', '', 'fer', 850, 0, 'apartada'),
        c(hoy, 16, 60, 'Karla Méndez', 'Relleno de pestañas', '', 'fer', 450, 0, 'confirmada'),
        c(hoy, 17.5, 120, 'Sofía Lara', 'Acrílico esculpido', 'Negro y oro', 'mia', 600, 0, 'confirmada', 'negocio'),
        Object.assign(c(man, 10, 60, 'Lucía Garza', 'Gelish en manos', '', 'mia', 280, 0, 'confirmada'), { recordada: 1 }),
        c(man, 12.5, 90, 'Paola Treviño', 'Lifting de pestañas', '', 'fer', 520, 100, 'confirmada'),
        c(man, 17, 120, 'Ana Villarreal', 'Acrílico esculpido', '', 'mia', 450, 0, 'apartada'),
        c(pas, 11, 75, 'Mariana López', 'Pedicure spa con gelish', '', 'mia', 380, 0, 'confirmada'),
        c(sumaDia(hoy, 3), 10, 120, 'Regina Cantú', 'Acrílico esculpido', 'Chrome perla', 'mia', 520, 100, 'confirmada'),
        c(sumaDia(hoy, 3), 16, 150, 'Valeria Garza', 'Volumen ruso', '', 'fer', 850, 0, 'apartada'),
        c(sumaDia(hoy, 5), 12, 60, 'Fernanda Ríos', 'Relleno de pestañas', '', 'fer', 450, 0, 'confirmada'),
      ],
      horario: { mia: { 1: lv, 2: lv, 3: lv, 4: jv, 5: jv, 6: [540, 900], 7: null }, fer: { 1: null, 2: lv, 3: lv, 4: jv, 5: jv, 6: [540, 900], 7: null } },
      calendarios: [{ id: 7, persona: 'mia', host: 'calendar.google.com', estado: 'ok', error: '', revisado: Math.floor(Date.now() / 1000) - 360, bloques: 3 }],
      calOcupado: [
        { fecha: man, inicio_min: 1140, fin_min: 1200, persona: 'mia' },
        { fecha: pas, inicio_min: 540, fin_min: 600, persona: 'mia' },
        { fecha: sumaDia(hoy, 4), inicio_min: 600, fin_min: 720, persona: 'mia' },
      ],
      repetidos: [
        { id: 1, persona: 'mia', dias: '135', inicio_min: 780, fin_min: 840, desde: hoy, hasta: '', motivo: 'Recoger a Santi de la escuela' },
        { id: 2, persona: 'mia', dias: '24', inicio_min: 840, fin_min: 900, desde: hoy, hasta: '', motivo: 'Comida' },
      ],
      bloqueos: [
        { id: 3, fecha: pas, inicio_min: 900, fin_min: 960, persona: 'mia', motivo: 'Dentista' },
        { id: 4, fecha: sumaDia(proxLunes, 49), inicio_min: 0, fin_min: 1440, persona: '', motivo: 'Vacaciones' },
        { id: 5, fecha: sumaDia(proxLunes, 50), inicio_min: 0, fin_min: 1440, persona: '', motivo: 'Vacaciones' },
        { id: 6, fecha: sumaDia(proxLunes, 51), inicio_min: 0, fin_min: 1440, persona: '', motivo: 'Vacaciones' },
      ],
    };
    return demoDatos;
  }
  function demoApi(ruta, op) {
    var d = demo(), b = op.body || {}, m;
    if (ruta === '/mover/sugerir') {
      var ini0 = b.desde ? aMin(b.desde) : 0, fin0 = b.hasta ? aMin(b.hasta) : 1440;
      var af = d.citas.filter(function (c) { return c.fecha === b.fecha && c.estado !== 'cancelada' && c.inicio_min < fin0 && c.fin_min > ini0 && tocaA(c.persona, b.persona); });
      return { status: 200, d: { fecha: b.fecha, afectadas: af.map(function (c, i) {
        var alt = [0, 1, 2].map(function (k) { return { fecha: sumaDia(b.fecha, 1 + k), ini: 600 + i * 90 }; });
        return { folio: c.folio, nombre: c.nombre, tel: c.tel, servicio: c.servicio, persona: c.persona, ini: c.inicio_min, fin: c.fin_min, dur: c.fin_min - c.inicio_min, app: i === 0, correo: i === 1, propuesta: alt[0], alternativas: alt };
      }) } };
    }
    if (ruta === '/mover/proponer') {
      return { status: 200, d: { resultados: (b.propuestas || []).map(function (p, i) {
        var c = d.citas.filter(function (x) { return x.folio === p.folio; })[0];
        c.antes_fecha = c.fecha; c.antes_ini = c.inicio_min; var dur = c.fin_min - c.inicio_min;
        c.fecha = p.fecha; c.inicio_min = aMin(p.hora); c.fin_min = c.inicio_min + dur; c.estado = 'propuesta'; c.enlace = 'https://agenda.solidaaplicaciones.com/ejemplo/';
        return { folio: c.folio, nombre: c.nombre, tel: c.tel, fecha: c.fecha, ini: c.inicio_min, link: c.enlace, app: i === 0, correo: i === 1 };
      }) } };
    }
    if ((m = ruta.match(/^\/citas\/(.+)\/recordada$/))) { d.citas.forEach(function (c) { if (c.folio === decodeURIComponent(m[1])) c.recordada = 1; }); return { status: 200, d: { ok: true } }; }
    if (ruta === '/citas' && op.metodo === 'POST') {
      var ini = aMin(b.hora), finC = ini + b.min;
      var choca = d.citas.some(function (c) { return c.fecha === b.fecha && c.estado !== 'cancelada' && tocaA(c.persona, b.persona) && c.inicio_min < finC && c.fin_min > ini; });
      if (choca) return { status: 409, d: { error: 'Esa hora ya no está disponible.' } };
      d.citas.push({ folio: 'C-EJEM' + (++demoId), fecha: b.fecha, inicio_min: ini, fin_min: finC, persona: b.persona, servicio: b.servicio, diseno: '', detalle: '', precio: b.precio, anticipo: 0,
        nombre: b.nombre, tel: b.tel, estado: 'confirmada', origen: 'negocio', recordada: 0 });
      return { status: 201, d: { folio: 'C-EJEM' + demoId, estado: 'confirmada' } };
    }
    if ((m = ruta.match(/^\/citas\/(.+)\/estado$/))) { d.citas.forEach(function (c) { if (c.folio === decodeURIComponent(m[1])) c.estado = b.estado; }); return { status: 200, d: { ok: true } }; }
    if (ruta === '/horario') { d.horario[b.persona] = b.semana; return { status: 200, d: { horario: d.horario } }; }
    if (ruta === '/repetidos' && op.metodo === 'POST') {
      d.repetidos.push({ id: ++demoId, persona: b.persona, dias: b.dias.slice().sort().join(''), inicio_min: aMin(b.desde), fin_min: aMin(b.hasta), desde: d.hoy, hasta: b.hastaFecha || '', motivo: b.motivo });
      return { status: 201, d: { id: demoId } };
    }
    if (ruta === '/calendarios' && op.metodo === 'POST') {
      if (!/^(https|webcal):\/\/.+/.test(b.url || '')) return { status: 400, d: { error: 'Esa dirección no se ve completa. Cópiala otra vez de tu calendario.' } };
      d.calendarios = d.calendarios.filter(function (c) { return c.persona !== b.persona; });
      d.calendarios.push({ id: ++demoId, persona: b.persona, host: 'calendar.google.com', estado: 'ok', error: '', revisado: Math.floor(Date.now() / 1000), bloques: 1 });
      d.calOcupado.push({ fecha: sumaDia(d.hoy, 1), inicio_min: 720, fin_min: 780, persona: b.persona });
      return { status: 201, d: d.calendarios[d.calendarios.length - 1] };
    }
    if ((m = ruta.match(/^\/calendarios\/(\d+)\/revisar$/))) { var cc = d.calendarios.filter(function (c) { return String(c.id) === m[1]; })[0]; if (cc) cc.revisado = Math.floor(Date.now() / 1000); return { status: 200, d: cc }; }
    if ((m = ruta.match(/^\/calendarios\/(\d+)$/))) {
      var quita = d.calendarios.filter(function (c) { return String(c.id) === m[1]; })[0];
      d.calendarios = d.calendarios.filter(function (c) { return c !== quita; });
      if (quita) d.calOcupado = d.calOcupado.filter(function (x) { return x.persona !== quita.persona; });
      return { status: 200, d: { ok: true } };
    }
    if ((m = ruta.match(/^\/repetidos\/(\d+)$/))) { d.repetidos = d.repetidos.filter(function (r) { return String(r.id) !== m[1]; }); return { status: 200, d: { ok: true } }; }
    if (ruta === '/bloqueos' && op.metodo === 'POST') {
      var fin = b.fechaFin || b.fecha;
      for (var f = b.fecha; f <= fin; f = sumaDia(f, 1)) d.bloqueos.push({ id: ++demoId, fecha: f, inicio_min: b.desde ? aMin(b.desde) : 0, fin_min: b.hasta ? aMin(b.hasta) : 1440, persona: b.persona, motivo: b.motivo });
      return { status: 201, d: { id: demoId } };
    }
    if ((m = ruta.match(/^\/bloqueos\/(\d+)$/))) { d.bloqueos = d.bloqueos.filter(function (x) { return String(x.id) !== m[1]; }); return { status: 200, d: { ok: true } }; }
    return { status: 404, d: { error: 'No existe' } };
  }

  // ───── arranque ─────
  if (DEMO) {
    perfil = { nombre: 'Atelier Mía', equipo: [{ id: 'mia', nombre: 'Mía' }, { id: 'fer', nombre: 'Fernanda' }], pagina: 'https://solidaaplicaciones.com/ejemplos/unas/avanzado/' };
    document.title = 'Agenda · ' + perfil.nombre + ' (ejemplo)';
    carga();
  } else {
    api('/perfil').then(function (x) {
      if (x.status !== 200) throw new Error(x.d.error || 'No existe');
      perfil = x.d; document.title = 'Agenda · ' + perfil.nombre;
      // Al abrir desde un aviso: el día de esa cita
      var qs = new URLSearchParams(location.search), dq = qs.get('dia'), cq = qs.get('cita');
      if (dq && /^\d{4}-\d{2}-\d{2}$/.test(dq)) { diaSel = dq; vista = 'hoy'; }
      if (cq && /^[A-Z0-9-]{4,20}$/.test(cq)) { citaPendiente = cq; vista = 'hoy'; }
      if (dq || cq) history.replaceState(null, '', location.pathname);
      revisaSuscripcion().then(function () { if (token && ultimo) pinta(ultimo); });
      if (token) carga(); else pintaEntrar();
    }).catch(function () {
      raiz.innerHTML = '<div class="envoltura cuerpo"><p class="vacio">No se pudo abrir tu agenda. Revisa tu conexión e inténtalo de nuevo.</p></div>';
    });
  }
  setInterval(function () {
    if (!token || DEMO || document.visibilityState !== 'visible' || document.getElementById('velo')) return;
    var a = document.activeElement;
    if (a && a.matches && a.matches('input,select,textarea')) return;
    carga();
  }, 60000);
})();
