// Portada de Solida Aplicaciones.
// - Una sola dirección oficial: quien entra por www.solidaaplicaciones.com va a solidaaplicaciones.com
//   (misma ruta y mismos parámetros).
// - Los ejemplos ya no viven aquí: las páginas de muestra las arma Solida Citas (repositorio solida-citas) en
//   citas.solidaaplicaciones.com/ejemplo/ (uñas), /ejemplo-barberia/ y /ejemplo-estetica/.
//   Las direcciones viejas (también las impresas en QR) llevan a la muestra de su giro o a la portada.
const OFICIAL = 'solidaaplicaciones.com';
const CITAS = 'https://citas.solidaaplicaciones.com';
export const GIROS = ['restaurante', 'profesional', 'taller', 'nutriologo', 'invitacion', 'uniformes', 'barberia'];
const VIEJA = new RegExp(`^/(${GIROS.join('|')})(/.*)?$`);
const GUARDADOS = new RegExp(`^/ejemplos(/.*)?$`);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.' + OFICIAL) {
      url.hostname = OFICIAL;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    // La página de uñas de antes (con sus tres niveles) y la de barbería: su muestra en Solida Citas
    if (/^\/ejemplos\/unas(\/.*)?$/.test(url.pathname)) return Response.redirect(CITAS + '/ejemplo/', 301);
    if (/^\/(ejemplos\/)?barberia(\/.*)?$/.test(url.pathname)) return Response.redirect(CITAS + '/ejemplo-barberia/', 301);
    // Lo guardado (archivo/), la página de prueba vieja y los pases: a la portada
    if (url.pathname.match(VIEJA) || url.pathname.match(GUARDADOS) || url.pathname.startsWith('/prueba-agenda') || url.pathname.startsWith('/soporte/pases')) {
      return Response.redirect(`https://${OFICIAL}/`, 302);
    }
    return env.ASSETS.fetch(request);
  },
};
