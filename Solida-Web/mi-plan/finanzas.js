/* ============================================================
   MOTOR FINANCIERO — Mi Plan
   ------------------------------------------------------------
   Funciones PURAS. Sin DOM, sin localStorage, sin render.
   Aquí viven TODOS los cálculos de dinero de la aplicación.

   REGLA INVIOLABLE DEL MÓDULO:
     La capa de conversación (IA) nunca hace una operación
     aritmética. Traduce la pregunta a una consulta, este
     motor la calcula, y la IA sólo redacta el resultado.
     Con tasas revolventes del 60% anual un error de cálculo
     cuesta dinero real.

   Se carga ANTES de app.js. Sin dependencias.
   ============================================================ */

/* Iteraciones de PBKDF2 para respaldo cifrado y PIN.
   Alto a propósito: en un celular tarda ~1 s, y eso es justo
   lo que encarece un ataque por diccionario contra el archivo. */
const ITER_KDF = 310000;

/* ---------- ayudantes privados (prefijo _fin para no chocar) ---------- */
const _finNum   = (v, def) => { const x = Number(v); return Number.isFinite(x) ? x : (def===undefined?0:def); };
const _finTxt   = (v, max) => typeof v === "string" ? v.slice(0, max||120) : "";
const _finId    = v => String(v==null ? "" : v).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,40);
const _finFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
const _finBool  = (v, def) => v===undefined ? !!def : !!v;
const _finTope  = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/* día del mes 1..31, o null: un 0 o un 45 significan "no lo sé", no un día */
const _finDiaMes = v => { const n = Math.round(_finNum(v,0)); return (n>=1 && n<=31) ? n : null; };
const _finDiaSem = v => { const n = Math.round(_finNum(v,-1)); return (n>=0 && n<=6) ? n : null; };
/* elige entre lista blanca; nunca deja pasar un valor inventado */
const _finDe = (v, lista, def) => lista.includes(v) ? v : def;

const FIN_FRECUENCIAS = ["semanal","quincenal","mensual","irregular"];
const FIN_TIPOS_ING   = ["recurrente","variable","extraordinario"];
const FIN_TIPOS_DEUDA = ["revolvente","msi","diferido","fijo","automotriz"];
const FIN_TIPOS_MOV   = ["ingreso","gasto","pago","traspaso"];
const FIN_DESTINOS    = ["deuda","gasto","ahorro"];

/* ============================================================
   1. ESQUEMA
   ============================================================ */

/* Nada de nadie en particular vive aquí: la app arranca vacía y
   el alta inicial la llena. Eso es lo que la hace extrapolable. */
function finDef(){
  return {
    perfil: { moneda:"MXN", locale:"es-MX", colchonMinimo:0,
              ingresoPorHora:null,          /* null = no lo sabemos, no 0 */
              altaHecha:false, horizonteDias:45,
              /* null = todavía no lo preguntamos. false es una decisión. */
              cifrarRespaldo:null },
    /* candado del módulo: {v, salt, iter, hash} o null. El PIN NUNCA se
       guarda, sólo su derivación PBKDF2 con salt aleatorio. */
    candado:     null,
    ingresos:    [],
    apartados:   [],
    deudas:      [],
    movimientos: [],
    reglas:      [],                        /* reglas como DATOS, no como código */
    pendientes:  [],                        /* lo que el asesor todavía no sabe */
    historial:   { presupuestos:[], recalibraciones:[], consejos:[] }
  };
}

/* ============================================================
   2. SANEADO
   ------------------------------------------------------------
   Se reconstruye campo por campo contra una lista blanca. No se
   usa Object.assign sobre datos ajenos a propósito: un respaldo
   con "__proto__" dentro contaminaría el prototipo.
   ============================================================ */
