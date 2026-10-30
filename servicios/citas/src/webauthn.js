// Entrar con Face ID, Touch ID o huella (WebAuthn / «llaves de acceso»), sin librerías.
// El teléfono guarda una llave privada que nunca sale de él; aquí sólo guardamos su llave pública y comprobamos firmas.
// Se acepta ES256 (lo que usan iPhone y Android) y RS256 (Windows Hello). Sin «attestation»: no nos importa la marca del aparato.

const enc = new TextEncoder();
export const b64url = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const deB64url = (s) => {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(t + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
};
export class ErrorLlave extends Error {}
const falla = (m) => { throw new ErrorLlave(m); };

// ── CBOR (lo justo para lo que mandan los teléfonos) ──
export function leeCbor(u8) {
  let i = 0;
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const largo = (info) => {
    if (info < 24) return info;
    if (info === 24) return u8[i++];
    if (info === 25) { const n = v.getUint16(i); i += 2; return n; }
    if (info === 26) { const n = v.getUint32(i); i += 4; return n; }
    if (info === 27) { const n = Number(v.getBigUint64(i)); i += 8; return n; }
    falla('CBOR con largo indefinido');
  };
  const item = (prof = 0) => {
    if (prof > 16 || i >= u8.length) falla('CBOR mal formado');
    const b = u8[i++], tipo = b >> 5, info = b & 31;
    if (tipo === 0) return largo(info);
    if (tipo === 1) return -1 - largo(info);
    if (tipo === 2) { const n = largo(info); const r = u8.slice(i, i + n); i += n; return r; }
    if (tipo === 3) { const n = largo(info); const r = new TextDecoder().decode(u8.slice(i, i + n)); i += n; return r; }
    if (tipo === 4) { const n = largo(info); const a = []; for (let k = 0; k < n; k++) a.push(item(prof + 1)); return a; }
    if (tipo === 5) { const n = largo(info); const m = new Map(); for (let k = 0; k < n; k++) { const key = item(prof + 1); m.set(key, item(prof + 1)); } return m; }
    if (tipo === 7) { if (info === 20) return false; if (info === 21) return true; if (info === 22) return null; }
    falla('CBOR con un tipo que no esperábamos');
  };
  const r = item();
  return { valor: r, fin: i };
}

// ── datos del autenticador ──
export function leeAuthData(ad) {
  if (ad.length < 37) falla('Datos del autenticador incompletos');
  const flags = ad[32];
  const out = { rpIdHash: ad.slice(0, 32), up: !!(flags & 1), uv: !!(flags & 4), at: !!(flags & 64), contador: new DataView(ad.buffer, ad.byteOffset + 33, 4).getUint32(0) };
  if (out.at) {
    if (ad.length < 55) falla('Faltan los datos de la llave');
    const n = (ad[53] << 8) | ad[54];
    out.credId = ad.slice(55, 55 + n);
    const resto = ad.slice(55 + n);
    out.cose = leeCbor(resto).valor;
  }
  return out;
}
// COSE → JWK (para importarla en WebCrypto)
export function coseAJwk(m) {
  if (!(m instanceof Map)) falla('Llave pública no válida');
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === -7 && m.get(-1) === 1) return { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: b64url(m.get(-2)), y: b64url(m.get(-3)) } };
  if (kty === 3 && alg === -257) return { alg: -257, jwk: { kty: 'RSA', n: b64url(m.get(-1)), e: b64url(m.get(-2)), alg: 'RS256' } };
  falla('Este tipo de llave no lo aceptamos');
}
// Las firmas ECDSA vienen en DER; WebCrypto las quiere como r||s de 64 bytes.
export function derARaw(der) {
  let i = 0;
  if (der[i++] !== 0x30) falla('Firma no válida');
  if (der[i] & 0x80) i += 1 + (der[i] & 0x7f); else i++;
  const entero = () => {
    if (der[i++] !== 0x02) falla('Firma no válida');
    const n = der[i++]; let x = der.slice(i, i + n); i += n;
    while (x.length > 32 && x[0] === 0) x = x.slice(1);
    if (x.length > 32) falla('Firma no válida');
    const r = new Uint8Array(32); r.set(x, 32 - x.length); return r;
  };
  const r = entero(), s = entero(), out = new Uint8Array(64); out.set(r, 0); out.set(s, 32); return out;
}
const sha256 = async (u8) => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
const iguales = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);

function revisaCliente(clientDataB64, tipo, reto, origen) {
  let cd; try { cd = JSON.parse(new TextDecoder().decode(deB64url(clientDataB64))); } catch { falla('Respuesta del teléfono no válida'); }
  if (cd.type !== tipo) falla('Respuesta del teléfono no válida');
  if (cd.challenge !== reto) falla('La solicitud ya venció. Inténtalo de nuevo.');
  if (cd.origin !== origen) falla('Esta llave no es de esta página');
  return cd;
}
// Alta: el teléfono crea la llave; devolvemos lo que hay que guardar.
export async function verificaAlta({ credencial, reto, origen, rpId }) {
  const r = credencial && credencial.response;
  if (!r || !r.clientDataJSON || !r.attestationObject) falla('Faltan datos de la llave');
  revisaCliente(r.clientDataJSON, 'webauthn.create', reto, origen);
  const att = leeCbor(deB64url(r.attestationObject)).valor;
  if (!(att instanceof Map) || !(att.get('authData') instanceof Uint8Array)) falla('Datos de la llave no válidos');
  const ad = leeAuthData(att.get('authData'));
  if (!iguales(ad.rpIdHash, await sha256(enc.encode(rpId)))) falla('Esta llave no es de esta página');
  if (!ad.up || !ad.uv) falla('El teléfono no confirmó que eres tú (Face ID o huella)');
  if (!ad.credId || !ad.cose) falla('El teléfono no mandó la llave');
  const { alg, jwk } = coseAJwk(ad.cose);
  return { id: b64url(ad.credId), alg, jwk, contador: ad.contador };
}
// Entrar: el teléfono firma el reto con su llave; comprobamos la firma con la llave pública guardada.
export async function verificaEntrada({ credencial, reto, origen, rpId, llave }) {
  const r = credencial && credencial.response;
  if (!r || !r.clientDataJSON || !r.authenticatorData || !r.signature) falla('Faltan datos de la llave');
  revisaCliente(r.clientDataJSON, 'webauthn.get', reto, origen);
  const adBytes = deB64url(r.authenticatorData), ad = leeAuthData(adBytes);
  if (!iguales(ad.rpIdHash, await sha256(enc.encode(rpId)))) falla('Esta llave no es de esta página');
  if (!ad.up || !ad.uv) falla('El teléfono no confirmó que eres tú (Face ID o huella)');
  // El contador sube en llaves que lo usan; si baja, alguien copió la llave. Los iPhone siempre mandan 0.
  if (ad.contador && llave.contador && ad.contador <= llave.contador) falla('Esta llave parece copiada. Por seguridad, entra con tu clave.');
  const datos = new Uint8Array([...adBytes, ...(await sha256(deB64url(r.clientDataJSON)))]);
  const firma = deB64url(r.signature);
  const jwk = JSON.parse(llave.jwk);
  const ok = llave.alg === -7
    ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']), derARaw(firma), datos)
    : await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, await crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']), firma, datos);
  if (!ok) falla('No pudimos comprobar que eres tú. Inténtalo de nuevo o entra con tu clave.');
  return { contador: ad.contador };
}
