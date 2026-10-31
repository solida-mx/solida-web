// Servicio de citas de Solida (Agenda Total). Un Worker y una base para todos los negocios.
//
// Públicas (las usa la página del negocio):
//   GET  /api/:negocio/ocupado?desde=AAAA-MM-DD&dias=14   horas ocupadas, sin datos de nadie
//   POST /api/:negocio/citas                              apartar una cita (no deja apartar una hora ocupada)
// De la dueña (con la clave que le da Solida):
//   POST /api/:negocio/entrar {clave}                     → {token} de una sesión de 7 días
//   POST /api/:negocio/passkey/opciones-entrar · …/passkey/entrar   entrar con Face ID / huella
//   POST …/passkey/opciones-alta · …/passkey/alta · …/passkey/desbloquear   (con sesión) activar Face ID / pedirlo al abrir
//   GET  …/dispositivos · DELETE …/dispositivos/sesion/:id · …/dispositivos/llave/:id · POST …/dispositivos/cerrar-otras · POST …/salir
//   GET  /api/:negocio/agenda?desde=&hasta=               citas y bloqueos con sus datos
//   POST /api/:negocio/citas/:folio/estado {estado}       confirmar o cancelar
//   POST /api/:negocio/citas/:folio/recordada              ya se le mandó su recordatorio
//   POST /api/:negocio/bloqueos {fecha, fechaFin?, desde?, hasta?} · DELETE /api/:negocio/bloqueos/:id
//   PUT  /api/:negocio/horario {persona, semana}            cuándo trabaja cada quien (Mis tiempos)
//   POST /api/:negocio/repetidos · DELETE /api/:negocio/repetidos/:id   planes que se repiten
//   POST /api/:negocio/calendarios {url, persona} · DELETE …/:id · POST …/:id/revisar   su calendario de Google (sólo horas ocupadas)
//   GET  /api/:negocio/avisos · POST …/avisos/suscribir · …/quitar · PUT …/avisos/correo · POST …/avisos/prueba   avisos al celular y por correo
//   POST /api/:negocio/avisos/pendientes {endpoint}       (sin clave) lo que el teléfono enseña al despertar
//   POST /api/:negocio/mover/sugerir · …/mover/proponer   «Se me atravesó algo»: proponer hora nueva a las clientas
//   PUT  /api/:negocio/avisos/clientas {recordar}          cuándo se les recuerda (60 | 120 | dia60)
// De la clienta (su teléfono, con la cabecera X-Dispositivo; sin cuenta):
//   GET  /api/:negocio/mis-citas · POST …/mis-citas/:folio/cancelar · …/mover {fecha, hora}
//   GET|POST /api/:negocio/mis-avisos · POST …/mis-avisos/quitar          avisos en su teléfono
//   GET|POST /api/:negocio/propuesta/:folio (?t= o X-Dispositivo)          contestar «te proponemos otra hora»
//   GET  /api/:negocio/perfil                             nombre, equipo y página (lo que la agenda pinta)
// De Solida (con la clave maestra):
//   POST /api/admin/negocios {id, nombre, equipo?, pagina?}  dar de alta un negocio (o cambiarle la clave)
//   POST /api/admin/negocios/:id/perfil {equipo?, pagina?, servicios?}  cambiar equipo, página o servicios sin tocar la clave
//   GET  /api/admin/negocios
// La agenda de la dueña (una app instalable, aparte de la página del negocio):
//   agenda.solidaaplicaciones.com/:negocio/   ·  /ejemplo/ es la de muestra para el catálogo
// Una vez al día se borran las citas de hace más de 120 días: no guardamos datos de nadie más de lo necesario.

import ARCHIVOS from './agenda.generados.js';
import { horasOcupadas, aInstante } from './ical.js';
import { validaEndpoint, vapidPublica, avisa, pendientes, correoValido, correoDisponible, avisaCitaNueva, avisaPrueba, mandaCorreo } from './avisos.js';
import { correoPropuesta, correoCancelada, correoTuCita } from './correos.js';
import { verificaAlta, verificaEntrada, ErrorLlave, b64url } from './webauthn.js';

const DIAS_GUARDADO = 120;
const CRON_CALENDARIOS = '*/15 * * * *';
const AGENDA = 'https://agenda.solidaaplicaciones.com';
const DIAS_MAX_ADELANTE = 90;
const ahora = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();

export class ErrorHttp extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);
    try {
      return cors(await enrutar(request, env, ctx), request);
    } catch (e) {
      if (e instanceof ErrorHttp) return cors(json({ error: e.message }, e.status), request);
      console.error(e);
      return cors(json({ error: 'Error interno' }, 500), request);
    }
  },
  async scheduled(c, env, ctx) {
    // Cada 15 minutos se vuelven a leer los calendarios; una vez al día, además, se limpia lo viejo.
    ctx.waitUntil(c.cron === CRON_CALENDARIOS ? Promise.all([sincronizaTodos(env), resumenesDeLaNoche(env), recordatoriosClientas(env)]) : limpia(env));
  },
};