function saneaFin(St){
  if(!St || typeof St !== "object") return;
  const d = finDef();
  const f = (St.fin && typeof St.fin === "object" && !Array.isArray(St.fin)) ? St.fin : {};

  /* --- perfil --- */
  const p = (f.perfil && typeof f.perfil === "object" && !Array.isArray(f.perfil)) ? f.perfil : {};
  const moneda = /^[A-Z]{3}$/.test(p.moneda) ? p.moneda : d.perfil.moneda;
  const locale = /^[a-z]{2}(-[A-Z]{2})?$/.test(p.locale) ? p.locale : d.perfil.locale;
  const iph = _finNum(p.ingresoPorHora, 0);
  const limpio = {
    perfil: {
      moneda, locale,
      colchonMinimo: Math.max(0, _finNum(p.colchonMinimo, 0)),
      ingresoPorHora: iph > 0 ? iph : null,
      altaHecha: _finBool(p.altaHecha, false),
      horizonteDias: _finTope(Math.round(_finNum(p.horizonteDias, 45)), 7, 180),
      /* tres estados de verdad: sí, no, y todavía no preguntamos */
      cifrarRespaldo: p.cifrarRespaldo === true ? true
                    : p.cifrarRespaldo === false ? false : null
    },

    /* --- candado ---
       Se reconstruye con sólo cuatro campos. Un candado a medias (sin hash o
       sin salt) se descarta: si se conservara, el módulo quedaría cerrado
       para siempre y sin PIN que pudiera abrirlo. */
    candado: (function(){
      const c = f.candado;
      if(!c || typeof c !== "object" || Array.isArray(c)) return null;
      const salt = _finTxt(c.salt, 128), hash = _finTxt(c.hash, 128);
      if(!salt || !hash) return null;
      const out = { v: Math.round(_finNum(c.v, 1)) || 1, salt, iter: _finIter(c.iter), hash };
      /* referencia a la llave de huella que guarda el teléfono (no es biometría) */
      const bio = _finTxt(c.bio, 400);
      if(bio && /^[A-Za-z0-9+/=]+$/.test(bio)) out.bio = bio;
      return out;
    })(),

    /* --- ingresos --- */
    ingresos: (Array.isArray(f.ingresos) ? f.ingresos : [])
      .filter(x => x && typeof x === "object")
      .map(x => ({
        id:         _finId(x.id) || ("i" + Math.abs(Math.round(_finNum(x.monto)))),
        nombre:     _finTxt(x.nombre, 80),
        tipo:       _finDe(x.tipo, FIN_TIPOS_ING, "recurrente"),
        monto:      Math.max(0, _finNum(x.monto)),
        frecuencia: _finDe(x.frecuencia, FIN_FRECUENCIAS, "mensual"),
        diaSemana:  _finDiaSem(x.diaSemana),
        diaMes:     _finDiaMes(x.diaMes),
        diaMes2:    x.diaMes2 === 0 ? 0 : _finDiaMes(x.diaMes2),
        activo:     _finBool(x.activo, true)
      })),

    /* --- apartados (sobres) --- */
    apartados: (Array.isArray(f.apartados) ? f.apartados : [])
      .filter(x => x && typeof x === "object")
      .map(x => {
        const dst = (x.destino && typeof x.destino === "object") ? x.destino : {};
        return {
          id:      _finId(x.id) || ("a" + Math.abs(Math.round(_finNum(x.montoPorDeposito)))),
          nombre:  _finTxt(x.nombre, 80),
          montoPorDeposito: Math.max(0, _finNum(x.montoPorDeposito)),
          saldo:   _finNum(x.saldo),
          meta:    x.meta === null || x.meta === undefined ? null : Math.max(0, _finNum(x.meta)),
          destino: { tipo: _finDe(dst.tipo, FIN_DESTINOS, "gasto"), ref: _finId(dst.ref) || null },
          /* el saldo apartado no sirve si el dinero no está en la cuenta
             el día del cargo: esto convierte el apartado en tarea fechada */
          requiereTransferencia: _finBool(x.requiereTransferencia, false),
          diaLimite: _finDiaMes(x.diaLimite)
        };
      }),

    /* --- deudas --- */
    deudas: (Array.isArray(f.deudas) ? f.deudas : [])
      .filter(x => x && typeof x === "object")
      .map(x => ({
        id:      _finId(x.id) || ("d" + Math.abs(Math.round(_finNum(x.saldo)))),
        nombre:  _finTxt(x.nombre, 80),
        /* cómo se llama ESTE renglón dentro de la tarjeta ("Saldo
           revolvente", "Station 24"). Vacío = usa el nombre. */
        etiqueta: _finTxt(x.etiqueta, 60),
        emisor:  _finTxt(x.emisor, 80),
        tipo:    _finDe(x.tipo, FIN_TIPOS_DEUDA, "revolvente"),
        saldo:   Math.max(0, _finNum(x.saldo)),
        /* tasa ANUAL en fracción: 0.6058 = 60.58%. Tope de 5 (500%) para
           que un dato corrupto no produzca proyecciones delirantes. */
        tasaAnual: _finTope(_finNum(x.tasaAnual), 0, 5),
        /* null = no lo sabemos. NO se asume el trato fiscal: se lee del
           estado de cuenta o se va a pendientes. */
        ivaSobreInteres: x.ivaSobreInteres === true ? true
                       : x.ivaSobreInteres === false ? false : null,
        diaCorte:        _finDiaMes(x.diaCorte),
        diaVencimiento:  _finDiaMes(x.diaVencimiento),
        pagoMinimo:        Math.max(0, _finNum(x.pagoMinimo)),
        pagoSinIntereses:  Math.max(0, _finNum(x.pagoSinIntereses)),
        /* pago requerido del mes cuando va a meses (lo dice el estado de
           cuenta); dividir el saldo entre los meses da un número parecido
           pero no el bueno, porque el plan trae su propio interés */
        pagoMensual:       Math.max(0, _finNum(x.pagoMensual)),
        /* a qué tarjeta física pertenece: el revolvente, el diferimiento y
           los meses sin intereses son partes del MISMO plástico */
        tarjeta:           _finId(x.tarjeta) || null,
        congelada:     _finBool(x.congelada, false),
        mesesRestantes: x.mesesRestantes === null || x.mesesRestantes === undefined
                        ? null : Math.max(0, Math.round(_finNum(x.mesesRestantes)))
      })),

    /* --- movimientos --- */
    movimientos: (Array.isArray(f.movimientos) ? f.movimientos : [])
      .filter(x => x && typeof x === "object" && _finFecha(x.fecha))
      .map(x => ({
        id:        _finId(x.id) || ("m" + Math.abs(Math.round(_finNum(x.monto)))),
        fecha:     x.fecha,
        monto:     _finNum(x.monto),
        tipo:      _finDe(x.tipo, FIN_TIPOS_MOV, "gasto"),
        cuenta:    _finTxt(x.cuenta, 40),
        categoria: _finTxt(x.categoria, 40),
        deudaId:    _finId(x.deudaId) || null,
        apartadoId: _finId(x.apartadoId) || null,
        nota:      _finTxt(x.nota, 4000),
        planeado:  _finBool(x.planeado, false)
      })),

    /* --- reglas: son datos, así que también se sanean como datos --- */
    reglas: (Array.isArray(f.reglas) ? f.reglas : [])
      .filter(x => x && typeof x === "object")
      .map(x => {
        const par = {};
        if(x.params && typeof x.params === "object" && !Array.isArray(x.params)){
          Object.keys(x.params).slice(0, 20).forEach(k => {
            if(k === "__proto__" || k === "constructor" || k === "prototype") return;
            const v = x.params[k];
            const t = typeof v;
            if(t === "number" && Number.isFinite(v)) par[_finTxt(k,40)] = v;
            else if(t === "boolean") par[_finTxt(k,40)] = v;
            else if(t === "string")  par[_finTxt(k,40)] = v.slice(0,120);
          });
        }
        return { id: _finId(x.id) || "r", texto: _finTxt(x.texto, 240),
                 tipo: _finTxt(x.tipo, 40), params: par, activa: _finBool(x.activa, true) };
      }),

    /* --- pendientes --- */
    pendientes: (Array.isArray(f.pendientes) ? f.pendientes : [])
      .filter(x => x && typeof x === "object")
      .map(x => ({ id: _finId(x.id) || "p", texto: _finTxt(x.texto, 4000),
                   resuelto: _finBool(x.resuelto, false) })),

    /* --- historial --- */
    historial: (function(){
      const h = (f.historial && typeof f.historial === "object" && !Array.isArray(f.historial)) ? f.historial : {};
      const ym = v => /^\d{4}-\d{2}$/.test(v) ? v : null;
      return {
        presupuestos: (Array.isArray(h.presupuestos) ? h.presupuestos : [])
          .filter(x => x && ym(x.ym))
          .map(x => ({ ym:x.ym, categoria:_finTxt(x.categoria,40), monto:_finNum(x.monto) })),
        recalibraciones: (Array.isArray(h.recalibraciones) ? h.recalibraciones : [])
          .filter(x => x && _finFecha(x.d))
          .map(x => ({ d:x.d, categoria:_finTxt(x.categoria,40),
                       antes:_finNum(x.antes), despues:_finNum(x.despues) })),
        consejos: (Array.isArray(h.consejos) ? h.consejos : [])
          .filter(x => x && _finFecha(x.d))
          .map(x => ({ d:x.d, texto:_finTxt(x.texto, 4000) }))
      };
    })()
  };

  St.fin = limpio;
}

