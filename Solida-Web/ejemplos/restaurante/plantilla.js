/* Plantilla de restaurante: pone los datos de datos.js en la página.
   - data-negocio="campo"        → el texto de ese campo (nombre, giro, eslogan, direccion…)
   - data-negocio="nombreAmp"    → el nombre con el «&» resaltado (si lo tiene)
   - data-negocio="distintivos"  → los chips de distintivos
   - data-negocio-wa="mensaje"   → un enlace de WhatsApp al negocio con ese mensaje ({nombre} se sustituye)
   - data-negocio-mapa           → un enlace a la ubicación
   - data-negocio-portada        → pone la foto de portada de fondo (si hay)
   - data-negocio="galeria" | "favoritos" | "resenas" → fotos del local, platillos con foto y el botón de reseñas de Google.
     Si el negocio no tiene ese dato, el hueco se quita.
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
    ponFotos();
  }

  // ───── fotos y reseñas: sólo salen si el negocio las tiene ─────
  var ESTRELLA = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  var conFoto = function (x) { return !!(x && x.foto); };
  N.imgHtml = function (src, alt) { return '<img src="' + esc(src) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async">'; };
  function ponFotos() {
    if (!document.getElementById('estilo-fotos')) {
      var st = document.createElement('style'); st.id = 'estilo-fotos';
      st.textContent = '.con-portada{background-size:cover!important;background-position:center!important}.top.con-portada{padding-top:150px;padding-bottom:34px}' +
        '.galeria-n{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 0 10px;scrollbar-width:none}.galeria-n::-webkit-scrollbar{display:none}' +
        '.galeria-n img{flex:none;width:78%;max-width:340px;aspect-ratio:3/2;object-fit:cover;border-radius:18px;scroll-snap-align:start}' +
        '.favs-n{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.favs-n figure{margin:0;border-radius:16px;overflow:hidden;background:var(--card,#fffdf9);border:1px solid var(--line,#e3d6c3)}' +
        '.favs-n img{width:100%;aspect-ratio:1;object-fit:cover}.favs-n figcaption{padding:8px 10px 10px;font-weight:700;font-size:13.5px;display:flex;justify-content:space-between;gap:6px}' +
        '.favs-n figcaption span{color:var(--ember,#d5622d);white-space:nowrap}' +
        '.dish-img img,.dimg img{width:100%;height:100%;object-fit:cover;border-radius:inherit}' +
        '.resena-n{margin:26px 0 0;padding:22px 18px;border-radius:22px;background:var(--card,#fffdf9);border:1px solid var(--line,#e3d6c3);text-align:center}' +
        '.resena-n h3{font-family:Fraunces,Georgia,serif;font-size:22px;margin:0}.resena-n p{margin:6px 0 14px;font-size:13.5px;color:var(--muted,#7c6c5f)}' +
        '.resena-n .es{display:flex;gap:6px;justify-content:center;color:#c99a4b;margin-bottom:6px}' +
        '.resena-n a{display:flex;align-items:center;justify-content:center;min-height:50px;border-radius:999px;background:var(--char,#1c1512);color:#fff;font-weight:800;text-decoration:none}' +
        '.aviso-n{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99;background:#1c1512;color:#fff;padding:11px 16px;border-radius:12px;font-size:13.5px;max-width:calc(100% - 32px)}';
      document.head.appendChild(st);
    }
    document.querySelectorAll('[data-negocio-portada]').forEach(function (el) {
      if (!N.fotoPortada) return;
      el.classList.add('con-portada');
      el.style.background = 'linear-gradient(180deg,rgba(20,12,8,.45),rgba(20,12,8,.2) 40%,rgba(20,12,8,.9)),url("' + encodeURI(N.fotoPortada) + '")';
    });
    document.querySelectorAll('[data-negocio="galeria"]').forEach(function (el) {
      var g = (N.galeria || []).filter(Boolean);
      if (!g.length) { el.remove(); return; }
      el.innerHTML = '<div class="galeria-n">' + g.map(function (src, i) { return N.imgHtml(src, N.nombre + ' · foto ' + (i + 1)); }).join('') + '</div>';
    });
    document.querySelectorAll('[data-negocio="favoritos"]').forEach(function (el) {
      var favs = [];
      N.menu.forEach(function (c) { c.platillos.forEach(function (x) { if (conFoto(x)) favs.push(x); }); });
      favs = favs.slice(0, Number(el.getAttribute('data-max')) || 6);
      if (!favs.length) { el.remove(); return; }
      el.innerHTML = '<h2 style="font-family:Fraunces,Georgia,serif;font-size:22px;margin:0 0 12px">Nuestros favoritos</h2><div class="favs-n">' + favs.map(function (x) {
        return '<figure>' + N.imgHtml(x.foto, x.nombre) + '<figcaption>' + esc(x.nombre) + '<span>' + N.pesos(x.precio) + '</span></figcaption></figure>';
      }).join('') + '</div>';
    });
    document.querySelectorAll('[data-negocio="resenas"]').forEach(function (el) {
      if (!N.resenas && !N.ejemplo) { el.remove(); return; }
      el.innerHTML = '<div class="resena-n"><h3>¿Cómo te fue hoy?</h3><p>Tu opinión en Google nos ayuda a que más gente nos encuentre.</p><div class="es" aria-hidden="true">' +
        ESTRELLA + ESTRELLA + ESTRELLA + ESTRELLA + ESTRELLA + '</div><a href="' + esc(N.resenas || '#') + '"' + (N.resenas ? ' target="_blank" rel="noopener"' : ' data-sin-resena') + '>Califícanos en Google</a></div>';
      var a = el.querySelector('[data-sin-resena]');
      if (a) a.onclick = function (e) {
        e.preventDefault();
        var t = document.createElement('div'); t.className = 'aviso-n'; t.setAttribute('role', 'status');
        t.textContent = 'En tu página, este botón abre directo tu reseña en Google.'; document.body.appendChild(t);
        setTimeout(function () { t.remove(); }, 2600);
      };
    });
  }
  rellena();
})();
