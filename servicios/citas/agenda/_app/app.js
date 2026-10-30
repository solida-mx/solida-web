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
  // Dos vistas: «Citas» (lo que viene) y «Mis tiempos» (cuándo trabaja cada quien y lo que no se puede apartar).
  var vista = location.hash === '#tiempos' ? 'tiempos' : 'citas';
  var personaSel = null;
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

  function pinta(d) {
    ultimo = d;
    var y = scrollY;
    var hoy = d.hoy;
    var vivas = d.citas.filter(function (c) { return c.fecha >= hoy && c.estado !== 'cancelada'; });
    var deHoy = vivas.filter(function (c) { return c.fecha === hoy; });
    var porCobrar = deHoy.reduce(function (s, c) { return s + Math.max(0, (c.precio || 0) - (c.anticipo || 0)); }, 0);
    var porConfirmar = vivas.filter(function (c) { return c.estado === 'apartada'; }).length;
    var h = (DEMO ? '<div class="muestra"><span>Ejemplo de Solida · así ve su agenda la dueña</span><a href="https://solidaaplicaciones.com/ejemplos/unas/avanzado/">Ver la página de sus clientas ›</a></div>' : '') +
      '<header class="cab"><div class="envoltura"><div class="cab-fila"><span class="sello chico">' + esc(iniciales(perfil.nombre)) + '</span>' +
      '<div class="quien"><span class="etq" style="color:var(--oro)">' + esc(perfil.nombre) + '</span><div>' + (vista === 'tiempos' ? 'Mis tiempos' : 'Tu agenda') + '</div></div></div>' +
      (vista === 'citas' ? '<div class="cifras"><div class="cifra"><b>' + deHoy.length + '</b><span>' + (deHoy.length === 1 ? 'cita hoy' : 'citas hoy') + '</span></div>' +
        '<div class="cifra"><b>' + pesos(porCobrar) + '</b><span>por cobrar hoy</span></div>' +
        '<div class="cifra"><b>' + porConfirmar + '</b><span>por confirmar</span></div></div>'
        : '<p class="cab-txt">Tu página sólo ofrece las horas en que de verdad puedes. Lo que apartes aquí, tus clientas lo ven como «no disponible», sin saber por qué.</p>' +
          '<button class="btn oro bloque" type="button" id="apartar" style="margin-top:14px">+ Apartar tiempo para mí</button>') +
      '<nav class="vistas" aria-label="Secciones"><button type="button" data-vista="citas" aria-pressed="' + (vista === 'citas') + '">Citas</button>' +
      '<button type="button" data-vista="tiempos" aria-pressed="' + (vista === 'tiempos') + '">Mis tiempos</button></nav></div></header>';
    h += '<main class="envoltura cuerpo">' + (vista === 'tiempos' ? htmlTiempos(d) : htmlCitas(d)) + pie() + '</main>' + tarjetaInstalar();
    var mismo = raiz.getAttribute('data-vista') === vista;
    raiz.setAttribute('data-vista', vista);
    raiz.innerHTML = h;
    if (mismo) scrollTo(0, y);
    pintaInstalar();
    ata(d);
  }
  function pie() {
    return '<div class="pie">' + (perfil.pagina ? '<a class="btn" href="' + esc(perfil.pagina) + '" target="_blank" rel="noopener">Ver mi página</a>' : '') +
      (DEMO ? '<a class="btn negro" href="https://wa.me/528443604349?text=' + encodeURIComponent('Hola 👋 Vi la agenda de ejemplo y quiero una para mi negocio.') + '" target="_blank" rel="noopener">Quiero una así</a>'
        : '<button class="btn" type="button" id="salir">Salir</button>') +
      '<p class="nota">' + (DEMO ? 'Es un ejemplo: puedes tocar todo, nada se guarda.' : 'Se actualiza sola cada minuto.') + '</p></div>';
  }

  // ───── vista: citas ─────
  var ESTADO = { apartada: 'Por confirmar', confirmada: 'Confirmada', cancelada: 'Cancelada' };
  function textoCita(c) {
    return (c.diseno ? c.diseno + ' (' + c.servicio + ')' : c.servicio) + (c.detalle ? ' · ' + c.detalle : '') + ' · ' + duracion(c.fin_min - c.inicio_min);
  }
  function htmlCitas(d) {
    var hoy = d.hoy, man = sumaDia(hoy, 1);
    var futuras = d.citas.filter(function (c) { return c.fecha >= hoy; });
    var dias = futuras.map(function (c) { return c.fecha; }).filter(function (f, i, a) { return a.indexOf(f) === i; });
    var h = dias.length ? dias.map(function (f) {
      return '<h2 class="etq dia-tit">' + (f === hoy ? 'Hoy · ' : f === man ? 'Mañana · ' : '') + esc(fechaLarga(f)) + '</h2><div class="lista">' +
        futuras.filter(function (c) { return c.fecha === f; }).map(function (c) { return filaCita(c, f, man); }).join('') + '</div>';
    }).join('') : '<p class="vacio">Todavía no hay citas. Las que se aparten en tu página aparecen aquí al momento.</p>';
    return h + '<button type="button" class="ir-tiempos" data-vista="tiempos"><span><b>Mis tiempos</b><span>Tu horario, tus planes y lo que no se puede apartar</span></span><span aria-hidden="true">›</span></button>';
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

    var lb = libresDe(d, p);
    if (lb) h += '<section class="libres"><span class="etq" style="color:var(--oro-txt)">En los próximos 7 días te quedan libres</span>' +
      '<div class="libres-n">' + esc(horas(lb.libres)) + ' para citas</div><div class="nota" style="text-align:left">De ' + esc(horas(lb.trabaja)) + ' que atiendes · ' + lb.citas + (lb.citas === 1 ? ' cita ya apartada' : ' citas ya apartadas') + '</div></section>';
    return h;
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
  function cierraHoja() {
    var v = document.getElementById('velo'); if (!v) return;
    v.remove(); document.body.style.overflow = '';
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

  function ata(d) {
    var s = document.getElementById('salir'); if (s) s.onclick = function () { if (confirm('¿Salir de tu agenda en este teléfono?')) salir(); };
    raiz.querySelectorAll('[data-vista]').forEach(function (b) {
      b.onclick = function () {
        vista = b.getAttribute('data-vista');
        history.replaceState(null, '', vista === 'tiempos' ? '#tiempos' : location.pathname);
        pinta(ultimo); scrollTo(0, 0);
      };
    });
    raiz.querySelectorAll('[data-persona]').forEach(function (b) { b.onclick = function () { personaSel = b.getAttribute('data-persona'); pinta(ultimo); }; });
    var ap = document.getElementById('apartar'); if (ap) ap.onclick = function () { abreApartar(ultimo); };
    var eh = document.getElementById('editaHorario'); if (eh) eh.onclick = function () { abreHorario(ultimo, personaSel); };
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
        c(man, 10, 60, 'Lucía Garza', 'Gelish en manos', '', 'mia', 280, 0, 'confirmada'),
        c(man, 12.5, 90, 'Paola Treviño', 'Lifting de pestañas', '', 'fer', 520, 100, 'confirmada'),
        c(man, 17, 120, 'Ana Villarreal', 'Acrílico esculpido', '', 'mia', 450, 0, 'apartada'),
        c(pas, 11, 75, 'Mariana López', 'Pedicure spa con gelish', '', 'mia', 380, 0, 'confirmada'),
      ],
      horario: { mia: { 1: lv, 2: lv, 3: lv, 4: jv, 5: jv, 6: [540, 900], 7: null }, fer: { 1: null, 2: lv, 3: lv, 4: jv, 5: jv, 6: [540, 900], 7: null } },
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
    if ((m = ruta.match(/^\/citas\/(.+)\/estado$/))) { d.citas.forEach(function (c) { if (c.folio === decodeURIComponent(m[1])) c.estado = b.estado; }); return { status: 200, d: { ok: true } }; }
    if (ruta === '/horario') { d.horario[b.persona] = b.semana; return { status: 200, d: { horario: d.horario } }; }
    if (ruta === '/repetidos' && op.metodo === 'POST') {
      d.repetidos.push({ id: ++demoId, persona: b.persona, dias: b.dias.slice().sort().join(''), inicio_min: aMin(b.desde), fin_min: aMin(b.hasta), desde: d.hoy, hasta: b.hastaFecha || '', motivo: b.motivo });
      return { status: 201, d: { id: demoId } };
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