/* ============================================================
   3. CALENDARIO REAL DE PAGOS
   ------------------------------------------------------------
   Un sueldo semanal NO es sueldo × 4.33. Los meses de cinco
   pagos existen y el quinto es ingreso extraordinario, no
   gasto corriente. Presupuestar con el promedio es la forma
   más común de quedarse corto en los meses de cuatro.
   ============================================================ */

/* mes en base 1 */
function diasDelMes(anio, mes){ return new Date(anio, mes, 0).getDate(); }
const _finKey = (a,m,d) => a + "-" + String(m).padStart(2,"0") + "-" + String(d).padStart(2,"0");
/* resuelve un día configurado: null → def; 0 → último día del mes */
function _finDiaEn(v, def, dim){
  let n = (v === null || v === undefined) ? def : Math.round(_finNum(v, def));
  if(n === 0) return dim;
  return _finTope(n, 1, dim);
}

function fechasDePago(ing, anio, mes){
  if(!ing || typeof ing !== "object") return [];
  if(ing.activo === false) return [];
  const dim = diasDelMes(anio, mes);

  if(ing.frecuencia === "semanal"){
    const objetivo = _finDiaSem(ing.diaSemana);
    if(objetivo === null) return [];
    const out = [];
    for(let d = 1; d <= dim; d++)
      if(new Date(anio, mes-1, d).getDay() === objetivo) out.push(_finKey(anio, mes, d));
    return out;
  }

  if(ing.frecuencia === "quincenal"){
    const a = _finDiaEn(ing.diaMes,  15, dim);
    const b = _finDiaEn(ing.diaMes2,  0, dim);      /* 0 / ausente = último día */
    const dias = [...new Set([a, b])].sort((x,y) => x - y);
    return dias.map(d => _finKey(anio, mes, d));
  }

  if(ing.frecuencia === "mensual"){
    return [ _finKey(anio, mes, _finDiaEn(ing.diaMes, 1, dim)) ];
  }

  return [];      /* irregular: no hay nada que predecir */
}

