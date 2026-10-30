import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificaAlta, verificaEntrada, leeCbor, derARaw, b64url } from '../src/webauthn.js';

// Un «teléfono» de mentira: genera su llave y firma como lo hace un iPhone o un Android.
const enc = new TextEncoder();
function cbor(v) {
  const cab = (t, n) => n < 24 ? [t << 5 | n] : n < 256 ? [t << 5 | 24, n] : [t << 5 | 25, n >> 8, n & 255];
  if (typeof v === 'number') return v >= 0 ? cab(0, v) : cab(1, -1 - v);
  if (typeof v === 'string') { const b = [...enc.encode(v)]; return [...cab(3, b.length), ...b]; }
  if (v instanceof Uint8Array) return [...cab(2, v.length), ...v];
  if (v instanceof Map) { let o = cab(5, v.size); for (const [k, x] of v) o = o.concat(cbor(k), cbor(x)); return o; }
  throw new Error('tipo');
}
const sha = async (u8) => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
function rawADer(raw) {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = new Uint8Array([0, ...b]); return [0x02, b.length, ...b]; };
  const c = [...int(raw.slice(0, 32)), ...int(raw.slice(32))]; return new Uint8Array([0x30, c.length, ...c]);
}
async function telefono(rpId = 'agenda.solidaaplicaciones.com') {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.publicKey);
  const credId = crypto.getRandomValues(new Uint8Array(16));
  let contador = 0;
  const authData = async (flags, conLlave) => {
    const base = [...await sha(enc.encode(rpId)), flags, 0, 0, 0, contador];
    if (!conLlave) return new Uint8Array(base);
    const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Uint8Array.from(atob(jwk.x.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0))], [-3, Uint8Array.from(atob(jwk.y.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0))]]);
    return new Uint8Array([...base, ...new Uint8Array(16), 0, 16, ...credId, ...cbor(cose)]);
  };
  return {
    id: b64url(credId),
    async crea(reto, origen, flags = 0x45) {
      const cd = enc.encode(JSON.stringify({ type: 'webauthn.create', challenge: reto, origin: origen }));
      const att = new Uint8Array(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', await authData(flags, true)]])));
      return { id: b64url(credId), response: { clientDataJSON: b64url(cd), attestationObject: b64url(att) } };
    },
    async firma(reto, origen, { flags = 0x05, sube = 0 } = {}) {
      contador += sube;
      const cd = enc.encode(JSON.stringify({ type: 'webauthn.get', challenge: reto, origin: origen }));
      const ad = await authData(flags, false);
      const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, new Uint8Array([...ad, ...await sha(cd)])));
      return { id: b64url(credId), response: { clientDataJSON: b64url(cd), authenticatorData: b64url(ad), signature: b64url(rawADer(raw)) } };
    },
  };
}
const O = 'https://agenda.solidaaplicaciones.com', R = 'agenda.solidaaplicaciones.com';

test('alta y entrada con una llave buena', async () => {
  const t = await telefono();
  const alta = await verificaAlta({ credencial: await t.crea('reto1', O), reto: 'reto1', origen: O, rpId: R });
  assert.equal(alta.id, t.id); assert.equal(alta.alg, -7); assert.equal(alta.jwk.kty, 'EC');
  const llave = { jwk: JSON.stringify(alta.jwk), alg: alta.alg, contador: 0 };
  const e = await verificaEntrada({ credencial: await t.firma('reto2', O), reto: 'reto2', origen: O, rpId: R, llave });
  assert.equal(e.contador, 0);
});

test('se rechaza: otro reto, otra página, otro sitio, sin Face ID, firma alterada, llave de otro', async () => {
  const t = await telefono(), otro = await telefono();
  await assert.rejects(verificaAlta({ credencial: await t.crea('a', O), reto: 'b', origen: O, rpId: R }), /venció/);
  await assert.rejects(verificaAlta({ credencial: await t.crea('a', 'https://falso.com'), reto: 'a', origen: O, rpId: R }), /no es de esta página/);
  await assert.rejects(verificaAlta({ credencial: await (await telefono('falso.com')).crea('a', O), reto: 'a', origen: O, rpId: R }), /no es de esta página/);
  await assert.rejects(verificaAlta({ credencial: await t.crea('a', O, 0x41), reto: 'a', origen: O, rpId: R }), /no confirmó/);
  const alta = await verificaAlta({ credencial: await t.crea('a', O), reto: 'a', origen: O, rpId: R });
  const llave = { jwk: JSON.stringify(alta.jwk), alg: -7, contador: 0 };
  const f = await t.firma('c', O); const sig = Uint8Array.from(atob(f.response.signature.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - f.response.signature.length % 4) % 4)), (c) => c.charCodeAt(0));
  sig[sig.length - 1] ^= 1; f.response.signature = b64url(sig);
  await assert.rejects(verificaEntrada({ credencial: f, reto: 'c', origen: O, rpId: R, llave }), /No pudimos comprobar/);
  await assert.rejects(verificaEntrada({ credencial: await otro.firma('d', O), reto: 'd', origen: O, rpId: R, llave }), /No pudimos comprobar/, 'la firma de otro teléfono no sirve');
  await assert.rejects(verificaEntrada({ credencial: await t.firma('e', O, { flags: 0x01 }), reto: 'e', origen: O, rpId: R, llave }), /no confirmó/);
});

test('un contador que no sube delata una llave copiada', async () => {
  const t = await telefono();
  const alta = await verificaAlta({ credencial: await t.crea('a', O), reto: 'a', origen: O, rpId: R });
  const llave = { jwk: JSON.stringify(alta.jwk), alg: -7, contador: 0 };
  const e1 = await verificaEntrada({ credencial: await t.firma('b', O, { sube: 5 }), reto: 'b', origen: O, rpId: R, llave });
  assert.equal(e1.contador, 5);
  await assert.rejects(verificaEntrada({ credencial: await t.firma('c', O), reto: 'c', origen: O, rpId: R, llave: { ...llave, contador: 5 } }), /copiada/);
});

test('CBOR y DER', () => {
  assert.deepEqual(leeCbor(new Uint8Array([0xa1, 0x61, 0x61, 0x01])).valor, new Map([['a', 1]]));
  assert.equal(derARaw(new Uint8Array([0x30, 6, 2, 1, 5, 2, 1, 7])).length, 64);
});
