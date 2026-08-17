/* ============================================================
   ASISTENTE — intérprete de frases en español
   ------------------------------------------------------------
   Funciones PURAS. Sin DOM, sin localStorage, sin red.
   Nada de esto sale del teléfono: no hay servidor detrás.

   El dominio es cerrado y pequeño (tus alimentos, tus
   ejercicios, tus categorías), y por eso un intérprete de
   reglas alcanza para lo que de verdad vas a decirle. Cuando
   no entiende, lo DICE y ofrece botones. Nunca adivina.

   Se carga ANTES de app.js. Las acciones que MODIFICAN algo
   viven en app.js: aquí sólo se interpreta, nunca se escribe.
   ============================================================ */

/* ---------- texto ---------- */
const _asAcentos = { "á":"a","é":"e","í":"i","ó":"o","ú":"u","ü":"u","ñ":"n",
                     "Á":"a","É":"e","Í":"i","Ó":"o","Ú":"u","Ü":"u","Ñ":"n" };
function normaliza(txt){
  return String(txt == null ? "" : txt)
    .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, c => _asAcentos[c])
    .toLowerCase()
    /* la diagonal y los dos puntos se conservan: sin ellos "15/08" se
       partía en dos números sueltos y la fecha se perdía */
    .replace(/[^\wáéíóúñ\s.,%$\/:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const _asPalabras = t => normaliza(t).split(" ").filter(Boolean);

/* Distancia de edición acotada: con nombres de alimentos de 20-30
   caracteres, la matriz completa es innecesaria y lenta. */
function _asDist(a, b, tope){
  if(a === b) return 0;
  const la = a.length, lb = b.length;
  if(Math.abs(la - lb) > tope) return tope + 1;
  let prev = new Array(lb + 1);
  for(let j = 0; j <= lb; j++) prev[j] = j;
  for(let i = 1; i <= la; i++){
    const fila = [i];
    let mejor = i;
    for(let j = 1; j <= lb; j++){
      const costo = a[i-1] === b[j-1] ? 0 : 1;
      fila[j] = Math.min(prev[j] + 1, fila[j-1] + 1, prev[j-1] + costo);
      if(fila[j] < mejor) mejor = fila[j];
    }
    if(mejor > tope) return tope + 1;
    prev = fila;
  }
  return prev[lb];
}

/* 0 a 1. Dos señales combinadas:
     cobertura  cuántas palabras del catálogo aparecen en la frase
     distintiva la mejor coincidencia de una palabra larga
   Hace falta la segunda porque nadie dice "pechuga de pollo": dice
   "pollo", y con pura cobertura eso daba 0.5 y no alcanzaba. */
function parecido(frase, candidato){
  const f = _asPalabras(frase), c = _asPalabras(candidato);
  if(!f.length || !c.length) return 0;
  let puntos = 0, peso = 0, distintiva = 0;
  for(const pc of c){
    if(pc.length <= 2) continue;                  /* "de", "con", "el" */
    peso++;
    let mejor = 0;
    for(const pf of f){
      if(pf === pc){ mejor = 1; break; }
      const raizC = pc.replace(/(es|s)$/, ""), raizF = pf.replace(/(es|s)$/, "");
      if(raizC.length > 3 && raizC === raizF){ mejor = Math.max(mejor, .97); continue; }
      if(pc.length > 4 && pf.startsWith(pc.slice(0, Math.min(5, pc.length)))){
        mejor = Math.max(mejor, .85); continue; }
      const tope = pc.length > 6 ? 2 : 1;
      const d = _asDist(pf, pc, tope);
      if(d <= tope) mejor = Math.max(mejor, 1 - d / (pc.length + 1));
    }
    puntos += mejor;
    if(pc.length >= 4 && mejor > distintiva) distintiva = mejor;
  }
  if(!peso) return 0;
  const cobertura = puntos / peso;
  return Math.max(cobertura, 0.75 * distintiva + 0.25 * cobertura);
}

/* Mejor coincidencia dentro de un catálogo [{id, nombre}] */
function buscaEnCatalogo(frase, catalogo, minimo){
  const min = minimo === undefined ? 0.6 : minimo;
  let mejor = null, mejorP = 0, segundo = 0;
  for(const it of (catalogo || [])){
    if(!it) continue;
    const p = parecido(frase, it.nombre);
    if(p > mejorP){ segundo = mejorP; mejorP = p; mejor = it; }
    else if(p > segundo) segundo = p;
  }
  if(!mejor || mejorP < min) return null;
  return { item: mejor, puntaje: +mejorP.toFixed(3), margen: +(mejorP - segundo).toFixed(3) };
}

/* ---------- números en español ---------- */
const _asUnidades = { cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6,
  siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12, trece:13, catorce:14, quince:15,
  dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19, veinte:20, veintiuno:21,
  veintiun:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26,
  veintisiete:27, veintiocho:28, veintinueve:29, treinta:30, cuarenta:40, cincuenta:50,
  sesenta:60, setenta:70, ochenta:80, noventa:90, cien:100, ciento:100, doscientos:200,
  trescientos:300, cuatrocientos:400, quinientos:500, seiscientos:600, setecientos:700,
  ochocientos:800, novecientos:900, medio:0.5, media:0.5 };

/* "mil quinientos" → 1500 · "dos mil trescientos cincuenta" → 2350 */
function _asNumeroEnLetras(palabras){
  let total = 0, actual = 0, hubo = false;
  for(const p of palabras){
    if(p === "y") continue;
    if(p === "mil"){ actual = (actual || 1) * 1000; total += actual; actual = 0; hubo = true; continue; }
    if(p === "millon" || p === "millones"){ total = (total + actual || 1) * 1000000; actual = 0; hubo = true; continue; }
    if(Object.prototype.hasOwnProperty.call(_asUnidades, p)){ actual += _asUnidades[p]; hubo = true; continue; }
    break;
  }
  return hubo ? total + actual : null;
}

/* Primer número de la frase, en dígitos o en letras.
   Coma = separador de miles, punto = decimal (uso mexicano). */
function leeNumero(frase){
  const t = normaliza(frase);
  const m = t.match(/(?:^|[\s$])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/);
  let porDigitos = null, posDig = -1;
  if(m){ porDigitos = parseFloat(m[1].replace(/,/g, "")); posDig = m.index; }

  const pal = t.split(" ");
  let porLetras = null, posLet = -1;
  for(let i = 0; i < pal.length; i++){
    const v = _asNumeroEnLetras(pal.slice(i, i + 6));
    if(v !== null && v !== 0){ porLetras = v; posLet = i; break; }
    if(v === 0 && pal[i] === "cero"){ porLetras = 0; posLet = i; break; }
  }
  if(porDigitos === null) return porLetras;
  if(porLetras === null) return porDigitos;
  /* si vienen los dos, gana el que aparece primero en la frase */
  const posLetChar = pal.slice(0, posLet).join(" ").length;
  return posDig <= posLetChar ? porDigitos : porLetras;
}

/* Todos los números, en orden de aparición (para "300 pesos por 2 kilos") */
function leeNumeros(frase){
  const t = normaliza(frase);
  const out = [];
  const re = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
  let m;
  while((m = re.exec(t))) out.push(parseFloat(m[1].replace(/,/g, "")));
  if(out.length) return out;
  const v = leeNumero(frase);
  return v === null ? [] : [v];
}

/* ---------- fechas relativas ---------- */
const _asDias = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
function leeFecha(frase, hoy){
  const t = normaliza(frase);
  const base = hoy instanceof Date ? new Date(hoy) : new Date();
  const mueve = n => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
  const clave = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") +
                     "-" + String(d.getDate()).padStart(2,"0");
  if(/\bantier\b|\banteayer\b/.test(t)) return clave(mueve(-2));
  if(/\bayer\b/.test(t))                return clave(mueve(-1));
  if(/\bmanana\b/.test(t))              return clave(mueve(1));
  if(/\bhoy\b/.test(t))                 return clave(base);
  const md = t.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if(md){
    const dia = +md[1], mes = +md[2];
    let anio = md[3] ? +md[3] : base.getFullYear();
    if(anio < 100) anio += 2000;
    if(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)
      return anio + "-" + String(mes).padStart(2,"0") + "-" + String(dia).padStart(2,"0");
  }
  for(let i = 0; i < 7; i++){
    const re = new RegExp("\\b(el |este |pasado )?" + _asDias[i] + "\\b");
    if(re.test(t)){
      /* el día de la semana más reciente hacia atrás, incluido hoy */
      let d = new Date(base);
      while(d.getDay() !== i) d.setDate(d.getDate() - 1);
      return clave(d);
    }
  }
  return null;
}

/* ---------- catálogo de intenciones ----------
   Cada intención declara: dominio, si ESCRIBE algo, y los verbos
   o giros que la disparan. El orden importa: la primera que
   coincide gana, así que las más específicas van arriba. */
const INTENCIONES = [
  { id:"definirUnidad", dominio:"mandado", escribe:true, peso:3,
    re: [/\b(la|el|una|un)\s+\S+\s+(es|son|trae|tiene)\s+de?\s*\d/,
         /\b(lata|paquete|bolsa|caja|frasco|botella|manojo|charola|penca|pieza)\b.*\b(es|son|de|trae|tiene)\b.*\d/] },

  { id:"precioAlimento", dominio:"mandado", escribe:true, peso:2,
    re: [/\bcuesta\b/, /\bcosto\b/, /\bpagu[eé]\b.*\bpor\b/, /\ba\s*\$?\s*\d+.*\b(el|la|por)\s+(kilo|litro|pieza|paquete|bolsa|lata)\b/,
         /\bprecio\b/, /\bsubi[oó]\b.*\b(el|la)\b/] },

  { id:"registrarGasto", dominio:"dinero", escribe:true, peso:1,
    re: [/\bgast[eéo]\b/, /\bpagu[eé]\b/, /\bme cost[oó]\b/, /\bcompr[eé]\b.*\bpor\b/,
         /\bsali[oó]\s+en\b/, /\bgasto\s+de\b/] },

  { id:"ajustarPresupuesto", dominio:"dinero", escribe:true, peso:2,
    re: [/\bpresupuesto\b.*\b(a|de|en)\s*\$?\s*\d/, /\bponme?\b.*\bpresupuesto\b/,
         /\bcambia\b.*\bpresupuesto\b/] },

  { id:"puedoGastar", dominio:"dinero", escribe:false, peso:2,
    re: [/\bme alcanza\b/, /\bpuedo (comprar|gastar|darme)\b/, /\balcanza para\b/,
         /\bs[ií] compro\b/] },

  { id:"comoVoy", dominio:"dinero", escribe:false, peso:1,
    re: [/\bcomo voy\b/, /\bcuanto llevo\b/, /\bcuanto he gastado\b/, /\bcuanto gaste\b/,
         /\bcomo va\b.*\b(mes|presupuesto|gasto)\b/, /\bme queda\b/] },

  { id:"ordenDeuda", dominio:"dinero", escribe:false, peso:2,
    re: [/\bqu[eé] deuda\b/, /\bcual deuda\b/, /\bpagar? primero\b/, /\bprioriza\w*\b.*\bdeuda/,
         /\bavalancha\b/, /\bbola de nieve\b/] },

  { id:"cambiarCarga", dominio:"rutina", escribe:true, peso:2,
    re: [/\bsub[ií]\b.*\b(a|hasta)\s*\d/, /\bbaj[eé]\b.*\b(a|hasta)\s*\d/,
         /\b(pon|ponle|cambia)\b.*\b\d+(\.\d+)?\s*(kg|kilos?|lb|libras?)\b/,
         /\b\d+(\.\d+)?\s*(kg|kilos?|lb|libras?)\b.*\b(en|de)\b/] },

  { id:"sustituirEjercicio", dominio:"rutina", escribe:true, peso:3,
    re: [/\bcambia\b.*\bpor\b/, /\bsustituye\b/, /\breemplaza\b/, /\ben lugar de\b/] },

  { id:"registrarSnack", dominio:"dieta", escribe:true, peso:2,
    re: [/\bme com[ií]\b/, /\bcom[ií]\b\s+(un|una|unos|unas)\b/, /\bantoj\w+\b/,
         /\bsnack\b/, /\bbotan[eé]\b/] },

  { id:"cambiarMacros", dominio:"dieta", escribe:true, peso:3,
    re: [/\bmacros?\b/, /\b(proteina|carbo\w*|grasa|calorias|kcal)\b.*\b\d/,
         /\betiqueta\b/] },

  { id:"sustituirAlimento", dominio:"dieta", escribe:true, peso:2,
    re: [/\bpor\b.*\ben lugar\b/, /\bcambia\b.*\bcomida\b/, /\bsustituye\b.*\b(comida|alimento)\b/] }
];

/* Interpreta una frase. NUNCA adivina: si no hay confianza, devuelve
   accion:null con las intenciones más probables para ofrecer botones. */
function interpreta(frase, ctx){
  const t = normaliza(frase);
  const contexto = ctx || {};
  if(!t) return { accion:null, motivo:"vacio", sugerencias:[] };

  const candidatas = [];
  for(const intn of INTENCIONES){
    for(const re of intn.re){
      if(re.test(t)){ candidatas.push(intn); break; }
    }
  }
  if(!candidatas.length){
    return { accion:null, motivo:"sin-verbo", frase:t,
             sugerencias: sugerenciasPara(t, contexto) };
  }
  /* la más específica gana; a igual peso, la declarada primero */
  candidatas.sort((a,b)=> b.peso - a.peso);
  const elegida = candidatas[0];

  const params = extraeRanuras(elegida.id, t, contexto);
  if(params.falta){
    return { accion:null, motivo:"falta-dato", intencion:elegida.id, falta:params.falta,
             parcial:params, sugerencias:[{ id:elegida.id, dominio:elegida.dominio }] };
  }
  return { accion: elegida.id, dominio: elegida.dominio, escribe: elegida.escribe,
           params, confianza: params._conf === undefined ? 1 : params._conf };
}

/* Qué le pudo haber querido decir: se ofrece como botones */
function sugerenciasPara(t, ctx){
  const out = [];
  const hayNumero = leeNumeros(t).length > 0;
  const ali = buscaEnCatalogo(t, ctx.alimentos || [], 0.7);
  const ejr = buscaEnCatalogo(t, ctx.ejercicios || [], 0.7);
  if(hayNumero) out.push({ id:"registrarGasto", dominio:"dinero" });
  if(ali) out.push({ id:"precioAlimento", dominio:"mandado", pista:ali.item.nombre });
  if(ejr) out.push({ id:"cambiarCarga", dominio:"rutina", pista:ejr.item.nombre });
  if(!out.length) out.push({ id:"comoVoy", dominio:"dinero" });
  return out.slice(0, 3);
}

const _asUnidadTxt = t => {
  if(/\bkilos?\b|\bkg\b/.test(t))            return "kg";
  if(/\bgramos?\b|\bgr?\b(?!\w)/.test(t))    return "g";
  if(/\blitros?\b|\blt?s?\b(?!\w)/.test(t))  return "l";
  if(/\bml\b|\bmililitros?\b/.test(t))       return "ml";
  if(/\bpiezas?\b|\bpzas?\b/.test(t))        return "pz";
  return null;
};

/* Saca los datos que cada intención necesita. Devuelve {falta:"..."}
   cuando no alcanza, para poder preguntar en vez de inventar. */
function extraeRanuras(id, t, ctx){
  const nums = leeNumeros(t);
  const ali = buscaEnCatalogo(t, ctx.alimentos || [], 0.62);
  const ejr = buscaEnCatalogo(t, ctx.ejercicios || [], 0.62);
  const cat = buscaEnCatalogo(t, ctx.categorias || [], 0.7);
  const fecha = leeFecha(t, ctx.hoy) || (ctx.hoyClave || null);

  switch(id){
    case "registrarGasto": {
      if(!nums.length) return { falta:"monto" };
      return { monto:nums[0], categoria: cat ? cat.item.id : null,
               etiqueta: cat ? cat.item.nombre : null, fecha,
               _conf: cat ? 1 : 0.8 };
    }
    case "ajustarPresupuesto": {
      if(!nums.length) return { falta:"monto" };
      return { monto:nums[0] };
    }
    case "puedoGastar": {
      if(!nums.length) return { falta:"monto" };
      return { monto:nums[0], fecha };
    }
    case "comoVoy":    return {};
    case "ordenDeuda": return { estrategia: /bola de nieve/.test(t) ? "nieve"
                                          : /avalancha/.test(t) ? "avalancha" : null };
    case "precioAlimento": {
      if(!ali) return { falta:"alimento" };
      if(!nums.length) return { falta:"precio" };
      return { alimento: ali.item.id, nombre: ali.item.nombre,
               precio: nums[nums.length-1], unidad: _asUnidadTxt(t),
               _conf: ali.puntaje };
    }
    case "definirUnidad": {
      if(!ali) return { falta:"alimento" };
      if(!nums.length) return { falta:"cuanto" };
      const m = t.match(/\b(lata|paquete|bolsa|caja|frasco|botella|manojo|charola|penca|pieza|costal|six|carton)\w*\b/);
      if(!m) return { falta:"nombreUnidad" };
      return { alimento: ali.item.id, nombre: ali.item.nombre,
               unidad: m[1], cuanto: nums[nums.length-1],
               medida: _asUnidadTxt(t) || "g", _conf: ali.puntaje };
    }
    case "cambiarCarga": {
      if(!ejr) return { falta:"ejercicio" };
      if(!nums.length) return { falta:"peso" };
      return { ejercicio: ejr.item.id, nombre: ejr.item.nombre,
               peso: nums[nums.length-1],
               unidad: /\blb\b|\blibras?\b/.test(t) ? "lb" : "kg", _conf: ejr.puntaje };
    }
    case "sustituirEjercicio": {
      const partes = t.split(/\bpor\b|\ben lugar de\b/);
      if(partes.length < 2) return { falta:"reemplazo" };
      const de = buscaEnCatalogo(partes[0], ctx.ejercicios || [], 0.62);
      if(!de) return { falta:"ejercicio" };
      return { ejercicio: de.item.id, nombre: de.item.nombre,
               busca: partes.slice(1).join(" ").trim(), _conf: de.puntaje };
    }
    case "registrarSnack": {
      const sn = buscaEnCatalogo(t, ctx.snacks || [], 0.62);
      if(!sn) return { falta:"snack" };
      return { snack: sn.item.id, nombre: sn.item.nombre, _conf: sn.puntaje };
    }
    case "cambiarMacros": {
      if(!ali) return { falta:"alimento" };
      if(!nums.length) return { falta:"valor" };
      const campo = /\bproteina/.test(t) ? "p" : /\bcarbo/.test(t) ? "c"
                  : /\bgrasa/.test(t) ? "f" : /\bcalorias|\bkcal/.test(t) ? "kcal" : null;
      if(!campo) return { falta:"cual" };
      return { alimento: ali.item.id, nombre: ali.item.nombre,
               campo, valor: nums[nums.length-1], _conf: ali.puntaje };
    }
    case "sustituirAlimento": {
      if(!ali) return { falta:"alimento" };
      return { alimento: ali.item.id, nombre: ali.item.nombre };
    }
  }
  return {};
}
