/* Franja «Ejemplo de Solida»: la pone el Worker (worker.js) en todas las páginas de /ejemplos/.
   Las páginas de ejemplo no se tocan: así la de un cliente, hecha con la misma plantilla, nunca la trae.
   Lee paquetes y precios de /datos/paquetes.js, el mismo archivo que usa la portada. */
(function () {
  if (window.__franjaSolida) return;
  window.__franjaSolida = true;

  function arranca() {
    var D = window.SOLIDA;
    if (!D || !D.SEGMENTS || !document.body) return;
    var ruta = location.pathname.replace(/\/+$/, '');
    var rutaDe = function (u) { try { return new URL(u).pathname.replace(/\/+$/, ''); } catch (e) { return ''; } };

    // ¿De qué giro y de qué paquete es esta página? El más largo que la contenga (avanzado/mesas es del avanzado).
    var giro = null, nivel = -1, largo = 0;
    Object.keys(D.SEGMENTS).forEach(function (k) {
      (D.SEGMENTS[k].tiers || []).forEach(function (t, i) {
        var r = rutaDe(t.demo || '');
        if (r && (ruta === r || ruta.indexOf(r + '/') === 0) && r.length > largo) { giro = k; nivel = i; largo = r.length; }
      });
    });
    if (!giro) {   // la portada de un giro, p. ej. /ejemplos/restaurante
      Object.keys(D.SEGMENTS).forEach(function (k) {
        var t0 = (D.SEGMENTS[k].tiers || [])[0];
        var r = t0 && rutaDe(t0.demo || '');
        if (r && r.slice(0, r.lastIndexOf('/')) === ruta) giro = k;
      });
    }
    if (!giro) return;
    var s = D.SEGMENTS[giro], t = s.tiers[nivel];
    var detalle = t ? t.name + ' · ' + t.amount + ' ' + t.unit : s.intro + ' · desde ' + s.tiers[0].amount;
    var msg = 'Hola Solida Aplicaciones 👋 Vi el ejemplo de ' + (t ? '«' + t.name + '» ' : '') + '(' + s.label + ') y quiero uno así para mi negocio.';

    var caja = document.createElement('div');
    caja.setAttribute('data-franja-solida', '');
    var sombra = caja.attachShadow ? caja.attachShadow({ mode: 'open' }) : caja;
    var esc = function (x) { return String(x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var niveles = s.tiers.filter(function (x) { return x.demo; }).map(function (x) {
      var i = s.tiers.indexOf(x), on = i === nivel;
      return '<a class="nv' + (on ? ' on' : '') + '" href="' + esc(rutaDe(x.demo)) + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(x.level) + '</a>';
    }).join('');
    sombra.innerHTML = '<style>' +
      ':host{all:initial;display:block}' +
      '.f{background:#1B396B;color:#fff;font:500 13px/1.3 Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 14px 12px;display:flex;flex-direction:column;gap:9px;position:relative;z-index:2147483000}' +
      '.r{display:flex;align-items:center;gap:10px;max-width:1120px;margin:0 auto;width:100%;box-sizing:border-box}' +
      '.m{width:28px;height:28px;border-radius:8px;background:#0d1e3a;padding:5px;box-sizing:border-box;flex:none;display:block}' +
      '.t{flex:1;min-width:0}.t b{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#34b9a7}' +
      '.t span{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.c{flex:none;min-height:40px;display:flex;align-items:center;padding:0 14px;border-radius:999px;background:#34b9a7;color:#0d1e3a;font-weight:800;text-decoration:none;font-size:13px}' +
      '.n{display:flex;gap:6px}.nv{flex:1;display:flex;align-items:center;justify-content:center;min-height:36px;border-radius:999px;color:#E8F6F6;text-decoration:none;font-weight:800;font-size:12.5px;border:1px solid rgba(232,246,246,.3)}' +
      '.nv.on{background:#34b9a7;border-color:#34b9a7;color:#0d1e3a}' +
      'a:focus-visible{outline:3px solid #fff;outline-offset:2px}' +
      '</style><div class="f" role="region" aria-label="Ejemplo de Solida Aplicaciones"><div class="r">' +
      '<a href="https://solidaaplicaciones.com/#paginas" aria-label="Ir a Solida Aplicaciones"><svg class="m" viewBox="0 0 100 100" aria-hidden="true"><rect x="30" y="18" width="40" height="15" rx="7.5" fill="#2A9D8E"/><rect x="22" y="42" width="56" height="15" rx="7.5" fill="#E8F6F6"/><rect x="14" y="66" width="72" height="15" rx="7.5" fill="#2A9D8E"/></svg></a>' +
      '<div class="t"><b>Ejemplo de Solida</b><span>' + esc(detalle) + '</span></div>' +
      '<a class="c" target="_blank" rel="noopener" href="https://wa.me/' + esc(D.WHATSAPP) + '?text=' + encodeURIComponent(msg) + '">Quiero uno así</a></div>' +
      (niveles ? '<nav class="r n" aria-label="Ver otro nivel">' + niveles + '</nav>' : '') + '</div>';
    document.body.insertBefore(caja, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arranca); else arranca();
})();