/* Base CONSERVADORA de pagos por mes: con esto se presupuesta.
   Cuatro semanas, no 4.33. Si el mes trae cinco, el quinto sobra. */
function pagosBase(ing){
  if(!ing || ing.activo === false) return 0;
  if(ing.frecuencia === "semanal")   return 4;
  if(ing.frecuencia === "quincenal") return 2;
  if(ing.frecuencia === "mensual")   return 1;
  return 0;                                        /* irregular */
}

function pagosEnMes(ing, anio, mes){ return fechasDePago(ing, anio, mes).length; }

/* Pagos que sobran respecto a la base: son ingreso EXTRAORDINARIO y
   disparan una decisión de barrido (deuda cara o colchón). */
function pagosExtra(ing, anio, mes){
  return Math.max(0, pagosEnMes(ing, anio, mes) - pagosBase(ing));
}

/* opciones.base = true → presupuesto conservador (ignora el pago extra) */
function ingresoDelMes(fin, anio, mes, opciones){
  const base = !!(opciones && opciones.base);
  const lista = (fin && Array.isArray(fin.ingresos)) ? fin.ingresos : [];
  let total = 0;
  for(const ing of lista){
    if(!ing || ing.activo === false) continue;
    const reales = pagosEnMes(ing, anio, mes);
    const veces  = base ? Math.min(pagosBase(ing), reales) : reales;
    total += _finNum(ing.monto) * veces;
  }
  return Math.round(total * 100) / 100;
}

