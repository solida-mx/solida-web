/* Plantilla de restaurante: pone los datos de datos.js en la página.
   - data-negocio="campo"        → el texto de ese campo (nombre, giro, eslogan, direccion…)
   - data-negocio="nombreAmp"    → el nombre con el «&» resaltado (si lo tiene)
   - data-negocio="distintivos"  → los chips de distintivos
   - data-negocio-wa="mensaje"   → un enlace de WhatsApp al negocio con ese mensaje ({nombre} se sustituye)
   - data-negocio-mapa           → un enlace a la ubicación
   Y deja listos NEGOCIO.esc() y NEGOCIO.pesos() para el resto de la página. */
(function () {
  var N = window.NEGOCIO;
  if (!N) { console.error('Falta datos.js'); return; }
  var esc = N.esc = function (x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  N.pesos = function (n) { return '$' + Number(n).toLocaleString('es-MX'); };
  N.wa = function (mensaje) { return 'https://wa.me/' + N.whatsapp + (mensaje ? '?text=' + encodeURIComponent(mensaje.replace(/\{nombre\}/g, N.nombre)) : ''); };

  function rellena() {
    document.querySelectorAll('[data-negocio]').forEach(function (el) {
      var c = el.getAttribute('data-negocio');
      if (c === 'nombreAmp') {
        var i = N.nombre.indexOf('&');
        el.innerHTML = i < 0 ? esc(N.nombre)
          : esc(N.nombre.slice(0, i).trim()) + ' <span class="amp">&amp;</span> ' + esc(N.nombre.slice(i + 1).trim());
      } else if (c === 'distintivos') {
        el.innerHTML = (N.distintivos || []).map(function (d) { return '<span class="chip">' + esc(d) + '</span>'; }).join('');
      } else if (N[c] != null) {
        el.textContent = N[c];
      }
    });
    document.querySelectorAll('[data-negocio-wa]').forEach(function (a) { a.href = N.wa(a.getAttribute('data-negocio-wa')); });
    document.querySelectorAll('[data-negocio-mapa]').forEach(function (a) { a.href = N.mapa; });
    document.title = document.title.replace('{nombre}', N.nombre);
  }
  rellena();
})();
