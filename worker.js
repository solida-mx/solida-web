// Portada de Solida Aplicaciones.
// Una sola dirección oficial: quien entra por www.solidaaplicaciones.com va a solidaaplicaciones.com
// (misma ruta y mismos parámetros). Todo lo demás se sirve tal cual desde la carpeta Solida-Web.
const OFICIAL = 'solidaaplicaciones.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.' + OFICIAL) {
      url.hostname = OFICIAL;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