/* ============================================================
   3.b AGRUPADO POR TARJETA FÍSICA
   ------------------------------------------------------------
   Un plástico puede traer varios renglones a la vez: el saldo
   revolvente, un diferimiento y una compra a meses. Listados
   sueltos parecen tres deudas distintas y das por bueno un total
   que no existe. Se agrupan por el campo `tarjeta`; la deuda
   cuyo id coincide con esa clave es la titular (la que trae las
   fechas y el pago para no generar intereses).

   El pago del siguiente corte NO es la suma de saldos:
     · lo revolvente se paga COMPLETO (si no, genera interés);
     · un plan a meses sólo cobra la mensualidad del periodo.
   Cuando el estado de cuenta declara el «pago para no generar
   intereses», ése manda: trae los redondeos del banco. Lo
   calculado se devuelve aparte para poder compararlos.
   ============================================================ */
const FIN_TIPOS_PLAN = ["msi", "diferido"];

function agrupaDeudas(lista){
  const arr = Array.isArray(lista) ? lista.filter(x => x && typeof x === "object") : [];
  const orden = [], mapa = new Map();
  for(const d of arr){
    const clave = _finId(d.tarjeta) || _finId(d.id);
    if(!mapa.has(clave)){ mapa.set(clave, []); orden.push(clave); }
    mapa.get(clave).push(d);
  }
  return orden.map(clave => {
    const partes  = mapa.get(clave);
    const titular = partes.find(x => _finId(x.id) === clave) || partes[0];
    const saldo   = partes.reduce((t, x) => t + Math.max(0, _finNum(x.saldo)), 0);

    /* cuánto pide cada renglón en este corte */
    let estimado = false, calculado = 0;
    for(const x of partes){
      const esPlan = FIN_TIPOS_PLAN.includes(x.tipo);
      if(!esPlan){ calculado += Math.max(0, _finNum(x.saldo)); continue; }
      const mensual = Math.max(0, _finNum(x.pagoMensual));
      if(mensual > 0){ calculado += mensual; continue; }
      /* sin el dato del estado de cuenta sólo queda repartir el saldo
         entre los pagos que faltan, y eso se marca como estimado
         porque el plan puede traer su propio interés */
      const meses = Math.max(0, Math.round(_finNum(x.mesesRestantes)));
      const sal   = Math.max(0, _finNum(x.saldo));
      calculado += meses > 0 ? sal / meses : sal;
      if(sal > 0) estimado = true;
    }
    calculado = Math.round(calculado * 100) / 100;

    /* Un crédito fijo (el del auto, una hipoteca) no tiene corte ni
       "pago para no generar intereses": pagas tu mensualidad y ya. Meter
       su saldo completo en ese total decía que había que juntar $25,954
       cuando la cifra real de las tarjetas eran $17,304. */
    const esTarjeta = !["fijo", "automotriz"].includes(titular.tipo);
    const declarado = Math.max(0, _finNum(titular.pagoSinIntereses));
    if(!esTarjeta){
      const mensual = Math.max(0, _finNum(titular.pagoMensual));
      return {
        clave, esTarjeta:false,
        nombre: _finTxt(titular.nombre, 80) || "Crédito",
        emisor: _finTxt(titular.emisor, 80),
        titular, partes,
        saldo: Math.round(saldo * 100) / 100,
        diaCorte: null,
        diaVencimiento: _finDiaMes(titular.diaVencimiento),
        pagoMinimo: Math.max(0, _finNum(titular.pagoMinimo)),
        pagoCorte: mensual,
        pagoCalculado: mensual,
        fuente: mensual > 0 ? "capturado" : "desconocido",
        estimado: false,
        descuadre: 0
      };
    }
    return {
      esTarjeta: true,
      clave,
      nombre: _finTxt(titular.nombre, 80) || "Tarjeta",
      emisor: _finTxt(titular.emisor, 80),
      titular,
      partes,
      saldo:  Math.round(saldo * 100) / 100,
      diaCorte:       _finDiaMes(titular.diaCorte)       || _finDiaMes((partes.find(x=>_finDiaMes(x.diaCorte))||{}).diaCorte),
      diaVencimiento: _finDiaMes(titular.diaVencimiento) || _finDiaMes((partes.find(x=>_finDiaMes(x.diaVencimiento))||{}).diaVencimiento),
      pagoMinimo: Math.max(0, _finNum(titular.pagoMinimo)),
      pagoCorte:  declarado > 0 ? declarado : calculado,
      pagoCalculado: calculado,
      fuente: declarado > 0 ? "estado" : "calculado",
      /* el declarado viene del banco: nunca es una estimación */
      estimado: declarado > 0 ? false : estimado,
      /* difieren en más de un peso → algo cambió desde el último corte */
      descuadre: declarado > 0 && Math.abs(declarado - calculado) > 1
                 ? Math.round((declarado - calculado) * 100) / 100 : 0
    };
  });
}

