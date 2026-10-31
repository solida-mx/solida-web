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
  // ¿Teléfono o computadora? Para decir «este teléfono» o «esta computadora» donde toca.
  var esCompu = !esIos && !/android|mobile/i.test(navigator.userAgent) && !(/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  var este = esCompu ? 'esta computadora' : 'este teléfono', Este = esCompu ? 'Esta computadora' : 'Este teléfono';
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
    document.body.classList.remove('con-lado'); document.body.classList.add('en-entrar');
    raiz.innerHTML = '<section class="portada"><span class="sello">' + esc(iniciales(perfil.nombre)) + '</span>' +
      '<div class="etq" style="color:var(--oro);margin-top:14px">' + esc(perfil.nombre) + '</div><h1 class="titulo" style="margin-top:6px">Tu agenda</h1>' +
      '<p>Sólo para ti. Tus clientas apartan en tu página; aquí ves y manejas todo.</p></section>' +
      '<div class="envoltura"><form class="forma" id="fEntrar"><label><span class="etq" style="color:var(--oro-txt)">Tu clave</span>' +
      '<input class="campo clave" id="clave" autocomplete="current-password" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="14" placeholder="XXXX-XXXX-XXXX" required></label>' +
      '<p class="falta" id="falta" role="alert"></p><button class="btn negro bloque" id="conClave">Entrar</button>' +
      '<button type="button" class="btn bloque bio" id="conBio" hidden>Entrar con ' + BIO + '</button>' +
      '<p class="nota">Se queda abierta 7 días en ' + este + '. La clave te la da Solida Aplicaciones; si la perdiste, escríbenos y te damos otra.</p></form>' +
      tarjetaInstalar() + '</div>';
    pintaInstalar();
    // Los guiones se ponen solos: ella sólo escribe las letras y los números (y en minúsculas también sirve).
    var cl = document.getElementById('clave');
    cl.addEventListener('input', function () {
      var limpio = cl.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      var conGuiones = limpio.replace(/(.{4})(?=.)/g, '$1-');
      if (cl.value !== conGuiones) cl.value = conGuiones;
      document.getElementById('falta').textContent = '';
    });
    // Si este teléfono ya tiene Face ID / huella, ése es el botón principal.
    var bb = document.getElementById('conBio');
    puedeBio().then(function (si) {
      if (!si || !bb.isConnected) return;
      bb.hidden = false;
      if (lee(LLAVE_BIO)) { bb.className = 'btn negro bloque bio'; document.getElementById('conClave').className = 'btn bloque'; }
    });
    bb.onclick = function () {
      var f = document.getElementById('falta'); bb.disabled = true; f.textContent = '';
      firmaConBio('/passkey/entrar').then(function (d) { token = d.token; pon(LLAVE, token); carga(); }, function (e) { f.textContent = errorBio(e); bb.disabled = false; });
    };
    document.getElementById('fEntrar').onsubmit = function (e) {
      e.preventDefault();
      var b = document.getElementById('conClave'), f = document.getElementById('falta');
      b.disabled = true; f.textContent = '';
      api('/entrar', { metodo: 'POST', body: { clave: document.getElementById('clave').value } }).then(function (x) {
        if (x.status === 200 && x.d.token) { token = x.d.token; pon(LLAVE, token); ofrecerBio = true; carga(); return; }
        f.textContent = x.d.error || 'No se pudo entrar.'; b.disabled = false;
      }, function () { f.textContent = 'Sin conexión. Revisa tu internet.'; b.disabled = false; });
    };
  }
  function salir(remoto) {
    if (remoto !== false && token) api('/salir', { metodo: 'POST' }).catch(function () {});
    token = ''; try { localStorage.removeItem(LLAVE); } catch (e) {}
    quitaCandado(); pintaEntrar();
  }

  // ───── Face ID / huella, candado al abrir y dispositivos ─────
  // El teléfono guarda la llave privada y nunca la suelta; el servidor sólo comprueba firmas.
  // La sesión dura 7 días. «Pedir Face ID al abrir» es opcional y se guarda sólo en este teléfono.
  var ofrecerBio = false;
  var LLAVE_BIO = 'agenda:llave:' + ID, BLOQUEO = 'agenda:bloqueo:' + ID, NO_BIO = 'agenda:nobio:' + ID;
  var esAndroid = /android/i.test(navigator.userAgent);
  // En la compu: Windows Hello (PIN, huella o cara) o Touch ID en la Mac. Un iPad se presenta como Mac, pero con pantalla táctil.
  var esWin = /Windows/.test(navigator.userAgent), esMac = /Macintosh/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1);
  var BIO = esIos || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? 'Face ID' : esAndroid ? 'huella' : esWin ? 'Windows Hello' : esMac ? 'Touch ID' : 'tu huella o PIN';
  function lee(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function pon(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }
  function aB64(buf) { var s = '', u = new Uint8Array(buf); for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function deB64(s) { var t = String(s).replace(/-/g, '+').replace(/_/g, '/'); t += '==='.slice((t.length + 3) % 4); var b = atob(t), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  var _puedeBio = null;
  function puedeBio() {
    if (DEMO || !window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
    if (!_puedeBio) _puedeBio = PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; });
    return _puedeBio;
  }
  function errorBio(e) {
    if (e && e.name === 'NotAllowedError') return 'Se canceló. Inténtalo de nuevo cuando quieras.';
    if (e && e.name === 'InvalidStateError') return Este + ' ya tiene ' + BIO + ' activado para tu agenda.';
    return (e && e.mensaje) || 'No se pudo usar ' + BIO + '. Entra con tu clave.';
  }
  // Pide la firma del teléfono y la manda a «ruta» (entrar o desbloquear).
  function firmaConBio(ruta) {
    return api('/passkey/opciones-entrar', { metodo: 'POST' }).then(function (x) {
      if (x.status !== 200) throw { mensaje: x.d.error };
      if (x.d.sinLlaves) throw { mensaje: 'Todavía no activas ' + BIO + '. Entra con tu clave y actívalo desde «Seguridad y dispositivos».' };
      var o = x.d;
      return navigator.credentials.get({ publicKey: { challenge: deB64(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification,
        allowCredentials: o.allowCredentials.map(function (c) { return { type: c.type, id: deB64(c.id) }; }) } });
    }).then(function (c) {
      if (!c) throw { mensaje: 'Se canceló.' };
      var r = c.response;
      return api(ruta, { metodo: 'POST', body: { credencial: { id: c.id, type: c.type, response: { clientDataJSON: aB64(r.clientDataJSON), authenticatorData: aB64(r.authenticatorData), signature: aB64(r.signature) } } } });
    }).then(function (x) {
      if (x.status !== 200) throw { mensaje: x.d.error };
      return x.d;
    });
  }
  function activaBio() {
    return api('/passkey/opciones-alta', { metodo: 'POST' }).then(function (x) {
      if (x.status !== 200) throw { mensaje: x.d.error };
      var o = x.d;
      return navigator.credentials.create({ publicKey: { challenge: deB64(o.challenge), rp: o.rp, user: { id: deB64(o.user.id), name: o.user.name, displayName: o.user.displayName },
        pubKeyCredParams: o.pubKeyCredParams, timeout: o.timeout, attestation: o.attestation, authenticatorSelection: o.authenticatorSelection,
        excludeCredentials: o.excludeCredentials.map(function (c) { return { type: c.type, id: deB64(c.id) }; }) } });
    }).then(function (c) {
      if (!c) throw { mensaje: 'Se canceló.' };
      return api('/passkey/alta', { metodo: 'POST', body: { credencial: { id: c.id, type: c.type, response: { clientDataJSON: aB64(c.response.clientDataJSON), attestationObject: aB64(c.response.attestationObject) } } } });
    }).then(function (x) {
      if (x.status !== 200) throw { mensaje: x.d.error };
      pon(LLAVE_BIO, x.d.id); pon(NO_BIO, '');
      return x.d;
    });
  }
  // Recién entró con la clave: una sola vez le ofrecemos Face ID (si dice «ahora no», no insistimos en 30 días).
  function ofreceBio() {
    if (lee(LLAVE_BIO) || Date.now() - (+lee(NO_BIO) || 0) < 30 * 86400000) return;
    puedeBio().then(function (si) {
      if (!si || !token || document.getElementById('velo')) return;
      var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">¿Entrar con ' + BIO + '?</h2>' + CERRAR + '</div>' +
        '<p class="nota" style="text-align:left">La próxima vez entras con ' + BIO + ' en lugar de escribir tu clave. ' + (esCompu ? 'Tu PIN, tu huella o tu cara no salen de ' + este : 'Tu cara o tu huella no salen de tu teléfono') + ': nosotros no los vemos ni los guardamos.</p>' +
        '<p class="falta" id="bioFalta" role="alert"></p><button type="button" class="btn negro bloque grande" id="bioSi">Activar ' + BIO + '</button>' +
        '<button type="button" class="btn bloque" id="bioNo" style="margin-top:8px">Ahora no</button>');
      hoja.querySelector('#bioNo').onclick = function () { pon(NO_BIO, String(Date.now())); cierraHoja(); };
      hoja.querySelector('#bioSi').onclick = function () {
        var b = this; b.disabled = true;
        activaBio().then(function () { cierraHoja(); toast('Listo: la próxima vez entras con ' + BIO); }, function (e) { hoja.querySelector('#bioFalta').textContent = errorBio(e); b.disabled = false; });
      };
    });
  }

  // Candado: con «Pedir Face ID al abrir», la agenda se tapa al abrirla y al volver después de 5 minutos fuera.
  function conCandado() { return !!(token && lee(BLOQUEO) === '1' && lee(LLAVE_BIO)); }
  function quitaCandado() { var c = document.getElementById('candado'); if (c) { c.remove(); document.body.style.overflow = ''; } }
  function ponCandado(luego) {
    if (document.getElementById('candado')) return;
    var c = document.createElement('div'); c.id = 'candado'; c.className = 'candado'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true'); c.setAttribute('aria-labelledby', 'candTit');
    c.innerHTML = '<span class="sello">' + esc(iniciales(perfil.nombre)) + '</span><h1 class="titulo" id="candTit">Tu agenda</h1>' +
      '<p class="nota">Está protegida con ' + BIO + '.</p><p class="falta" id="candFalta" role="alert"></p>' +
      '<button type="button" class="btn negro bloque grande" id="candBio">Abrir con ' + BIO + '</button>' +
      '<button type="button" class="btn bloque" id="candClave" style="margin-top:8px">Entrar con mi clave</button>';
    document.body.appendChild(c); document.body.style.overflow = 'hidden';
    var b = c.querySelector('#candBio');
    b.onclick = function () {
      b.disabled = true; c.querySelector('#candFalta').textContent = '';
      firmaConBio('/passkey/desbloquear').then(function () { quitaCandado(); if (luego) luego(); }, function (e) { c.querySelector('#candFalta').textContent = errorBio(e); b.disabled = false; });
    };
    c.querySelector('#candClave').onclick = function () { salir(); };
    b.focus();
  }
  // Antes de pedir Face ID, ¿sigue viva esta sesión y la llave de este teléfono? Si la quitaron desde otro, no tiene caso.
  function abreConCandado() {
    raiz.innerHTML = '';
    api('/dispositivos').then(function (x) {
      if (x.status === 401) return salir(false);
      if (x.status === 200 && !x.d.llaves.some(function (l) { return l.id === lee(LLAVE_BIO); })) { pon(LLAVE_BIO, ''); pon(BLOQUEO, ''); return carga(); }
      ponCandado(carga);
    }, function () { ponCandado(carga); });
  }
  var fueraDesde = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { fueraDesde = Date.now(); return; }
    if (fueraDesde && Date.now() - fueraDesde > 5 * 60000 && conCandado()) { cierraHoja(); ponCandado(); }
    fueraDesde = 0;
  });

  function haceTxt(seg) {
    var s = Math.max(0, Math.floor(Date.now() / 1000) - seg);
    if (s < 600) return 'ahora';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
    if (s < 86400) { var h = Math.round(s / 3600); return 'hace ' + h + (h === 1 ? ' hora' : ' horas'); }
    var d = Math.round(s / 86400); return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  function fechaSeg(seg) { var d = new Date(seg * 1000); return d.getDate() + ' ' + MESES[d.getMonth()]; }
  function abreSeguridad() {
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Seguridad y dispositivos</h2>' + CERRAR + '</div><div id="segCuerpo"><p class="nota">Cargando…</p></div>');
    var cuerpo = hoja.querySelector('#segCuerpo');
    var pintaSeg = function (st, bio) {
      var mia = lee(LLAVE_BIO), tengo = mia && st.llaves.some(function (l) { return l.id === mia; });
      if (mia && !tengo) { pon(LLAVE_BIO, ''); pon(BLOQUEO, ''); tengo = false; }
      var h = '<section class="campo-h"><span class="etq">' + esc(BIO.charAt(0).toUpperCase() + BIO.slice(1)) + ' en ' + este + '</span>';
      if (tengo) {
        h += '<div class="fila-dato"><span>Entrar con ' + BIO + '</span><b class="ok">Activado</b></div>' +
          '<label class="interruptor"><input type="checkbox" id="segBloqueo"' + (lee(BLOQUEO) === '1' ? ' checked' : '') + '><span>Pedir ' + BIO + ' al abrir la agenda<small>Si alguien usa ' + este + ' con tu sesión abierta, no ve tus citas. Se pide al abrirla y al volver después de 5 minutos.</small></span></label>';
      } else if (bio) {
        h += '<p class="nota" style="text-align:left;margin:0">Entra con ' + BIO + ' en lugar de escribir tu clave. ' + (esCompu ? 'Tu PIN, tu huella o tu cara no salen de ' + este + '.' : 'Tu cara o tu huella no salen del teléfono.') + '</p>' +
          '<button type="button" class="btn negro bloque" id="segActiva">Activar ' + BIO + '</button>';
      } else {
        h += '<p class="nota" style="text-align:left;margin:0">' + (esIos || esAndroid ? 'Este teléfono no tiene ' + BIO + ' disponible aquí. Abre tu agenda en Safari (iPhone) o Chrome (Android), o desde la app instalada.' : esWin ? 'Esta computadora no tiene Windows Hello configurado. Actívalo en Configuración → Cuentas → Opciones de inicio de sesión (PIN, huella o cara), cierra y vuelve a abrir el navegador, y regresa aquí.' : esMac ? 'Esta Mac no ofrece Touch ID aquí. Usa Safari o Chrome actualizados.' : 'Este aparato no tiene Face ID ni huella disponibles.') + '</p>';
      }
      h += '<p class="falta" id="segFalta" role="alert"></p></section>';
      h += '<section class="campo-h"><span class="etq">Dónde está abierta tu agenda</span>' + st.sesiones.map(function (s) {
        return '<div class="disp"><div><b>' + esc(s.nombre) + (s.actual ? ' <span class="pill confirmada">' + Este + '</span>' : '') + '</b>' +
          '<small>' + (s.metodo === 'llave' ? 'Entró sin clave (Face ID, huella o PIN)' : 'Entró con tu clave') + ' · usada ' + haceTxt(s.ultimo) + ' · cierra sola el ' + fechaSeg(s.expira) + '</small></div>' +
          '<button type="button" class="btn rojo-linea" data-quita-sesion="' + esc(s.id) + '"' + (s.actual ? ' data-actual="1"' : '') + '>' + (s.actual ? 'Salir' : 'Quitar') + '</button></div>';
      }).join('') +
        (st.sesiones.length > 1 ? '<button type="button" class="btn bloque rojo-linea" id="segOtras">Cerrar en todos los demás</button>' : '') + '</section>';
      if (st.llaves.length) h += '<section class="campo-h"><span class="etq">Pueden entrar sin clave (Face ID, huella o PIN)</span>' + st.llaves.map(function (l) {
        return '<div class="disp"><div><b>' + esc(l.nombre) + (l.id === mia ? ' <span class="pill confirmada">' + Este + '</span>' : '') + '</b>' +
          '<small>Desde el ' + fechaSeg(l.creado) + (l.ultimo ? ' · usada ' + haceTxt(l.ultimo) : ' · todavía no se usa') + '</small></div>' +
          '<button type="button" class="btn rojo-linea" data-quita-llave="' + esc(l.id) + '">Quitar</button></div>';
      }).join('') + '<p class="nota" style="text-align:left;margin:0">Quitar uno de aquí no lo saca de tu agenda: quítalo también de la lista de arriba.</p></section>';
      h += '<p class="ojo"><b>¿Perdiste o te robaron un teléfono o tu computadora?</b> Entra desde otro y quítalo de las dos listas: en ese momento deja de ver tu agenda. Si ya no puedes entrar en ninguno, escríbenos a Solida y te damos una clave nueva: eso cierra la agenda en todos tus teléfonos y borra los Face ID o huellas.</p>';
      cuerpo.innerHTML = h;
      var falta = cuerpo.querySelector('#segFalta');
      var b;
      if ((b = cuerpo.querySelector('#segActiva'))) b.onclick = function () {
        b.disabled = true;
        activaBio().then(function () { toast('Listo: ya entras con ' + BIO); recarga(); }, function (e) { falta.textContent = errorBio(e); b.disabled = false; });
      };
      if ((b = cuerpo.querySelector('#segBloqueo'))) b.onchange = function () { pon(BLOQUEO, this.checked ? '1' : ''); toast(this.checked ? 'Se pedirá ' + BIO + ' al abrir' : 'Ya no se pide ' + BIO + ' al abrir'); };
      if ((b = cuerpo.querySelector('#segOtras'))) b.onclick = function () {
        if (!confirm('¿Cerrar tu agenda en todos los demás? Tendrán que volver a entrar con tu clave o sin clave (Face ID, huella o PIN).')) return;
        api('/dispositivos/cerrar-otras', { metodo: 'POST' }).then(trae, sinRed);
      };
      cuerpo.querySelectorAll('[data-quita-sesion]').forEach(function (x) {
        x.onclick = function () {
          if (x.getAttribute('data-actual')) { if (confirm('¿Salir de tu agenda en ' + este + '?')) { cierraHoja(); salir(); } return; }
          if (!confirm('¿Quitarlo? Deja de ver tu agenda en ese momento.')) return;
          api('/dispositivos/sesion/' + encodeURIComponent(x.getAttribute('data-quita-sesion')), { metodo: 'DELETE' }).then(trae, sinRed);
        };
      });
      cuerpo.querySelectorAll('[data-quita-llave]').forEach(function (x) {
        x.onclick = function () {
          var id = x.getAttribute('data-quita-llave');
          if (!confirm('¿Quitar esta llave? Ya no podrá entrar sin clave (Face ID, huella o PIN).')) return;
          api('/dispositivos/llave/' + encodeURIComponent(id), { metodo: 'DELETE' }).then(function (r) { if (id === lee(LLAVE_BIO)) { pon(LLAVE_BIO, ''); pon(BLOQUEO, ''); } trae(r); }, sinRed);
        };
      });
    };
    var sinRed = function () { var f = cuerpo.querySelector('#segFalta'); if (f) f.textContent = 'Sin conexión. Inténtalo de nuevo.'; };
    var trae = function (x) {
      if (x.status === 401) { cierraHoja(); return salir(false); }
      if (x.status !== 200) { cuerpo.innerHTML = '<p class="falta">' + esc(x.d.error || 'No se pudo cargar.') + '</p>'; return; }
      puedeBio().then(function (bio) { if (cuerpo.isConnected) pintaSeg(x.d, bio); });
    };
    var recarga = function () { api('/dispositivos').then(trae, sinRed); };
    if (DEMO) { cuerpo.innerHTML = '<p class="nota" style="text-align:left">En la agenda de cada negocio, aquí activas ' + BIO + ', ves en qué teléfonos está abierta tu agenda y quitas los que ya no quieras (por ejemplo, si te roban uno).</p>'; return; }
    recarga();
  }

  // ───── la agenda ─────
  // Tres secciones, en la barra de abajo: «Hoy» (el día, hora por hora), «Semana» (los próximos 7 días)
  // y «Mis tiempos» (cuándo trabaja cada quien y lo que no se puede apartar).
  var vista = location.hash === '#tiempos' ? 'tiempos' : location.hash === '#semana' ? 'semana' : location.hash === '#qr' ? 'qr' : 'hoy';
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
    if (DEMO) { pinta(demo()); traeNotificaciones(); return; }
    api('/agenda').then(function (x) {
      if (x.status === 401) return salir(false);
      if (x.status !== 200) throw new Error(x.d.error);
      pinta(x.d);
      traeNotificaciones();
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
    qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  };
  function navHtml() {
    return '<nav class="barra-nav" aria-label="Secciones de tu agenda">' + [['hoy', 'Hoy'], ['semana', 'Semana'], ['tiempos', 'Mis tiempos'], ['qr', 'Mi QR']].map(function (x) {
      return '<button type="button" data-vista="' + x[0] + '"' + (vista === x[0] ? ' aria-current="page"' : '') + '><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' + ICO[x[0]] + '</svg>' + x[1] + '</button>';
    }).join('') + '</nav>';
  }

  // ───── en la compu (pantalla ancha): menú a un lado, Hoy por columnas, Semana en columnas, hojas a la derecha ─────
  var ANCHA = matchMedia('(min-width: 1024px)');
  function ancha() { return ANCHA.matches; }
  function marcaAncha() { document.body.classList.toggle('ancha', ancha()); }
  marcaAncha();
  (ANCHA.addEventListener ? ANCHA.addEventListener.bind(ANCHA, 'change') : ANCHA.addListener.bind(ANCHA))(function () { marcaAncha(); if (ultimo && (token || DEMO)) pinta(ultimo); });
  function ladoHtml() {
    var bot = function (attr, ico, txt, actual) { return '<button type="button" ' + attr + (actual ? ' aria-current="page"' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' + ico + '</svg>' + txt + '</button>'; };
    return '<nav class="lado" aria-label="Menú de tu agenda"><div class="lado-quien"><span class="sello chico">' + esc(iniciales(perfil.nombre)) + '</span><div><span class="etq">' + esc(perfil.nombre) + '</span><b>Tu agenda</b></div></div>' +
      [['hoy', 'Hoy'], ['semana', 'Semana'], ['tiempos', 'Mis tiempos'], ['qr', 'Tu código QR']].map(function (x) { return bot('data-vista="' + x[0] + '"', ICO[x[0]], x[1], vista === x[0]); }).join('') +
      '<span class="lado-raya"></span>' +
      bot('data-lado="avisos"', '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>', 'Notificaciones<span class="cuenta" data-cuenta hidden></span>') +
      bot('data-lado="servicios"', '<path d="M5 6h14M5 12h14M5 18h9"/><circle cx="19" cy="18" r="2"/>', 'Mis servicios') +
      (DEMO ? '' : bot('data-lado="seguridad"', '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>', 'Seguridad y dispositivos')) +
      (perfil.pagina ? '<a href="' + esc(perfil.pagina) + '" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>Ver mi página</a>' : '') +
      (DEMO ? '' : bot('data-lado="salir"', '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>', 'Salir')) +
      '<span class="lado-hueco"></span><button type="button" class="btn oro bloque" data-lado="nueva">+ Apartar una cita</button>' +
      '<p class="lado-nota">' + (DEMO ? 'Es un ejemplo: puedes tocar todo, nada se guarda.' : 'Se actualiza sola cada minuto.') + '</p></nav>';
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
    if (vista === 'tiempos' || vista === 'qr') {
      cab = '<div><span class="etq" style="color:var(--oro)">' + esc(perfil.nombre) + '</span><div>' + (vista === 'qr' ? 'Tu código QR' : 'Mis tiempos') + '</div></div>';
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
    } else if (vista === 'qr') {
      cifras = '<p class="cab-txt">Pégalo en tu mostrador, en el espejo o en la puerta. Quien lo escanee llega a tu página, aparta sola y se queda con tu app en su celular.</p>';
    } else {
      cifras = '<p class="cab-txt">Tu página sólo ofrece las horas en que de verdad puedes. Lo que apartes aquí, tus clientas lo ven como «no disponible», sin saber por qué.</p>' +
        '<button class="btn oro bloque" type="button" id="apartar" style="margin-top:14px">+ Apartar tiempo para mí</button>';
    }
    var h = (DEMO ? '<div class="muestra"><span>Ejemplo de Solida · así ve su agenda la dueña</span><a href="https://solidaaplicaciones.com/ejemplos/unas/avanzado/">Ver la página de sus clientas ›</a></div>' : '') +
      '<header class="cab"><div class="envoltura"><div class="cab-fila"><span class="sello chico">' + esc(iniciales(perfil.nombre)) + '</span>' +
      '<div class="quien">' + cab + '</div>' +
      '<button type="button" class="mas campana" id="abreAvisos" aria-label="Notificaciones"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><span class="cuenta" data-cuenta hidden></span></button>' +
      (vista !== 'tiempos' ? '<button type="button" class="mas" id="nuevaCita" aria-label="Apartar una cita que te pidieron por teléfono">+</button>' : '') + '</div>' + cifras + '</div></header>';
    h += '<main class="envoltura cuerpo">' + (vista === 'tiempos' ? htmlTiempos(d) : vista === 'semana' ? htmlSemana(d) : vista === 'qr' ? htmlQr() : htmlHoy(d)) + pie() + '</main>' + (ancha() ? ladoHtml() : navHtml());
    document.body.classList.remove('en-entrar'); document.body.classList.toggle('con-lado', ancha());
    var mismo = raiz.getAttribute('data-vista') === vista;
    raiz.setAttribute('data-vista', vista);
    raiz.innerHTML = h;
    if (mismo) scrollTo(0, y);
    pintaInstalar();
    ata(d);
    if (citaPendiente && !document.getElementById('velo')) { var f = citaPendiente; citaPendiente = null; abreCita(f); }
    if (ofrecerBio) { ofrecerBio = false; ofreceBio(); }
    if (vista === 'qr') ataQr();
  }
  function pie() {
    return '<div class="pie">' + (perfil.pagina ? '<a class="btn" href="' + esc(perfil.pagina) + '" target="_blank" rel="noopener">Ver mi página</a>' : '') +
      (DEMO ? '<a class="btn negro" href="https://wa.me/528443604349?text=' + encodeURIComponent('Hola 👋 Vi la agenda de ejemplo y quiero una para mi negocio.') + '" target="_blank" rel="noopener">Quiero una así</a>'
        : '<button class="btn" type="button" id="misServ">Mis servicios</button><button class="btn" type="button" id="seguridad">Seguridad y dispositivos</button><button class="btn" type="button" id="salir">Salir</button>') +
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
    if (ancha() && (citas.length || tiempos.length || libres.length)) h += rejillaDia(d, f, citas, tiempos, libres, man);
    else if (items.length) h += '<div class="lista">' + items.map(function (x) { return x.html; }).join('') + '</div>';
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
  // El día en columnas, una por persona (en la compu). Media hora = una fila; lo que es de todo el negocio cruza todas las columnas.
  function rejillaDia(d, f, citas, tiempos, libres, man) {
    var ps = personas(), col = {}; ps.forEach(function (p, i) { col[p.id] = i + 2; });
    var vivas = citas.filter(function (c) { return c.estado !== 'cancelada'; });
    var desde = 1440, hasta = 0;
    ps.forEach(function (p) { var s = semanaDe(d, p.id), x = s && s[dsem(f)]; if (x) { desde = Math.min(desde, x[0]); hasta = Math.max(hasta, x[1]); } });
    vivas.forEach(function (c) { desde = Math.min(desde, c.inicio_min); hasta = Math.max(hasta, c.fin_min); });
    tiempos.forEach(function (t) { if (t.fin - t.ini < 1440) { desde = Math.min(desde, t.ini); hasta = Math.max(hasta, t.fin); } });
    if (desde >= hasta) { desde = 540; hasta = 1200; }
    desde = Math.floor(desde / 60) * 60; hasta = Math.ceil(hasta / 60) * 60;
    var fila = function (m) { return Math.round((Math.min(Math.max(m, desde), hasta) - desde) / 30) + 1; };
    var lugar = function (ini, fin, persona) {
      var c = persona && col[persona] ? col[persona] + ' / span 1' : '2 / -1';
      return 'grid-column:' + c + ';grid-row:' + fila(ini) + ' / ' + Math.max(fila(fin), fila(ini) + 1);
    };
    var filas = (hasta - desde) / 30;
    var h = '<div class="rej-caja"><div class="rej" style="grid-template-columns:56px repeat(' + ps.length + ',minmax(0,1fr));grid-template-rows:auto repeat(' + filas + ',40px)">';
    h += '<span class="rej-esq"></span>' + ps.map(function (p) {
      var s = semanaDe(d, p.id), x = s && s[dsem(f)];
      return '<div class="rej-quien"><span class="rej-ini">' + esc(String(p.nombre || '?').charAt(0).toUpperCase()) + '</span><b>' + esc(p.nombre) + '</b><span>' + (s ? (x ? esc(corta(x[0]) + ' – ' + corta(x[1])) : 'descansa') : '') + '</span></div>';
    }).join('');
    // filas de la hora (la fila 1 es la de los nombres, así que todo va +1)
    var mueve = function (st) { return st.replace(/grid-row:(\d+) \/ (\d+)/, function (_, a, b) { return 'grid-row:' + (+a + 1) + ' / ' + (+b + 1); }); };
    for (var m = desde; m < hasta; m += 60) h += '<span class="rej-hora" style="grid-column:1;grid-row:' + (fila(m) + 1) + ' / span 2">' + esc(corta(m)) + '</span>';
    h += '<span class="rej-fondo" style="grid-column:2 / -1;grid-row:2 / -1"></span>';
    tiempos.forEach(function (t) {
      h += '<div class="rej-mio' + (t.cal ? ' cal' : '') + '" style="' + mueve(lugar(t.ini, t.fin, t.persona)) + '"><b>' + esc(t.motivo || 'Tiempo para ti') + '</b><span>' +
        esc(rango(t.ini, t.fin) + (t.rep ? ' · se repite' : '') + (t.cal ? ' · de tu calendario' : ' · sólo tú lo ves')) + '</span></div>';
    });
    libres.forEach(function (l) {
      h += '<button type="button" class="rej-libre" data-libre="' + esc(f + '|' + l.ini + '|' + l.persona) + '" style="' + mueve(lugar(l.ini, l.fin, l.persona)) + '"><span>Libre ' + esc(corta(l.ini) + ' – ' + corta(l.fin)) + '</span><b>+ Apartar</b></button>';
    });
    vivas.forEach(function (c) {
      var corta30 = c.fin_min - c.inicio_min <= 30;
      h += '<button type="button" class="rej-cita ' + esc(c.estado) + (corta30 ? ' chica' : '') + '" data-detalle="' + esc(c.folio) + '" style="' + mueve(lugar(c.inicio_min, c.fin_min, c.persona)) + '">' +
        '<span class="rej-est">' + esc(hora12(c.inicio_min) + ' · ' + (ESTADO[c.estado] || c.estado).split(' · ')[0]) + '</span><b>' + esc(c.nombre) + '</b>' +
        (corta30 ? '' : '<span class="rej-s">' + esc((c.diseno ? c.diseno + ' · ' : '') + c.servicio + ' · ' + pesos(c.precio)) + '</span>') + '</button>';
    });
    h += '</div></div>';
    var canc = citas.filter(function (c) { return c.estado === 'cancelada'; });
    if (canc.length) h += '<p class="rej-canc">Canceladas: ' + canc.map(function (c) { return '<button type="button" class="enlace" data-detalle="' + esc(c.folio) + '">' + esc(hhmm(c.inicio_min) + ' ' + c.nombre) + '</button>'; }).join(' · ') + '</p>';
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
    var hoy = d.hoy, h = '<div class="sem-rejilla">';
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
    return h + '</div>';
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
        if (x.status === 401) return salir(false);
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

  // ───── Notificaciones: lo que le ha llegado (citas nuevas, cambios, respuestas) y lo pendiente del sistema ─────
  // Sin tarjetas grandes en la pantalla: todo vive aquí, y la campana dice cuántas hay sin ver.
  var NOTIF_VISTO = 'agenda:notifvisto:' + ID, notifs = [];
  function traeNotificaciones() {
    var listo = function (l) { notifs = l || []; pintaCuenta(); var c = document.getElementById('ntCuerpo'); if (c) pintaNotificaciones(c); };
    if (DEMO) return listo(demoNotifs());
    api('/avisos/historial').then(function (x) { if (x.status === 200) listo(x.d.avisos); }, function () {});
  }
  // Lo pendiente del sistema en ESTE teléfono: avisos apagados, instalarla como app
  function pendientesSistema() {
    var l = [], et = DEMO ? 'ok' : (suscrito === null ? 'ok' : (esIos && !instalada ? 'instalar' : !puedePush ? 'sin' : suscrito ? 'ok' : Notification.permission === 'denied' ? 'bloqueado' : 'apagado'));
    if (et === 'apagado') l.push({ k: 'avisos', t: 'Activa los avisos en ' + este, s: 'Te llega uno en cuanto alguien aparte en tu página.', b: 'Activar' });
    if (et === 'bloqueado') l.push({ k: 'bloqueado', t: 'Los avisos están bloqueados en ' + este, s: 'Actívalos en los ajustes de tu navegador para esta página.' });
    if (et === 'instalar') l.push({ k: 'instalar-ios', t: 'Instala tu agenda para recibir avisos', s: 'En Safari: Compartir (el cuadro con la flecha) → «Agregar a inicio», y ábrela desde ahí.' });
    if (!instalada && aviso) l.push({ k: 'instalar', t: 'Tenla como app', s: 'Con tus iniciales en la pantalla de inicio. Sin tienda de apps.', b: 'Instalar' });
    return l;
  }
  function sinVer() { var v = 0; try { v = +localStorage.getItem(NOTIF_VISTO) || 0; } catch (e) {} return notifs.filter(function (n) { return n.id > v; }).length + pendientesSistema().length; }
  function pintaCuenta() {
    var n = sinVer();
    document.querySelectorAll('[data-cuenta]').forEach(function (e) { e.hidden = !n; e.textContent = n > 9 ? '9+' : String(n); });
    var b = document.getElementById('abreAvisos'); if (b) b.setAttribute('aria-label', n ? 'Notificaciones: ' + n + ' sin ver' : 'Notificaciones');
  }
  function haceRato(seg) {
    var s = Math.max(0, Math.floor(Date.now() / 1000) - seg);
    if (s < 60) return 'ahora'; if (s < 3600) return 'hace ' + Math.floor(s / 60) + ' min'; if (s < 86400) return 'hace ' + Math.floor(s / 3600) + ' h';
    var d = Math.floor(s / 86400); return d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }
  function abreNotificaciones() {
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Notificaciones</h2>' + CERRAR + '</div><div id="ntCuerpo"></div>' +
      '<button type="button" class="enlace" id="ntAjustes">Ajustes de avisos: celular, correo y recordatorios a tus clientas</button>');
    var visto = 0; try { visto = +localStorage.getItem(NOTIF_VISTO) || 0; } catch (e) {}
    pintaNotificaciones(hoja.querySelector('#ntCuerpo'), visto);
    // Al abrirlas quedan vistas
    try { if (notifs.length) localStorage.setItem(NOTIF_VISTO, String(notifs[0].id)); } catch (e) {}
    pintaCuenta();
    hoja.querySelector('#ntAjustes').onclick = function () { abreAvisos(); };
    traeNotificaciones();
  }
  function pintaNotificaciones(c, visto) {
    if (visto == null) visto = +(c.getAttribute('data-visto') || 0); c.setAttribute('data-visto', visto);
    var sis = pendientesSistema(), h = '';
    if (sis.length) h += '<section class="nt-sec"><span class="etq">Pendiente en ' + esc(este) + '</span>' + sis.map(function (x) {
      return '<div class="nt nt-sis"><div><b>' + esc(x.t) + '</b><span>' + esc(x.s) + '</span></div>' + (x.b ? '<button type="button" class="btn negro" data-ntsis="' + x.k + '">' + esc(x.b) + '</button>' : '') + '</div>';
    }).join('') + '</section>';
    h += '<section class="nt-sec"><span class="etq">Actividad</span>' + (notifs.length ? notifs.map(function (n) {
      var f = (String(n.url).match(/[?&]cita=([A-Z0-9-]{4,20})/) || [])[1] || '';
      return '<button type="button" class="nt' + (n.id > visto ? ' nueva' : '') + '"' + (f ? ' data-ntcita="' + esc(f) + '"' : ' disabled') + '><div><b>' + esc(String(n.titulo).split(' · ' + perfil.nombre).join('')) + '</b><span>' + esc(n.cuerpo) + '</span></div><small>' + esc(haceRato(n.creado)) + '</small></button>';
    }).join('') : '<p class="vacio">Aquí te van a aparecer las citas nuevas que lleguen de tu página, los cambios y las respuestas de tus clientas.</p>') + '</section>';
    c.innerHTML = h;
    c.querySelectorAll('[data-ntcita]').forEach(function (b) { b.onclick = function () { var f = b.getAttribute('data-ntcita'); cierraHoja(); if (ultimo && ultimo.citas.some(function (x) { return x.folio === f; })) abreCita(f); else toast('Esa cita ya no está en tu agenda'); }; });
    c.querySelectorAll('[data-ntsis]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-ntsis'); b.disabled = true;
        if (k === 'instalar' && aviso) { aviso.prompt(); aviso.userChoice.then(function () { aviso = null; pintaNotificaciones(c); pintaCuenta(); }); return; }
        if (k === 'avisos') api('/avisos').then(function (x) { return activaAvisos(x.d && x.d.vapid); }).then(function () { toast('Listo: te vamos a avisar en ' + este); pintaNotificaciones(c); pintaCuenta(); },
          function (e) { b.disabled = false; toast(e.message || 'No se pudo'); });
      };
    });
  }
  function demoNotifs() {
    var a = Math.floor(Date.now() / 1000);
    return [{ id: 3, titulo: 'Nueva cita · Atelier Mía', cuerpo: 'Daniela Soto apartó Volumen ruso con Fernanda · hoy · 1:00 pm. Sin anticipo todavía.', url: '/ejemplo/?cita=C-EJEM2', creado: a - 900 },
      { id: 2, titulo: 'Sofía Lara cambió su cita', cuerpo: 'Antes jue · 4:00 pm, ahora hoy · 5:30 pm.', url: '/ejemplo/?cita=C-EJEM4', creado: a - 7200 },
      { id: 1, titulo: 'Mañana tienes 3 citas', cuerpo: 'La primera a las 10:00 am. Recuérdales por WhatsApp desde tu agenda.', url: '/ejemplo/', creado: a - 86400 }];
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
      else if (!puedePush) cel = '<p class="nota" style="text-align:left">' + (esCompu ? 'Este navegador no recibe avisos. Usa Chrome, Edge o Safari actualizados.' : 'Este navegador no recibe avisos. En Android usa Chrome; en iPhone, instala tu agenda en la pantalla de inicio.') + '</p>';
      else if (esIos && !instalada) cel = '<p class="ojo">En iPhone los avisos llegan sólo con tu agenda instalada: en Safari toca Compartir (el cuadro con la flecha) → «Agregar a inicio», ábrela desde ahí y vuelve a esta pantalla.</p>';
      else if (!st.vapid) cel = '<p class="nota" style="text-align:left">Los avisos al celular todavía no están activos. Escríbele a Solida.</p>';
      else if (suscrito) cel = '<div class="fila-dato"><span>' + Este + '</span><b class="ok">Avisos activados</b></div><button type="button" class="btn bloque" id="avApaga" style="margin-top:10px">Apagar en ' + este + '</button>';
      else if (Notification.permission === 'denied') cel = '<p class="ojo">Bloqueaste los avisos para esta página. Actívalos en los ajustes de tu navegador y vuelve aquí.</p>';
      else cel = '<button type="button" class="btn negro bloque grande" id="avActiva">Activar en ' + este + '</button>' + (esCompu ? '<p class="nota" style="text-align:left">En la computadora te llegan mientras el navegador esté abierto (aunque esté minimizado). Puedes tenerlos aquí y en tu celular a la vez.</p>' : '');
      // El correo es sólo respaldo: no se enseña si el servicio de correo no está conectado.
      var correo = !st.correoDisponible ? '' : '<section class="campo-h"><span class="etq" style="color:var(--oro-txt)">Correo de respaldo</span>' +
        '<p class="nota" style="text-align:left;margin:0">Sólo te escribimos si llega una cita y en ninguno de tus dispositivos están activos los avisos. Nunca te llegan los dos.</p>' +
        '<form id="fCorreo" novalidate><input class="campo" id="avCorreo" type="email" inputmode="email" autocomplete="email" maxlength="200" value="' + esc(st.correo) + '" placeholder="tu@correo.com" aria-label="Tu correo de respaldo">' +
        '<p class="falta" id="avFalta" role="alert"></p><div class="dos"><button class="btn" id="avGuarda">Guardar</button>' +
        '<button type="button" class="btn" id="avPruebaCorreo"' + (st.correo && !DEMO ? '' : ' disabled') + '>Probar el correo</button></div></form></section>';
      document.getElementById('avCuerpo').innerHTML = '<section class="campo-h"><span class="etq" style="color:var(--oro-txt)">' + (esCompu ? 'En ' + este : 'Al celular') + '</span>' + cel +
        (st.telefonos ? '<p class="nota" style="text-align:left">Activos en ' + st.telefonos + (st.telefonos === 1 ? ' dispositivo' : ' dispositivos') + '.</p>' : '') +
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
        activaAvisos(st.vapid).then(function (nuevo) { toast('Listo: te vamos a avisar en ' + este); pintaCuerpo(nuevo); },
          function (e) { a.disabled = false; a.textContent = 'Activar en ' + este; toast(e.message || 'No se pudo'); });
      };
      var ap = document.getElementById('avApaga');
      if (ap) ap.onclick = function () { ap.disabled = true; apagaAvisos().then(function () { toast('Avisos apagados en ' + este); return api('/avisos'); }).then(function (x) { pintaCuerpo(x.d); }, function () { ap.disabled = false; toast('No se pudo'); }); };
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
            else toast(x.d.push ? (esCompu ? 'Listo: te debe salir el aviso en la pantalla' : 'Listo: revisa tu celular') : 'No se pudo mandar. Apaga y vuelve a activar los avisos.');
          }, function () { b.disabled = false; toast('Sin conexión'); });
        };
      };
      prueba(document.getElementById('avPrueba'), 'celular');
      prueba(document.getElementById('avPruebaCorreo'), 'correo');
    };
    if (DEMO) { pintaCuerpo({ vapid: '', telefonos: 0, correo: '', avisoCorreo: false, correoDisponible: true }); return; }
    revisaSuscripcion().then(function () { return api('/avisos'); }).then(function (x) {
      if (x.status === 401) return salir(false);
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
    document.body.appendChild(v);
    if (ancha()) document.body.classList.add('con-panel'); else document.body.style.overflow = 'hidden';
    v.addEventListener('click', function (e) { if (e.target === v) cierraHoja(); });
    var x = v.querySelector('.cerrar'); if (x) x.onclick = cierraHoja;
    var f = v.querySelector('input,select,button:not(.cerrar)'); if (f) f.focus({ preventScroll: true });
    return v.querySelector('.hoja');
  }
  var alCerrar = null;
  function cierraHoja() {
    var v = document.getElementById('velo'); if (!v) return;
    v.remove(); document.body.style.overflow = ''; document.body.classList.remove('con-panel');
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
        if (x.status === 401) return salir(false);
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
        if (x.status === 401) return salir(false);
        if (x.status !== 200) { falta.textContent = x.d.error || 'No se pudo'; b.disabled = false; return; }
        listo(hoja, 'Listo: tu página ya ofrece este horario.', choques(ultimo, { tipo: 'horario', persona: p, semana: nueva }));
        carga();
      }, function () { falta.textContent = 'Sin conexión.'; b.disabled = false; });
    };
  }

  // ───── el detalle de una cita (lo que abre el aviso) ─────
  var recienApartada = null;
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
    if (c.estado !== 'cancelada' && perfil.pagina) ponManda(hoja, c, recienApartada === c.folio);
    recienApartada = null;
    var cambia = function (est, aviso) {
      var ventana = aviso ? window.open('', '_blank') : null;
      envia('/citas/' + encodeURIComponent(c.folio) + '/estado', { metodo: 'POST', body: { estado: est } }).then(function (x) {
        if (x.status === 401) return salir(false);
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

  // ───── «Mándale su cita»: su enlace por WhatsApp, por correo o como QR para que lo escanee ahí mismo ─────
  // El enlace abre la página del negocio, guarda la cita en SU celular («Mis citas», avisos) y la invita a instalar la app.
  function ponManda(hoja, c, recien) {
    var quien = nombreDe(c.persona);
    var sec = document.createElement('section'); sec.className = 'manda' + (recien ? ' recien' : '');
    sec.innerHTML = (recien ? '<p class="manda-ok">Lista: ' + esc(c.nombre) + ' · ' + esc(fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min)) + '. Ya no se puede apartar esa hora en tu página.</p>' : '') +
      '<span class="etq">Mándale su cita</span>' +
      '<div class="dos"><button class="btn negro" type="button" data-manda="wa">Por WhatsApp</button><button class="btn" type="button" data-manda="correo">Por correo</button></div>' +
      '<form class="manda-correo" hidden novalidate><input class="campo" type="email" inputmode="email" autocomplete="off" maxlength="200" placeholder="su@correo.com" aria-label="Su correo" value="' + esc(c.correo || '') + '">' +
      '<button class="btn negro">Enviar</button></form>' +
      '<button class="btn bloque" type="button" data-manda="qr">Que la escanee aquí</button>' +
      '<div class="manda-qr" hidden></div><p class="falta manda-falta" role="alert"></p>' +
      '<p class="nota" style="text-align:left">Le llega su cita con su enlace: la guarda en su celular, le recordamos antes y la próxima la aparta ella sola.</p>';
    var fil = hoja.querySelector('.filas');
    if (recien) fil.parentNode.insertBefore(sec, fil); else hoja.appendChild(sec);
    var falta = sec.querySelector('.manda-falta');
    var enlace = '';
    var pideEnlace = function () {
      if (enlace) return Promise.resolve(enlace);
      return envia('/citas/' + encodeURIComponent(c.folio) + '/enlace', { metodo: 'POST' }).then(function (x) {
        if (x.status === 401) { salir(false); throw new Error(''); }
        if (x.status !== 200) throw new Error(x.d.error || 'No se pudo');
        enlace = x.d.enlace; return enlace;
      });
    };
    var msg = function (l) {
      return 'Hola ' + c.nombre + ', te escribo de ' + perfil.nombre + '. Tu cita quedó el ' + fechaLarga(c.fecha) + ' a las ' + hora12(c.inicio_min) + (quien ? ' con ' + quien : '') + ': ' + c.servicio + '.\n\n' +
        'Aquí la ves, la cambias si lo necesitas y te recordamos antes: ' + l + '\n\nLa próxima la apartas tú desde ahí, a la hora que quieras.';
    };
    sec.querySelector('[data-manda="wa"]').onclick = function () {
      falta.textContent = '';
      var ventana = window.open('', '_blank');   // se abre ya, o el teléfono la bloquea como ventana emergente
      pideEnlace().then(function (l) { if (ventana) ventana.location = wa(c.tel, msg(l)); else location.href = wa(c.tel, msg(l)); },
        function (e) { if (ventana) ventana.close(); falta.textContent = e.message || 'Sin conexión.'; });
    };
    var fc = sec.querySelector('.manda-correo');
    sec.querySelector('[data-manda="correo"]').onclick = function () { fc.hidden = !fc.hidden; if (!fc.hidden) fc.querySelector('input').focus(); };
    fc.onsubmit = function (e) {
      e.preventDefault(); falta.textContent = '';
      var b = fc.querySelector('button'), v = fc.querySelector('input').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { falta.textContent = 'Revisa su correo.'; return; }
      b.disabled = true;
      envia('/citas/' + encodeURIComponent(c.folio) + '/correo', { metodo: 'POST', body: { correo: v } }).then(function (x) {
        b.disabled = false;
        if (x.status === 401) return salir(false);
        if (x.status !== 200) { falta.textContent = x.d.error || 'No se pudo'; return; }
        c.correo = v; fc.hidden = true; toast('Listo: le mandamos su cita a ' + v);
      }, function () { b.disabled = false; falta.textContent = 'Sin conexión.'; });
    };
    sec.querySelector('[data-manda="qr"]').onclick = function () {
      var caja = sec.querySelector('.manda-qr'), b = this;
      if (!caja.hidden) { caja.hidden = true; return; }
      falta.textContent = ''; b.disabled = true;
      pideEnlace().then(function (l) {
        b.disabled = false; caja.hidden = false;
        caja.innerHTML = '<div class="qr-img" role="img" aria-label="Código QR de la cita de ' + esc(c.nombre) + '">' + qrSvg(l) + '</div>' +
          '<span>Con la cámara de su celular: se abre su cita y queda guardada ahí.</span><button class="btn" type="button" data-manda="grande">Verlo en grande</button>';
        caja.querySelector('[data-manda="grande"]').onclick = function () { qrGrande(l, c.nombre, 'Escanea con tu cámara: tu cita queda guardada en tu celular.'); };
      }, function (e) { b.disabled = false; falta.textContent = e.message || 'Sin conexión.'; });
    };
  }
  // Un código QR como dibujo (SVG), con la librería qr.js (MIT, sin conexión a nada)
  function qrSvg(texto, nivel) {
    var q = qrcode(0, nivel || 'M'); q.addData(texto); q.make();
    var n = q.getModuleCount(), m = 4, d = '';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.isDark(y, x)) d += 'M' + (x + m) + ' ' + (y + m) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * m) + ' ' + (n + 2 * m) + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#161412"/></svg>';
  }
  // En grande, para voltear la pantalla hacia la clienta
  function qrGrande(texto, titulo, sub) {
    var v = document.createElement('div'); v.className = 'qr-grande'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', 'Código QR');
    v.innerHTML = '<span class="etq">' + esc(perfil.nombre) + '</span><b>' + esc(titulo) + '</b><div class="qr-img">' + qrSvg(texto) + '</div><span>' + esc(sub) + '</span>' +
      '<button type="button" class="btn">Cerrar</button>';
    var cierra = function () { v.remove(); document.removeEventListener('keydown', tecla, true); };
    var tecla = function (e) { if (e.key === 'Escape') { e.stopPropagation(); cierra(); } };
    v.querySelector('button').onclick = cierra; document.addEventListener('keydown', tecla, true);
    document.body.appendChild(v); v.querySelector('button').focus();
  }

  // ───── Tu código QR: el cartel para el local (imprimir o PDF), en pantalla o como imagen para redes ─────
  // Lleva a la página con ?de=qr: las citas que llegan así se cuentan, para ver si el cartel funciona.
  var qrOp = { tam: 'carta', color: 'oro' };
  try { var g = JSON.parse(localStorage.getItem('agenda:qr:' + ID) || '{}'); if (g.tam) qrOp.tam = g.tam; if (g.color) qrOp.color = g.color; qrOp.pie = String(g.pie || '').slice(0, 90); } catch (e) {}
  var qrDatos = null;
  function htmlQr() {
    if (!perfil.pagina) return '<p class="vacio">Tu agenda todavía no tiene página conectada. Escríbele a Solida y te la conectamos.</p>';
    var chip = function (attr, v, txt, sel) { return '<button type="button" class="chip" ' + attr + '="' + v + '" aria-pressed="' + (sel === v) + '">' + txt + '</button>'; };
    return '<div class="qr-vista"><div class="qr-previa" aria-hidden="true"><div class="qr-hoja-previa" id="qrPrevia"></div></div>' +
      '<div class="qr-opciones"><div class="campo-h"><span class="etq">Tamaño</span><div class="chips" role="group" aria-label="Tamaño">' +
      chip('data-qrtam', 'carta', 'Cartel · carta', qrOp.tam) + chip('data-qrtam', 'media', 'Para el mostrador · 2 por hoja', qrOp.tam) + chip('data-qrtam', 'tarjetas', 'Tarjetitas · 8 por hoja', qrOp.tam) + '</div></div>' +
      '<div class="campo-h"><span class="etq">Colores</span><div class="chips" role="group" aria-label="Colores">' +
      chip('data-qrcolor', 'oro', 'Negro y dorado', qrOp.color) + chip('data-qrcolor', 'blanco', 'Blanco y negro (gasta menos tinta)', qrOp.color) + '</div></div>' +
      '<div class="campo-h"><label class="etq" for="qrPie">Abajo del cartel (opcional)</label><input class="campo" id="qrPie" maxlength="90" placeholder="Tu dirección, tu horario o tu WhatsApp" value="' + esc(qrOp.pie || '') + '"></div>' +
      '<div class="qr-botones"><button type="button" class="btn negro" id="qrImprime">Imprimir o guardar PDF</button><button type="button" class="btn" id="qrPantalla">Mostrar en pantalla</button>' +
      '<button type="button" class="btn" id="qrImagen">Imagen para redes</button><button type="button" class="btn" id="qrCopia">Copiar el enlace</button></div>' +
      '<p class="nota" style="text-align:left">Al imprimir elige tu impresora o «Guardar como PDF». El código nunca cambia: si lo imprimes hoy, sirve para siempre.</p>' +
      '<div class="cifras qr-cifras" id="qrCifras"></div></div></div>';
  }
  function qrUrl() { return qrDatos ? qrDatos.url : perfil.pagina + (perfil.pagina.indexOf('?') >= 0 ? '&' : '?') + 'de=qr'; }
  function guardaQrOp() { try { localStorage.setItem('agenda:qr:' + ID, JSON.stringify(qrOp)); } catch (e) {} }
  function ataQr() {
    if (!perfil.pagina) return;
    var previa = function () { var p = document.getElementById('qrPrevia'); if (p) { p.className = 'qr-hoja-previa ' + qrOp.tam; p.innerHTML = hojaCartel(); } };
    var cifras = function () {
      var c = document.getElementById('qrCifras'); if (!c || !qrDatos) return;
      c.innerHTML = '<div class="cifra"><b>' + qrDatos.delQr + '</b><span>apartaron desde tu QR este mes</span></div><div class="cifra"><b>' + qrDatos.nuevas + '</b><span>' + (qrDatos.nuevas === 1 ? 'es clienta nueva' : 'son clientas nuevas') + '</span></div>' +
        '<div class="cifra"><b>' + qrDatos.conApp + '</b><span>tienen tus avisos en su celular</span></div>';
    };
    previa(); cifras();
    raiz.querySelectorAll('[data-qrtam]').forEach(function (b) { b.onclick = function () { qrOp.tam = b.getAttribute('data-qrtam'); guardaQrOp(); raiz.querySelectorAll('[data-qrtam]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); previa(); }; });
    raiz.querySelectorAll('[data-qrcolor]').forEach(function (b) { b.onclick = function () { qrOp.color = b.getAttribute('data-qrcolor'); guardaQrOp(); raiz.querySelectorAll('[data-qrcolor]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); previa(); }; });
    var pieIn = document.getElementById('qrPie');
    pieIn.oninput = function () { qrOp.pie = pieIn.value.slice(0, 90); guardaQrOp(); previa(); };
    document.getElementById('qrImprime').onclick = imprimeCartel;
    document.getElementById('qrPantalla').onclick = function () { qrGrande(qrUrl(), 'Aparta tu próxima cita', 'Escanea con la cámara de tu celular: eliges servicio, día y hora, y listo.'); };
    document.getElementById('qrImagen').onclick = imagenRedes;
    document.getElementById('qrCopia').onclick = function () {
      var t = qrUrl(), ok = function () { toast('Enlace copiado'); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(ok, function () { prompt('Copia este enlace:', t); }); else prompt('Copia este enlace:', t);
    };
    if (!qrDatos) {
      if (DEMO) { qrDatos = { url: qrUrl(), delQr: 12, nuevas: 7, conApp: 18 }; cifras(); return; }
      api('/qr').then(function (x) { if (x.status === 401) return salir(false); if (x.status === 200) { qrDatos = x.d; cifras(); } });
    }
  }
  // Un cartel (las tres medidas usan la misma pieza; cambian el acomodo y el tamaño)
  function cartel(tam) {
    var linea = String(perfil.pagina).replace(/^https?:\/\//, '').replace(/\/$/, '');
    var qr = '<div class="ct-qr"><div class="qr-img">' + qrSvg(qrUrl(), 'H') + '</div><span class="ct-sello-qr">' + esc(iniciales(perfil.nombre)) + '</span></div>';
    if (tam === 'tarjetas') return '<div class="ct ct-tarjeta">' + qr + '<div class="ct-txt"><span class="ct-neg">' + esc(perfil.nombre) + '</span><b>Aparta tu cita desde tu celular</b><span class="ct-pasos">Escanea · elige · listo</span></div></div>';
    var pasos = '<div class="ct-pasos3"><div><i>1</i><b>Escanea</b><span>Con la cámara de tu celular, sin descargar nada.</span></div><div><i>2</i><b>Elige</b><span>Servicio, día y hora libre. Al momento.</span></div>' +
      '<div><i>3</i><b>Listo</b><span>Guárdala como app y te recordamos tu cita.</span></div></div>';
    return '<div class="ct ct-' + tam + '"><div class="ct-marco"><span class="ct-sello">' + esc(iniciales(perfil.nombre)) + '</span><span class="ct-neg">' + esc(perfil.nombre) + '</span>' +
      '<b class="ct-tit">Aparta tu próxima cita <i>desde tu celular</i></b>' + qr + pasos + '<span class="ct-hueco"></span>' +
      '<div class="ct-pie"><span>' + esc(qrOp.pie || '') + '</span><span>' + esc(linea) + '</span></div></div></div>';
  }
  function hojaCartel() {
    var n = qrOp.tam === 'carta' ? 1 : qrOp.tam === 'media' ? 2 : 8, h = '';
    for (var i = 0; i < n; i++) h += cartel(qrOp.tam);
    return '<div class="ct-hoja ' + qrOp.tam + ' ' + qrOp.color + '">' + h + '</div>';
  }
  function imprimeCartel() {
    var v = document.getElementById('impresion'); if (v) v.remove();
    v = document.createElement('div'); v.id = 'impresion'; v.innerHTML = hojaCartel();
    document.body.appendChild(v); document.body.classList.add('imprimiendo');
    var fin = function () { document.body.classList.remove('imprimiendo'); var x = document.getElementById('impresion'); if (x) x.remove(); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(function () { window.print(); }, 60);
  }
  // Imagen de 1080 × 1350 (la medida de una publicación) para subirla a redes o mandarla por WhatsApp
  function imagenRedes() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var x = cv.getContext('2d'), oro = qrOp.color === 'oro', fondo = oro ? '#161412' : '#ffffff', tinta = oro ? '#f7f3ec' : '#161412', acento = oro ? '#c9a96e' : '#161412';
    var serif = '"Cormorant Garamond", Georgia, serif', sans = 'Jost, Helvetica, Arial, sans-serif';
    x.fillStyle = fondo; x.fillRect(0, 0, W, H);
    x.strokeStyle = acento; x.lineWidth = 3; x.strokeRect(48, 48, W - 96, H - 96);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.beginPath(); x.arc(W / 2, 190, 64, 0, Math.PI * 2); x.stroke();
    x.fillStyle = acento; x.font = '600 56px ' + serif; x.fillText(iniciales(perfil.nombre), W / 2, 194);
    x.font = '500 26px ' + sans; x.fillText(perfil.nombre.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, 300);
    x.fillStyle = tinta; x.font = '500 76px ' + serif; x.fillText('Aparta tu próxima cita', W / 2, 395);
    x.font = 'italic 500 76px ' + serif; x.fillStyle = oro ? '#e9d3a6' : '#161412'; x.fillText('desde tu celular', W / 2, 475);
    var q = qrcode(0, 'H'); q.addData(qrUrl()); q.make();
    var n = q.getModuleCount(), lado = 470, cel = Math.floor(lado / (n + 8)), real = cel * (n + 8), x0 = (W - real) / 2, y0 = 560;
    x.fillStyle = '#ffffff'; x.fillRect(x0, y0, real, real);
    x.fillStyle = '#161412';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect(x0 + (c + 4) * cel, y0 + (r + 4) * cel, cel, cel);
    var cx = W / 2, cy = y0 + real / 2, rr = real * 0.11;
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, rr + 8, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#161412'; x.beginPath(); x.arc(cx, cy, rr, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#c9a96e'; x.font = '600 ' + Math.round(rr * 0.9) + 'px ' + serif; x.fillText(iniciales(perfil.nombre), cx, cy + 2);
    x.fillStyle = tinta; x.font = '400 34px ' + sans; x.fillText('Escanea · elige · listo', W / 2, y0 + real + 70);
    x.fillStyle = oro ? '#c9bfb1' : '#6b6157'; x.font = '400 28px ' + sans;
    x.fillText(String(perfil.pagina).replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, H - 120);
    if (qrOp.pie) x.fillText(qrOp.pie, W / 2, H - 165);
    var a = document.createElement('a'); a.download = 'codigo-qr-' + ID + '.png'; a.href = cv.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
    toast('Listo: se descargó la imagen');
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
        if (x.status === 401) return salir(false);
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
          if (x.status === 401) return salir(false);
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
  // ───── la lista de servicios del negocio (para apartar eligiendo, sin escribir) ─────
  function cartera() { return perfil.servicios || {}; }
  function listaServicios() { return cartera().servicios || cartera().lista || []; }
  function variantesDe(id) { return (cartera().variantes || []).filter(function (v) { return v.servicio === id; }); }
  function largosDe(s) { var c = cartera(); return s && (c.largos || []).length && (c.largosEn || []).indexOf(s.cat) >= 0 ? c.largos : []; }
  function chipsDuracion(sel) {
    var l = DURACIONES.indexOf(sel) < 0 ? DURACIONES.concat([sel]).sort(function (a, b) { return a - b; }) : DURACIONES;
    return l.map(function (m) { return '<button type="button" class="chip" data-dur="' + m + '" aria-pressed="' + (m === sel) + '">' + esc(duracion(m)) + '</button>'; }).join('');
  }
  function campoServicio() {
    var l = listaServicios();
    if (!l.length) return '<label class="etq" for="ncServ">Servicio</label><input class="campo" id="ncServ" maxlength="80" required placeholder="Gelish, corte, consulta…">' +
      '<button type="button" class="enlace" id="ncEditaServ">Guardar mi lista de servicios para elegir sin escribir</button>';
    var grupos = [], porCat = {};
    l.forEach(function (s, i) { var c = s.cat || ''; if (!porCat[c]) { porCat[c] = []; grupos.push(c); } porCat[c].push('<option value="' + i + '">' + esc(s.nombre + ' · ' + duracion(s.min) + (s.precio ? ' · ' + (s.desde ? 'desde ' : '') + pesos(s.precio) : '')) + '</option>'); });
    var ops = grupos.map(function (c) { return c && grupos.length > 1 ? '<optgroup label="' + esc(c) + '">' + porCat[c].join('') + '</optgroup>' : porCat[c].join(''); }).join('');
    return '<label class="etq" for="ncServSel">Servicio</label><select class="campo" id="ncServSel" required><option value="">Elige el servicio…</option>' + ops + '<option value="otro">Otro (escribirlo)</option></select>' +
      '<input class="campo" id="ncServ" maxlength="80" placeholder="¿Qué servicio?" aria-label="Otro servicio" hidden>' +
      '<button type="button" class="enlace" id="ncEditaServ">Editar mis servicios y precios</button>';
  }
  function servicioElegido() {
    var sel = document.getElementById('ncServSel'), otro = document.getElementById('ncServ');
    if (!sel) return otro.value.trim();
    if (sel.value === 'otro') return otro.value.trim();
    var s = listaServicios()[+sel.value]; return s ? s.nombre : '';
  }
  // «Mis servicios»: la cartera entera (servicios, diseños, largos y anticipo). Lo que ella guarde aquí es lo que vale
  // desde ese momento: al apartar se pone siempre su precio más reciente, y su página también lo toma.
  function abreServicios(luego) {
    var c0 = cartera(), aprendidos = c0.aprendidos && (c0.servicios || c0.lista || []).length;
    var c = { servicios: listaServicios().map(function (x) { return { id: x.id, nombre: x.nombre, cat: x.cat || '', min: x.min, precio: x.precio, desde: !!x.desde, quien: (x.quien || []).slice() }; }),
      variantes: (c0.variantes || []).map(function (x) { return { id: x.id, nombre: x.nombre, servicio: x.servicio, extra: x.extra, extraMin: x.extraMin || 0 }; }),
      largos: (c0.largos || []).map(function (x) { return { nombre: x.nombre, extra: x.extra }; }), largosEn: (c0.largosEn || []).slice(), anticipo: c0.anticipo || 0 };
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Mis servicios</h2>' + CERRAR + '</div>' +
      '<p class="nota" style="text-align:left;margin-top:2px">' + (aprendidos ? 'Ésta es la lista con lo que han apartado en tu página. Ajústala y guárdala.' :
        'Lo que guardes aquí vale desde ese momento: al apartar se pone solo tu precio más reciente, y tu página también lo toma. Las citas que ya estaban no cambian.') + '</p>' +
      '<div id="svCuerpo"></div><p class="falta" id="svFalta" role="alert"></p><button type="button" class="btn negro bloque grande" id="svOk">Guardar</button>');
    var cuerpo = hoja.querySelector('#svCuerpo');
    var dinero = function (v) { return +String(v || '').replace(/\D/g, '') || 0; };
    var cats = function () { var l = []; c.servicios.forEach(function (x) { if (x.cat && l.indexOf(x.cat) < 0) l.push(x.cat); }); return l; };
    var opDur = function (sel, extra) { var l = (extra ? [0, 15, 30, 45, 60] : DURACIONES).slice(); if (l.indexOf(sel) < 0) l.push(sel); return l.sort(function (a, b) { return a - b; }).map(function (m) { return '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + (extra ? (m ? '+' + esc(duracion(m)) : 'sin tiempo extra') : esc(duracion(m))) + '</option>'; }).join(''); };
    var lee = function () {
      c.servicios.forEach(function (x, i) {
        var q = function (a) { return cuerpo.querySelector('[' + a + '="' + i + '"]'); };
        if (!q('data-sn')) return;
        x.nombre = q('data-sn').value.trim(); x.min = +q('data-sm').value; x.precio = dinero(q('data-sp').value); x.cat = q('data-sc').value; x.desde = q('data-sd').checked;
      });
      c.variantes.forEach(function (x, i) {
        var q = function (a) { return cuerpo.querySelector('[' + a + '="' + i + '"]'); };
        if (!q('data-vn')) return;
        x.nombre = q('data-vn').value.trim(); x.servicio = q('data-vs').value; x.extra = dinero(q('data-vp').value); x.extraMin = +q('data-vm').value;
      });
      c.largos.forEach(function (x, i) { var n = cuerpo.querySelector('[data-ln="' + i + '"]'); if (n) { x.nombre = n.value.trim(); x.extra = dinero(cuerpo.querySelector('[data-lp="' + i + '"]').value); } });
      var a = cuerpo.querySelector('#svAnt'); if (a) c.anticipo = dinero(a.value);
    };
    var pinta = function () {
      var eq = equipo(), h = '<section class="sv-sec"><span class="etq">Servicios</span>';
      h += c.servicios.map(function (x, i) {
        if (!x.id) x.id = 'n' + Date.now().toString(36) + i;
        return '<div class="sv-fila"><input class="campo" data-sn="' + i + '" maxlength="80" value="' + esc(x.nombre) + '" placeholder="Nombre del servicio" aria-label="Nombre del servicio">' +
          '<button type="button" class="cerrar" data-sq="' + i + '" aria-label="Quitar ' + esc(x.nombre) + '">✕</button>' +
          '<select class="campo" data-sm="' + i + '" aria-label="Cuánto dura">' + opDur(x.min) + '</select>' +
          '<input class="campo" data-sp="' + i + '" inputmode="numeric" maxlength="7" value="' + (x.precio ? '$' + x.precio : '') + '" placeholder="$ precio" aria-label="Precio">' +
          '<select class="campo sv-cat" data-sc="' + i + '" aria-label="Grupo"><option value="">Sin grupo</option>' + cats().concat(x.cat && cats().indexOf(x.cat) < 0 ? [x.cat] : []).map(function (t) { return '<option' + (t === x.cat ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '<option value="__nuevo">+ Grupo nuevo…</option></select>' +
          '<label class="sv-desde"><input type="checkbox" data-sd="' + i + '"' + (x.desde ? ' checked' : '') + '> Precio «desde»</label>' +
          (eq.length > 1 ? '<div class="chips sv-quien" role="group" aria-label="Quién lo hace"><span>Lo hace:</span>' + [{ id: '', nombre: 'Cualquiera' }].concat(eq).map(function (p) {
            var on = p.id ? x.quien.indexOf(p.id) >= 0 : !x.quien.length;
            return '<button type="button" class="chip" data-sw="' + i + '|' + esc(p.id) + '" aria-pressed="' + on + '">' + esc(p.nombre) + '</button>';
          }).join('') + '</div>' : '') + '</div>';
      }).join('') + '<button type="button" class="btn bloque" id="svMas">+ Agregar servicio</button></section>';
      h += '<section class="sv-sec"><span class="etq">Diseños o variantes</span><p class="nota" style="text-align:left;margin:0">Van con un servicio y suman al precio (y al tiempo, si tardan más).</p>' +
        c.variantes.map(function (x, i) {
          return '<div class="sv-fila"><input class="campo" data-vn="' + i + '" maxlength="80" value="' + esc(x.nombre) + '" placeholder="Nombre del diseño" aria-label="Nombre del diseño">' +
            '<button type="button" class="cerrar" data-vq="' + i + '" aria-label="Quitar ' + esc(x.nombre) + '">✕</button>' +
            '<select class="campo" data-vs="' + i + '" aria-label="Para qué servicio">' + c.servicios.map(function (sv) { return '<option value="' + esc(sv.id) + '"' + (sv.id === x.servicio ? ' selected' : '') + '>' + esc(sv.nombre || 'Servicio sin nombre') + '</option>'; }).join('') + '</select>' +
            '<input class="campo" data-vp="' + i + '" inputmode="numeric" maxlength="7" value="' + (x.extra ? '$' + x.extra : '') + '" placeholder="+ $ extra" aria-label="Costo extra">' +
            '<select class="campo sv-cat" data-vm="' + i + '" aria-label="Tiempo extra">' + opDur(x.extraMin || 0, true) + '</select></div>';
        }).join('') + (c.servicios.length ? '<button type="button" class="btn bloque" id="svMasV">+ Agregar diseño</button>' : '') + '</section>';
      h += '<section class="sv-sec"><span class="etq">Largos o tamaños</span><p class="nota" style="text-align:left;margin:0">Suman al precio en los grupos que elijas.</p>' +
        c.largos.map(function (x, i) {
          return '<div class="sv-fila sv-corta"><input class="campo" data-ln="' + i + '" maxlength="40" value="' + esc(x.nombre) + '" placeholder="Corto, medio, largo…" aria-label="Largo">' +
            '<input class="campo" data-lp="' + i + '" inputmode="numeric" maxlength="7" value="' + (x.extra ? '$' + x.extra : '') + '" placeholder="+ $ extra" aria-label="Costo extra">' +
            '<button type="button" class="cerrar" data-lq="' + i + '" aria-label="Quitar ' + esc(x.nombre) + '">✕</button></div>';
        }).join('') + '<button type="button" class="btn bloque" id="svMasL">+ Agregar largo</button>' +
        (c.largos.length && cats().length ? '<div class="chips" role="group" aria-label="En qué grupos aplican"><span class="sv-en">Aplican en:</span>' + cats().map(function (t) {
          return '<button type="button" class="chip" data-len="' + esc(t) + '" aria-pressed="' + (c.largosEn.indexOf(t) >= 0) + '">' + esc(t) + '</button>';
        }).join('') + '</div>' : '') + '</section>';
      h += '<section class="sv-sec"><label class="etq" for="svAnt">Anticipo para apartar</label><input class="campo" id="svAnt" inputmode="numeric" maxlength="7" value="' + (c.anticipo ? '$' + c.anticipo : '') + '" placeholder="$ (vacío si no pides)"></section>';
      cuerpo.innerHTML = h;
      var en = function (sel, f) { cuerpo.querySelectorAll(sel).forEach(function (b) { b.onclick = function () { lee(); f(b); pinta(); }; }); };
      en('[data-sq]', function (b) { var i = +b.getAttribute('data-sq'), id = c.servicios[i].id; c.servicios.splice(i, 1); c.variantes = c.variantes.filter(function (v) { return v.servicio !== id; }); });
      en('[data-vq]', function (b) { c.variantes.splice(+b.getAttribute('data-vq'), 1); });
      en('[data-lq]', function (b) { c.largos.splice(+b.getAttribute('data-lq'), 1); });
      en('[data-sw]', function (b) {
        var p = b.getAttribute('data-sw').split('|'), x = c.servicios[+p[0]];
        if (!p[1]) x.quien = []; else { var k = x.quien.indexOf(p[1]); if (k >= 0) x.quien.splice(k, 1); else x.quien.push(p[1]); }
      });
      en('[data-len]', function (b) { var t = b.getAttribute('data-len'), k = c.largosEn.indexOf(t); if (k >= 0) c.largosEn.splice(k, 1); else c.largosEn.push(t); });
      en('#svMas', function () { c.servicios.push({ id: '', nombre: '', cat: cats()[0] || '', min: 60, precio: 0, desde: false, quien: [] }); });
      en('#svMasV', function () { c.variantes.push({ id: '', nombre: '', servicio: c.servicios[0].id, extra: 0, extraMin: 0 }); });
      en('#svMasL', function () { c.largos.push({ nombre: '', extra: 0 }); });
      cuerpo.querySelectorAll('[data-sc]').forEach(function (s) {
        s.onchange = function () {
          if (s.value !== '__nuevo') return;
          var t = (prompt('Nombre del grupo nuevo (por ejemplo: Uñas, Pestañas, Cortes):') || '').trim().slice(0, 40);
          lee(); c.servicios[+s.getAttribute('data-sc')].cat = t; pinta();
        };
      });
    };
    pinta();
    document.getElementById('svOk').onclick = function () {
      lee();
      var f = document.getElementById('svFalta'), b = this;
      var buenos = c.servicios.filter(function (x) { return x.nombre; });
      if (!buenos.length) { f.textContent = 'Agrega al menos un servicio.'; return; }
      b.disabled = true; f.textContent = '';
      envia('/servicios', { metodo: 'PUT', body: { servicios: buenos, variantes: c.variantes.filter(function (x) { return x.nombre; }), largos: c.largos.filter(function (x) { return x.nombre; }), largosEn: c.largosEn, anticipo: c.anticipo } }).then(function (x) {
        b.disabled = false;
        if (x.status === 401) return salir(false);
        if (x.status !== 200) { f.textContent = x.d.error || 'No se pudo guardar'; return; }
        perfil.servicios = x.d.cartera;
        toast('Listo: tus servicios quedaron guardados'); cierraHoja(); if (luego) luego();
      }, function () { b.disabled = false; f.textContent = 'Sin conexión.'; });
    };
  }

  function abreNuevaCita(d, pre) {
    pre = pre || {};
    var st = { min: 60, persona: pre.persona != null ? pre.persona : (equipo().length ? (personaSel || equipo()[0].id) : '') };
    var hoja = abreHoja('<div class="hoja-cab"><h2 class="titulo" id="hojaTit">Apartar una cita</h2>' + CERRAR + '</div>' +
      '<p class="nota" style="text-align:left;margin-top:2px">La que te pidieron por teléfono o en persona. Entra ya confirmada.</p>' +
      '<form id="fCita" novalidate><div class="campo-h"><label class="etq" for="ncNombre">Nombre</label><input class="campo" id="ncNombre" maxlength="60" autocomplete="off" required>' +
      '<label class="etq" for="ncTel">WhatsApp (10 dígitos)</label><input class="campo" id="ncTel" inputmode="tel" maxlength="14" autocomplete="off" required placeholder="844 123 4567"></div>' +
      '<div class="campo-h">' + campoServicio() + '<div id="ncExtras" class="nc-extras"></div>' +
      '<span class="etq">Dura</span><div class="chips" role="group" aria-label="Cuánto dura" id="ncDuras">' + chipsDuracion(st.min) + '</div>' +
      '<label class="etq" for="ncPrecio">Precio</label><input class="campo" id="ncPrecio" inputmode="numeric" maxlength="7" placeholder="$">' +
      (cartera().anticipo ? '<button type="button" class="chip" id="ncAnt" aria-pressed="false">Ya pagó su anticipo · ' + esc(pesos(cartera().anticipo)) + '</button>' : '') + '</div>' +
      '<div class="campo-h"><div class="dos"><label><span class="etq">Día</span><input class="campo" type="date" id="ncFecha" value="' + esc(pre.fecha || diaSel || d.hoy) + '" min="' + esc(d.hoy) + '"></label>' +
      '<label><span class="etq">Hora</span><select class="campo" id="ncHora">' + opcionesHora(hhmm(pre.ini != null ? pre.ini : 600), 360, 1380) + '</select></label></div></div>' +
      (equipo().length ? '<div class="campo-h"><span class="etq">¿Con quién?</span><div class="chips" role="group" aria-label="Con quién">' +
        equipo().map(function (x) { return '<button type="button" class="chip" data-con="' + esc(x.id) + '" aria-pressed="' + (x.id === st.persona) + '">' + esc(x.nombre) + '</button>'; }).join('') + '</div></div>' : '') +
      '<p class="falta" id="ncFalta" role="alert"></p><button class="btn negro bloque grande" id="ncOk">Apartar cita</button></form>');
    eligeEn(hoja, 'data-dur', function (m) { st.min = +m; });
    eligeEn(hoja, 'data-con', function (p) { st.persona = p; });
    // Al elegir un servicio salen sus diseños y largos; la duración, el precio (el más reciente de su cartera) y quién lo hace se ponen solos.
    // Si ella escribe otro precio a mano, se respeta.
    var sel = document.getElementById('ncServSel'), otro = document.getElementById('ncServ'), precioAuto = '';
    st.serv = null; st.vari = ''; st.largo = ''; st.ant = false;
    var recalcula = function () {
      var s = st.serv; if (!s) return;
      var v = variantesDe(s.id).filter(function (x) { return x.id === st.vari; })[0], l = largosDe(s).filter(function (x) { return x.nombre === st.largo; })[0];
      st.min = s.min + (v ? v.extraMin : 0);
      document.getElementById('ncDuras').innerHTML = chipsDuracion(st.min); eligeEn(hoja, 'data-dur', function (m) { st.min = +m; });
      var pr = document.getElementById('ncPrecio'), total = s.precio + (v ? v.extra : 0) + (l ? l.extra : 0);
      if (!pr.value || pr.value === precioAuto) { pr.value = total ? '$' + total : ''; precioAuto = pr.value; }
    };
    var pintaExtras = function () {
      var s = st.serv, x = document.getElementById('ncExtras'), h = '';
      if (s) {
        var vs = variantesDe(s.id), ls = largosDe(s);
        if (vs.length) h += '<span class="etq">Diseño</span><div class="chips" role="group" aria-label="Diseño">' + [{ id: '', nombre: 'Sin diseño', extra: 0 }].concat(vs).map(function (v) {
          return '<button type="button" class="chip" data-vari="' + esc(v.id) + '" aria-pressed="' + (v.id === st.vari) + '">' + esc(v.nombre) + (v.extra ? ' <small>+' + esc(pesos(v.extra)) + '</small>' : '') + '</button>';
        }).join('') + '</div>';
        if (ls.length) h += '<span class="etq">Largo</span><div class="chips" role="group" aria-label="Largo">' + ls.map(function (l) {
          return '<button type="button" class="chip" data-largo="' + esc(l.nombre) + '" aria-pressed="' + (l.nombre === st.largo) + '">' + esc(l.nombre) + (l.extra ? ' <small>+' + esc(pesos(l.extra)) + '</small>' : '') + '</button>';
        }).join('') + '</div>';
      }
      x.innerHTML = h;
      eligeEn(x, 'data-vari', function (v) { st.vari = v; recalcula(); });
      eligeEn(x, 'data-largo', function (v) { st.largo = v; recalcula(); });
    };
    if (sel) sel.onchange = function () {
      var s = listaServicios()[+sel.value];
      otro.hidden = sel.value !== 'otro'; if (!otro.hidden) otro.focus();
      st.serv = s || null; st.vari = ''; st.largo = s && largosDe(s).length ? largosDe(s)[0].nombre : '';
      pintaExtras(); if (!s) return;
      // Si sólo una persona del equipo hace ese servicio, ya queda elegida
      var q = (s.quien || []).filter(function (id) { return equipo().some(function (p) { return p.id === id; }); });
      if (q.length === 1) { st.persona = q[0]; hoja.querySelectorAll('[data-con]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-con') === q[0]); }); }
      recalcula();
    };
    var ant = document.getElementById('ncAnt'); if (ant) ant.onclick = function () { st.ant = !st.ant; ant.setAttribute('aria-pressed', st.ant); };
    var ed = document.getElementById('ncEditaServ'); if (ed) ed.onclick = function () { abreServicios(function () { abreNuevaCita(d, pre); }); };
    document.getElementById('fCita').onsubmit = function (e) {
      e.preventDefault();
      var falta = document.getElementById('ncFalta');
      var c = { nombre: document.getElementById('ncNombre').value.trim(), tel: document.getElementById('ncTel').value.replace(/\D/g, '').slice(-10),
        servicio: servicioElegido(), precio: +String(document.getElementById('ncPrecio').value).replace(/\D/g, '') || 0,
        diseno: st.serv && st.vari ? (variantesDe(st.serv.id).filter(function (v) { return v.id === st.vari; })[0] || {}).nombre || '' : '',
        largo: st.serv ? st.largo : '', anticipo: st.ant ? cartera().anticipo : 0,
        fecha: document.getElementById('ncFecha').value, hora: document.getElementById('ncHora').value, min: st.min, persona: st.persona };
      falta.textContent = '';
      if (c.nombre.length < 2) { falta.textContent = 'Escribe su nombre.'; return; }
      if (c.tel.length !== 10) { falta.textContent = 'Su WhatsApp debe tener 10 dígitos (para recordarle su cita).'; return; }
      if (!c.servicio) { falta.textContent = listaServicios().length ? 'Elige el servicio.' : 'Escribe qué servicio es.'; return; }
      if (!c.fecha) { falta.textContent = 'Elige el día.'; return; }
      var b = document.getElementById('ncOk'); b.disabled = true;
      envia('/citas', { metodo: 'POST', body: c }).then(function (x) {
        if (x.status === 401) return salir(false);
        if (x.status !== 201) { falta.textContent = x.status === 409 ? 'A esa hora ya hay otra cita' + (c.persona ? ' con ' + nombreDe(c.persona) : '') + '. Elige otra hora.' : (x.d.error || 'No se pudo'); b.disabled = false; return; }
        var msg = 'Hola ' + c.nombre + ' 👋 Quedó tu cita en ' + perfil.nombre + ' el ' + fechaLarga(c.fecha) + ' a las ' + hora12(aMin(c.hora)) + ' (' + c.servicio + '). ¡Te esperamos!';
        diaSel = c.fecha;
        // Con página conectada: se abre su cita con «Mándale su cita» (WhatsApp, correo o el QR para que la escanee ahí mismo).
        if (perfil.pagina && x.d.folio) { recienApartada = x.d.folio; citaPendiente = x.d.folio; cierraHoja(); carga(); return; }
        carga();
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
    var s = document.getElementById('salir'); if (s) s.onclick = function () { if (confirm('¿Salir de tu agenda en ' + este + '?')) salir(); };
    var sg = document.getElementById('seguridad'); if (sg) sg.onclick = abreSeguridad;
    var ms = document.getElementById('misServ'); if (ms) ms.onclick = function () { abreServicios(); };
    raiz.querySelectorAll('[data-vista]').forEach(function (b) {
      b.onclick = function () { irA(b.getAttribute('data-vista')); };
    });
    raiz.querySelectorAll('[data-dia]').forEach(function (b) { if (b.classList.contains('dia-chip')) b.onclick = function () { diaSel = b.getAttribute('data-dia'); pinta(ultimo); }; });
    raiz.querySelectorAll('[data-ir]').forEach(function (b) { b.onclick = function () { diaSel = b.getAttribute('data-ir'); irA('hoy'); }; });
    var nc = document.getElementById('nuevaCita'); if (nc) nc.onclick = function () { abreNuevaCita(ultimo); };
    raiz.querySelectorAll('[data-lado]').forEach(function (b) {
      var q = b.getAttribute('data-lado');
      b.onclick = q === 'avisos' ? abreNotificaciones : q === 'seguridad' ? abreSeguridad : q === 'servicios' ? function () { abreServicios(); } : q === 'nueva' ? function () { abreNuevaCita(ultimo); }
        : function () { if (confirm('¿Salir de tu agenda en ' + este + '?')) salir(); };
    });
    var av = document.getElementById('abreAvisos'); if (av) av.onclick = abreNotificaciones;
    pintaCuenta();
    var atr = document.getElementById('atraveso'); if (atr) atr.onclick = function () { abreMover(ultimo); };
    raiz.querySelectorAll('[data-detalle]').forEach(function (b) { b.onclick = function () { abreCita(b.getAttribute('data-detalle')); }; });
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
          if (x.status === 401) return salir(false);
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
    history.replaceState(null, '', v === 'hoy' ? location.pathname : '#' + v);
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
    if (ruta === '/servicios') return { status: 200, d: { cartera: Object.assign({}, b, { lista: b.servicios, aprendidos: false }) } };
    if ((m = ruta.match(/^\/citas\/(.+)\/enlace$/))) return { status: 200, d: { enlace: perfil.pagina + '?cita=' + m[1] + '&t=EJEMPLO' } };
    if ((m = ruta.match(/^\/citas\/(.+)\/correo$/))) return { status: 200, d: { ok: true } };
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

  // ───── versión nueva: si la publicamos mientras la tiene abierta, se le avisa (sólo eso; no se le dice nada al actualizar) ─────
  var MI_VERSION = (document.querySelector('meta[name="version"]') || {}).content || '';
  var versionAplazada = 0;
  function revisaVersion() {
    if (!MI_VERSION || document.visibilityState !== 'visible' || Date.now() < versionAplazada || document.getElementById('nuevaVersion')) return;
    fetch('/_app/version.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (x) {
      if (!x.v || x.v === MI_VERSION || document.getElementById('nuevaVersion')) return;
      var b = document.createElement('div'); b.id = 'nuevaVersion'; b.className = 'nueva-version'; b.setAttribute('role', 'status');
      b.innerHTML = '<span>Hay una nueva versión disponible</span><button type="button" class="btn oro" id="nvSi">Actualizar</button><button type="button" class="nv-no" id="nvNo" aria-label="Ahora no">✕</button>';
      document.body.appendChild(b);
      document.getElementById('nvSi').onclick = function () { location.reload(); };
      document.getElementById('nvNo').onclick = function () { b.remove(); versionAplazada = Date.now() + 3600000; };
    }, function () {});
  }
  setInterval(revisaVersion, 5 * 60000);
  document.addEventListener('visibilitychange', revisaVersion);
  setTimeout(revisaVersion, 15000);

  // ───── arranque ─────
  if (DEMO) {
    perfil = { nombre: 'Atelier Mía', equipo: [{ id: 'mia', nombre: 'Mía' }, { id: 'fer', nombre: 'Fernanda' }], pagina: 'https://solidaaplicaciones.com/ejemplos/unas/avanzado/',
      servicios: { lista: [{ nombre: 'Gelish en manos', min: 60, precio: 280, cat: 'Uñas' }, { nombre: 'Acrílico esculpido', min: 120, precio: 450, cat: 'Uñas' }, { nombre: 'Pedicure spa con gelish', min: 75, precio: 380, cat: 'Uñas' },
        { nombre: 'Pestañas clásicas', min: 120, precio: 650, cat: 'Pestañas' }, { nombre: 'Volumen ruso', min: 150, precio: 850, cat: 'Pestañas' }, { nombre: 'Lifting de pestañas', min: 60, precio: 400, cat: 'Pestañas' },
        { nombre: 'Diseño de cejas', min: 45, precio: 250, cat: 'Cejas' }].map(function (x) { x.id = x.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'); x.quien = x.cat === 'Pestañas' ? ['fer'] : x.cat === 'Uñas' ? ['mia'] : []; return x; }),
        variantes: [{ id: 'french', nombre: 'French clásico', servicio: 'gelish-en-manos', extra: 40, extraMin: 0 }, { id: 'perla', nombre: 'Chrome perla', servicio: 'gelish-en-manos', extra: 80, extraMin: 15 }, { id: 'baby', nombre: 'Baby boomer', servicio: 'acrilico-esculpido', extra: 120, extraMin: 30 }],
        largos: [{ nombre: 'Corto', extra: 0 }, { nombre: 'Medio', extra: 0 }, { nombre: 'Largo', extra: 50 }], largosEn: ['Uñas'], anticipo: 100, aprendidos: false } };
    perfil.servicios.lista = perfil.servicios.servicios = perfil.servicios.lista;
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
      if (!token) pintaEntrar(); else if (conCandado()) abreConCandado(); else carga();
    }).catch(function () {
      raiz.innerHTML = '<div class="envoltura cuerpo"><p class="vacio">No se pudo abrir tu agenda. Revisa tu conexión e inténtalo de nuevo.</p></div>';
    });
  }
  setInterval(function () {
    if (!token || DEMO || document.visibilityState !== 'visible' || document.getElementById('velo') || document.getElementById('candado')) return;
    var a = document.activeElement;
    if (a && a.matches && a.matches('input,select,textarea')) return;
    carga();
  }, 60000);
})();
