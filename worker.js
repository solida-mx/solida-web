// Portada de Solida Aplicaciones.
// - Una sola dirección oficial: quien entra por www.solidaaplicaciones.com va a solidaaplicaciones.com
//   (misma ruta y mismos parámetros).
// - Los ejemplos para posibles clientes viven en /ejemplos/<giro>/. Las direcciones viejas (/restaurante/basico,
//   también las de workers.dev que ya están impresas en QR) mandan solas a la nueva, en la dirección oficial.
// - A cada página de /ejemplos/ se le pone la franja «Ejemplo de Solida» y se le pide a Google que no la indexe.
//   La franja vive en un solo archivo (ejemplos/franja.js); las páginas de ejemplo no se tocan.
const OFICIAL = 'solidaaplicaciones.com';
export const GIROS = ['restaurante', 'profesional', 'taller', 'nutriologo', 'invitacion', 'uniformes', 'barberia'];
const VIEJA = new RegExp(`^/(${GIROS.join('|')})(/.*)?$`);

class PonFranja {
  element(head) {
    head.append('<script src="/datos/paquetes.js" defer></script><script src="/ejemplos/franja.js" defer></script>', { html: true });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.' + OFICIAL) {
      url.hostname = OFICIAL;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    const vieja = url.pathname.match(VIEJA);
    if (vieja) {
      const nueva = new URL(`/ejemplos/${vieja[1]}${vieja[2] || '/'}${url.search}`, `https://${OFICIAL}`);
      return Response.redirect(nueva.toString(), 301);
    }
    const res = await env.ASSETS.fetch(request);
    if (!url.pathname.startsWith('/ejemplos/')) return res;
    const r = new Response(res.body, res);
    r.headers.set('X-Robots-Tag', 'noindex');
    if (!(r.headers.get('content-type') || '').includes('text/html')) return r;
    return new HTMLRewriter().on('head', new PonFranja()).transform(r);
  },
};