/* ============================================================
   4. CIFRADO DEL RESPALDO  (AES-GCM 256 + PBKDF2-SHA256)
   ------------------------------------------------------------
   El respaldo salía en texto plano. Con deudas y saldos dentro,
   quien abra el archivo ve todo. Ahora se cifra con una frase
   que sólo tiene el usuario: no hay servidor que la recupere.
   ============================================================ */

/* base64 por trozos: con un respaldo grande, el spread de
   String.fromCharCode(...) desborda la pila de llamadas */
function _finB64(buf){
  const b = new Uint8Array(buf);
  let s = "";
  for(let i = 0; i < b.length; i += 0x8000)
    s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function _finDeB64(s){
  if(typeof s !== "string") throw new Error("base64 inválido");
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}
/* comparación sin salida temprana: no filtra cuántos caracteres coinciden */
function _finIguales(a, b){
  if(typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let dif = 0;
  for(let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}
function _finIter(v){
  return _finTope(Math.round(_finNum(v, ITER_KDF)), 1, 2000000);
}

async function _finClaveAES(frase, salt, iter){
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(frase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name:"PBKDF2", salt, iterations:iter, hash:"SHA-256" },
    base, { name:"AES-GCM", length:256 }, false, ["encrypt","decrypt"]);
}

async function cifraRespaldo(datos, frase){
  if(typeof frase !== "string" || frase.length < 4) return null;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const k    = await _finClaveAES(frase, salt, ITER_KDF);
  const ct   = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, k,
                 new TextEncoder().encode(JSON.stringify(datos)));
  return { v:1, kdf:"PBKDF2-SHA256", iter:ITER_KDF,
           salt:_finB64(salt), iv:_finB64(iv), ct:_finB64(ct) };
}

/* devuelve null si la frase no es la correcta o si el sobre fue alterado
   (AES-GCM valida integridad: un byte cambiado y falla el descifrado) */
async function descifraRespaldo(sobre, frase){
  if(!sobre || typeof sobre !== "object" || sobre.kdf !== "PBKDF2-SHA256") return null;
  try{
    const k = await _finClaveAES(frase, _finDeB64(sobre.salt), _finIter(sobre.iter));
    const buf = await crypto.subtle.decrypt(
      { name:"AES-GCM", iv:_finDeB64(sobre.iv) }, k, _finDeB64(sobre.ct));
    return JSON.parse(new TextDecoder().decode(buf));
  }catch(e){ return null; }
}

/* ============================================================
   5. CANDADO DEL MÓDULO DINERO
   ------------------------------------------------------------
   El PIN nunca se guarda. Se guarda su derivación PBKDF2 con
   salt aleatorio, igual que una contraseña.
   ============================================================ */

async function _finHashPin(pin, salt, iter){
  const base = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name:"PBKDF2", salt, iterations:iter, hash:"SHA-256" }, base, 256);
  return _finB64(bits);
}

async function creaPin(pin){
  const txt = String(pin == null ? "" : pin);
  if(!/^\d{4,8}$/.test(txt)) return null;          /* 4 a 8 dígitos */
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { v:1, salt:_finB64(salt), iter:ITER_KDF,
           hash: await _finHashPin(txt, salt, ITER_KDF) };
}

async function verificaPin(pin, reg){
  if(!reg || typeof reg !== "object" || !reg.salt || !reg.hash) return false;
  if(typeof pin !== "string" || pin.length === 0) return false;
  try{
    const h = await _finHashPin(pin, _finDeB64(reg.salt), _finIter(reg.iter));
    return _finIguales(h, String(reg.hash));
  }catch(e){ return false; }
}