async function enrutar(request, env, ctx) {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/\/+$/, '');
  const m = request.method;
  let p;
  if (!url.pathname.startsWith('/api/')) return app(request, env, url);

  if (ruta === '/api/admin/negocios') {
    await exigeMaestra(request, env);
    if (m === 'GET') return json((await env.DB.prepare('SELECT id, nombre, zona, activo, creado FROM negocios ORDER BY creado').all()).results);
    if (m === 'POST') return json(await altaNegocio(env, await cuerpo(request)), 201);
  }
  if ((p = ruta.match(/^\/api\/admin\/negocios\/([a-z0-9-]{2,40})\/perfil$/)) && m === 'POST') {
    await exigeMaestra(request, env);
    const d = await cuerpo(request);
    const r = await env.DB.prepare('UPDATE negocios SET equipo=COALESCE(?,equipo), pagina=COALESCE(?,pagina), servicios=COALESCE(?,servicios) WHERE id=?')
      .bind(d.equipo !== undefined ? JSON.stringify(limpiaEquipo(d.equipo)) : null, d.pagina !== undefined ? limpiaPagina(d.pagina) : null,
        d.servicios !== undefined ? JSON.stringify(limpiaCartera(d.servicios)) : null, p[1]).run();
    if (!r.meta.changes) throw new ErrorHttp(404, 'Negocio no encontrado');
    return json(perfilDe(await env.DB.prepare('SELECT * FROM negocios WHERE id=?').bind(p[1]).first()));
  }

  if (!(p = ruta.match(/^\/api\/([a-z0-9-]{2,40})(\/.*)?$/))) throw new ErrorHttp(404, 'No existe');
  const neg = await env.DB.prepare('SELECT * FROM negocios WHERE id=? AND activo=1').bind(p[1]).first();
  if (!neg) throw new ErrorHttp(404, 'Negocio no encontrado');
  const sub = p[2] || '';

  if (sub === '/perfil' && m === 'GET') return json({ ...perfilDe(neg), servicios: await serviciosDe(env, neg) });
  if (sub === '/ocupado' && m === 'GET') return json(await ocupado(env, neg, url), 200, { 'Cache-Control': 'no-store' });
  if (sub === '/citas' && m === 'POST') {
    const dueña = await tokenValido(request, env, neg.id);
    if (!dueña) await limita(env, 'cita:' + neg.id + ':' + await ipDe(request, env), 6, 3600, 'Ya apartaste varias citas. Si necesitas otra, escríbele al negocio por WhatsApp.');
    const { cita, ...res } = await apartar(env, neg, await cuerpo(request), dueña);
    // La que llega de la página se le avisa a la dueña (celular y correo). La que capturó ella, no: ya la sabe.
    if (!dueña) { const av = avisaCitaNueva(env, neg, { ...cita, folio: res.folio, persona: res.persona }, AGENDA, (id) => nombreEnEquipo(neg, id)).catch((e) => console.error('aviso', e)); if (ctx) ctx.waitUntil(av); else await av; }
    return json(res, 201);
  }
  if (sub === '/entrar' && m === 'POST') {
    const ip = await ipDe(request, env);
    await limita(env, 'entrar:' + neg.id + ':' + ip, 8, 3600, 'Demasiados intentos. Espera una hora e inténtalo de nuevo.');
    const d = await cuerpo(request);
    const clave = normalizaClave(d.clave);
    if (!clave || await sha256(clave) !== neg.clave_hash) throw new ErrorHttp(401, 'Esa clave no es la de este negocio.');
    return json({ ...(await creaSesion(env, neg, request, 'clave')), nombre: neg.nombre });
  }
  if (sub === '/passkey/opciones-entrar' && m === 'POST') {
    const rp = rpDe(url, env, request);
    await limita(env, 'llave:' + neg.id + ':' + await ipDe(request, env), 30, 3600, 'Demasiados intentos. Espera un rato.');
    const l = (await env.DB.prepare('SELECT id FROM llaves WHERE negocio_id=?').bind(neg.id).all()).results;
    if (!l.length) return json({ sinLlaves: true });
    return json({ challenge: await nuevoReto(env, neg.id, 'entrar'), rpId: rp.id, timeout: 60000, userVerification: 'required', allowCredentials: l.map((x) => ({ type: 'public-key', id: x.id })) });
  }
  if (sub === '/passkey/entrar' && m === 'POST') {
    const rp = rpDe(url, env, request);
    await limita(env, 'entrar:' + neg.id + ':' + await ipDe(request, env), 8, 3600, 'Demasiados intentos. Espera una hora e inténtalo de nuevo.');
    const llave = await usaLlave(env, neg, rp, await cuerpo(request), 'entrar');
    return json({ ...(await creaSesion(env, neg, request, 'llave', llave.nombre)), nombre: neg.nombre });
  }

  // ── de la clienta ──
  if (sub.startsWith('/mis-') || sub.startsWith('/propuesta/')) {
    await limita(env, 'cli:' + neg.id + ':' + await ipDe(request, env), 240, 3600, 'Demasiadas consultas. Espera un rato.');
    const disp = await dispDe(request);
    if (sub === '/mis-avisos' && m === 'GET') return json({ vapid: vapidPublica(env) });
    if ((p = sub.match(/^\/propuesta\/([A-Z0-9-]{4,20})$/))) {
      const t = m === 'GET' ? url.searchParams.get('t') || '' : String((await cuerpoCopia(request)).t || '');
      const c = await citaDeClienta(env, neg, p[1], t, disp);
      if (m === 'GET') return json(await vistaPropuesta(env, neg, c));
      if (m === 'POST') return json(await contestaPropuesta(env, neg, c, await cuerpo(request), ctx));
    }
    if (!disp) throw new ErrorHttp(401, 'Este teléfono todavía no tiene citas aquí.');
    if (sub === '/mis-citas' && m === 'GET') return json(await misCitas(env, neg, disp));
    // La cita que le apartaron en el local: con el enlace (folio + t) queda en ESTE teléfono, en «Mis citas», con sus avisos.
    if ((p = sub.match(/^\/mis-citas\/([A-Z0-9-]{4,20})\/guardar$/)) && m === 'POST') {
      const c = await citaDeClienta(env, neg, p[1], String((await cuerpo(request)).t || ''), '');
      await env.DB.prepare('UPDATE citas SET disp=? WHERE id=?').bind(disp, c.id).run();
      return json(await misCitas(env, neg, disp));
    }
    if ((p = sub.match(/^\/mis-citas\/([A-Z0-9-]{4,20})\/(cancelar|mover)$/)) && m === 'POST') {
      const c = await citaDeClienta(env, neg, p[1], '', disp);
      return json(p[2] === 'cancelar' ? await cancelaClienta(env, neg, c, ctx) : await mueveClienta(env, neg, c, await cuerpo(request), ctx));
    }
    if (sub === '/mis-avisos' && m === 'POST') {
      const ep = validaEndpoint((await cuerpo(request)).endpoint, env);
      if (!ep) throw new ErrorHttp(400, 'Este teléfono no dio una dirección de avisos válida');
      const ultimo = await env.DB.prepare('SELECT COALESCE(MAX(id),0) n FROM avisos WHERE negocio_id=?').bind(neg.id).first();
      await env.DB.prepare('INSERT INTO suscripciones (negocio_id, endpoint, visto, creado, disp) VALUES (?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET negocio_id=excluded.negocio_id, disp=excluded.disp, fallos=0')
        .bind(neg.id, ep, ultimo.n, ahora(), disp).run();
      return json({ ok: true });
    }
    if (sub === '/mis-avisos/quitar' && m === 'POST') {
      const ep = validaEndpoint((await cuerpo(request)).endpoint, env);
      if (ep) await env.DB.prepare('DELETE FROM suscripciones WHERE negocio_id=? AND endpoint=? AND disp=?').bind(neg.id, ep, disp).run();
      return json({ ok: true });
    }
    throw new ErrorHttp(404, 'No existe');
  }
  if (sub === '/avisos/pendientes' && m === 'POST') {
    await limita(env, 'pend:' + neg.id + ':' + await ipDe(request, env), 120, 3600, 'Demasiadas consultas');
    const ep = validaEndpoint((await cuerpo(request)).endpoint, env);
    const l = ep ? await pendientes(env, neg.id, ep) : null;
    if (!l) throw new ErrorHttp(404, 'No existe');
    return json({ avisos: l });
  }

  // De aquí en adelante, sólo la dueña
  const sesion = await tokenValido(request, env, neg.id);
  if (!sesion) throw new ErrorHttp(401, 'Entra con tu clave.');
  if (sub === '/salir' && m === 'POST') { await env.DB.prepare('UPDATE sesiones SET revocada=1 WHERE id=?').bind(sesion.id).run(); return json({ ok: true }); }
  if (sub === '/dispositivos' && m === 'GET') return json(await dispositivos(env, neg, sesion));
  if ((p = sub.match(/^\/dispositivos\/sesion\/([A-Za-z0-9]{8,40})$/)) && m === 'DELETE') {
    await env.DB.prepare('UPDATE sesiones SET revocada=1 WHERE negocio_id=? AND id=?').bind(neg.id, p[1]).run();
    return json(await dispositivos(env, neg, sesion));
  }
  if ((p = sub.match(/^\/dispositivos\/llave\/([A-Za-z0-9_-]{8,400})$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM llaves WHERE negocio_id=? AND id=?').bind(neg.id, p[1]).run();
    return json(await dispositivos(env, neg, sesion));
  }
  if (sub === '/dispositivos/cerrar-otras' && m === 'POST') {
    await env.DB.prepare('UPDATE sesiones SET revocada=1 WHERE negocio_id=? AND id<>?').bind(neg.id, sesion.id).run();
    return json(await dispositivos(env, neg, sesion));
  }
  if (sub === '/passkey/opciones-alta' && m === 'POST') {
    const rp = rpDe(url, env, request);
    const l = (await env.DB.prepare('SELECT id FROM llaves WHERE negocio_id=?').bind(neg.id).all()).results;
    if (l.length >= 10) throw new ErrorHttp(400, 'Ya hay muchas llaves. Quita alguna que ya no uses.');
    return json({
      challenge: await nuevoReto(env, neg.id, 'alta'), rp: { id: rp.id, name: 'Tu agenda · ' + neg.nombre },
      user: { id: b64url(new TextEncoder().encode(neg.id)), name: neg.id, displayName: neg.nombre },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 60000, attestation: 'none',
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      excludeCredentials: l.map((x) => ({ type: 'public-key', id: x.id })),
    });
  }
  if (sub === '/passkey/alta' && m === 'POST') {
    const rp = rpDe(url, env, request), d = await cuerpo(request);
    const reto = await gastaReto(env, neg.id, 'alta', retoDe(d.credencial));
    let a; try { a = await verificaAlta({ credencial: d.credencial, reto, origen: rp.origen, rpId: rp.id }); } catch (e) { throw e instanceof ErrorLlave ? new ErrorHttp(400, e.message) : e; }
    const nombre = texto(d.nombre, 60) || nombreDispositivo(request);
    await env.DB.prepare('INSERT INTO llaves (id, negocio_id, nombre, jwk, alg, contador, creado) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .bind(a.id, neg.id, nombre, JSON.stringify(a.jwk), a.alg, a.contador, ahora()).run();
    return json({ ok: true, id: a.id });
  }
  if (sub === '/passkey/desbloquear' && m === 'POST') {
    const rp = rpDe(url, env, request);
    await usaLlave(env, neg, rp, await cuerpo(request), 'entrar');
    return json({ ok: true });
  }
  if (sub === '/agenda' && m === 'GET') return json(await agenda(env, neg, url));
  if (sub === '/servicios' && m === 'PUT') {
    const d = await cuerpo(request);
    const c = limpiaCartera(Array.isArray(d.servicios) && !d.variantes ? d.servicios : d);
    await env.DB.prepare('UPDATE negocios SET servicios=? WHERE id=?').bind(JSON.stringify(c), neg.id).run();
    return json({ servicios: c.servicios, cartera: { ...c, lista: c.servicios, aprendidos: false } });
  }
  if ((p = sub.match(/^\/citas\/([A-Z0-9-]{4,20})\/enlace$/)) && m === 'POST') return json({ enlace: await enlaceDeCita(env, neg, p[1]) });
  if ((p = sub.match(/^\/citas\/([A-Z0-9-]{4,20})\/correo$/)) && m === 'POST') {
    const correo = correoValido((await cuerpo(request)).correo);
    if (!correo) throw new ErrorHttp(400, 'Ese correo no parece válido');
    if (!correoDisponible(env)) throw new ErrorHttp(400, 'El correo no está activo todavía. Mándasela por WhatsApp.');
    const enlace = await enlaceDeCita(env, neg, p[1]);
    const c = await env.DB.prepare('SELECT * FROM citas WHERE negocio_id=? AND folio=?').bind(neg.id, p[1]).first();
    await env.DB.prepare('UPDATE citas SET correo=? WHERE id=?').bind(correo, c.id).run();
    const mc = correoTuCita(neg, { ...c, ini: c.inicio_min }, nombreEnEquipo(neg, c.persona), enlace);
    if (!(await mandaCorreo(env, correo, 'Tu cita en ' + neg.nombre, mc.html, mc.texto))) throw new ErrorHttp(502, 'No se pudo mandar el correo. Inténtalo otra vez o mándasela por WhatsApp.');
    return json({ ok: true });
  }
  if (sub === '/qr' && m === 'GET') return json(await datosQr(env, neg));
  if ((p = sub.match(/^\/citas\/([A-Z0-9-]{4,20})\/estado$/)) && m === 'POST') {
    const d = await cuerpo(request);
    if (!['confirmada', 'cancelada', 'apartada'].includes(d.estado)) throw new ErrorHttp(400, 'Estado no válido');
    const r = await env.DB.prepare('UPDATE citas SET estado=? WHERE negocio_id=? AND folio=?').bind(d.estado, neg.id, p[1]).run();
    if (!r.meta.changes) throw new ErrorHttp(404, 'No existe esa cita');
    const cc = await env.DB.prepare('SELECT * FROM citas WHERE negocio_id=? AND folio=?').bind(neg.id, p[1]).first();
    const av = avisaCambioEstado(env, neg, cc).catch((e) => console.error('aviso clienta', e)); if (ctx) ctx.waitUntil(av); else await av;
    return json({ ok: true });
  }
  if ((p = sub.match(/^\/citas\/([A-Z0-9-]{4,20})\/recordada$/)) && m === 'POST') {
    const r = await env.DB.prepare('UPDATE citas SET recordada=? WHERE negocio_id=? AND folio=?').bind(ahora(), neg.id, p[1]).run();
    if (!r.meta.changes) throw new ErrorHttp(404, 'No existe esa cita');
    return json({ ok: true });
  }
  if (sub === '/bloqueos' && m === 'POST') return json(await bloquear(env, neg, await cuerpo(request)), 201);
  if (sub === '/avisos' && m === 'GET') return json(await estadoAvisos(env, neg));
  if (sub === '/avisos/clientas' && m === 'PUT') {
    const v = String((await cuerpo(request)).recordar || '');
    if (!['60', '120', 'dia60'].includes(v)) throw new ErrorHttp(400, 'Elige cuándo recordarles');
    await env.DB.prepare('UPDATE negocios SET recordar=? WHERE id=?').bind(v, neg.id).run();
    return json(await estadoAvisos(env, { ...neg, recordar: v }));
  }
  if (sub === '/mover/sugerir' && m === 'POST') return json(await sugiereMovidas(env, neg, await cuerpo(request)));
  if (sub === '/mover/proponer' && m === 'POST') return json(await proponeMovidas(env, neg, await cuerpo(request)));
  if (sub === '/avisos/suscribir' && m === 'POST') {
    const ep = validaEndpoint((await cuerpo(request)).endpoint, env);
    if (!ep) throw new ErrorHttp(400, 'Ese dispositivo no dio una dirección de avisos válida');
    const ultimo = await env.DB.prepare('SELECT COALESCE(MAX(id),0) n FROM avisos WHERE negocio_id=?').bind(neg.id).first();
    await env.DB.prepare("INSERT INTO suscripciones (negocio_id, endpoint, visto, creado, disp) VALUES (?,?,?,?,'') ON CONFLICT(endpoint) DO UPDATE SET negocio_id=excluded.negocio_id, disp='', fallos=0")
      .bind(neg.id, ep, ultimo.n, ahora()).run();
    // Hasta 10 teléfonos por negocio: el más viejo sale.
    await env.DB.prepare("DELETE FROM suscripciones WHERE negocio_id=? AND disp='' AND id NOT IN (SELECT id FROM suscripciones WHERE negocio_id=? AND disp='' ORDER BY id DESC LIMIT 10)").bind(neg.id, neg.id).run();
    return json(await estadoAvisos(env, neg));
  }
  if (sub === '/avisos/quitar' && m === 'POST') {
    const ep = validaEndpoint((await cuerpo(request)).endpoint, env);
    if (ep) await env.DB.prepare('DELETE FROM suscripciones WHERE negocio_id=? AND endpoint=?').bind(neg.id, ep).run();
    return json(await estadoAvisos(env, neg));
  }
  if (sub === '/avisos/correo' && m === 'PUT') {
    const d = await cuerpo(request);
    const correo = d.correo === undefined ? neg.correo : correoValido(d.correo);
    if (d.correo !== undefined && String(d.correo).trim() && !correo) throw new ErrorHttp(400, 'Ese correo no se ve bien escrito');
    const activo = correo ? 1 : 0;   // el correo de respaldo está activo si hay correo
    await env.DB.prepare('UPDATE negocios SET correo=?, aviso_correo=? WHERE id=?').bind(correo || '', activo, neg.id).run();
    return json(await estadoAvisos(env, { ...neg, correo: correo || '', aviso_correo: activo }));
  }
  if (sub === '/avisos/prueba' && m === 'POST') {
    await limita(env, 'prueba:' + neg.id, 5, 3600, 'Ya mandaste varias pruebas. Espera un rato.');
    const canal = (await cuerpo(request)).canal === 'correo' ? 'correo' : 'celular';
    if (canal === 'correo' && (!correoDisponible(env) || !neg.correo)) throw new ErrorHttp(400, 'Primero guarda tu correo de respaldo.');
    return json(await avisaPrueba(env, neg, AGENDA, canal));
  }
  if (sub === '/calendarios' && m === 'POST') return json(await conectaCalendario(env, neg, await cuerpo(request)), 201);
  if ((p = sub.match(/^\/calendarios\/(\d+)$/)) && m === 'DELETE') {
    const id = Number(p[1]);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM cal_ocupado WHERE negocio_id=? AND calendario_id=?').bind(neg.id, id),
      env.DB.prepare('DELETE FROM calendarios WHERE negocio_id=? AND id=?').bind(neg.id, id),
    ]);
    return json({ ok: true });
  }
  if ((p = sub.match(/^\/calendarios\/(\d+)\/revisar$/)) && m === 'POST') {
    const cal = await env.DB.prepare('SELECT * FROM calendarios WHERE negocio_id=? AND id=?').bind(neg.id, Number(p[1])).first();
    if (!cal) throw new ErrorHttp(404, 'No existe ese calendario');
    await limita(env, 'cal:' + cal.id, 6, 600, 'Ya lo revisamos hace un momento. Espera unos minutos.');
    await sincroniza(env, neg, cal);
    return json(await calendarioPublico(env, cal.id));
  }
  if (sub === '/horario' && m === 'PUT') return json(await guardaHorario(env, neg, await cuerpo(request)));
  if (sub === '/repetidos' && m === 'POST') return json(await repetir(env, neg, await cuerpo(request)), 201);
  if ((p = sub.match(/^\/repetidos\/(\d+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM repetidos WHERE negocio_id=? AND id=?').bind(neg.id, Number(p[1])).run();
    return json({ ok: true });
  }
  if ((p = sub.match(/^\/bloqueos\/(\d+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM bloqueos WHERE negocio_id=? AND id=?').bind(neg.id, Number(p[1])).run();
    return json({ ok: true });
  }
  throw new ErrorHttp(404, 'No existe');
}

// ───────── disponibilidad y citas ─────────

export function hoyEn(zona, t = Date.now()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { fecha: `${f.year}-${f.month}-${f.day}`, min: Number(f.hour) * 60 + Number(f.minute) };
}
export function sumaDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const ident = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
const entero = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

async function ocupado(env, neg, url) {
  const hoy = hoyEn(neg.zona).fecha;
  let desde = url.searchParams.get('desde') || hoy;
  if (!FECHA.test(desde) || desde < hoy) desde = hoy;
  const dias = Math.min(DIAS_MAX_ADELANTE, Math.max(1, Number(url.searchParams.get('dias')) || 14));
  const hasta = sumaDias(desde, dias);
  const c = (await env.DB.prepare("SELECT fecha, inicio_min ini, fin_min fin, persona FROM citas WHERE negocio_id=? AND fecha>=? AND fecha<? AND estado<>'cancelada'")
    .bind(neg.id, desde, hasta).all()).results;
  const b = (await env.DB.prepare('SELECT fecha, inicio_min ini, fin_min fin, persona FROM bloqueos WHERE negocio_id=? AND fecha>=? AND fecha<?')
    .bind(neg.id, desde, hasta).all()).results;
  const rep = await repetidosDe(env, neg.id, desde);
  const t = tiemposOcupados(neg, rep, desde, hasta);
  const cal = (await env.DB.prepare('SELECT fecha, inicio_min ini, fin_min fin, persona FROM cal_ocupado WHERE negocio_id=? AND fecha>=? AND fecha<?')
    .bind(neg.id, desde, hasta).all()).results;
  return { desde, hasta, ocupado: c.concat(b, t.ocupado, cal), horario: t.horario };
}

// ───────── Mis tiempos: horario por persona y planes que se repiten ─────────

export const diaSemana = (fecha) => { const d = new Date(fecha + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };   // 1 = lunes … 7 = domingo
const personasDe = (neg) => { const e = perfilDe(neg).equipo.map((x) => x.id); return e.length ? e : ['']; };
export function leeHorario(neg) {
  let h = {}; try { h = JSON.parse(neg.horario || '{}'); } catch {}
  return h && typeof h === 'object' && !Array.isArray(h) ? h : {};
}
// El horario que vale para una persona: el suyo o, si no tiene, el de todo el negocio. null = sin horario (no se restringe).
const horarioPara = (h, persona) => h[persona] || h[''] || null;

// Lo que no se puede apartar por horario y por planes repetidos, día por día, como «ocupado» (sin decir por qué).
// También devuelve el horario de cada quien para que la página ofrezca sólo esos días y horas.
export function tiemposOcupados(neg, repetidos, desde, hasta) {
  const h = leeHorario(neg), personas = personasDe(neg), ocupado = [];
  for (let f = desde; f < hasta; f = sumaDias(f, 1)) {
    const wd = String(diaSemana(f));
    for (const p of personas) {
      const sem = horarioPara(h, p);
      if (!sem) continue;
      const d = sem[wd];
      if (!d) { ocupado.push({ fecha: f, ini: 0, fin: 1440, persona: p }); continue; }
      if (d[0] > 0) ocupado.push({ fecha: f, ini: 0, fin: d[0], persona: p });
      if (d[1] < 1440) ocupado.push({ fecha: f, ini: d[1], fin: 1440, persona: p });
    }
    for (const r of repetidos) {
      if (r.dias.includes(wd) && r.desde <= f && (!r.hasta || r.hasta >= f)) ocupado.push({ fecha: f, ini: r.inicio_min, fin: r.fin_min, persona: r.persona });
    }
  }
  const horario = {};
  for (const p of personas) { const sem = horarioPara(h, p); if (sem) horario[p] = sem; }
  return { ocupado, horario: Object.keys(horario).length ? horario : null };
}
export function fueraDeHorario(neg, fecha, ini, fin, persona) {
  const sem = horarioPara(leeHorario(neg), persona);
  if (!sem) return false;
  const d = sem[String(diaSemana(fecha))];
  return !d || ini < d[0] || fin > d[1];
}
async function repetidosDe(env, negocio, desde) {
  return (await env.DB.prepare("SELECT id, persona, dias, inicio_min, fin_min, desde, hasta, motivo FROM repetidos WHERE negocio_id=? AND (hasta='' OR hasta>=?) ORDER BY inicio_min")
    .bind(negocio, desde).all()).results;
}
const HM = (v) => { const m = String(v || '').match(/^(\d{2}):(\d{2})$/); return m && +m[1] <= 24 && +m[2] < 60 ? Math.min(1440, +m[1] * 60 + +m[2]) : null; };
function personaValida(neg, v) {
  const p = ident(v);
  const eq = perfilDe(neg).equipo;
  if (p && eq.length && !eq.some((x) => x.id === p)) throw new ErrorHttp(400, 'Esa persona no está en tu equipo');
  return p;
}
export function limpiaSemana(sem) {
  if (!sem || typeof sem !== 'object') throw new ErrorHttp(400, 'Falta el horario');
  const out = {};
  for (let i = 1; i <= 7; i++) {
    const d = sem[i] ?? sem[String(i)];
    if (d == null || d === false) { out[i] = null; continue; }
    const a = Array.isArray(d) ? d.map(Number) : [HM(d.desde), HM(d.hasta)];
    if (a.length !== 2 || !a.every((x) => Number.isInteger(x) && x >= 0 && x <= 1440) || a[1] <= a[0]) throw new ErrorHttp(400, 'Revisa el horario: la hora de salida va después de la de entrada');
    out[i] = a;
  }
  return out;
}
async function guardaHorario(env, neg, d) {
  const persona = personaValida(neg, d.persona);
  const h = leeHorario(neg);
  if (d.semana === null) delete h[persona]; else h[persona] = limpiaSemana(d.semana);
  await env.DB.prepare('UPDATE negocios SET horario=? WHERE id=?').bind(JSON.stringify(h), neg.id).run();
  return { horario: h };
}
async function repetir(env, neg, d) {
  const persona = personaValida(neg, d.persona);
  const dias = [...new Set((Array.isArray(d.dias) ? d.dias : []).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 7))].sort().join('');
  if (!dias) throw new ErrorHttp(400, 'Elige qué días se repite');
  const ini = HM(d.desde), fin = HM(d.hasta);
  if (ini == null || fin == null) throw new ErrorHttp(400, 'Pon la hora de inicio y de fin');
  if (fin <= ini) throw new ErrorHttp(400, 'La hora de fin va después de la de inicio');
  const hoy = hoyEn(neg.zona).fecha;
  const desdeF = FECHA.test(d.desdeFecha || '') && d.desdeFecha > hoy ? d.desdeFecha : hoy;
  const hastaF = FECHA.test(d.hastaFecha || '') ? d.hastaFecha : '';
  if (hastaF && hastaF < desdeF) throw new ErrorHttp(400, 'La fecha de fin va después de la de inicio');
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM repetidos WHERE negocio_id=?').bind(neg.id).first();
  if (n && n.n >= 60) throw new ErrorHttp(400, 'Ya tienes muchos planes repetidos. Quita alguno que ya no uses.');
  const r = await env.DB.prepare('INSERT INTO repetidos (negocio_id, persona, dias, inicio_min, fin_min, desde, hasta, motivo, creado) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(neg.id, persona, dias, ini, fin, desdeF, hastaF, texto(d.motivo, 80), ahora()).run();
  return { id: r.meta.last_row_id };
}

export function validaCita(d, zona, t = Date.now()) {
  const hoy = hoyEn(zona, t);
  const fecha = String(d.fecha || '');
  if (!FECHA.test(fecha)) throw new ErrorHttp(400, 'Falta el día');
  if (fecha < hoy.fecha || fecha > sumaDias(hoy.fecha, DIAS_MAX_ADELANTE)) throw new ErrorHttp(400, 'Ese día no se puede apartar');
  const hm = String(d.hora || '').match(/^(\d{2}):(\d{2})$/);
  if (!hm) throw new ErrorHttp(400, 'Falta la hora');
  const ini = Number(hm[1]) * 60 + Number(hm[2]);
  const dur = entero(d.min, 10, 600);
  if (ini > 1439 || dur == null) throw new ErrorHttp(400, 'Hora o duración no válidas');
  if (fecha === hoy.fecha && ini <= hoy.min) throw new ErrorHttp(400, 'Esa hora ya pasó');
  const nombre = texto(d.nombre, 60);
  const tel = String(d.tel || '').replace(/\D/g, '').slice(-10);
  if (nombre.length < 2) throw new ErrorHttp(400, 'Falta tu nombre');
  if (tel.length !== 10) throw new ErrorHttp(400, 'Tu WhatsApp debe tener 10 dígitos');
  const equipo = Array.isArray(d.equipo) ? d.equipo.map(ident).filter(Boolean).slice(0, 20) : [];
  return {
    fecha, ini, fin: Math.min(1440, ini + dur), persona: ident(d.persona), equipo,
    servicio: texto(d.servicio, 80) || 'Servicio', diseno: texto(d.diseno, 80), detalle: texto(d.largo || d.detalle, 40),
    precio: entero(d.precio, 0, 1000000) || 0, anticipo: entero(d.anticipo, 0, 1000000) || 0, nombre, tel,
  };
}

async function apartar(env, neg, d, deLaDueña) {
  const c = validaCita(d, neg.zona);
  // Con quién: la que eligió, o la primera del equipo que esté libre. Sin equipo, el negocio es un solo lugar.
  const candidatas = c.persona ? [c.persona] : (c.equipo.length ? c.equipo : ['']);
  const folio = 'C-' + aleatorio(6);
  const wd = String(diaSemana(c.fecha));
  // Desde la app de la clienta: la huella de su teléfono (para que vea SUS citas) y, si lo dejó, su correo.
  const dispH = !deLaDueña && DISP.test(String(d.disp || '')) ? await sha256('disp|' + d.disp) : '';
  const correoCli = deLaDueña ? '' : correoValido(d.correo);
  for (const persona of candidatas) {
    // La dueña puede apartar fuera de su horario o encima de sus tiempos (se lo pidieron por teléfono y ella sabe); la página no.
    if (!deLaDueña && fueraDeHorario(neg, c.fecha, c.ini, c.fin, persona)) continue;
    // Un solo INSERT … WHERE NOT EXISTS: dos personas apartando la misma hora al mismo tiempo no pueden ganar las dos.
    const r = await env.DB.prepare(`INSERT INTO citas (negocio_id, folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada, disp, correo)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?19, ?20
      WHERE NOT EXISTS (SELECT 1 FROM citas WHERE negocio_id=?1 AND fecha=?3 AND estado<>'cancelada' AND inicio_min < ?5 AND fin_min > ?4
                          AND (persona=?6 OR persona='' OR ?6=''))
        AND (?17 = 1 OR NOT EXISTS (SELECT 1 FROM bloqueos WHERE negocio_id=?1 AND fecha=?3 AND inicio_min < ?5 AND fin_min > ?4 AND (persona=?6 OR persona='')))
        AND (?17 = 1 OR NOT EXISTS (SELECT 1 FROM repetidos WHERE negocio_id=?1 AND instr(dias, ?18) > 0 AND desde <= ?3 AND (hasta = '' OR hasta >= ?3)
                                      AND inicio_min < ?5 AND fin_min > ?4 AND (persona=?6 OR persona='')))
        AND (?17 = 1 OR NOT EXISTS (SELECT 1 FROM cal_ocupado WHERE negocio_id=?1 AND fecha=?3 AND inicio_min < ?5 AND fin_min > ?4 AND (persona=?6 OR persona='')))`)
      .bind(neg.id, folio, c.fecha, c.ini, c.fin, persona, c.servicio, c.diseno, c.detalle, c.precio, c.anticipo, c.nombre, c.tel,
        deLaDueña ? 'confirmada' : 'apartada', deLaDueña ? 'negocio' : 'pagina', ahora(), deLaDueña ? 1 : 0, wd, dispH, correoCli).run();
    if (r.meta.changes) {
      if (!deLaDueña && d.via === 'qr') await env.DB.prepare("UPDATE citas SET via='qr' WHERE negocio_id=? AND folio=?").bind(neg.id, folio).run();
      return { folio, persona, estado: deLaDueña ? 'confirmada' : 'apartada', cita: c };
    }
  }
  throw new ErrorHttp(409, 'Esa hora ya no está disponible. Elige otra.');
}

async function agenda(env, neg, url) {
  const hoy = hoyEn(neg.zona).fecha;
  const desde = FECHA.test(url.searchParams.get('desde') || '') ? url.searchParams.get('desde') : sumaDias(hoy, -1);
  const hasta = FECHA.test(url.searchParams.get('hasta') || '') ? url.searchParams.get('hasta') : sumaDias(hoy, DIAS_MAX_ADELANTE);
  const conApp = new Set((await env.DB.prepare("SELECT DISTINCT disp FROM suscripciones WHERE negocio_id=? AND disp<>''").bind(neg.id).all()).results.map((x) => x.disp));
  const citas = (await env.DB.prepare(`SELECT folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada, recordada,
      disp, correo, antes_fecha, antes_ini, propuesta_hasta, resp
      FROM citas WHERE negocio_id=? AND fecha>=? AND fecha<=? ORDER BY fecha, inicio_min`).bind(neg.id, desde, hasta).all()).results
    .map(({ disp, resp, ...c }) => ({ ...c, app: !!disp && conApp.has(disp), enlace: c.estado === 'propuesta' && resp ? enlacePropuesta(neg, c.folio, resp) : '' }));
  const bloqueos = (await env.DB.prepare('SELECT id, fecha, inicio_min, fin_min, persona, motivo FROM bloqueos WHERE negocio_id=? AND fecha>=? AND fecha<=? ORDER BY fecha, inicio_min')
    .bind(neg.id, desde, hasta).all()).results;
  const calOcupado = (await env.DB.prepare('SELECT fecha, inicio_min, fin_min, persona FROM cal_ocupado WHERE negocio_id=? AND fecha>=? AND fecha<=? ORDER BY fecha, inicio_min')
    .bind(neg.id, desde, hasta).all()).results;
  const calendarios = (await env.DB.prepare('SELECT id FROM calendarios WHERE negocio_id=? ORDER BY id').bind(neg.id).all()).results;
  return { hoy, citas, bloqueos, horario: leeHorario(neg), repetidos: await repetidosDe(env, neg.id, hoy), calOcupado,
    calendarios: await Promise.all(calendarios.map((x) => calendarioPublico(env, x.id))) };
}

async function bloquear(env, neg, d) {
  const fecha = String(d.fecha || '');
  if (!FECHA.test(fecha)) throw new ErrorHttp(400, 'Falta el día');
  let ini = 0, fin = 1440;
  if (d.desde || d.hasta) {
    const a = String(d.desde || '').match(/^(\d{2}):(\d{2})$/), b = String(d.hasta || '').match(/^(\d{2}):(\d{2})$/);
    if (!a || !b) throw new ErrorHttp(400, 'Pon la hora de inicio y de fin');
    ini = Number(a[1]) * 60 + Number(a[2]); fin = Number(b[1]) * 60 + Number(b[2]);
    if (fin <= ini) throw new ErrorHttp(400, 'La hora de fin va después de la de inicio');
  }
  // Varios días seguidos (vacaciones): un renglón por día, hasta dos meses.
  const fechaFin = FECHA.test(d.fechaFin || '') ? d.fechaFin : fecha;
  if (fechaFin < fecha) throw new ErrorHttp(400, 'El último día va después del primero');
  const dias = []; for (let f = fecha; f <= fechaFin; f = sumaDias(f, 1)) { dias.push(f); if (dias.length > 62) throw new ErrorHttp(400, 'Son demasiados días de una vez: máximo dos meses'); }
  const persona = personaValida(neg, d.persona), motivo = texto(d.motivo, 80), t = ahora();
  const st = env.DB.prepare('INSERT INTO bloqueos (negocio_id, fecha, inicio_min, fin_min, persona, motivo, creado) VALUES (?,?,?,?,?,?,?) RETURNING id');
  const res = await env.DB.batch(dias.map((f) => st.bind(neg.id, f, ini, fin, persona, motivo, t)));
  const ids = res.map((x) => x.results[0].id);
  return { id: ids[0], ids };
}

// ───────── alta de negocios (Solida) ─────────

async function altaNegocio(env, d) {
  const id = String(d.id || '').toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new ErrorHttp(400, 'El id va en minúsculas, números y guiones');
  const nombre = texto(d.nombre, 80);
  if (!nombre) throw new ErrorHttp(400, 'Falta el nombre');
  const zona = texto(d.zona, 40) || 'America/Monterrey';
  try { new Intl.DateTimeFormat('es', { timeZone: zona }); } catch { throw new ErrorHttp(400, 'Zona horaria no válida'); }
  if (id === 'ejemplo') throw new ErrorHttp(400, '«ejemplo» está reservado para la agenda de muestra');
  const clave = generaClave();
  await env.DB.prepare(`INSERT INTO negocios (id, nombre, clave_hash, zona, activo, creado) VALUES (?,?,?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, clave_hash=excluded.clave_hash, zona=excluded.zona, activo=1`)
    .bind(id, nombre, await sha256(clave), zona, ahora()).run();
  // Clave nueva (perdió su teléfono, se lo robaron o alguien más sabía la clave): se cierran todas sus sesiones
  // y se borran sus llaves de Face ID / huella, porque un teléfono robado también trae la suya. Las vuelve a activar al entrar.
  await env.DB.batch([
    env.DB.prepare('UPDATE sesiones SET revocada=1 WHERE negocio_id=?').bind(id),
    env.DB.prepare('DELETE FROM llaves WHERE negocio_id=?').bind(id),
  ]);
  // Equipo y página sólo si vienen: darle una clave nueva no borra lo que ya tenía.
  if (d.equipo !== undefined || d.pagina !== undefined) {
    await env.DB.prepare('UPDATE negocios SET equipo=COALESCE(?,equipo), pagina=COALESCE(?,pagina) WHERE id=?')
      .bind(d.equipo !== undefined ? JSON.stringify(limpiaEquipo(d.equipo)) : null, d.pagina !== undefined ? limpiaPagina(d.pagina) : null, id).run();
  }
  return { id, nombre, clave, agenda: AGENDA + '/' + id + '/', aviso: 'Guarda esta clave y dásela a la dueña. No se vuelve a mostrar; si se pierde, se genera otra.' };
}

// La cartera del negocio: lo que la dueña ofrece, con su precio más reciente. Una sola fuente para apartar sin escribir:
//   servicios  [{id, nombre, cat, min, precio, desde, quien:[persona…]}]   (quien vacío = cualquiera del equipo)
//   variantes  [{id, nombre, servicio, extra, extraMin}]                  (diseños: van con un servicio y suman al precio)
//   largos     [{nombre, extra}] y largosEn [categoría…]                  (tamaños: suman al precio en esas categorías)
//   anticipo   lo que se pide para apartar
// Una lista sola (el formato de antes) cuenta como los servicios.
const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
export function limpiaCartera(v) {
  const c = Array.isArray(v) ? { servicios: v } : (v && typeof v === 'object' ? v : {});
  const ids = new Set(), nombres = new Set(), servicios = [];
  for (const x of (Array.isArray(c.servicios) ? c.servicios : []).slice(0, 80)) {
    const nombre = texto(x && x.nombre, 80), k = nombre.toLowerCase();
    if (!nombre || nombres.has(k)) continue;
    let id = ident(x.id) || slug(nombre) || 's'; while (ids.has(id)) id += '2';
    nombres.add(k); ids.add(id);
    const min = entero(x.min, 10, 600);
    servicios.push({ id, nombre, cat: texto(x.cat, 40), min: min ? Math.round(min / 5) * 5 : 60, precio: entero(x.precio, 0, 1000000) || 0,
      desde: !!x.desde, quien: Array.isArray(x.quien) ? [...new Set(x.quien.map(ident).filter(Boolean))].slice(0, 20) : [] });
  }
  const porNombre = new Map(servicios.map((s) => [s.nombre.toLowerCase(), s.id]));
  const vIds = new Set(), variantes = [];
  for (const x of (Array.isArray(c.variantes) ? c.variantes : []).slice(0, 200)) {
    const nombre = texto(x && x.nombre, 80);
    const serv = ids.has(ident(x && x.servicio)) ? ident(x.servicio) : porNombre.get(String((x && x.servicio) || '').toLowerCase().trim());
    if (!nombre || !serv) continue;
    let id = ident(x.id) || slug(nombre) || 'v'; while (vIds.has(id)) id += '2'; vIds.add(id);
    variantes.push({ id, nombre, servicio: serv, extra: entero(x.extra, 0, 1000000) || 0, extraMin: entero(x.extraMin, 0, 300) || 0 });
  }
  const largos = [];
  for (const x of (Array.isArray(c.largos) ? c.largos : []).slice(0, 10)) {
    const nombre = texto(Array.isArray(x) ? x[0] : x && x.nombre, 40);
    if (nombre && !largos.some((l) => l.nombre === nombre)) largos.push({ nombre, extra: entero(Array.isArray(x) ? x[1] : x.extra, 0, 1000000) || 0 });
  }
  const largosEn = (Array.isArray(c.largosEn) ? c.largosEn : []).map((t) => texto(t, 40)).filter(Boolean).slice(0, 10);
  return { servicios, variantes, largos, largosEn: largos.length ? largosEn : [], anticipo: entero(c.anticipo, 0, 1000000) || 0 };
}
export const limpiaServicios = (v) => limpiaCartera(v).servicios;
// La cartera que ve la dueña: la que guardó, o si no hay, la que se arma sola con lo que han apartado en su página
// (ahí los nombres vienen del catálogo, así que ya están escritos igual siempre).
async function serviciosDe(env, neg) {
  let g = null; try { g = JSON.parse(neg.servicios || 'null'); } catch {}
  const c = limpiaCartera(g);
  if (c.servicios.length) return { ...c, lista: c.servicios, aprendidos: false };
  const filas = (await env.DB.prepare("SELECT servicio, fin_min - inicio_min AS dur, precio FROM citas WHERE negocio_id=? AND origen='pagina' AND creada>? ORDER BY creada DESC LIMIT 400")
    .bind(neg.id, ahora() - 180 * 86400).all()).results;
  const por = new Map();
  for (const f of filas) { if (!por.has(f.servicio)) por.set(f.servicio, { nombre: f.servicio, min: f.dur, precio: f.precio, cat: '' }); }
  const a = limpiaCartera({ servicios: [...por.values()].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')) });
  return { ...a, lista: a.servicios, aprendidos: true };
}
// Quién atiende: ["Mía", "Fernanda"] o [{id, nombre}]. El id es el que usan las citas (persona).
export function limpiaEquipo(v) {
  if (!Array.isArray(v)) return [];
  const vistos = new Set();
  return v.slice(0, 20).map((x) => {
    const nombre = texto(typeof x === 'string' ? x : x && x.nombre, 40);
    const id = ident(typeof x === 'object' && x && x.id ? x.id : nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-'));
    return { id, nombre };
  }).filter((x) => x.id && x.nombre && !vistos.has(x.id) && vistos.add(x.id));
}
export function limpiaPagina(v) {
  const t = String(v || '').trim().slice(0, 200);
  if (!t) return '';
  try { const u = new URL(t); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
function perfilDe(neg) {
  let equipo = []; try { equipo = JSON.parse(neg.equipo || '[]'); } catch {}
  return { id: neg.id, nombre: neg.nombre, equipo: Array.isArray(equipo) ? equipo : [], pagina: neg.pagina || '' };
}

// ───────── seguridad ─────────

const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sin 0/O, 1/I/L
export function generaClave() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(b, (x) => LETRAS[x % LETRAS.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}
export const normalizaClave = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');
function aleatorio(n) { const b = crypto.getRandomValues(new Uint8Array(n)); return Array.from(b, (x) => LETRAS[x % LETRAS.length]).join(''); }
export async function sha256(t) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join(''); }
// ── sesiones de la dueña: guardadas en el servidor para poder verlas y quitarlas ──
const DIAS_SESION = 7;
export async function creaSesion(env, neg, request, metodo, nombreLlave) {
  const id = aleatorio(16), secreto = aleatorio(32), t = ahora(), expira = t + DIAS_SESION * 86400;
  await env.DB.prepare('INSERT INTO sesiones (id, negocio_id, hash, nombre, metodo, creado, ultimo, expira) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, neg.id, await sha256(secreto), nombreDispositivo(request), metodo, t, t, expira).run();
  // Máximo 20 sesiones vivas: la más vieja sale.
  await env.DB.prepare('UPDATE sesiones SET revocada=1 WHERE negocio_id=? AND revocada=0 AND id NOT IN (SELECT id FROM sesiones WHERE negocio_id=? AND revocada=0 ORDER BY creado DESC LIMIT 20)').bind(neg.id, neg.id).run();
  return { token: 's.' + id + '.' + secreto, expira, sesion: id };
}
export async function tokenValido(request, env, negocio) {
  const a = request.headers.get('Authorization') || '';
  const m = a.match(/^Bearer s\.([A-Za-z0-9]{8,40})\.([A-Za-z0-9]{20,64})$/);
  if (!m) return false;
  const s = await env.DB.prepare('SELECT * FROM sesiones WHERE id=? AND negocio_id=?').bind(m[1], negocio).first();
  if (!s || s.revocada || s.expira < ahora()) return false;
  const bien = await sha256(m[2]);
  let dif = bien.length ^ s.hash.length; for (let i = 0; i < bien.length; i++) dif |= bien.charCodeAt(i) ^ (s.hash.charCodeAt(i) || 0);
  if (dif) return false;
  if (ahora() - s.ultimo > 300) await env.DB.prepare('UPDATE sesiones SET ultimo=? WHERE id=?').bind(ahora(), s.id).run();
  return s;
}
export function nombreDispositivo(request) {
  const ua = request.headers.get('User-Agent') || '';
  const que = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Navegador';
  const nav = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return que + (nav ? ' · ' + nav : '');
}
async function dispositivos(env, neg, actual) {
  const ses = (await env.DB.prepare('SELECT id, nombre, metodo, creado, ultimo, expira FROM sesiones WHERE negocio_id=? AND revocada=0 AND expira>? ORDER BY ultimo DESC').bind(neg.id, ahora()).all()).results;
  const ll = (await env.DB.prepare('SELECT id, nombre, creado, ultimo FROM llaves WHERE negocio_id=? ORDER BY creado').bind(neg.id).all()).results;
  return { sesiones: ses.map((x) => ({ ...x, actual: x.id === actual.id })), llaves: ll };
}
// ── Face ID / huella ──
function rpDe(url, env, request) {
  if (url.hostname === 'agenda.solidaaplicaciones.com') return { id: url.hostname, origen: url.origin };
  // En las pruebas (wrangler dev cambia el host de la dirección): sólo http://localhost:<puerto>
  const o = request.headers.get('Origin') || '';
  if (env.WEBAUTHN_PRUEBA === '1' && /^http:\/\/localhost:\d+$/.test(o)) return { id: 'localhost', origen: o };
  throw new ErrorHttp(400, 'Abre tu agenda en agenda.solidaaplicaciones.com para entrar sin clave (Face ID, huella o PIN).');
}
async function nuevoReto(env, negocio, tipo) {
  const id = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO retos (id, negocio_id, tipo, creado) VALUES (?,?,?,?)').bind(id, negocio, tipo, ahora()).run();
  return id;
}
function retoDe(credencial) {
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(String(credencial.response.clientDataJSON).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(credencial.response.clientDataJSON).length + 3) % 4)), (c) => c.charCodeAt(0)))).challenge; } catch { return ''; }
}
async function gastaReto(env, negocio, tipo, id) {
  const r = id ? await env.DB.prepare('DELETE FROM retos WHERE id=? AND negocio_id=? AND tipo=? AND creado>? RETURNING id').bind(String(id), negocio, tipo, ahora() - 300).first() : null;
  if (!r) throw new ErrorHttp(400, 'La solicitud ya venció. Inténtalo de nuevo.');
  return r.id;
}
async function usaLlave(env, neg, rp, d, tipo) {
  const c = d.credencial || {};
  const llave = await env.DB.prepare('SELECT * FROM llaves WHERE negocio_id=? AND id=?').bind(neg.id, String(c.id || '')).first();
  const reto = await gastaReto(env, neg.id, tipo, retoDe(c));
  if (!llave) throw new ErrorHttp(401, 'Esa llave ya no está activa. Entra con tu clave.');
  let r; try { r = await verificaEntrada({ credencial: c, reto, origen: rp.origen, rpId: rp.id, llave }); } catch (e) { throw e instanceof ErrorLlave ? new ErrorHttp(401, e.message) : e; }
  await env.DB.prepare('UPDATE llaves SET contador=?, ultimo=? WHERE id=?').bind(r.contador, ahora(), llave.id).run();
  return llave;
}
async function exigeMaestra(request, env) {
  const a = request.headers.get('Authorization') || '';
  if (!env.MAESTRA || env.MAESTRA.length < 24 || a !== 'Bearer ' + env.MAESTRA) throw new ErrorHttp(401, 'No autorizado');
}
async function ipDe(request, env) { return (await sha256((request.headers.get('CF-Connecting-IP') || 'local') + (env.SECRETO || ''))).slice(0, 16); }
async function limita(env, clave, max, ventanaSeg, mensaje) {
  const v = Math.floor(ahora() / ventanaSeg);
  const r = await env.DB.prepare('INSERT INTO intentos (clave, ventana, n) VALUES (?,?,1) ON CONFLICT(clave, ventana) DO UPDATE SET n=n+1 RETURNING n').bind(clave, v).first();
  if (r && r.n > max) throw new ErrorHttp(429, mensaje);
}

async function limpia(env) {
  const corte = sumaDias(hoyEn('America/Monterrey').fecha, -DIAS_GUARDADO);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM citas WHERE fecha < ?').bind(corte),
    env.DB.prepare('DELETE FROM bloqueos WHERE fecha < ?').bind(corte),
    env.DB.prepare("DELETE FROM repetidos WHERE hasta <> '' AND hasta < ?").bind(corte),
    env.DB.prepare('DELETE FROM avisos WHERE creado < ?').bind(ahora() - 7 * 86400),
    env.DB.prepare('DELETE FROM retos WHERE creado < ?').bind(ahora() - 3600),
    env.DB.prepare('DELETE FROM sesiones WHERE expira < ? OR (revocada=1 AND ultimo < ?)').bind(ahora() - 30 * 86400, ahora() - 30 * 86400),
    env.DB.prepare('DELETE FROM cal_ocupado WHERE fecha < ?').bind(sumaDias(hoyEn('America/Monterrey').fecha, -1)),
    env.DB.prepare('DELETE FROM intentos WHERE ventana < ?').bind(Math.floor(ahora() / 3600) - 48),
  ]);
}

// ───────── la app de la clienta y las propuestas de hora nueva ─────────
const DISP = /^[A-Za-z0-9_-]{20,80}$/;
async function dispDe(request) { const t = request.headers.get('X-Dispositivo') || ''; return DISP.test(t) ? sha256('disp|' + t) : ''; }
async function cuerpoCopia(request) { try { return JSON.parse(await request.clone().text() || '{}') || {}; } catch { return {}; } }
// El enlace de «su cita» en la página del negocio: la abre, la guarda en su teléfono y la invita a instalar la app.
async function enlaceDeCita(env, neg, folio) {
  if (!neg.pagina) throw new ErrorHttp(400, 'Tu agenda todavía no tiene página conectada. Escríbele a Solida.');
  const c = await env.DB.prepare('SELECT id, resp, estado FROM citas WHERE negocio_id=? AND folio=?').bind(neg.id, folio).first();
  if (!c) throw new ErrorHttp(404, 'No existe esa cita');
  let resp = c.resp;
  if (!resp) { resp = aleatorio(20); await env.DB.prepare('UPDATE citas SET resp=? WHERE id=?').bind(resp, c.id).run(); }
  return neg.pagina + (neg.pagina.includes('?') ? '&' : '?') + 'cita=' + encodeURIComponent(folio) + '&t=' + encodeURIComponent(resp);
}
// «Tu código QR»: a dónde lleva y cuántas clientas trajo este mes.
async function datosQr(env, neg) {
  const hoy = hoyEn(neg.zona).fecha, mes = hoy.slice(0, 7);
  const desde = Math.floor(new Date(mes + '-01T06:00:00Z').getTime() / 1000);
  const del = (await env.DB.prepare("SELECT tel, creada FROM citas WHERE negocio_id=? AND via='qr' AND estado<>'cancelada' AND creada>=?").bind(neg.id, desde).all()).results;
  let nuevas = 0;
  for (const c of del) {
    const antes = await env.DB.prepare('SELECT 1 FROM citas WHERE negocio_id=? AND tel=? AND creada<? LIMIT 1').bind(neg.id, c.tel, c.creada).first();
    if (!antes) nuevas++;
  }
  const conApp = await env.DB.prepare("SELECT COUNT(DISTINCT disp) n FROM suscripciones WHERE negocio_id=? AND disp<>''").bind(neg.id).first();
  return { url: neg.pagina ? neg.pagina + (neg.pagina.includes('?') ? '&' : '?') + 'de=qr' : '', pagina: neg.pagina || '', nombre: neg.nombre, mes, delQr: del.length, nuevas, conApp: conApp.n };
}
const enlacePropuesta = (neg, folio, resp) => AGENDA + '/' + neg.id + '/cita/' + encodeURIComponent(folio) + '?t=' + encodeURIComponent(resp);
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (f) => { const d = new Date(f + 'T12:00:00Z'); return DIAS_C[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MESES_C[d.getUTCMonth()]; };
const hora12 = (m) => { const h = Math.floor(m / 60), mi = m % 60; return (h % 12 || 12) + ':' + String(mi).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
const minutosDe = (v) => { const x = String(v || '').match(/^(\d{2}):(\d{2})$/); return x ? +x[1] * 60 + +x[2] : null; };

// Lo que ya está ocupado un día: citas (con folio, para poder excluir la que se mueve) y lo demás (bloqueos, planes, calendario).
async function ocupacionDia(env, neg, fecha) {
  const [c, b, cal, rep] = await Promise.all([
    env.DB.prepare("SELECT folio, inicio_min ini, fin_min fin, persona FROM citas WHERE negocio_id=? AND fecha=? AND estado<>'cancelada'").bind(neg.id, fecha).all(),
    env.DB.prepare('SELECT inicio_min ini, fin_min fin, persona FROM bloqueos WHERE negocio_id=? AND fecha=?').bind(neg.id, fecha).all(),
    env.DB.prepare('SELECT inicio_min ini, fin_min fin, persona FROM cal_ocupado WHERE negocio_id=? AND fecha=?').bind(neg.id, fecha).all(),
    repetidosDe(env, neg.id, fecha),
  ]);
  const wd = String(diaSemana(fecha));
  const reps = rep.filter((x) => x.dias.includes(wd) && x.desde <= fecha && (!x.hasta || x.hasta >= fecha)).map((x) => ({ ini: x.inicio_min, fin: x.fin_min, persona: x.persona }));
  return { citas: c.results, otros: b.results.concat(cal.results, reps) };
}
export function cabe(neg, occ, fecha, ini, fin, persona, excluir = [], conHorario = true) {
  if (conHorario && fueraDeHorario(neg, fecha, ini, fin, persona)) return false;
  if (occ.citas.some((x) => !excluir.includes(x.folio) && x.ini < fin && x.fin > ini && (x.persona === persona || x.persona === '' || persona === ''))) return false;
  return !occ.otros.some((x) => x.ini < fin && x.fin > ini && (x.persona === persona || x.persona === ''));
}
// Las primeras horas libres para un servicio de «dur» minutos, cada media hora, dentro del horario de esa persona.
async function buscaHuecos(env, neg, { persona = '', dur, desde, desdeMin = 0, excluir = [], extra = [], max = 6, dias = 14 }) {
  const h = leeHorario(neg), sem = h[persona] || h[''] || null, hoy = hoyEn(neg.zona), out = [];
  for (let i = 0, f = desde < hoy.fecha ? hoy.fecha : desde; i < dias && out.length < max; i++, f = sumaDias(f, 1)) {
    const x = sem ? sem[String(diaSemana(f))] : [600, 1140];
    if (!x) continue;
    const occ = await ocupacionDia(env, neg, f);
    occ.otros = occ.otros.concat(extra.filter((e) => e.fecha === f));
    let m = Math.max(x[0], f === desde ? desdeMin : 0, f === hoy.fecha ? hoy.min + 60 : 0);
    for (m = Math.ceil(m / 30) * 30; m + dur <= x[1] && out.length < max; m += 30) if (cabe(neg, occ, f, m, m + dur, persona, excluir, !!sem)) out.push({ fecha: f, ini: m });
  }
  return out;
}
async function citaDeClienta(env, neg, folio, t, disp) {
  const c = await env.DB.prepare('SELECT * FROM citas WHERE negocio_id=? AND folio=?').bind(neg.id, folio).first();
  if (!c || !((t && c.resp && t === c.resp) || (disp && c.disp && disp === c.disp))) throw new ErrorHttp(404, 'No encontramos esa cita');
  return c;
}
function citaPublica(neg, c) {
  return { folio: c.folio, nombre: c.nombre, fecha: c.fecha, ini: c.inicio_min, fin: c.fin_min, persona: c.persona, con: nombreEnEquipo(neg, c.persona), servicio: c.servicio,
    diseno: c.diseno, detalle: c.detalle, precio: c.precio, anticipo: c.anticipo, estado: c.estado, antesFecha: c.antes_fecha, antesIni: c.antes_ini, hasta: c.propuesta_hasta,
    enlace: c.estado === 'propuesta' && c.resp ? enlacePropuesta(neg, c.folio, c.resp) : '' };
}
async function misCitas(env, neg, disp) {
  const l = (await env.DB.prepare('SELECT * FROM citas WHERE negocio_id=? AND disp=? AND fecha>=? ORDER BY fecha DESC, inicio_min DESC LIMIT 40')
    .bind(neg.id, disp, sumaDias(hoyEn(neg.zona).fecha, -365)).all()).results;
  return { hoy: hoyEn(neg.zona).fecha, negocio: { nombre: neg.nombre, recordar: neg.recordar || '60' }, citas: l.map((c) => citaPublica(neg, c)) };
}
const avisaDuena = (env, neg, aviso) => avisa(env, neg.id, aviso).catch((e) => console.error('aviso dueña', e));
async function cancelaClienta(env, neg, c, ctx) {
  if (c.estado === 'cancelada') return { ok: true };
  await env.DB.prepare("UPDATE citas SET estado='cancelada' WHERE id=?").bind(c.id).run();
  const av = avisaDuena(env, neg, { titulo: c.nombre + ' canceló su cita', cuerpo: fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min) + ' · ' + c.servicio + '. Esa hora ya está libre en tu página.', url: '/' + neg.id + '/?dia=' + c.fecha });
  if (ctx) ctx.waitUntil(av); else await av;
  return { ok: true };
}
async function mueveA(env, neg, c, d, estado) {
  const fecha = String(d.fecha || ''), ini = minutosDe(d.hora), dur = c.fin_min - c.inicio_min, hoy = hoyEn(neg.zona);
  if (!FECHA.test(fecha) || ini == null) throw new ErrorHttp(400, 'Elige el día y la hora');
  if (fecha < hoy.fecha || (fecha === hoy.fecha && ini <= hoy.min) || fecha > sumaDias(hoy.fecha, DIAS_MAX_ADELANTE)) throw new ErrorHttp(400, 'Esa hora ya no se puede');
  if (!cabe(neg, await ocupacionDia(env, neg, fecha), fecha, ini, ini + dur, c.persona, [c.folio], true)) throw new ErrorHttp(409, 'Esa hora ya no está disponible. Elige otra.');
  await env.DB.prepare("UPDATE citas SET fecha=?, inicio_min=?, fin_min=?, estado=?, antes_fecha='', antes_ini=0, propuesta_hasta=0, aviso_cli=0, recordada=0 WHERE id=?")
    .bind(fecha, ini, ini + dur, estado, c.id).run();
  return { fecha, ini };
}
async function mueveClienta(env, neg, c, d, ctx) {
  if (c.estado === 'cancelada') throw new ErrorHttp(400, 'Esa cita ya está cancelada');
  const n = await mueveA(env, neg, c, d, 'apartada');
  const av = avisaDuena(env, neg, { titulo: c.nombre + ' cambió su cita', cuerpo: 'Antes ' + fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min) + ', ahora ' + fechaCorta(n.fecha) + ' · ' + hora12(n.ini) + '. Confírmasela.', url: '/' + neg.id + '/?cita=' + encodeURIComponent(c.folio) });
  if (ctx) ctx.waitUntil(av); else await av;
  return { ok: true, ...n };
}
async function vistaPropuesta(env, neg, c) {
  const hoy = hoyEn(neg.zona).fecha, dur = c.fin_min - c.inicio_min;
  const huecos = c.estado === 'cancelada' ? [] : await buscaHuecos(env, neg, { persona: c.persona, dur, desde: hoy, excluir: [c.folio], max: 9 });
  return { negocio: { nombre: neg.nombre, pagina: neg.pagina || '' }, cita: citaPublica(neg, c), huecos };
}
async function contestaPropuesta(env, neg, c, d, ctx) {
  const accion = String(d.accion || '');
  if (c.estado === 'cancelada') throw new ErrorHttp(400, 'Esa cita ya está cancelada');
  let aviso;
  if (accion === 'acepto') {
    if (c.estado !== 'propuesta') return { ok: true, estado: c.estado };
    await env.DB.prepare("UPDATE citas SET estado='confirmada', antes_fecha='', antes_ini=0, propuesta_hasta=0 WHERE id=?").bind(c.id).run();
    aviso = { titulo: c.nombre + ' aceptó la hora nueva', cuerpo: fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min) + ' · ' + c.servicio + '. Quedó confirmada.' };
  } else if (accion === 'otra') {
    const n = await mueveA(env, neg, c, d, 'confirmada');
    aviso = { titulo: c.nombre + ' eligió otra hora', cuerpo: fechaCorta(n.fecha) + ' · ' + hora12(n.ini) + ' · ' + c.servicio + '. Quedó confirmada.' };
  } else if (accion === 'cancelo') {
    await env.DB.prepare("UPDATE citas SET estado='cancelada' WHERE id=?").bind(c.id).run();
    aviso = { titulo: c.nombre + ' canceló su cita', cuerpo: 'No pudo con la hora nueva (' + fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min) + '). Esa hora ya está libre.' };
  } else throw new ErrorHttp(400, 'Elige una opción');
  const av = avisaDuena(env, neg, { ...aviso, url: '/' + neg.id + '/?cita=' + encodeURIComponent(c.folio) });
  if (ctx) ctx.waitUntil(av); else await av;
  const nueva = await env.DB.prepare('SELECT * FROM citas WHERE id=?').bind(c.id).first();
  return { ok: true, cita: citaPublica(neg, nueva) };
}
// Cuando la dueña confirma o cancela: a la clienta le llega a su teléfono (y si canceló, también por correo si lo dejó).
async function avisaCambioEstado(env, neg, c) {
  if (!c) return;
  const quien = nombreEnEquipo(neg, c.persona);
  if (c.estado === 'confirmada' && c.disp) {
    await avisa(env, neg.id, { titulo: 'Tu cita quedó confirmada', cuerpo: fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min) + ' · ' + c.servicio + (quien ? ' con ' + quien : '') + '. ¡Te esperamos!', url: neg.pagina || '' }, c.disp);
  }
  if (c.estado === 'cancelada') {
    if (c.disp) await avisa(env, neg.id, { titulo: 'Tu cita se canceló', cuerpo: fechaCorta(c.fecha) + ' · ' + hora12(c.inicio_min) + ' · ' + c.servicio + '. Toca para agendar otra.', url: neg.pagina || '' }, c.disp);
    if (c.correo) { const m = correoCancelada(neg, { ...c, ini: c.inicio_min }, quien, neg.pagina || ''); await mandaCorreo(env, c.correo, 'Tu cita en ' + neg.nombre + ' se canceló', m.html, m.texto); }
  }
}
// «Se me atravesó algo»: qué citas caen en ese tiempo y la primera hora libre para cada una (sin encimarlas entre sí).
async function sugiereMovidas(env, neg, d) {
  const fecha = String(d.fecha || '');
  if (!FECHA.test(fecha)) throw new ErrorHttp(400, 'Elige el día');
  const ini = d.desde ? minutosDe(d.desde) : 0, fin = d.hasta ? minutosDe(d.hasta) : 1440;
  if (ini == null || fin == null || fin <= ini) throw new ErrorHttp(400, 'La hora de fin va después de la de inicio');
  const persona = personaValida(neg, d.persona);
  const l = (await env.DB.prepare("SELECT * FROM citas WHERE negocio_id=? AND fecha=? AND estado<>'cancelada' AND inicio_min<? AND fin_min>? ORDER BY inicio_min")
    .bind(neg.id, fecha, fin, ini).all()).results.filter((c) => !persona || c.persona === persona || c.persona === '');
  const conApp = new Set((await env.DB.prepare("SELECT DISTINCT disp FROM suscripciones WHERE negocio_id=? AND disp<>''").bind(neg.id).all()).results.map((x) => x.disp));
  const excluir = l.map((c) => c.folio), extra = [{ fecha, ini, fin, persona }], afectadas = [];
  for (const c of l) {
    const dur = c.fin_min - c.inicio_min;
    const alternativas = await buscaHuecos(env, neg, { persona: c.persona, dur, desde: fecha, desdeMin: fin, excluir, extra, max: 6 });
    const p = alternativas[0] || null;
    if (p) extra.push({ fecha: p.fecha, ini: p.ini, fin: p.ini + dur, persona: c.persona });
    afectadas.push({ folio: c.folio, nombre: c.nombre, tel: c.tel, servicio: c.servicio, diseno: c.diseno, persona: c.persona, con: nombreEnEquipo(neg, c.persona),
      ini: c.inicio_min, fin: c.fin_min, dur, app: !!c.disp && conApp.has(c.disp), correo: !!c.correo, propuesta: p, alternativas });
  }
  return { fecha, ini, fin, persona, afectadas };
}
async function proponeMovidas(env, neg, d) {
  const b = d.bloqueo || {};
  if (b.fecha) await bloquear(env, neg, { fecha: b.fecha, desde: b.desde, hasta: b.hasta, persona: b.persona, motivo: b.motivo || 'Se me atravesó algo' });
  const hoy = hoyEn(neg.zona);
  // Se le guarda hasta mañana a las 10 de la mañana (hora del negocio)
  const man = sumaDias(hoy.fecha, 1).split('-').map(Number);
  const hasta = Math.floor(aInstante({ y: man[0], mo: man[1], d: man[2], h: 10, mi: 0 }, neg.zona) / 1000);
  const resultados = [];
  for (const pr of (Array.isArray(d.propuestas) ? d.propuestas : []).slice(0, 40)) {
    const c = await env.DB.prepare('SELECT * FROM citas WHERE negocio_id=? AND folio=?').bind(neg.id, String(pr.folio || '')).first();
    if (!c || c.estado === 'cancelada') continue;
    const fecha = String(pr.fecha || ''), ini = minutosDe(pr.hora), dur = c.fin_min - c.inicio_min;
    if (!FECHA.test(fecha) || ini == null) { resultados.push({ folio: c.folio, error: 'Falta la hora nueva' }); continue; }
    if (!cabe(neg, await ocupacionDia(env, neg, fecha), fecha, ini, ini + dur, c.persona, [c.folio], false)) { resultados.push({ folio: c.folio, error: 'Esa hora ya se ocupó' }); continue; }
    const resp = c.resp || aleatorio(20);
    await env.DB.prepare("UPDATE citas SET antes_fecha=?, antes_ini=?, fecha=?, inicio_min=?, fin_min=?, estado='propuesta', propuesta_hasta=?, resp=?, aviso_cli=0, recordada=0 WHERE id=?")
      .bind(c.antes_fecha || c.fecha, c.antes_fecha ? c.antes_ini : c.inicio_min, fecha, ini, ini + dur, hasta, resp, c.id).run();
    const n = { ...c, antes_fecha: c.antes_fecha || c.fecha, antes_ini: c.antes_fecha ? c.antes_ini : c.inicio_min, fecha, ini, fin: ini + dur, inicio_min: ini };
    const link = enlacePropuesta(neg, c.folio, resp), quien = nombreEnEquipo(neg, c.persona);
    let app = false, correo = false;
    if (c.disp) app = (await avisa(env, neg.id, { titulo: 'Tu cita cambió de hora', cuerpo: (quien || neg.nombre) + ' te propone ' + fechaCorta(fecha) + ' a las ' + hora12(ini) + '. Toca para contestar.', url: link }, c.disp)).enviados > 0;
    if (c.correo) { const m = correoPropuesta(neg, n, quien, link, 'mañana a las 10:00 am'); correo = await mandaCorreo(env, c.correo, neg.nombre + ' te propone mover tu cita', m.html, m.texto); }
    resultados.push({ folio: c.folio, nombre: c.nombre, tel: c.tel, fecha, ini, antesFecha: n.antes_fecha, antesIni: n.antes_ini, link, app, correo });
  }
  return { resultados };
}
// Cada 15 minutos: el recordatorio a las clientas que tienen la app (1 h o 2 h antes, y si la dueña quiere, también la noche anterior).
async function recordatoriosClientas(env) {
  const negs = (await env.DB.prepare("SELECT * FROM negocios n WHERE activo=1 AND EXISTS (SELECT 1 FROM suscripciones s WHERE s.negocio_id=n.id AND s.disp<>'')").all()).results;
  for (const neg of negs) {
    const hoy = hoyEn(neg.zona), man = sumaDias(hoy.fecha, 1), modo = neg.recordar || '60', antes = modo === '120' ? 120 : 60;
    const l = (await env.DB.prepare("SELECT * FROM citas WHERE negocio_id=? AND disp<>'' AND estado IN ('apartada','confirmada') AND fecha IN (?,?)").bind(neg.id, hoy.fecha, man).all()).results;
    for (const c of l) {
      const [y, mo, dd] = c.fecha.split('-').map(Number);
      const falta = (aInstante({ y, mo, d: dd, h: Math.floor(c.inicio_min / 60), mi: c.inicio_min % 60 }, neg.zona) - Date.now()) / 60000;
      const quien = nombreEnEquipo(neg, c.persona), qu = c.servicio + (quien ? ' con ' + quien : '');
      if (!(c.aviso_cli & 1) && falta > 0 && falta <= antes + 8) {
        await env.DB.prepare('UPDATE citas SET aviso_cli=aviso_cli|1 WHERE id=?').bind(c.id).run();
        await avisa(env, neg.id, { titulo: 'Tu cita es en ' + (antes === 120 ? '2 horas' : '1 hora'), cuerpo: neg.nombre + ' te espera a las ' + hora12(c.inicio_min) + ' · ' + qu + '.', url: neg.pagina || '' }, c.disp);
      } else if (modo === 'dia60' && !(c.aviso_cli & 2) && c.fecha === man && hoy.min >= 19 * 60) {
        await env.DB.prepare('UPDATE citas SET aviso_cli=aviso_cli|2 WHERE id=?').bind(c.id).run();
        await avisa(env, neg.id, { titulo: 'Mañana es tu cita', cuerpo: neg.nombre + ' te espera mañana a las ' + hora12(c.inicio_min) + ' · ' + qu + '.', url: neg.pagina || '' }, c.disp);
      }
    }
  }
}

// ───────── avisos ─────────
function nombreEnEquipo(neg, id) { const p = perfilDe(neg).equipo.find((x) => x.id === id); return p ? p.nombre : ''; }
async function estadoAvisos(env, neg) {
  const n = await env.DB.prepare("SELECT COUNT(*) n FROM suscripciones WHERE negocio_id=? AND disp=''").bind(neg.id).first();
  const cl = await env.DB.prepare("SELECT COUNT(DISTINCT disp) n FROM suscripciones WHERE negocio_id=? AND disp<>''").bind(neg.id).first();
  return { vapid: vapidPublica(env), telefonos: n ? n.n : 0, correo: neg.correo || '', avisoCorreo: !!neg.aviso_correo, correoDisponible: correoDisponible(env),
    recordar: neg.recordar || '60', clientasConApp: cl ? cl.n : 0 };
}
// A partir de las 8 de la noche (hora del negocio), una vez al día: «Mañana tienes N citas».
async function resumenesDeLaNoche(env) {
  const negs = (await env.DB.prepare("SELECT n.* FROM negocios n WHERE n.activo=1 AND EXISTS (SELECT 1 FROM suscripciones s WHERE s.negocio_id=n.id AND s.disp='')").all()).results;
  for (const neg of negs) {
    const h = hoyEn(neg.zona);
    if ((h.min < 20 * 60 && env.RESUMEN_PRUEBA !== '1') || neg.resumen === h.fecha) continue;
    await env.DB.prepare('UPDATE negocios SET resumen=? WHERE id=?').bind(h.fecha, neg.id).run();
    const man = sumaDias(h.fecha, 1);
    const r = await env.DB.prepare("SELECT COUNT(*) n, SUM(CASE WHEN recordada=0 THEN 1 ELSE 0 END) sin FROM citas WHERE negocio_id=? AND fecha=? AND estado<>'cancelada'").bind(neg.id, man).first();
    if (!r || !r.n) continue;
    await avisa(env, neg.id, { titulo: 'Mañana tienes ' + r.n + (r.n === 1 ? ' cita' : ' citas'),
      cuerpo: r.sin ? 'Toca para mandarles su recordatorio por WhatsApp.' : 'Ya les mandaste su recordatorio a todas.', url: '/' + neg.id + '/' });
  }
}

// ───────── su calendario de Google, iCloud u Outlook ─────────
// La dueña pega la «dirección secreta en formato iCal» (sólo lectura). Se guarda cifrada; cada 15 minutos se lee
// y se guardan nada más las horas ocupadas de los próximos 90 días. Lo que anote ahí, su página lo da por ocupado.

const HOSTS_CALENDARIO = [/^calendar\.google\.com$/, /^([a-z0-9-]+\.)*icloud\.com$/, /^outlook\.(live|office|office365)\.com$/];
const TAMANO_MAX = 4 * 1024 * 1024;
export function validaUrlCalendario(v, env = {}) {
  let t = String(v || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!t) throw new ErrorHttp(400, 'Pega la dirección de tu calendario');
  let u; try { u = new URL(t); } catch { throw new ErrorHttp(400, 'Esa dirección no se ve completa. Cópiala otra vez de tu calendario.'); }
  const prueba = env.CALENDARIOS_PRUEBA === '1' && u.protocol === 'http:' && u.hostname === '127.0.0.1';
  if (!prueba && (u.protocol !== 'https:' || !HOSTS_CALENDARIO.some((x) => x.test(u.hostname)))) {
    throw new ErrorHttp(400, 'Por ahora funciona con Google Calendar, iCloud (iPhone) y Outlook. Copia la dirección secreta en formato iCal.');
  }
  if (/calendar\.google\.com$/.test(u.hostname) && !/\/ical\/.+\.ics$/.test(u.pathname)) {
    throw new ErrorHttp(400, 'Ésa no es la dirección secreta. En Google Calendar es la que termina en «basic.ics».');
  }
  return u.href;
}
async function llaveCalendarios(env) {
  if (!env.SECRETO || env.SECRETO.length < 24) throw new ErrorHttp(500, 'Falta configurar SECRETO');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(env.SECRETO + '|calendarios'));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function cifra(env, texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await llaveCalendarios(env), enc.encode(texto)));
  return b64(iv) + '.' + b64(c);
}
export async function descifra(env, t) {
  const [iv, c] = String(t).split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await llaveCalendarios(env), deB64(c)));
}
async function bajaCalendario(url) {
  let r;
  try { r = await fetch(url, { headers: { Accept: 'text/calendar, */*' }, signal: AbortSignal.timeout(12000), cf: { cacheTtl: 0 } }); }
  catch { throw new ErrorHttp(502, 'Tu calendario no contestó. Lo volvemos a intentar en unos minutos.'); }
  if (r.status === 404 || r.status === 401 || r.status === 403) throw new ErrorHttp(400, 'Tu calendario ya no deja leerse con esa dirección. Si la restableciste en Google, pega la nueva.');
  if (!r.ok) throw new ErrorHttp(502, 'Tu calendario contestó con un error (' + r.status + '). Lo volvemos a intentar en unos minutos.');
  if (Number(r.headers.get('content-length') || 0) > TAMANO_MAX) throw new ErrorHttp(400, 'Tu calendario es demasiado grande para leerlo.');
  const t = await r.text();
  if (t.length > TAMANO_MAX) throw new ErrorHttp(400, 'Tu calendario es demasiado grande para leerlo.');
  if (!/BEGIN:VCALENDAR/.test(t)) throw new ErrorHttp(400, 'Esa dirección no es un calendario. Copia la «dirección secreta en formato iCal».');
  return t;
}
async function sincroniza(env, neg, cal) {
  const hoy = hoyEn(neg.zona).fecha;
  try {
    const texto = await bajaCalendario(await descifra(env, cal.url_cifrada));
    const horas = horasOcupadas(texto, neg.zona, hoy, sumaDias(hoy, DIAS_MAX_ADELANTE + 1)).slice(0, 3000);
    const ins = env.DB.prepare('INSERT INTO cal_ocupado (calendario_id, negocio_id, persona, fecha, inicio_min, fin_min) VALUES (?,?,?,?,?,?)');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM cal_ocupado WHERE calendario_id=?').bind(cal.id),
      ...horas.map((x) => ins.bind(cal.id, neg.id, cal.persona, x.fecha, x.ini, x.fin)),
      env.DB.prepare("UPDATE calendarios SET estado='ok', error='', revisado=?, bloques=? WHERE id=?").bind(ahora(), horas.length, cal.id),
    ]);
    return { ok: true, bloques: horas.length };
  } catch (e) {
    // Si falla, se queda lo que ya se había leído: mejor horas ocupadas de hace un rato que ninguna.
    const msg = e instanceof ErrorHttp ? e.message : 'No pudimos leer tu calendario.';
    if (!(e instanceof ErrorHttp)) console.error(e);
    await env.DB.prepare("UPDATE calendarios SET estado='error', error=?, revisado=? WHERE id=?").bind(msg, ahora(), cal.id).run();
    return { ok: false, error: msg };
  }
}
async function calendarioPublico(env, id) {
  const c = await env.DB.prepare('SELECT id, persona, host, estado, error, revisado, bloques FROM calendarios WHERE id=?').bind(id).first();
  return c;   // nunca la dirección
}
async function conectaCalendario(env, neg, d) {
  const persona = personaValida(neg, d.persona);
  const url = validaUrlCalendario(d.url, env);
  const n = await env.DB.prepare('SELECT COUNT(*) n FROM calendarios WHERE negocio_id=? AND persona<>?').bind(neg.id, persona).first();
  if (n && n.n >= 10) throw new ErrorHttp(400, 'Ya hay muchos calendarios conectados.');
  // Uno por persona: conectar otro reemplaza al anterior.
  const viejos = (await env.DB.prepare('SELECT id FROM calendarios WHERE negocio_id=? AND persona=?').bind(neg.id, persona).all()).results;
  const r = await env.DB.prepare('INSERT INTO calendarios (negocio_id, persona, url_cifrada, host, creado) VALUES (?,?,?,?,?)')
    .bind(neg.id, persona, await cifra(env, url), new URL(url).hostname, ahora()).run();
  const cal = await env.DB.prepare('SELECT * FROM calendarios WHERE id=?').bind(r.meta.last_row_id).first();
  const s = await sincroniza(env, neg, cal);
  if (!s.ok) {
    await env.DB.prepare('DELETE FROM calendarios WHERE id=?').bind(cal.id).run();
    throw new ErrorHttp(400, s.error);
  }
  for (const v of viejos) await env.DB.batch([
    env.DB.prepare('DELETE FROM cal_ocupado WHERE calendario_id=?').bind(v.id), env.DB.prepare('DELETE FROM calendarios WHERE id=?').bind(v.id)]);
  return calendarioPublico(env, cal.id);
}
async function sincronizaTodos(env) {
  const l = (await env.DB.prepare('SELECT c.*, n.zona, n.nombre, n.equipo, n.horario FROM calendarios c JOIN negocios n ON n.id=c.negocio_id WHERE n.activo=1 AND c.revisado < ? ORDER BY c.revisado LIMIT 40')
    .bind(ahora() - (env.CALENDARIOS_PRUEBA === '1' ? -60 : 13 * 60)).all()).results;
  for (const c of l) await sincroniza(env, { id: c.negocio_id, zona: c.zona }, c);
}

// ───────── la agenda de la dueña (app instalable) ─────────
// /:negocio/ es la app; los archivos comunes viven en /_app/ (carpeta agenda/). El manifiesto y el icono
// se arman por negocio para que, instalada, lleve su nombre y sus iniciales.

const SEGURIDAD = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
};
const EJEMPLO = { id: 'ejemplo', nombre: 'Atelier Mía', activo: 1 };

async function app(request, env, url) {
  const m = request.method;
  if (m !== 'GET' && m !== 'HEAD') throw new ErrorHttp(405, 'No permitido');
  const ruta = url.pathname;
  if (ruta === '/') {
    if (url.hostname.startsWith('agenda.')) return Response.redirect('https://solidaaplicaciones.com/', 302);
    return json({ servicio: 'citas de Solida', ok: true });
  }
  if (ruta.startsWith('/_app/')) {
    if (!ARCHIVOS[ruta]) return paginaNoExiste();
    return archivo(ruta, { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  }
  const p = ruta.match(/^\/([a-z0-9-]{2,40})(\/|\/manifest\.webmanifest|\/icono\.svg|\/sw\.js|\/cita\/[A-Z0-9-]{4,20})?$/);
  if (!p) return paginaNoExiste();
  const neg = p[1] === 'ejemplo' ? EJEMPLO : await env.DB.prepare('SELECT id, nombre FROM negocios WHERE id=? AND activo=1').bind(p[1]).first();
  if (!neg) return paginaNoExiste();
  const que = p[2] || '';
  if (que === '') return Response.redirect(url.origin + '/' + neg.id + '/', 301);
  if (que === '/manifest.webmanifest') return new Response(JSON.stringify(manifiesto(neg)), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ...SEGURIDAD } });
  if (que === '/icono.svg') return new Response(iconoSvg(neg.nombre), { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', ...SEGURIDAD } });
  // La página donde la clienta contesta «te proponemos otra hora» (o cambia o cancela su cita): sin clave, con el enlace que le llegó.
  if (que.startsWith('/cita/')) return archivo('/cita.html', { 'Cache-Control': 'no-cache', ...SEGURIDAD });
  return archivo(que === '/sw.js' ? '/sw.js' : '/index.html', { 'Cache-Control': 'no-cache', ...SEGURIDAD });
}
function archivo(ruta, cabeceras) {
  const a = ARCHIVOS[ruta];
  const cuerpo = a.b64 ? Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)) : a.cuerpo;
  return new Response(cuerpo, { headers: { 'Content-Type': a.tipo, ...cabeceras } });
}
export function iniciales(nombre) {
  const p = String(nombre || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase();
}
function manifiesto(neg) {
  return {
    name: 'Agenda · ' + neg.nombre, short_name: String(neg.nombre).slice(0, 12), id: '/' + neg.id + '/',
    start_url: '/' + neg.id + '/', scope: '/' + neg.id + '/', display: 'standalone', orientation: 'portrait',
    background_color: '#f7f3ec', theme_color: '#161412', lang: 'es-MX',
    icons: [
      { src: '/' + neg.id + '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/_app/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/_app/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
function iconoSvg(nombre) {
  const t = iniciales(nombre).replace(/[<>&"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#161412"/>` +
    `<circle cx="256" cy="256" r="170" fill="none" stroke="#c9a96e" stroke-width="10"/>` +
    `<text x="256" y="300" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="150" fill="#c9a96e">${t}</text></svg>`;
}
function paginaNoExiste() {
  return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agenda no encontrada</title>' +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f3ec;color:#161412;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center">' +
    '<div><h1 style="font:500 30px Georgia,serif;margin:0 0 8px">Esta agenda no existe</h1><p style="margin:0;color:#6b6157">Revisa la dirección que te mandaron. Si no la encuentras, escríbele a Solida Aplicaciones.</p></div></body></html>',
  { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD } });
}

// ───────── utilidades ─────────

async function cuerpo(request) {
  const t = await request.text();
  if (t.length > 8000) throw new ErrorHttp(413, 'Demasiado grande');
  try { const d = JSON.parse(t || '{}'); return d && typeof d === 'object' ? d : {}; } catch { throw new ErrorHttp(400, 'JSON no válido'); }
}
function json(d, status = 200, extra = {}) {
  return new Response(JSON.stringify(d), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
// Cualquier página puede consultar y apartar (las de los clientes viven en sus propios dominios);
// lo privado se protege con el token, no con el origen.
function cors(res, request) {
  const r = new Response(res.body, res);
  r.headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  r.headers.set('Vary', 'Origin');
  r.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  r.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Dispositivo');   // X-Dispositivo: el teléfono de la clienta
  r.headers.set('Access-Control-Max-Age', '86400');
  return r;
}
