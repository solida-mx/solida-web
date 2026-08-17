/* ============================================================
   MI PLAN — página personal de Salvador
   Todo lo editable vive en CONFIG y en las tablas de abajo.
   ============================================================ */
const CONFIG = {
  cliente: "Salvador",
  kcal: 2440, prot: 193, carb: 245, fat: 77,
  aguaLitros: 3.0,               // dato informativo del día
  // Presupuesto semanal de antojos LIBRES (aparte de los snacks del plan)
  antojosSemana: 1200,
  cardioMin: 20,
  unidad: "kg",
  // Fotos de alimentos: si existe img/<id>.png se muestra la foto;
  // si no existe (o falla), aparece el emoji. Pon false para usar solo emojis.
  usarFotos: true,
  // Fotos de ejercicios: img/ejercicios/<nombre-de-la-variante>.png
  // (la lista exacta de nombres está en img/LEEME.txt)
  fotosEjercicios: true,
  perfil: { altura: 183, edad: 29, metaGrasa: 15, metaMusculo: 47.5 }
};

// Mediciones de partida. Cuando llegue un InBody nuevo, agrégalo desde Progreso.
const MEDICION_BASE = { d: "2026-07-06", kg: 94.7, mme: 47.0, grasa: 23.2, imc: 28.3 };
const SEMILLAS = [ { d: "2026-07-26", kg: 94.3 } ];

/* ---------- utilidades de fecha ---------- */
const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DSHORT = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const now = new Date();
function localKey(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function fromKey(k){ return new Date(k+"T00:00:00"); }
function addDays(d,n){ const t=new Date(d); t.setDate(t.getDate()+n); return t; }
function daysBetween(a,b){ return Math.round((fromKey(b)-fromKey(a))/864e5); }
const dayKey = localKey(now);
function weekKey(d){ const t=new Date(d); const wd=(t.getDay()+6)%7; t.setDate(t.getDate()-wd); return localKey(t); }
const thisWeek = weekKey(now);

/* ---------- almacenamiento ---------- */
let S = { meals:{}, water:{}, swaps:{}, mealOpt:{}, lifts:{}, liftHi:{}, antojos:{}, trained:{},
          note:{}, lastReport:null, unidad:CONFIG.unidad, sets:{}, sessions:0, body:[],
          varSel:{}, warm:{}, cardio:{}, cicloShift:0, tier:"med" };
const LS_KEY = "mi_plan_salvador_v1";
const PRE_KEY = LS_KEY + "__antes_de_importar";
let canStore = true;
let cargaCorrupta = false;   /* había datos guardados pero no se pudieron leer */
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw){
    let parsed = null;
    try { parsed = JSON.parse(raw); }
    catch(pe){ cargaCorrupta = true; }           /* JSON roto: NO desactivamos el guardado */
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) S = Object.assign(S, parsed);
    else if (parsed) cargaCorrupta = true;
  }
} catch(e){ canStore = false; }                  /* storage bloqueado de verdad */
/* migración de ajustes viejos → nuevo modelo (persona + diseño) */
if(S.cfg && !S.persona){
  S.persona = {};
  if(S.cfg.metaGrasa!==undefined)   S.persona.metaGrasa  = S.cfg.metaGrasa;
  if(S.cfg.metaMusculo!==undefined) S.persona.metaMusculo= S.cfg.metaMusculo;
  if(S.cfg.cardioMin!==undefined)   S.persona.cardioMin  = S.cfg.cardioMin;
  if(!S.ui) S.ui = {};
  if(S.cfg.usarFotos!==undefined)       S.ui.fotosAlimentos = S.cfg.usarFotos;
  if(S.cfg.fotosEjercicios!==undefined) S.ui.fotosEjercicios= S.cfg.fotosEjercicios;
  delete S.cfg;
}

/* ============================================================
   MOTOR DE OBJETIVOS — tú capturas tus datos; la app calcula
   la dieta (Mifflin-St Jeor + actividad + objetivo). Los
   resultados van BLOQUEADOS en la interfaz a propósito: así
   nadie descompone su dieta moviendo un número sin querer.
   ============================================================ */
const MONTHS_FULL = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const PERSONA_DEF = { estatura:183, edad:29, sexo:"m", act:1.55,
                      objetivo:"perder", metaGrasa:15, metaMusculo:47.5, cardioMin:15 };
function personaGet(){ return Object.assign({}, PERSONA_DEF, S.persona||{}); }
function pesoActual(){
  /* el más reciente POR FECHA, no el último capturado: si registras un
     InBody viejo después, no debe recalcularte la dieta con ese peso. */
  const withKg = (Array.isArray(S.body)?S.body:[]).filter(b=>b && b.kg && b.d);
  if(!withKg.length) return MEDICION_BASE.kg;
  return withKg.reduce((a,b)=> b.d > a.d ? b : a).kg;
}
/* Peso objetivo derivado de TU meta de grasa, manteniendo la masa magra:
     magra = peso × (1 − grasa/100)   →   metaPeso = magra / (1 − metaGrasa/100)
   Si vas a subir masa, la meta va hacia arriba, no a un 85.5 fijo. */
function metaPesoKg(){
  const P = personaGet(), kg = pesoActual();
  const ult = (Array.isArray(S.body)?S.body:[]).filter(b=>b && b.grasa && b.d);
  const grasa = ult.length ? ult.reduce((a,b)=> b.d>a.d?b:a).grasa : MEDICION_BASE.grasa;
  if(!grasa || !P.metaGrasa) return kg;
  const magra = kg * (1 - grasa/100);
  const meta = magra / (1 - P.metaGrasa/100);
  return Math.round(meta*10)/10;
}
function applyPersona(){
  const P = personaGet(), kg = pesoActual();
  const bmr = P.sexo==="m" ? 10*kg + 6.25*P.estatura - 5*P.edad + 5
                           : 10*kg + 6.25*P.estatura - 5*P.edad - 161;
  const factor = {perder:.80, recomp:.90, mantener:1, subir:1.08}[P.objetivo] || .80;
  CONFIG.kcal = Math.round(bmr * P.act * factor / 10) * 10;
  CONFIG.prot = Math.round(2.1 * kg);
  CONFIG.fat  = Math.round(.85 * kg);
  CONFIG.carb = Math.max(0, Math.round((CONFIG.kcal - CONFIG.prot*4 - CONFIG.fat*9) / 4));
  CONFIG.aguaLitros    = Math.round(kg * .035 / .25) * .25;
  CONFIG.antojosSemana = Math.round(CONFIG.kcal * 7 * .06 / 50) * 50;
  CONFIG.cardioMin = P.cardioMin;
  CONFIG.perfil.metaGrasa = P.metaGrasa; CONFIG.perfil.metaMusculo = P.metaMusculo;
  CONFIG.perfil.altura = P.estatura;     CONFIG.perfil.edad = P.edad;
}
/* Tema: "auto" sigue al sistema, o se fija en claro/oscuro */
const mqClaro = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
function temaResuelto(){
  const t = (S.ui||{}).tema || "auto";
  if(t==="claro" || t==="oscuro") return t;
  return (mqClaro && mqClaro.matches) ? "claro" : "oscuro";
}
function applyTema(){
  const t = temaResuelto();
  document.documentElement.setAttribute("data-tema", t);
  /* la barra de estado del teléfono tiene que combinar */
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute("content", t==="claro" ? "#1b396b" : "#081427");
}
if(mqClaro && mqClaro.addEventListener)
  mqClaro.addEventListener("change", ()=>{ if(((S.ui||{}).tema||"auto")==="auto") applyTema(); });

function applyUI(){
  const u = S.ui || {};
  CONFIG.usarFotos       = u.fotosAlimentos !== false;
  CONFIG.fotosEjercicios = u.fotosEjercicios !== false;
  document.body.style.zoom = u.texto==="grande" ? "1.08" : u.texto==="chico" ? "0.94" : "";
  document.documentElement.classList.toggle("noanim", u.anim===false);
  applyTema();
}
applyPersona();
/* ==================================================================
   SONIDOS
   Sintetizados con Web Audio: cero archivos, funcionan sin conexión y
   no pesan nada. Cortos y discretos: confirman sin llamar la atención.

   Dos cosas de iPhone que condicionan el diseño:
     · el audio web necesita un toque previo para desbloquearse
     · el switch físico de silencio LO APAGA — por eso el fin del
       descanso siempre va acompañado de vibración, nunca sonido solo
   ================================================================== */
/* ==================================================================
   AUDIO — resistente a interrupciones
   ------------------------------------------------------------------
   Bug que traía: con música puesta, cerrar y abrir la app dejaba los
   sonidos muertos para siempre. Cuatro causas a la vez:
     1) el desbloqueo se registraba con {once:true} y se marcaba hecho
        PARA SIEMPRE, así que tras una interrupción nunca se rearmaba;
     2) ctxAudio() devolvía el contexto en caché aunque estuviera
        cerrado o muerto;
     3) sólo se atendía el estado "suspended", pero cuando otra app
        toma la sesión de audio Safari deja el contexto en
        "interrupted" — estado que nadie miraba;
     4) las notas se programaban ANTES de que resolviera resume(),
        que es asíncrono, así que el primer sonido se perdía.
   ================================================================== */
let _audio = null;
function audioOn(){ return (S.ui||{}).sonido !== false; }
/* volumen 0..1; sólo vibrar = sonido apagado pero avisos con vibración */
function volumenActual(){
  const v = Number((S.ui||{}).volumen);
  if(!Number.isFinite(v)) return 0.85;              /* por omisión */
  return Math.min(1, Math.max(0, v));
}
function soloVibrar(){ return (S.ui||{}).soloVibrar === true; }

function ctxAudio(){
  /* un contexto cerrado ya no sirve para nada: se tira y se hace otro */
  if(_audio && _audio.state === "closed") _audio = null;
  if(_audio) return _audio;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  try{ _audio = new AC(); }catch(e){ _audio = null; return null; }
  return _audio;
}

/* Devuelve un contexto EN MARCHA, o null. Espera el resume, y si el
   contexto quedó inservible lo reemplaza por uno nuevo. */
async function audioListo(){
  let c = ctxAudio();
  if(!c) return null;
  if(c.state === "running") return c;
  try{ await c.resume(); }catch(e){}
  if(c.state === "running") return c;
  /* seguía sin arrancar (interrupted / closed): contexto nuevo y otra vez */
  try{ await c.close(); }catch(e){}
  _audio = null;
  c = ctxAudio();
  if(!c) return null;
  if(c.state !== "running"){ try{ await c.resume(); }catch(e){} }
  return c.state === "running" ? c : null;
}

/* El desbloqueo se REARMA: cada vez que el contexto deja de estar en
   marcha, el siguiente toque lo vuelve a despertar. */
function desbloqueaAudio(){ audioListo(); }
["pointerdown","touchstart","keydown"].forEach(ev=>
  document.addEventListener(ev, ()=>{
    const c = _audio;
    if(!c || c.state !== "running") desbloqueaAudio();
  }, {passive:true}));

/* Al volver a la app, reanudar sin esperar a que algo tenga que sonar:
   así el primer aviso del descanso ya llega vivo. */
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden && _audio && _audio.state !== "running") desbloqueaAudio();
});
window.addEventListener("focus", ()=>{
  if(_audio && _audio.state !== "running") desbloqueaAudio();
});

/* una nota: onda suave con envolvente, para que no suene a pitido barato */
function _nota(c, freq, t0, dur, vol, tipo){
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = tipo || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
const SONIDOS = {
  comida:    { notas:[[880,0,.10],[1174.7,.055,.13]], vol:.11 },
  deshacer:  { notas:[[740,0,.09],[554,.05,.11]],     vol:.09 },
  serie:     { notas:[[1318.5,0,.055]],               vol:.09, tipo:"triangle" },
  ejercicio: { notas:[[784,0,.10],[1046.5,.07,.16]],  vol:.11 },
  carrito:   { notas:[[1567.9,0,.06]],                vol:.10, tipo:"square" },
  mandado:   { notas:[[523.3,0,.16],[659.3,.07,.18],[784,.14,.26]], vol:.10 },
  descanso:  { notas:[[523.3,0,.16],[659.3,.15,.16],[784,.30,.16],
                      [1046.5,.45,.34],[1046.5,.85,.30]], vol:.16 }
};
/* async a propósito: las notas se programan DESPUÉS de que el contexto
   está realmente corriendo, no antes. */
async function sonar(nombre){
  if(!audioOn() || soloVibrar()) return;
  const vol = volumenActual();
  if(vol <= 0) return;
  const def = SONIDOS[nombre]; if(!def) return;
  const c = await audioListo(); if(!c) return;
  const t0 = c.currentTime + 0.01;
  try{ def.notas.forEach(([f, off, dur]) => _nota(c, f, t0+off, dur, def.vol * vol, def.tipo)); }
  catch(e){ /* si el navegador no deja, seguimos sin sonido */ }
}
/* sonido + vibración juntos: en el gimnasio la vibración es lo confiable.
   Con "sólo vibrar" activo, esto sigue avisando aunque no suene nada. */
async function avisar(nombre, ms){
  try{ if(navigator.vibrate) navigator.vibrate(ms || 12); }catch(e){}
  await sonar(nombre);
}

/* Banner rojo fijo para avisos que NO se pueden perder (a diferencia del toast) */
let alertaActiva = null;
function alertaGrave(titulo, texto, accion){
  if(alertaActiva === titulo) return;            /* no apilar el mismo aviso */
  alertaActiva = titulo;
  const prev = document.getElementById("alertaGrave"); if(prev) prev.remove();
  const el = document.createElement("div");
  el.id = "alertaGrave"; el.className = "alerta-grave"; el.setAttribute("role","alert");
  el.innerHTML = `<div class="ag-txt"><b>${esc(titulo)}</b><span>${esc(texto)}</span></div>`+
    (accion?`<button class="ag-act" data-agact="1">${esc(accion)}</button>`:``)+
    `<button class="ag-x" data-agclose="1" aria-label="Cerrar aviso">✕</button>`;
  document.body.appendChild(el);
  el.addEventListener("click", ev=>{
    if(ev.target.closest("[data-agclose]")){ el.remove(); alertaActiva=null; return; }
    if(ev.target.closest("[data-agact]")){ exportBackup(); return; }
  });
}
/* Guardado. Si falla la cuota avisamos SIEMPRE y seguimos intentando:
   apagarlo en silencio era la forma de perder una semana entera de progreso. */
let guardadoFallando = false;
/* Al restaurar un respaldo se escribe el estado nuevo en localStorage y se
   recarga 900 ms después. En ese hueco, cualquier save() —y el de `pagehide`
   dispara SIEMPRE al recargar— escribía la S vieja que sigue en memoria
   encima de lo restaurado: la importación se deshacía sola, en silencio.
   Con esto, una vez comprometida la restauración ya nada guarda encima. */
let restaurando = false;
function save(){
  if(!canStore || restaurando) return;
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(S));
    if(guardadoFallando){                        /* se recuperó: quitamos el aviso */
      guardadoFallando = false;
      const el = document.getElementById("alertaGrave");
      if(el && alertaActiva==="No se está guardando"){ el.remove(); alertaActiva=null; }
      showToast("Ya se está guardando otra vez ✓");
    }
  }catch(e){
    guardadoFallando = true;
    alertaGrave("No se está guardando",
      "Se llenó el espacio de este navegador. Exporta un respaldo ahora y borra algunas fotos en Ajustes → Alimentos.",
      "Exportar respaldo");
  }
}
/* Registro de cuándo fue el último respaldo, para poder insistir */
function diasSinRespaldo(){
  if(!S.lastBackup) return null;
  return Math.floor((Date.now() - S.lastBackup) / 864e5);
}
function respaldoAvisoHtml(){
  const d = diasSinRespaldo();
  if(d===null) return `<div class="bk-aviso urge"><b>Nunca has hecho un respaldo.</b>
    <span>Si cambias de teléfono o borras los datos del navegador, todo esto se va. Toma 10 segundos.</span></div>`;
  if(d>=7) return `<div class="bk-aviso urge"><b>Tu último respaldo fue hace ${d} día${d===1?"":"s"}.</b>
    <span>Ya te toca uno nuevo.</span></div>`;
  return `<div class="bk-aviso ok"><b>Último respaldo: ${d===0?"hoy":"hace "+d+" día"+(d===1?"":"s")}.</b>
    <span>Vas bien.</span></div>`;
}
function renderRespaldoAviso(){
  const el = document.getElementById("respaldoAviso");
  if(el) el.innerHTML = respaldoAvisoHtml();
}

/* ---------- Descargar todas las fotos para usar sin señal ---------- */
let precacheEstado = null;   /* null | {hechas,total,fin} */
function precacheHtml(){
  if(!("serviceWorker" in navigator))
    return `<div class="bk-aviso urge"><b>No disponible</b><span>Este navegador no soporta uso sin conexión.</span></div>`;
  if(!precacheEstado)
    return `<button class="nut-addbtn" data-precache="1" style="margin-bottom:0">⬇️ Descargar todo para el gimnasio</button>`;
  const {hechas, total, fin, fallidas} = precacheEstado;
  const pct = total ? Math.round(hechas/total*100) : 0;
  if(fin) return `<div class="bk-aviso ok"><b>Listo: ${hechas} de ${total} imágenes guardadas.</b>
    <span>${fallidas?fallidas+" no se encontraron. ":""}Ya puedes abrir la app sin señal.</span></div>`;
  return `<div class="pc-prog"><div class="pc-bar"><i style="width:${pct}%"></i></div>
    <span>Descargando… ${hechas} de ${total}</span></div>`;
}
function renderPrecache(){
  const el = document.getElementById("precacheBox");
  if(el) el.innerHTML = precacheHtml();
}
/* lista de todo lo que hay que tener guardado antes de ir al gym */
function urlsDeImagenes(){
  const urls = new Set();
  SHOP.forEach(it=>urls.add("img/"+it.id+".png"));
  exVariantList().forEach(v=>urls.add("img/ej-"+v.sl+".png"));
  return [...urls];
}
function descargarImagenes(){
  if(!navigator.serviceWorker || !navigator.serviceWorker.controller){
    showToast("Abre y cierra la app una vez y vuelve a intentar"); return;
  }
  const urls = urlsDeImagenes();
  precacheEstado = {hechas:0, fallidas:0, total:urls.length}; renderPrecache();
  const ch = new MessageChannel();
  ch.port1.onmessage = ev => { precacheEstado = ev.data; renderPrecache(); };
  navigator.serviceWorker.controller.postMessage({tipo:"precachear-imagenes", urls}, [ch.port2]);
}

/* ============================================================
   MANDADO
   f  = factor de cantidad para igualar macros
   hair = nutriente capilar que aporta
   prep = listo | rapido | cocina
   tip  = cómo conviene comprarlo
   ============================================================ */
const SHOP = [
 /* ---------- PROTEÍNAS ---------- */
 {id:"pollo", cat:"prot", e:"🍗", name:"Pechuga de pollo deshebrada (ya cocida)", total:850, unit:"g", dur:"5 comidas", rol:"base",
  hair:"proteína + zinc", prep:"listo",
  tip:"1 kg ya cocido equivale a ~1.45 kg de pechuga cruda. Cómpralo en paquete de 1 kg o en la rostisería y <b>congélalo el mismo día en bolsas de 170 g (una por comida)</b> ya porcionado: sacas una en la noche y al día siguiente está lista. Enjuágala si viene muy salada.",
  alts:[
   {n:"Pollo rostizado entero, desmenuzado", f:1, prep:"listo", hair:"proteína + zinc + hierro",
    note:"El más barato ya cocido. 1 pollo ≈ 650 g de carne. La pierna aporta más hierro y zinc que la pechuga."},
   {n:"Pechuga de pollo cruda", f:1.45, prep:"cocina", hair:"proteína + zinc",
    note:"~30 % más barata por gramo de proteína, pero son ~50 min de cocina a la semana."},
   {n:"Atún en agua (drenado)", f:0.95, prep:"listo", hair:"selenio + omega-3 + vitamina D",
    note:"Cero cocción, se guarda un año. Máx. 4 latas por semana por el mercurio."},
   {n:"Sardina en tomate", f:1.1, prep:"listo", hair:"omega-3 + vitamina D + calcio",
    note:"La lata más barata con omega-3 real. Es de lo mejor que puedes comer para pelo, piel y huesos."},
   {n:"Filete de tilapia congelado", f:1.35, prep:"rapido", hair:"proteína magra + selenio",
    note:"Del congelador al sartén sin descongelar: 8 min. Bolsa de 1 kg."},
   {n:"Carne molida de res 90/10", f:1.2, prep:"cocina", hair:"hierro hemo + zinc + B12",
    note:"El hierro de la res se absorbe 3 veces mejor que el vegetal. 15 min en sartén."},
   {n:"Salmón (fresco o congelado)", f:1.15, prep:"rapido", hair:"omega-3 EPA/DHA + vitamina D + selenio",
    note:"La opción premium: la mejor fuente de omega-3 y vitamina D. 10 min al sartén u horno."}
  ]},
 {id:"res", cat:"prot", e:"🥩", name:"Res magra (molida 90/10 o bistec)", total:200, unit:"g", dur:"1 comida", rol:"rot",
  hair:"hierro hemo + zinc + B12", prep:"cocina",
  tip:"Cómprala en pieza de 1 kg cuando esté en oferta y congélala en porciones de 250 g planas (se descongelan en 20 min). Cocínala los domingos junto con el resto del prep.",
  alts:[
   {n:"Hígado de res", f:0.85, prep:"rapido", hair:"hierro, zinc, B12 y vitamina A (el más denso)",
    note:"El alimento más barato y más denso en nutrientes capilares. Máximo 100–150 g UNA vez por semana: el exceso de vitamina A también causa caída."},
   {n:"Falda o diezmillo", f:1, prep:"cocina", hair:"hierro hemo + zinc"},
   {n:"Molida de pavo", f:1.05, prep:"cocina", hair:"proteína + zinc", note:"Menos grasa, un poco menos hierro."},
   {n:"Sardina en tomate", f:1.3, prep:"listo", hair:"omega-3 + vitamina D", note:"Sustituto sin cocina."},
   {n:"Camarón congelado precocido", f:1.15, prep:"listo", hair:"zinc + selenio", note:"Se descongela en agua fría en 5 min. Más caro."}
  ]},
 {id:"huevos", cat:"prot", e:"🥚", name:"Huevo entero", total:14, unit:"pzas", dur:"7 cenas", rol:"base",
  hair:"biotina + zinc + selenio + vitamina D (en la yema)", prep:"rapido",
  tip:"<b>Siempre el cartón de 30.</b> Sale ~25 % más barato por pieza que el paquete de 12 y dura 4 semanas en refri. No tires la yema: ahí está todo lo del cabello.",
  alts:[
   {n:"Huevo cocido (los preparas de golpe)", f:1, prep:"listo", hair:"biotina + zinc + selenio",
    note:"Cuece 12 el domingo en 12 min. Duran 7 días en refri con cáscara."}
  ]},
 {id:"claras", cat:"prot", e:"🥛", name:"Claras pasteurizadas", total:2100, unit:"g", dur:"7 cenas", rol:"base",
  hair:"proteína (queratina)", prep:"rapido",
  tip:"El bote de 1 L sale mejor que el de 500 ml y no hay que cascar ni separar nada. Si te da igual el trabajo, 6 claras frescas cuestan ~35 % menos que 200 ml de bote.",
  alts:[
   {n:"Claras de huevo fresco", f:1, unit:"g", prep:"rapido", note:"~6 claras por porción. Más barato, más trabajo."},
   {n:"Pechuga de pavo natural rebanada", f:0.55, prep:"listo", hair:"proteína + zinc", note:"Cero cocina, más caro."},
   {n:"Queso cottage", f:0.85, prep:"listo", hair:"proteína + calcio", note:"Se come frío directo del bote."},
   {n:"Atún en agua", f:0.5, prep:"listo", hair:"selenio + omega-3", note:"Para cenas rápidas."}
  ]},
 {id:"yogurt", cat:"prot", e:"🥣", name:"Yogurt griego natural", total:2800, unit:"g", dur:"desayunos + pre-entrenos", rol:"base",
  hair:"proteína + calcio + B12", prep:"listo",
  tip:"<b>Bote de 1 kg, nunca los vasitos individuales:</b> los individuales cuestan casi el doble por gramo y suelen traer azúcar. Compra 2 botes de golpe, duran las 2 semanas.",
  alts:[
   {n:"Queso cottage", f:0.9, prep:"listo", hair:"proteína + calcio", note:"Misma proteína, más barato, menos cremoso."},
   {n:"Yogurt natural sin azúcar (no griego)", f:1.35, prep:"listo", note:"Más barato pero tiene menos proteína: sube la porción."},
   {n:"Skyr natural", f:1, prep:"listo", hair:"proteína", note:"Macros casi idénticos, más caro."},
   {n:"Requesón", f:1.1, prep:"listo", hair:"proteína + calcio", note:"El más barato de todos, se consigue en cualquier lado."}
  ]},
 {id:"queso", cat:"prot", e:"🧀", name:"Queso panela", total:560, unit:"g", dur:"7 cenas", rol:"base",
  hair:"proteína + calcio", prep:"listo",
  tip:"La pieza entera de 1 kg sale ~30 % más barata que las rebanadas empacadas. Se corta en 7 rebanadas gruesas y listo.",
  alts:[
   {n:"Queso cottage", f:1.3, prep:"listo", hair:"proteína + calcio"},
   {n:"Jamón de pechuga de pavo", f:0.9, prep:"listo", note:"Más sodio; busca el de 90 % pechuga."},
   {n:"Queso Oaxaca (poca cantidad)", f:0.75, prep:"listo", note:"Más grasa; ajusta el aceite del día."},
   {n:"Requesón", f:1.2, prep:"listo", hair:"proteína + calcio", note:"El más económico."}
  ]},
 {id:"sardina", cat:"prot", e:"🐟", name:"Sardina en tomate (lata 425 g)", total:3, unit:"latas", dur:"1 comida + snacks", rol:"rot",
  hair:"omega-3 EPA/DHA + vitamina D + calcio + selenio", prep:"listo",
  tip:"Cómprala por paquete de 4–6 latas: es de lo más barato por gramo de omega-3 y no caduca pronto. 2 latas por semana ya te cubren la cuota de omega-3.",
  alts:[
   {n:"Atún en agua (paquete de 6)", f:3, unit:"latas", prep:"listo", hair:"selenio + omega-3",
    note:"Menos omega-3 que la sardina, pero más versátil.", totalTxt:"6 latas"},
   {n:"Salmón enlatado", f:1, prep:"listo", hair:"omega-3 + vitamina D", note:"Mismo beneficio, ~3 veces el precio."},
   {n:"Linaza molida + atún", f:1, prep:"listo", hair:"omega-3 vegetal", note:"Opción de emergencia: el omega-3 vegetal se convierte peor."}
  ]},

 /* ---------- CARBOHIDRATOS ---------- */
 {id:"avena", cat:"carb", e:"🌾", name:"Avena en hojuela", total:420, unit:"g", dur:"desayunos + pre", rol:"base",
  hair:"zinc + hierro + silicio + fibra", prep:"rapido",
  tip:"<b>A granel siempre.</b> El kilo a granel cuesta la mitad que la caja de marca y es exactamente el mismo grano. Compra 2 kg de una vez y guárdala en un frasco hermético.",
  alts:[
   {n:"Avena instantánea (sobre)", f:1, prep:"listo", note:"Cara y con azúcar añadida. Solo si tienes cero tiempo."},
   {n:"Amaranto inflado", f:1, prep:"listo", hair:"hierro + proteína vegetal", note:"Se come sin cocinar, muy barato a granel."},
   {n:"Salvado de trigo + avena", f:1, prep:"rapido", hair:"zinc + fibra", note:"Más fibra, mejor saciedad."},
   {n:"Granola sin azúcar", f:0.8, prep:"listo", note:"Más densa: menos gramos. Cara."}
  ]},
 {id:"arroz", cat:"carb", e:"🍚", name:"Arroz (crudo)", total:350, unit:"g", dur:"7 comidas", rol:"base",
  hair:null, prep:"cocina",
  tip:"Bolsa de 5 kg a granel: sale ~40 % más barato y dura meses. Cuece 1 kg el domingo en la arrocera (0 esfuerzo) y porciona en topers; aguanta 5 días en refri.",
  alts:[
   {n:"Tortilla de maíz", f:2.4, unit:"pzas", prep:"listo", hair:"calcio + niacina", note:"Cero cocina. 1 tortilla ≈ 25 g de arroz crudo.", totalTxt:"~28 pzas"},
   {n:"Papa o camote", f:3.5, prep:"rapido", hair:"vitamina A (camote) + potasio", note:"6 min en microondas picada con tenedor. Muy saciante."},
   {n:"Pasta integral", f:1, prep:"cocina", hair:"selenio + fibra"},
   {n:"Arroz precocido en bolsa (90 s)", f:2.6, prep:"listo", note:"3 veces más caro. Solo para días de emergencia.", totalTxt:"~5 bolsas"}
  ]},
 {id:"tortillas", cat:"carb", e:"🫓", name:"Tortillas de maíz", total:21, unit:"pzas", dur:"7 cenas", rol:"base",
  hair:"calcio + niacina", prep:"listo",
  tip:"De tortillería, no empacadas: mitad de precio y mejor sabor. Compra 1 kg (~35 pzas) y congela la mitad en bolsa; se descongelan en 20 s de micro.",
  alts:[
   {n:"Tortilla de nopal o baja en carbos", f:1, unit:"pzas", prep:"listo", note:"Menos carbos, más cara."},
   {n:"Tostadas horneadas", f:1, unit:"pzas", prep:"listo", note:"Mismas piezas, más crujiente."},
   {n:"Pan integral de caja", f:0.6, unit:"reb", prep:"listo", note:"2 rebanadas ≈ 3 tortillas."}
  ]},
 {id:"frijoles", cat:"carb", e:"🫘", name:"Frijoles cocidos", total:840, unit:"g", dur:"7 comidas", rol:"base",
  hair:"hierro vegetal + zinc + folato", prep:"listo",
  tip:"<b>Frijol seco a granel + olla express.</b> 1 kg seco (~$40) rinde 2.5 kg cocido: sale a menos de un tercio de lo que cuestan los de lata. 35 min en la express una vez al mes y congelas en bolsas planas de 500 g.",
  alts:[
   {n:"Frijoles refritos en tetra/lata", f:0.9, prep:"listo", hair:"hierro vegetal", note:"Cero trabajo, ~3 veces el precio del granel."},
   {n:"Lentejas cocidas", f:1.1, prep:"listo", hair:"hierro + folato + zinc", note:"Aún más hierro que el frijol. Se cuecen en 20 min sin remojo."},
   {n:"Garbanzo cocido", f:1, prep:"listo", hair:"hierro + zinc + proteína"},
   {n:"Habas o alubias", f:1, prep:"listo", hair:"hierro vegetal"}
  ]},
 {id:"leche", cat:"carb", e:"🥛", name:"Leche alta en proteína", total:2100, unit:"ml", dur:"7 pre-entrenos", rol:"base",
  hair:"proteína + calcio + vitamina D", prep:"listo",
  tip:"<b>Paquete completo de 12 piezas, no sueltas.</b> Sale ~12–15 % más barata por litro, es leche UHT (no necesita refri hasta abrirse) y te ahorra ir al súper cada tercer día. Guárdala en la alacena.",
  alts:[
   {n:"Leche descremada normal", f:1.15, prep:"listo", hair:"calcio + vitamina D", note:"Más barata pero menos proteína: sube la porción."},
   {n:"Leche en polvo descremada", f:0.13, unit:"g", prep:"rapido", hair:"proteína + calcio",
    note:"La proteína más barata del súper. 1 bote rinde 8 L. Ideal para batidos.", totalTxt:"~270 g"},
   {n:"Bebida de soya sin azúcar", f:1.2, prep:"listo", note:"Si te cae pesada la leche."},
   {n:"Yogurt griego bebible sin azúcar", f:0.9, prep:"listo", hair:"proteína + calcio"}
  ]},
 {id:"chispas", cat:"carb", e:"🍫", name:"Chispas de chocolate", total:140, unit:"g", dur:"7 desayunos", rol:"base",
  hair:null, prep:"listo",
  tip:"La bolsa de 225 g te dura ~2 semanas. <b>Pésalas, no las eches a ojo:</b> 20 g es una cucharada copeteada. Si las mides, son parte del plan; si van a ojo se vuelven 40 g sin darte cuenta.",
  alts:[
   {n:"Chocolate amargo 70 %+ troceado", f:1, prep:"listo", hair:"magnesio + hierro",
    note:"Mismo gusto con la mitad del azúcar y nutrientes de regalo. Pruébalo algún día."},
   {n:"Cacao nibs", f:0.9, prep:"listo", hair:"magnesio + hierro",
    note:"Crujiente, casi sin azúcar, sabor más intenso."},
   {n:"Granola con chocolate sin azúcar añadida", f:1.2, prep:"listo",
    note:"Más volumen, menos golpe dulce."}
  ]},
 {id:"cacao", cat:"carb", e:"🍫", name:"Cacao en polvo sin azúcar", total:100, unit:"g", dur:"desayunos + pre", rol:"base",
  hair:"magnesio + hierro + antioxidantes", prep:"listo",
  tip:"La bolsa grande de 400 g a granel dura 6 semanas y cuesta lo mismo que 2 latitas. Es tu mejor aliado contra el antojo de chocolate: sabor a chocolate con casi cero azúcar.",
  alts:[{n:"Cocoa sin azúcar de marca", f:1, prep:"listo", note:"Equivalente directo, algo más cara."}]},

 /* ---------- FRUTAS Y VERDURAS ---------- */
 {id:"verdura", cat:"veg", e:"🥦", name:"Mezcla de verduras congeladas", total:1750, unit:"g", dur:"7 comidas", rol:"base",
  hair:"vitamina C + folato + antioxidantes", prep:"listo",
  tip:"<b>El mejor cambio de todos.</b> Se congela en el punto máximo de maduración (a veces con MÁS vitamina C que la 'fresca' que viajó 5 días), no se echa a perder, no hay que lavar ni picar y son 4 min de microondas. Bolsas de 1 kg, compra 2.",
  alts:[
   {n:"Brócoli y calabacita frescos", f:1, prep:"cocina", hair:"vitamina C + folato",
    note:"Similar de precio pero son ~25 min semanales de lavar y picar, y se echa a perder."},
   {n:"Espinaca congelada", f:0.9, prep:"listo", hair:"hierro + folato + vitamina A",
    note:"Muy concentrada en hierro. Escúrrela bien antes de usar."},
   {n:"Ejotes congelados", f:1, prep:"listo", hair:"vitamina C"},
   {n:"Verdura fresca de mercado (a granel)", f:1, prep:"cocina", note:"Lo más barato si vas al mercado el domingo; el precio baja hasta 40 %."}
  ]},
 {id:"espinaca", cat:"veg", e:"🥬", name:"Espinaca (fresca en bolsa o congelada)", total:800, unit:"g", dur:"7 cenas + guarnición", rol:"base",
  hair:"hierro + folato + vitamina A + vitamina C", prep:"listo",
  tip:"La bolsa de espinaca baby ya lavada cuesta poco más que la de manojo y te ahorra lavar y desinfectar. La congelada sale aún más barata y rinde el triple (viene sin agua).",
  alts:[
   {n:"Espinaca congelada en bloque", f:0.4, prep:"listo", hair:"hierro + folato", note:"Rinde mucho más: 40 g del bloque ≈ 100 g fresca."},
   {n:"Acelga", f:1, prep:"rapido", hair:"hierro + vitamina A"},
   {n:"Kale", f:1, prep:"rapido", hair:"vitamina C + vitamina A"},
   {n:"Nopal en frasco", f:1.2, prep:"listo", hair:"calcio + fibra", note:"Cero preparación, muy barato."}
  ]},
 {id:"manzana", cat:"veg", e:"🍎", name:"Manzana", total:910, unit:"g",
  totalTxt:"7 pzas (≈130 g c/u)", dur:"desayunos", rol:"base",
  hair:"fibra + antioxidantes", prep:"listo",
  tip:"<b>7 piezas para la semana: una por desayuno.</b> Cómprala por kilo en el mercado, no por pieza en el súper: la diferencia llega al 50 %. Aguanta 3 semanas en refri sin problema.",
  alts:[
   {n:"Guayaba", f:0.9, prep:"listo", hair:"vitamina C (4 veces más que la naranja)",
    note:"La fruta con más vitamina C por peso. Cómela junto con frijoles para absorber su hierro."},
   {n:"Papaya", f:1.2, prep:"listo", hair:"vitamina C + vitamina A", note:"Barata en temporada, buena para digestión."},
   {n:"Naranja o mandarina", f:1.1, prep:"listo", hair:"vitamina C"},
   {n:"Fresa congelada", f:1.1, prep:"listo", hair:"vitamina C", note:"No se echa a perder, ideal para el yogurt."},
   {n:"Pera", f:1.1, prep:"listo", note:"Misma practicidad que la manzana, cambia el sabor."},
   {n:"Berries (fresa + arándano)", f:0.9, prep:"listo", hair:"antioxidantes premium",
    note:"Las frutas con más antioxidantes por caloría. Congeladas rinden igual."}
  ]},
 {id:"platano", cat:"veg", e:"🍌", name:"Plátano", total:720, unit:"g",
  totalTxt:"6 pzas (≈120 g c/u)", dur:"snacks + pre-entreno", rol:"base",
  hair:"potasio + vitamina B6", prep:"listo",
  tip:"<b>6 piezas para la semana: snack o pre-entreno.</b> Cómpralos algo verdes para que te duren; si maduran de más, al congelador pelados y quedan perfectos para licuado.",
  alts:[
   {n:"Guayaba", f:0.9, prep:"listo", hair:"vitamina C"},
   {n:"Naranja o mandarina", f:1.1, prep:"listo", hair:"vitamina C"},
   {n:"Papaya", f:1.2, prep:"listo", hair:"vitamina C + vitamina A"},
   {n:"Sandía o melón", f:1.6, prep:"rapido", note:"Mucho volumen y pocas calorías: la mejor arma contra el antojo."},
   {n:"Dátiles", f:0.35, prep:"listo", note:"Energía rápida pre-entreno. Ojo: 3 piezas equivalen a un plátano."}
  ]},
 {id:"zanahoria", cat:"veg", e:"🥕", name:"Zanahoria", total:700, unit:"g", dur:"para picar", rol:"extra",
  hair:"vitamina A (betacaroteno) + vitamina C", prep:"rapido",
  tip:"<b>Compra 1 bolsa de 700 g – 1 kg de zanahoria:</b> dura 3 semanas en refri. Su betacaroteno NO es tóxico como el retinol de los suplementos: puedes comerla diario sin riesgo. Si prefieres camote, cámbiala abajo con la cantidad ya ajustada.",
  alts:[
   {n:"Camote", f:0.85, prep:"rapido", hair:"vitamina A + potasio", note:"6 min en microondas entero. Muy saciante."},
   {n:"Calabacita", f:1.3, prep:"listo", note:"Menos carbos, más volumen."},
   {n:"Chayote", f:1.3, prep:"rapido", note:"El más barato del mercado."},
   {n:"Pepino con limón y chile", f:1.5, prep:"listo", note:"Casi cero calorías, perfecto para picar en la tarde."}
  ]},
 {id:"limon", cat:"veg", e:"🍋", name:"Limón", total:250, unit:"g", dur:"toda la semana", rol:"base",
  hair:"vitamina C (multiplica la absorción de hierro)", prep:"listo",
  tip:"Compra 1 kg cuando esté barato y congela el jugo en cubitera. <b>Truco clave:</b> exprime limón sobre los frijoles, las lentejas y la espinaca — triplica el hierro que realmente absorbes.",
  alts:[
   {n:"Naranja", f:2, prep:"listo", hair:"vitamina C"},
   {n:"Pimiento morrón crudo", f:0.6, prep:"listo", hair:"vitamina C (más que el limón)"},
   {n:"Guayaba", f:0.5, prep:"listo", hair:"vitamina C"}
  ]},

 /* ---------- GRASAS, SEMILLAS Y EXTRAS ---------- */
 {id:"linaza", cat:"fat", e:"🌱", name:"Linaza molida", total:100, unit:"g", dur:"7 desayunos", rol:"base",
  hair:"omega-3 vegetal + lignanos + zinc", prep:"listo",
  tip:"<b>A granel es 3 veces más barata</b> que empacada. Cómprala entera y muélela en la licuadora en tandas de 2 semanas (entera pasa de largo sin digerirse). Guárdala en el refri.",
  alts:[
   {n:"Chía", f:1, prep:"listo", hair:"omega-3 + calcio + fibra", note:"No hay que molerla, pero es el doble de cara."},
   {n:"Nuez de Castilla", f:1.5, prep:"listo", hair:"omega-3 + biotina + zinc", note:"La nuez más rica en omega-3. Cara: úsala en poca cantidad."},
   {n:"Semilla de girasol", f:1.4, prep:"listo", hair:"vitamina E + selenio", note:"Muy barata a granel."}
  ]},
 {id:"pepitas", cat:"fat", e:"🎃", name:"Pepitas (semilla de calabaza)", total:200, unit:"g", dur:"desayunos + snacks", rol:"base",
  hair:"zinc (de lo más alto que existe) + hierro + magnesio", prep:"listo",
  tip:"A granel cuesta la mitad que empacada. Es tu snack más útil: zinc y magnesio en un puño, sin cocinar. Lleva 30 g al trabajo en un frasquito.",
  alts:[
   {n:"Cacahuate natural (sin sal)", f:1.1, prep:"listo", hair:"biotina + niacina + vitamina E",
    note:"La opción más barata del mercado. A granel cuesta la mitad que empacado."},
   {n:"Almendra", f:1, prep:"listo", hair:"vitamina E + magnesio + biotina", note:"Cara pero muy saciante."},
   {n:"Nuez de Castilla", f:0.9, prep:"listo", hair:"omega-3 + biotina"},
   {n:"Crema de cacahuate natural", f:1.1, prep:"listo", hair:"biotina + niacina",
    note:"Revisa que solo diga cacahuate y sal. Perfecta con manzana."}
  ]},
 {id:"aceite", cat:"fat", e:"🫒", name:"Aceite de oliva", total:100, unit:"ml", dur:"toda la semana", rol:"base",
  hair:"vitamina E + grasas para la piel", prep:"listo",
  tip:"Botella de 1 L, no la chica: sale ~30 % más barato por mililitro y dura 4 meses. Guárdala lejos del calor de la estufa.",
  alts:[
   {n:"Aguacate en fruta", f:2.5, unit:"g", prep:"listo", hair:"vitamina E + grasas monoinsaturadas",
    note:"20 g de aguacate ≈ 8 ml de aceite. Mejores nutrientes, más volumen."},
   {n:"Aceite de canola", f:1, prep:"listo", note:"Más barato, perfil de grasa aceptable."}
  ]},
 {id:"sazon", cat:"fat", e:"🧂", name:"Sal, pimienta, ajo, comino, chile", total:0, unit:"al gusto", dur:"toda la semana", rol:"base",
  hair:null, prep:"listo",
  tip:"A granel en el mercado: pagas por gramo lo que en el súper cuesta el frasco. El ajo en polvo y el comino son lo que hace que la comida repetida no se vuelva insoportable.",
  alts:[]},
 {id:"galletas", cat:"fat", e:"🍪", name:"Galletas de avena (tipo Quaker)", total:6, unit:"paquetes", dur:"snacks del trabajo", rol:"base",
  hair:"fibra + zinc de la avena", prep:"listo",
  tip:"Compra la caja multipack de 6–8 paquetes: sale ~25 % más barata por paquete y ya viene porcionada, así no te comes media caja. Deja 2 paquetes en el cajón del trabajo.",
  alts:[
   {n:"Barra de granola sin chocolate", f:1, unit:"pzas", prep:"listo", note:"Revisa que tenga menos de 10 g de azúcar."},
   {n:"Galleta integral tipo María o salada", f:1.2, unit:"paquetes", prep:"listo", note:"Más barata, menos sabor."},
   {n:"Palomitas naturales para microondas", f:1, unit:"bolsas", prep:"rapido", note:"Mucho volumen, pocas calorías: la mejor para el antojo de 'picar'."},
   {n:"Chocolate amargo 70 %+ (20 g)", f:1, unit:"barras", prep:"listo", hair:"magnesio + hierro",
    note:"Mata el antojo de chocolate con la cuarta parte del azúcar. 20 g ≈ 110 kcal."}
  ]}
];
const CATS = {prot:{t:"Proteínas",c:"#4d8dff"}, carb:{t:"Carbohidratos",c:"#f2b544"},
              veg:{t:"Frutas y verduras",c:"#7ee081"}, fat:{t:"Grasas, semillas y extras",c:"#b09bff"}};
const shopById = Object.fromEntries(SHOP.map(s=>[s.id,s]));

/* ============================================================
   NUTRICIÓN Y PRECIOS (por 100 g/ml, o por pieza si pz:true)
   Clave: "id" = alimento del plan · "id~N" = su equivalencia N.
   Todo es editable desde la tuerca → 🍽 Nutrición; lo que edites
   se guarda en tu navegador y recalcula dieta y mandado.
   ============================================================ */
const NUTBASE = {
 /* --- proteínas --- */
 pollo:     {kcal:165,p:31,  c:0,   f:3.6, precio:25},
 "pollo~0": {kcal:180,p:28,  c:0,   f:7,   precio:21},
 "pollo~1": {kcal:112,p:23,  c:0,   f:1.8, precio:14},
 "pollo~2": {kcal:105,p:24,  c:0,   f:1,   precio:23},
 "pollo~3": {kcal:165,p:18,  c:2.5, f:9,   precio:9},
 "pollo~4": {kcal:96, p:20,  c:0,   f:1.8, precio:14},
 "pollo~5": {kcal:176,p:20,  c:0,   f:10,  precio:18},
 "pollo~6": {kcal:190,p:20,  c:0,   f:12,  precio:45},
 res:       {kcal:176,p:20,  c:0,   f:10,  precio:18},
 "res~0":   {kcal:135,p:20,  c:3.9, f:3.6, precio:9},
 "res~1":   {kcal:155,p:21,  c:0,   f:8,   precio:22},
 "res~2":   {kcal:150,p:19,  c:0,   f:8,   precio:16},
 "res~3":   {kcal:165,p:18,  c:2.5, f:9,   precio:9},
 "res~4":   {kcal:85, p:18,  c:0.5, f:1,   precio:26},
 huevos:    {pz:true, pzTxt:"pieza", kcal:74,p:6.3,c:0.5,f:5, precio:3.7},
 "huevos~0":{pz:true, pzTxt:"pieza", kcal:74,p:6.3,c:0.5,f:5, precio:3.7},
 claras:    {kcal:52, p:11,  c:0.7, f:0.2, precio:16},
 "claras~0":{kcal:52, p:11,  c:0.7, f:0.2, precio:11},
 "claras~1":{kcal:95, p:17,  c:2,   f:2,   precio:26},
 "claras~2":{kcal:82, p:11,  c:3.5, f:2.5, precio:13},
 "claras~3":{kcal:105,p:24,  c:0,   f:1,   precio:23},
 yogurt:    {kcal:60, p:10,  c:3.8, f:0.4, precio:14.5},
 "yogurt~0":{kcal:82, p:11,  c:3.5, f:2.5, precio:13},
 "yogurt~1":{kcal:60, p:4,   c:6,   f:3,   precio:9},
 "yogurt~2":{kcal:63, p:11,  c:4,   f:0.2, precio:26},
 "yogurt~3":{kcal:96, p:11,  c:3.5, f:4.5, precio:11},
 queso:     {kcal:250,p:18,  c:3.5, f:18,  precio:18},
 "queso~0": {kcal:82, p:11,  c:3.5, f:2.5, precio:13},
 "queso~1": {kcal:100,p:17,  c:2,   f:2.5, precio:22},
 "queso~2": {kcal:315,p:23,  c:2,   f:24,  precio:22},
 "queso~3": {kcal:96, p:11,  c:3.5, f:4.5, precio:11},
 sardina:   {pz:true, pzTxt:"lata",  kcal:470,p:52,c:6,  f:26, precio:38},
 "sardina~0":{pz:true,pzTxt:"lata",  kcal:120,p:26,c:0,  f:1.2,precio:21},
 "sardina~1":{pz:true,pzTxt:"lata",  kcal:460,p:55,c:0,  f:26, precio:78},
 "sardina~2":{pz:true,pzTxt:"lata",  kcal:190,p:28,c:3,  f:7,  precio:26},
 /* --- carbohidratos --- */
 avena:     {kcal:389,p:13,  c:66,  f:7,   precio:3},
 "avena~0": {kcal:380,p:10,  c:70,  f:6,   precio:28},
 "avena~1": {kcal:375,p:14,  c:65,  f:6.5, precio:8},
 "avena~2": {kcal:330,p:14,  c:58,  f:6,   precio:4},
 "avena~3": {kcal:470,p:12,  c:58,  f:20,  precio:18},
 arroz:     {kcal:360,p:7,   c:79,  f:0.6, precio:2.8},
 "arroz~0": {pz:true, pzTxt:"pieza", kcal:65,p:1.4,c:13.5,f:0.8, precio:0.8},
 "arroz~1": {kcal:90, p:2,   c:20,  f:0.1, precio:3},
 "arroz~2": {kcal:355,p:13,  c:71,  f:2,   precio:4},
 "arroz~3": {kcal:140,p:3,   c:31,  f:0.5, precio:24},
 tortillas: {pz:true, pzTxt:"pieza", kcal:65,p:1.4,c:13.5,f:0.8, precio:0.8},
 "tortillas~0":{pz:true,pzTxt:"pieza",kcal:45,p:2, c:8,   f:0.7, precio:2.5},
 "tortillas~1":{pz:true,pzTxt:"pieza",kcal:60,p:1.5,c:12, f:0.5, precio:1.2},
 "tortillas~2":{pz:true,pzTxt:"rebanada",kcal:75,p:3.5,c:13,f:1.1,precio:2},
 frijoles:  {kcal:130,p:8,   c:23,  f:0.6, precio:1.6},
 "frijoles~0":{kcal:95,p:5.5,c:15,  f:1.2, precio:4.5},
 "frijoles~1":{kcal:115,p:9, c:20,  f:0.4, precio:2.5},
 "frijoles~2":{kcal:165,p:9, c:27,  f:2.6, precio:2.5},
 "frijoles~3":{kcal:110,p:8, c:19,  f:0.5, precio:2.6},
 leche:     {kcal:45, p:5.6, c:4.6, f:0.8, precio:2.9},
 "leche~0": {kcal:35, p:3.2, c:4.9, f:0.2, precio:2.4},
 "leche~1": {kcal:360,p:35,  c:52,  f:0.8, precio:16},
 "leche~2": {kcal:33, p:3,   c:1.5, f:1.8, precio:3},
 "leche~3": {kcal:55, p:8,   c:4.5, f:0.5, precio:4},
 chispas:   {kcal:500,p:4,   c:62,  f:26,  precio:27},
 "chispas~0":{kcal:560,p:7,  c:38,  f:42,  precio:35},
 "chispas~1":{kcal:600,p:13, c:32,  f:50,  precio:40},
 "chispas~2":{kcal:450,p:10, c:60,  f:18,  precio:20},
 cacao:     {kcal:380,p:20,  c:45,  f:12,  precio:20},
 "cacao~0": {kcal:380,p:20,  c:45,  f:12,  precio:33},
 /* --- frutas y verduras --- */
 verdura:   {kcal:40, p:2.2, c:7,   f:0.4, precio:5.5},
 "verdura~0":{kcal:32,p:2.5, c:5,   f:0.3, precio:4.5},
 "verdura~1":{kcal:29,p:3,   c:3.5, f:0.4, precio:6},
 "verdura~2":{kcal:33,p:1.8, c:7,   f:0.2, precio:5.5},
 "verdura~3":{kcal:35,p:2,   c:6,   f:0.3, precio:3.5},
 espinaca:  {kcal:23, p:2.9, c:3.6, f:0.4, precio:12},
 "espinaca~0":{kcal:29,p:3.6,c:4.3, f:0.5, precio:6},
 "espinaca~1":{kcal:19,p:1.8,c:3.7, f:0.2, precio:3},
 "espinaca~2":{kcal:35,p:2.9,c:4.4, f:0.7, precio:8},
 "espinaca~3":{kcal:16,p:1.4,c:3.3, f:0.2, precio:5},
 manzana:     {kcal:52, p:0.3, c:14,  f:0.2, precio:4.5},
 "manzana~0": {kcal:68, p:2.6, c:14,  f:1,   precio:4},
 "manzana~1": {kcal:43, p:0.5, c:11,  f:0.3, precio:3},
 "manzana~2": {kcal:47, p:0.9, c:12,  f:0.1, precio:2.2},
 "manzana~3": {kcal:33, p:0.7, c:8,   f:0.3, precio:8.5},
 "manzana~4": {kcal:57, p:0.4, c:15,  f:0.1, precio:5},
 "manzana~5": {kcal:45, p:0.8, c:10,  f:0.4, precio:14},
 platano:     {kcal:89, p:1.1, c:23,  f:0.3, precio:2.4},
 "platano~0": {kcal:68, p:2.6, c:14,  f:1,   precio:4},
 "platano~1": {kcal:47, p:0.9, c:12,  f:0.1, precio:2.2},
 "platano~2": {kcal:43, p:0.5, c:11,  f:0.3, precio:3},
 "platano~3": {kcal:30, p:0.6, c:8,   f:0.2, precio:1.8},
 "platano~4": {kcal:280, p:2.5, c:75, f:0.4, precio:16},
 zanahoria: {kcal:41, p:0.9, c:10,  f:0.2, precio:1.8},
 "zanahoria~0":{kcal:86,p:1.6,c:20, f:0.1, precio:3},
 "zanahoria~1":{kcal:17,p:1.2,c:3.1,f:0.3, precio:2.8},
 "zanahoria~2":{kcal:19,p:0.8,c:4.5,f:0.1, precio:2},
 "zanahoria~3":{kcal:15,p:0.7,c:3.6,f:0.1, precio:2.2},
 limon:     {kcal:29, p:1.1, c:9,   f:0.3, precio:3.5},
 "limon~0": {kcal:47, p:0.9, c:12,  f:0.1, precio:2.2},
 "limon~1": {kcal:31, p:1,   c:6,   f:0.3, precio:7},
 "limon~2": {kcal:68, p:2.6, c:14,  f:1,   precio:4},
 /* --- grasas, semillas y extras --- */
 linaza:    {kcal:534,p:18,  c:29,  f:42,  precio:4.5},
 "linaza~0":{kcal:486,p:17,  c:42,  f:31,  precio:9},
 "linaza~1":{kcal:654,p:15,  c:14,  f:65,  precio:28},
 "linaza~2":{kcal:584,p:21,  c:20,  f:51,  precio:6},
 pepitas:   {kcal:559,p:30,  c:11,  f:49,  precio:12},
 "pepitas~0":{kcal:567,p:26, c:16,  f:49,  precio:7},
 "pepitas~1":{kcal:579,p:21, c:22,  f:50,  precio:22},
 "pepitas~2":{kcal:654,p:15, c:14,  f:65,  precio:28},
 "pepitas~3":{kcal:588,p:25, c:20,  f:50,  precio:13},
 aceite:    {kcal:884,p:0,   c:0,   f:100, precio:17},
 "aceite~0":{kcal:160,p:2,   c:9,   f:15,  precio:9},
 "aceite~1":{kcal:884,p:0,   c:0,   f:100, precio:4.5},
 sazon:     {kcal:0,  p:0,   c:0,   f:0,   precio:0},
 galletas:  {pz:true, pzTxt:"paquete", kcal:120,p:2,c:19,f:4,  precio:7},
 "galletas~0":{pz:true,pzTxt:"pieza",  kcal:110,p:2,c:18,f:3.5,precio:9},
 "galletas~1":{pz:true,pzTxt:"paquete",kcal:110,p:2,c:19,f:3,  precio:6},
 "galletas~2":{pz:true,pzTxt:"bolsa",  kcal:120,p:4,c:24,f:1.5,precio:9},
 "galletas~3":{pz:true,pzTxt:"barra",  kcal:110,p:2,c:9,  f:8, precio:18}
};
/* macro principal por categoría: define cómo se calculan equivalencias nuevas */
const MAIN_MACRO = {prot:"p", carb:"c", veg:"kcal", fat:"f"};

/* --- alimentos agregados por ti (viven en tu navegador) --- */
if(!Array.isArray(S.customFoods)) S.customFoods = [];
if(!S.nutEdits || typeof S.nutEdits!=="object" || Array.isArray(S.nutEdits)) S.nutEdits = {};
function attachCustomFoods(){
  S.customFoods.forEach(cf=>{
    const base = shopById[cf.base]; if(!base) return;
    if(base.alts.some(a=>a.customId===cf.id)) return;
    base.alts.push({n:cf.n, f:1, prep:"listo", note:"agregado por ti",
                    unit:cf.pz?"pzas":base.unit, customId:cf.id, hair:cf.hair||null});
  });
}
attachCustomFoods();
/* migración: el alimento combinado "fruta" ahora son manzana y plátano */
if(S.swaps && S.swaps.fruta!==undefined){ delete S.swaps.fruta; }
if(S.nutEdits){ Object.keys(S.nutEdits).forEach(k=>{ if(k==="fruta"||k.startsWith("fruta~")) delete S.nutEdits[k]; }); }
S.customFoods.forEach(cf=>{ if(cf.base==="fruta") cf.base="manzana"; });

/* ------------------------------------------------------------------
   SANEADO DEL ESTADO GUARDADO
   Todo lo que se guarda apunta a POSICIONES de array. Si una
   actualización quita una equivalencia o reordena algo, esos índices
   quedan colgados y antes tronaban la app entera antes de pintar nada.
   Aquí los revisamos una sola vez al arrancar.
   ------------------------------------------------------------------ */
function saneaEstado(){
  /* el mismo saneado que a un respaldo: lo que ya está guardado pudo
     haberse escrito antes de esta versión, o por otra página del origen */
  saneaImportado(S);
  const obj = k => (S[k] && typeof S[k]==="object" && !Array.isArray(S[k])) ? S[k] : (S[k]={});
  ["meals","water","swaps","mealOpt","lifts","liftHi","antojos","trained",
   "note","sets","varSel","warm","cardio","nutEdits",
   /* nuevos: compra semanal, historial de cargas y snacks registrados */
   "compras","liftHist","snacks","precios"].forEach(obj);
  Object.keys(S.precios).forEach(k=>{ if(!Array.isArray(S.precios[k])) delete S.precios[k]; });
  /* cada semana de compra: {items:{id:{e:0|1|2, $:num}}, cerrada:bool} */
  Object.keys(S.compras).forEach(k=>{
    const c = S.compras[k];
    if(!c || typeof c!=="object"){ delete S.compras[k]; return; }
    if(!c.items || typeof c.items!=="object") c.items = {};
  });
  Object.keys(S.liftHist).forEach(k=>{ if(!Array.isArray(S.liftHist[k])) delete S.liftHist[k]; });
  Object.keys(S.snacks).forEach(k=>{ if(!Array.isArray(S.snacks[k])) delete S.snacks[k]; });
  if(!Array.isArray(S.body)) S.body = [];
  if(!Array.isArray(S.customFoods)) S.customFoods = [];

  /* sustituciones: el índice tiene que existir todavía */
  Object.keys(S.swaps).forEach(id=>{
    const it = shopById[id], i = S.swaps[id];
    if(!it || !Array.isArray(it.alts) || typeof i!=="number" || i<0 || !it.alts[i]) delete S.swaps[id];
  });
  /* opción de comida: la letra tiene que existir en esa comida */
  Object.keys(S.mealOpt).forEach(i=>{
    const m = MEALS[+i];
    if(!m || !m.options || !m.options[S.mealOpt[i]]) delete S.mealOpt[i];
  });
  /* unidad de peso: hubo dos claves distintas (S.unit y S.unidad) que no se
     hablaban. Nos quedamos con S.unidad y absorbemos la vieja. */
  if(S.unit && !["kg","lb"].includes(S.unidad)) S.unidad = S.unit;
  if(S.unit){ if(S.unit!==S.unidad) S.unidad = S.unit; delete S.unit; }
  if(!["kg","lb"].includes(S.unidad)) S.unidad = "kg";

  /* mediciones: ordenadas por fecha y sin basura */
  S.body = S.body.filter(b=>b && b.d).sort((a,b)=> a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
}
/* Ojo: saneaEstado() se llama más abajo, cuando MEALS ya existe. */

/* clave nutricional de un alimento efectivo */
function nutKey(id, altIdx){
  if(altIdx===undefined || altIdx===null || altIdx<0) return id;
  const a = shopById[id].alts[altIdx];
  return (a && a.customId) ? "custom:"+a.customId : id+"~"+altIdx;
}
/* datos nutricionales efectivos (base + tus ediciones) */
function nutOf(key){
  let n;
  if(key.startsWith("custom:")){
    const cf = S.customFoods.find(c=>"custom:"+c.id===key);
    n = cf ? {kcal:cf.kcal,p:cf.p,c:cf.c,f:cf.f,precio:cf.precio||0,pz:!!cf.pz,pzTxt:cf.pzTxt||"pieza"} : null;
  } else n = NUTBASE[key] ? Object.assign({}, NUTBASE[key]) : null;
  if(!n) return {kcal:0,p:0,c:0,f:0,precio:0};
  if(S.nutEdits[key]) Object.assign(n, S.nutEdits[key]);
  return n;
}
/* factor de cantidad efectivo base→equivalencia: iguala el macro principal */
/* ¿hay ediciones de MACROS (no de precio) para esta clave? Editar un precio
   nunca debe mover los gramos de la dieta. */
function tieneEdicionMacros(key){
  const e = S.nutEdits[key]; if(!e) return false;
  return ["kcal","p","c","f","pz"].some(k=>e[k]!==undefined);
}
function factorOf(id, altIdx){
  if(altIdx===undefined||altIdx===null||altIdx<0) return 1;
  const it = shopById[id]; if(!it) return 1;
  const a = it.alts && it.alts[altIdx];
  if(!a) return 1;                       /* índice viejo o equivalencia eliminada */
  const kB = nutKey(id), kA = nutKey(id, altIdx);
  const m = MAIN_MACRO[it.cat] || "kcal";
  const nb = nutOf(kB), na = nutOf(kA);
  /* Si no se han editado macros y la equivalencia es del plan, respeta el
     factor curado a mano — PERO sólo cuando los dos se miden igual. Un factor
     curado en gramos no se puede aplicar a un alimento que se cuenta por pieza:
     con arroz→tortilla eso multiplicaba los carbos del día por 40. */
  if(!a.customId && !tieneEdicionMacros(kB) && !tieneEdicionMacros(kA) && !!nb.pz === !!na.pz)
    return a.f;
  const db = nb.pz ? nb[m] : nb[m]/100;   /* densidad por unidad propia */
  const da = na.pz ? na[m] : na[m]/100;
  if(!da || !db) return a.f || 1;
  return db/da;                          /* misma cantidad de macro principal */
}
/* macros de una cantidad qty (en la unidad propia del alimento) */
function macrosOf(key, qty){
  const n = nutOf(key), k = n.pz ? qty : qty/100;
  return {kcal:n.kcal*k, p:n.p*k, c:n.c*k, f:n.f*k, precio:(n.precio||0)*k};
}
/* macros de un ingrediente de comida {ref,g} respetando la sustitución activa */
function mealItemMacros(it){
  const ai = S.swaps[it.ref];
  const key = nutKey(it.ref, ai);
  const f = factorOf(it.ref, ai);
  return macrosOf(key, it.g * f);
}
function sumM(list){ return list.reduce((t,m)=>({kcal:t.kcal+m.kcal,p:t.p+m.p,c:t.c+m.c,f:t.f+m.f}),{kcal:0,p:0,c:0,f:0}); }
function mealMacros(m, i){
  const items = m.options ? m.options[mealOpt(i)] : m.items;
  return sumM(items.map(mealItemMacros));
}
function dayMacros(){ return sumM(MEALS.map((m,i)=>mealMacros(m,i))); }
function optionMacros(m, k){ return sumM(m.options[k].map(mealItemMacros)); }

/* ============================================================
   NIVELES DE PRESUPUESTO DEL MANDADO
   Cada entrada dice qué equivalencia usar por nivel:
   -1 (o ausente) = opción original del plan; N = índice de alts.
   Los macros no cambian: solo cambia qué compras.
   ============================================================ */
const TIER_DEF = {
  pollo:    { eco: 1, alto: 6 },   // eco: pechuga cruda · alto: salmón
  res:      { eco: 0, alto: 4 },   // eco: hígado (1×/sem) · alto: camarón
  claras:   { eco: 0, alto: 1 },   // eco: claras frescas · alto: pechuga de pavo
  yogurt:   { eco: 3, alto: 2 },   // eco: requesón · alto: skyr
  queso:    { eco: 3 },            // eco: requesón
  sardina:  { eco: 0, alto: 1 },   // eco: atún · alto: salmón enlatado
  avena:    { alto: 3 },           // alto: granola sin azúcar
  frijoles: { alto: 0 },           // alto: refritos listos (cero trabajo)
  leche:    { eco: 1 },            // eco: leche en polvo
  verdura:  { eco: 3 },            // eco: mercado a granel
  espinaca: { eco: 0 },            // eco: congelada en bloque
  manzana:  { eco: 2, alto: 5 },   // eco: naranja/mandarina · alto: berries
  platano:  { eco: 1 },            // eco: naranja/mandarina (el plátano ya es económico)
  pepitas:  { eco: 0, alto: 1 },   // eco: cacahuate · alto: almendra
  aceite:   { eco: 1, alto: 0 },   // eco: canola · alto: aguacate en fruta
  galletas: { eco: 1 }             // eco: galleta integral
};
const TIER_META = {
  eco:  { i:"💰", t:"Económico",   s:"cuida el bolsillo" },
  med:  { i:"⚖️", t:"Precio medio", s:"el plan original" },
  alto: { i:"✨", t:"Premium",     s:"práctico y variado" }
};
function applyTier(t){
  S.tier = t;
  Object.entries(TIER_DEF).forEach(([id,m])=>{
    const v = t==="med" ? -1 : (m[t]!==undefined ? m[t] : -1);
    if(v<0) delete S.swaps[id]; else S.swaps[id]=v;
  });
  save(); renderTierBar(); renderShop(); renderMeals();
  showToast(TIER_META[t].i+" "+TIER_META[t].t+" · mandado ≈ "+fmt$(weekCost())+" esta semana");
}
function renderTierBar(){
  const cur = S.tier || "med";
  $("tierBar").innerHTML = ["eco","med","alto"].map(k=>
    `<button data-tier="${k}" class="${cur===k?'on':''}">
      <span class="ti">${TIER_META[k].i}</span><b>${TIER_META[k].t}</b>
      <span class="tc">≈ ${fmt$(weekCost(k))}<i>/sem</i></span><small>${TIER_META[k].s}</small>
    </button>`).join("");
}

/* ============================================================
   COMPRA INTELIGENTE — dinero vs. esfuerzo vs. tiempo
   Precios aproximados de Monterrey; lo que importa es la proporción.
   ============================================================ */
const COMPRA = [
 {id:"granel", e:"⚖️", t:"Cómpralo a granel", sub:"Mismo producto, hasta la mitad de precio", save:"−40 % a −60 %",
  items:[
   {n:"Avena en hojuela", save:"−50 %", p:"Granel ~$28/kg contra ~$58/kg en caja de marca. Es el mismo grano. Compra 2 kg y guárdalos en un frasco.",
    m:[["good","Ahorro $30/kg"],["time","0 min extra"]]},
   {n:"Frijol seco", save:"−65 %", p:"1 kg seco (~$40) rinde 2.5 kg cocido = ~$16/kg cocido, contra ~$50/kg de los de lata. Una tanda mensual en olla express: 35 min para todo el mes.",
    m:[["good","Ahorro ~$120/mes"],["cost","35 min al mes"]]},
   {n:"Arroz", save:"−40 %", p:"Bolsa de 5 kg contra bolsitas de 900 g. Dura meses y no se echa a perder.",
    m:[["good","Ahorro ~$12/kg"],["time","0 min extra"]]},
   {n:"Cacahuate y pepitas", save:"−50 %", p:"Empacado ~$140–250/kg; a granel ~$70–120/kg. Es exactamente el mismo producto sin el empaque.",
    m:[["good","Ahorro ~$70/kg"],["time","0 min extra"]]},
   {n:"Linaza", save:"−60 %", p:"Granel ~$45/kg contra ~$120/kg empacada. Cómprala entera y muélela cada 2 semanas.",
    m:[["good","Ahorro ~$75/kg"],["cost","2 min cada 2 sem"]]},
   {n:"Especias (ajo, comino, pimienta, chile)", save:"−70 %", p:"En el mercado pagas por gramo lo que el frasco del súper cuesta completo.",
    m:[["good","Ahorro grande"],["time","0 min extra"]]},
   {n:"Verdura y fruta de mercado", save:"−35 %", p:"Ir al mercado el domingo temprano baja el precio de fruta y verdura hasta un 40 % contra el súper.",
    m:[["good","Ahorro ~$200/sem"],["cost","40 min de ida"]]}
  ]},
 {id:"volumen", e:"📦", t:"Cómpralo en paquete grande", sub:"Menos viajes al súper y mejor precio por unidad", save:"−15 % a −30 %",
  items:[
   {n:"Leche alta en proteína · paquete de 12", save:"−13 %", p:"Sí te conviene el paquete completo. Es leche UHT: no necesita refri hasta abrirla, la guardas en la alacena y te ahorras 3–4 idas al súper al mes.",
    m:[["good","Ahorro ~$50/paquete"],["time","−3 viajes/mes"]]},
   {n:"Huevo · cartón de 30", save:"−25 %", p:"La pieza sale ~25 % más barata que en el paquete de 12 y aguanta 4 semanas en refri.",
    m:[["good","Ahorro ~$18/cartón"],["time","−2 viajes/mes"]]},
   {n:"Yogurt griego · bote de 1 kg", save:"−45 %", p:"Los vasitos individuales cuestan casi el doble por gramo y casi siempre traen azúcar. Bote grande + báscula.",
    m:[["good","Ahorro ~$60/kg"],["cost","Pesar: 20 s"]]},
   {n:"Atún y sardina · paquete de 6", save:"−18 %", p:"No caducan pronto y te resuelven cualquier comida sin cocinar. Ten siempre 6 latas de reserva.",
    m:[["good","Ahorro ~$25/paq"],["time","Plan B siempre listo"]]},
   {n:"Aceite de oliva · botella de 1 L", save:"−30 %", p:"Contra la botella de 250 ml. Dura 4 meses si la guardas lejos del calor.",
    m:[["good","Ahorro ~$90/L"],["time","0 min extra"]]},
   {n:"Galletas de avena · caja multipack", save:"−25 %", p:"Ya vienen porcionadas: eso evita que te comas media caja de un jalón. Deja 2 paquetes en el trabajo.",
    m:[["good","Ahorro ~$20/caja"],["good","Porción controlada"]]},
   {n:"Tortillas · 1 kg de tortillería", save:"−45 %", p:"Contra las empacadas del súper. Congela la mitad en bolsa: se descongelan en 20 s de micro.",
    m:[["good","Ahorro ~$25/kg"],["time","0 min extra"]]}
  ]},
 {id:"congelado", e:"❄️", t:"Congelado: donde más ganas", sub:"Mismo precio, cero desperdicio, mitad de tiempo", save:"−25 min/semana",
  items:[
   {n:"Verduras congeladas (brócoli, mezcla, ejotes)", save:"−25 min/sem", p:"Cuestan casi lo mismo que las frescas pero eliminan lavar, desinfectar y picar. Se congelan en el punto máximo de maduración, así que conservan igual o más vitamina C que las 'frescas' que viajaron 5 días. Y no se echan a perder: cero desperdicio.",
    m:[["good","Cero desperdicio"],["time","4 min al micro"],["good","Igual o más nutrientes"]]},
   {n:"Espinaca congelada en bloque", save:"−60 % vs fresca", p:"Rinde el triple porque viene sin agua: 40 g del bloque equivalen a 100 g de espinaca fresca. Es de las formas más baratas de meter hierro al día.",
    m:[["good","Rinde 3×"],["time","2 min"],["good","Hierro + folato"]]},
   {n:"Filete de pescado congelado (tilapia, basa)", save:"−30 % vs fresco", p:"Del congelador al sartén sin descongelar: 8 min. Bolsa de 1 kg = 5 porciones. Proteína magra y barata.",
    m:[["good","~$130/kg"],["time","8 min"],["good","Proteína magra"]]},
   {n:"Fruta congelada (fresa, mango)", save:"Cero desperdicio", p:"Para el yogurt y los licuados. No se echa a perder y en temporada baja es más barata que la fresca.",
    m:[["time","0 min"],["good","Dura meses"]]},
   {n:"Tu propio pollo deshebrado, porcionado", save:"−20 min/sem", p:"Compra 850 g ya cocidos y el mismo día congélalas en bolsas planas de 170 g. Sacas una en la noche y amanece lista. Las bolsas planas se descongelan 3 veces más rápido que un bloque.",
    m:[["good","Cero desperdicio"],["time","10 min una vez"]]},
   {n:"Frijol cocido en bolsas planas de 500 g", save:"−65 % vs lata", p:"Una tanda mensual de olla express y congelas. Se descongela en 4 min de micro.",
    m:[["good","Ahorro ~$120/mes"],["cost","35 min al mes"]]}
  ]},
 {id:"tiempo", e:"⏱️", t:"Paga un poco más, ahorra mucho tiempo", sub:"Cuando el minuto vale más que el peso", save:"−50 min/semana",
  items:[
   {n:"Pollo deshebrado ya cocido", save:"+22 % costo · −50 min/sem", p:"El gramo de proteína sale ~22 % más caro que comprando pechuga cruda (≈ $0.71 contra $0.58 por gramo), pero te quita ~50 minutos de cocina a la semana. Sale a unos <b>$4 por minuto ahorrado</b>: es de los mejores cambios que hiciste. <b>Ojo con la porción:</b> el pollo cocido pierde ~30 % de agua, así que 170 g cocidos aportan lo mismo que 245 g crudos — si sigues pesando 250 g estás comiendo 45 % más proteína y calorías de lo que crees.",
    m:[["cost","+$40/kg"],["time","−50 min/sem"],["good","Vale la pena"]]},
   {n:"Pollo rostizado entero", save:"El mejor precio ya cocido", p:"Un pollo rostizado (~$135) rinde ~650 g de carne = ~$208/kg cocido, casi lo mismo que el deshebrado empacado pero con pierna y muslo incluidos, que traen <b>más hierro y zinc</b> — justo lo que necesitas para el cabello. Quítale la piel y deshébralo tibio (sale solo en 5 min).",
    m:[["good","Más hierro y zinc"],["time","5 min deshebrar"],["good","Mejor precio/kg"]]},
   {n:"Sardina y atún en lata", save:"Barato Y rápido", p:"Es el caso raro donde lo más rápido también es lo más barato y de lo más nutritivo: omega-3, vitamina D, selenio y calcio, cero cocción, cero desperdicio. Debería ser fijo en tu alacena.",
    m:[["good","Barato"],["time","0 min"],["good","Omega-3 + vit D"]]},
   {n:"Claras pasteurizadas en bote", save:"+35 % costo · −10 min/sem", p:"Contra separar 6 claras a mano cada noche. Si te molesta el trabajo nocturno, vale la pena; si no, el huevo fresco es más barato.",
    m:[["cost","+35 %"],["time","−10 min/sem"],["good","Decide tú"]]},
   {n:"Espinaca baby lavada en bolsa", save:"+20 % costo · −8 min/sem", p:"Contra el manojo que hay que lavar y desinfectar hoja por hoja. Diferencia pequeña de precio, molestia grande eliminada.",
    m:[["cost","+20 %"],["time","−8 min/sem"],["good","Vale la pena"]]},
   {n:"Camote o papa al microondas", save:"Gratis", p:"Pícala con un tenedor y 6 minutos al micro. Cero sartén, cero aceite, cero trastes. Carbohidrato saciante con vitamina A.",
    m:[["good","Sin trastes"],["time","6 min"]]},
   {n:"Arroz precocido en bolsa de 90 s", save:"+180 % costo", p:"<b>Este NO vale la pena</b> como rutina: es casi 3 veces más caro que el arroz normal. Ten 2 bolsas de emergencia y ya.",
    m:[["cost","+180 %"],["good","Solo emergencia"]]},
   {n:"Batido de proteína en polvo", save:"Depende", p:"Si te falta proteína y no tienes tiempo, resuelve. Pero <b>la leche en polvo descremada</b> te da proteína a menos de la mitad de precio si la mezclas con leche líquida.",
    m:[["cost","Compara $/g proteína"],["time","1 min"]]}
  ]}
];

/* ============================================================
   DIETA DIARIA
   ============================================================ */
const MEALS = [
 {name:"Desayuno", time:"7:00–8:30 am", kcal:570, prot:37, color:"#4d8dff",
  items:[
   {ref:"yogurt", g:300},
   {ref:"avena", g:30},
   {ref:"manzana", g:130, extra:"1 pieza en cubos"},
   {ref:"chispas", g:20, tag:"máx"},
   {ref:"linaza", g:12},
   {ref:"pepitas", g:10},
   {ref:"cacao", g:5, tag:"opcional"}
  ]},
 {name:"Snack del trabajo", time:"10:30–11:30 am", kcal:240, prot:14, color:"#38d6e8", optLabel:["Galleta + café","Pepitas + fruta","Atún"],
  options:{
   A:[{ref:"galletas", g:1, unit:"paquete"},{ref:"leche", g:150, unit:"ml", extra:"+ café"}],
   B:[{ref:"pepitas", g:30},{ref:"platano", g:130, extra:"1 pieza"}],
   C:[{ref:"sardina", g:0.35, unit:"lata", extra:"o 1 lata de atún"},{ref:"galletas", g:1, unit:"paquete"}]
  }},
 {name:"Comida", time:"2:00\u20133:30 pm", kcal:720, prot:62, color:"#f2b544",
  optLabel:["Pollo \u00b7 5 d\u00edas","Res \u00b7 1 d\u00eda","Sardina \u00b7 1 d\u00eda"],
  options:{
   A:[{ref:"pollo", g:170, tag:"cocido \u00b7", tagBase:true},
      {ref:"verdura", g:250},
      {ref:"frijoles", g:120},
      {ref:"arroz", g:50, extra:"crudo \u2248 150 g ya cocido (1 toper del prep)"},
      {ref:"aceite", g:8, unit:"ml"},
      {ref:"limon", g:15, extra:"exprimido sobre los frijoles"}],
   B:[{ref:"res", g:200, extra:"en crudo \u00b7 el d\u00eda del hierro"},
      {ref:"verdura", g:250},
      {ref:"frijoles", g:120},
      {ref:"arroz", g:50, extra:"crudo \u2248 150 g ya cocido"},
      {ref:"aceite", g:5, unit:"ml"},
      {ref:"limon", g:20, extra:"clave: triplica el hierro que absorbes"}],
   C:[{ref:"sardina", g:1, unit:"lata", extra:"escurrida \u00b7 cero cocina"},
      {ref:"verdura", g:250},
      {ref:"frijoles", g:120},
      {ref:"arroz", g:50, extra:"crudo \u2248 150 g ya cocido"},
      {ref:"limon", g:15},
      {ref:"espinaca", g:80, extra:"cruda, de guarnici\u00f3n"}]
  }},
 {name:"Pre-entreno", time:"5:30–6:30 pm", kcal:250, prot:18, color:"#b09bff", optLabel:["Leche + cacao","Yogurt + fruta"],
  options:{
   A:[{ref:"leche", g:300, unit:"ml", extra:"+ 10 g cacao"},{ref:"avena", g:30}],
   B:[{ref:"yogurt", g:200},{ref:"platano", g:120, extra:"1 pieza mediana"}]
  }},
 {name:"Cena", time:"8:30–9:30 pm", kcal:660, prot:62, color:"#ff6b6b",
  items:[
   {ref:"claras", g:300},
   {ref:"huevos", g:2, unit:"pzas", tag:"con yema ·"},
   {ref:"queso", g:80},
   {ref:"espinaca", g:100},
   {ref:"tortillas", g:3, unit:"pzas", tag:"MÁX"},
   {ref:"aceite", g:5, unit:"ml", extra:"o 40 g de aguacate"}
  ]}
];

/* ---------- nutrientes del cabello (y del resto) ---------- */
const NUTRIENTES = [
 {e:"🥩", n:"Proteína suficiente", ev:"alta",
  d:"El pelo es queratina pura. En un déficit agresivo con poca proteína el folículo entra en reposo y la caída aumenta. Tus 195 g diarios (2.1 g por kg) están justo donde deben."},
 {e:"🩸", n:"Hierro (ferritina)", ev:"alta",
  d:"La carencia más asociada a la caída difusa, incluso sin llegar a anemia. Hígado, res, frijol, lenteja y espinaca. Combínalos SIEMPRE con limón, guayaba o naranja: triplica lo que absorbes."},
 {e:"🧬", n:"Zinc", ev:"alta",
  d:"Su déficit produce caída y pelo quebradizo. Pepitas, res, huevo, avena, frijol. Un puño de pepitas al día ya hace la mitad del trabajo."},
 {e:"☀️", n:"Vitamina D", ev:"media-alta",
  d:"Niveles bajos aparecen una y otra vez en personas con caída. Sardina, atún, yema de huevo, leche fortificada y 15 min de sol. En Monterrey es fácil cubrirla."},
 {e:"🐟", n:"Omega-3 (EPA/DHA)", ev:"media",
  d:"Estudios pequeños muestran menos caída y más densidad. Sardina y atún son la vía barata; linaza, chía y nuez aportan la versión vegetal, que se aprovecha menos."},
 {e:"🥚", n:"Biotina", ev:"media *",
  d:"Muy publicitada, pero los suplementos solo sirven si REALMENTE tienes carencia — es rara. Con yema de huevo, cacahuate y avena la cubres de sobra sin gastar en pastillas."},
 {e:"🍋", n:"Vitamina C", ev:"media",
  d:"Forma el colágeno que sostiene el folículo y multiplica la absorción del hierro vegetal. Guayaba, limón, naranja y pimiento crudo."},
 {e:"🌰", n:"Selenio", ev:"media",
  d:"Antioxidante del folículo. Sardina, atún, huevo. Cuidado: el EXCESO también provoca caída — máximo 1 nuez de Brasil al día si las comes."},
 {e:"🥕", n:"Vitamina A", ev:"cuidado",
  d:"Necesaria, pero el exceso causa caída. El betacaroteno de zanahoria y camote es seguro en cualquier cantidad; los suplementos de retinol y el hígado diario NO lo son. Hígado: máximo una vez por semana."},
 {e:"💧", n:"Lo que más pesa de todo", ev:"alta",
  d:"Dormir 7–8 h, no bajar de peso más rápido de 0.5–0.7 kg por semana y controlar el estrés. Un déficit demasiado agresivo hace más daño al cabello que cualquier nutriente que le agregues."}
];

const PREP_STEPS = [
 "Reparte los 850 g de pollo deshebrado en 5 bolsas planas de ~170 g y congélalas. Etiqueta con la fecha.",
 "Pon a cocer 1 kg de arroz en la arrocera. Mientras se hace, no lo veas: haz lo demás.",
 "Cuece 12 huevos (12 min desde el hervor). Se guardan con cáscara toda la semana.",
 "Muele 200 g de linaza en la licuadora y guárdala en un frasco en el refri.",
 "Porciona el arroz ya frío en 7 topers con 120 g de frijol cada uno: 5 llevarán pollo, 1 es del día de res y 1 del de sardina.",
 "No cocines las verduras: se quedan congeladas en su bolsa. Van al micro el mismo día que las comas.",
 "Refrigera los topers de los días 1–5 y congela los del 6 y 7. Listo: ~35 min en total."
];

/* ============================================================
   RUTINA — semana fija 3-1-2-1:
   Lun, Mar y Mié entrenas · JUEVES descansas ·
   Vie y Sáb entrenas · DOMINGO descansas.
   Siempre los mismos días: nada se recorre.

   act = índice de activación 0-100. Combina electromiografía y
   estudios de hipertrofia. Sirve para comparar variantes DEL
   MISMO patrón, no ejercicios distintos entre sí.
   ============================================================ */
const BLOQUES = {
 pushA:{t:"entreno", id:"pushA", title:"Empuje · Pecho y hombro",        short:"Empuje"},
 pullA:{t:"entreno", id:"pullA", title:"Jalón · Espalda y bíceps",       short:"Jalón"},
 legsA:{t:"entreno", id:"legsA", title:"Pierna A · Cuádriceps y glúteo", short:"Pierna A"},
 torso:{t:"entreno", id:"torso", title:"Torso completo · Hombro, pecho y espalda", short:"Torso"},
 legsB:{t:"entreno", id:"legsB", title:"Pierna B · Femoral y glúteo",    short:"Pierna B"},
 rest: {t:"descanso", id:"rest", title:"Descanso", short:"Descanso"}
};
/* índice = getDay(): 0=Dom … 6=Sáb */
const PLAN_SEMANAL = ["rest","pushA","pullA","legsA","rest","torso","legsB"];

const RUTINA = {
 pushA:[
  {id:"press_plano", s:4, r:"6-8", grp:"sup", v:[
   {n:"Press de banca plana con mancuernas", act:94, base:25, u:"por mancuerna",
    top:"TU OPCIÓN ACTUAL · la mejor del patrón",
    note:"Mayor recorrido y más estiramiento del pectoral que la barra, y cada lado trabaja solo. Bien elegido: para hipertrofia es superior a la barra."},
   {n:"Press de banca plana con barra", act:90, base:60,
    note:"Permite más carga total y es más fácil de progresar, pero la barra frena el recorrido en el pecho."},
   {n:"Press de pecho en máquina convergente", act:89, base:55,
    note:"Trayectoria guiada: puedes ir al fallo sin riesgo. Muy útil en las semanas de alta intensidad."},
   {n:"Press plano en multipower (Smith)", act:86, base:55,
    note:"Estable pero fija la trayectoria. Solo si no hay banca libre."}
  ]},
  {id:"press_incl", s:3, r:"8-10", grp:"sup", v:[
   {n:"Press inclinado 30° con mancuernas", act:93, base:20, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"30° es el ángulo con más activación del pectoral superior. Más de 45° y el trabajo se va al hombro."},
   {n:"Press inclinado 30° con barra", act:89, base:40,
    note:"Más carga, menos recorrido."},
   {n:"Press inclinado en máquina", act:88, base:40,
    note:"Cómodo al final de la sesión cuando ya vienes cansado."},
   {n:"Press inclinado en multipower", act:85, base:40}
  ]},
  {id:"apertura", s:3, r:"12-15", grp:"sup", v:[
   {n:"Cruce de poleas de abajo hacia arriba", act:91, base:12, u:"por lado",
    top:"LA MEJOR DEL PATRÓN",
    note:"Tensión constante en todo el recorrido y máxima carga en la posición estirada, que es donde más crece el pectoral."},
   {n:"Aperturas con mancuernas en banca inclinada", act:89, base:10, u:"por mancuerna",
    note:"Estiramiento excelente, pero pierde tensión arriba."},
   {n:"Pec deck / mariposa", act:88, base:35,
    note:"La más cómoda para llegar al fallo con seguridad."},
   {n:"Cruce de polea a un brazo", act:87, base:12,
    note:"Corrige diferencias entre lados."}
  ]},
  {id:"militar", s:3, r:"8-10", grp:"sup", v:[
   {n:"Press militar sentado con mancuernas", act:90, base:20, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Más recorrido que la barra y el respaldo quita la carga de la espalda baja. Ideal en déficit calórico."},
   {n:"Press militar con barra de pie", act:87, base:35,
    note:"Más funcional y más carga, pero fatiga el core y la zona lumbar."},
   {n:"Press de hombro en máquina", act:86, base:35},
   {n:"Press Arnold", act:85, base:15, u:"por mancuerna",
    note:"Añade rotación; buen recorrido pero obliga a bajar el peso."}
  ]},
  {id:"lateral", s:4, r:"12-15", grp:"sup", v:[
   {n:"Elevación lateral en polea a un brazo", act:95, base:8, u:"por lado",
    top:"LA MEJOR DEL PATRÓN",
    note:"La polea mantiene tensión justo abajo, donde la mancuerna no tiene ninguna. Es la variante con más activación del deltoides medio."},
   {n:"Elevación lateral tumbado de lado en banco", act:91, base:6, u:"por mancuerna",
    note:"Truco barato para conseguir tensión en el estiramiento sin polea."},
   {n:"Elevación lateral con mancuernas de pie", act:90, base:8, u:"por mancuerna",
    note:"La clásica. Funciona muy bien, solo pierde tensión al inicio del recorrido."},
   {n:"Elevación lateral en máquina", act:89, base:20}
  ]},
  {id:"triceps_long", s:3, r:"10-12", grp:"sup", v:[
   {n:"Extensión de tríceps sobre la cabeza en polea", act:94, base:20,
    top:"LA MEJOR DEL PATRÓN",
    note:"Con el brazo arriba, la cabeza larga del tríceps queda estirada. Los estudios de hipertrofia le dan cerca de 1.5 veces más crecimiento que los jalones hacia abajo."},
   {n:"Extensión sobre la cabeza con mancuerna a dos manos", act:90, base:20,
    note:"Misma idea sin necesidad de polea libre."},
   {n:"Press francés con barra Z", act:89, base:25,
    note:"Excelente, pero molesta los codos a algunas personas."},
   {n:"Jalón de tríceps en polea con cuerda", act:82, base:25,
    note:"Buen bombeo, pero deja la cabeza larga acortada: úsalo como accesorio, no como principal."}
  ]}
 ],
 pullA:[
  {id:"dominada", s:4, r:"6-10", grp:"sup", v:[
   {n:"Dominadas con peso corporal (o con lastre)", act:93, base:0, bw:true,
    top:"TU OPCIÓN ACTUAL · la mejor del patrón",
    note:"Hiciste bien en subir de jalón a dominada: exige más estabilidad y trabaja el dorsal en todo su recorrido. Cuando pases de 12 repeticiones limpias, ponte cinturón con disco para quedarte en 6-10."},
   {n:"Jalón al pecho, agarre prono medio", act:90, base:55,
    note:"Casi la misma activación del dorsal. Su ventaja real es que puedes ajustar el peso al gramo: úsalo para las series de más repeticiones o cuando vengas cansado."},
   {n:"Jalón al pecho con agarre neutro", act:89, base:55,
    note:"Más amable con el hombro y algo más de bíceps."},
   {n:"Dominadas en máquina asistida", act:86, base:0,
    note:"Para cerrar la sesión cuando ya no salen limpias."}
  ]},
  {id:"remo_pesado", s:4, r:"8-10", grp:"sup", v:[
   {n:"Remo en máquina con apoyo en el pecho", act:91, base:45,
    top:"LA MÁS RECOMENDABLE EN DÉFICIT",
    note:"Misma activación de espalda media que el remo con barra, pero sin fatigar la espalda baja. En déficit calórico recuperas peor: esto importa."},
   {n:"Remo con barra a 45°", act:92, base:60,
    note:"El de más carga total, pero cobra caro en fatiga lumbar."},
   {n:"Remo con mancuerna a un brazo", act:90, base:30,
    note:"Gran recorrido y corrige asimetrías. Apoya la mano libre en el banco."},
   {n:"Remo sentado en polea baja", act:88, base:50,
    note:"Tensión constante, muy fácil de progresar."}
  ]},
  {id:"pullover", s:3, r:"12-15", grp:"sup", v:[
   {n:"Pullover en polea alta con barra recta", act:89, base:30,
    top:"LA MEJOR DEL PATRÓN",
    note:"Aísla el dorsal sin que el bíceps se lleve el trabajo: los brazos van casi rectos."},
   {n:"Pullover en máquina", act:87, base:35},
   {n:"Pullover con mancuerna en banca", act:85, base:20,
    note:"Buen estiramiento, pero pierde tensión al final."}
  ]},
  {id:"delt_post", s:3, r:"15-20", grp:"sup", v:[
   {n:"Aperturas posteriores en polea cruzada", act:91, base:10, u:"por lado",
    top:"LA MEJOR DEL PATRÓN",
    note:"Tensión constante en el deltoides posterior, que es la porción que casi todo el mundo tiene atrasada."},
   {n:"Face pull en polea", act:90, base:25,
    note:"Además cuida el manguito rotador. Muy buena para la salud del hombro si haces mucho press."},
   {n:"Pec deck invertido", act:89, base:30},
   {n:"Pájaros con mancuernas inclinado", act:86, base:8, u:"por mancuerna"}
  ]},
  {id:"biceps_long", s:3, r:"10-12", grp:"sup", v:[
   {n:"Curl inclinado con mancuernas (banco a 45–60°)", act:93, base:10, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Con el brazo detrás del cuerpo, la cabeza larga del bíceps queda estirada. Los estudios comparativos le dan bastante más crecimiento que el curl de pie."},
   {n:"Curl en polea baja de pie", act:89, base:20,
    note:"Tensión constante en todo el recorrido."},
   {n:"Curl con barra Z", act:87, base:25,
    note:"Permite más carga, la Z cuida las muñecas."},
   {n:"Curl en banco predicador", act:86, base:20,
    note:"Aísla mucho pero trabaja la porción corta, no la larga."}
  ]},
  {id:"braquial", s:3, r:"12-15", grp:"sup", v:[
   {n:"Curl martillo con mancuernas", act:88, base:12, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Trabaja braquial y braquiorradial: son los que empujan el bíceps hacia arriba y hacen que el brazo se vea más grueso."},
   {n:"Curl martillo en polea con cuerda", act:87, base:22},
   {n:"Curl inverso con barra Z", act:83, base:15,
    note:"Más antebrazo, menos braquial."}
  ]}
 ],
 legsA:[
  {id:"sentadilla", s:4, r:"6-8", grp:"inf", v:[
   {n:"Hack squat en máquina", act:93, base:80,
    top:"LA MEJOR DEL PATRÓN PARA CUÁDRICEPS",
    note:"Permite bajar más profundo con la espalda apoyada: máximo estiramiento del cuádriceps sin castigar la lumbar. Para hipertrofia de pierna es superior a la sentadilla libre."},
   {n:"Sentadilla libre con barra", act:91, base:80,
    note:"La más completa a nivel global, pero el core y la lumbar limitan antes que la pierna."},
   {n:"Prensa 45°", act:89, base:140,
    note:"Mucha carga con poca fatiga sistémica. Pies bajos y juntos para cuádriceps."},
   {n:"Sentadilla en multipower con pies adelantados", act:88, base:70,
    note:"Imita al hack squat cuando la máquina está ocupada."}
  ]},
  {id:"unilateral", s:3, r:"10-12", grp:"inf", v:[
   {n:"Sentadilla búlgara con mancuernas", act:90, base:14, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Enorme estiramiento de cuádriceps y glúteo, y corrige diferencias entre piernas. Duele, pero funciona."},
   {n:"Zancadas caminando con mancuernas", act:87, base:12, u:"por mancuerna"},
   {n:"Prensa a una pierna", act:86, base:60},
   {n:"Subida al cajón con mancuernas", act:84, base:12, u:"por mancuerna",
    note:"La más amable con las rodillas."}
  ]},
  {id:"cuadriceps", s:3, r:"12-15", grp:"inf", v:[
   {n:"Extensión de piernas con respaldo reclinado", act:91, base:40,
    top:"TU OPCIÓN ACTUAL · bien elegida",
    note:"Es el único ejercicio que trabaja el recto femoral estirado — la sentadilla y la prensa no lo tocan. Recuesta el respaldo lo que se pueda para maximizarlo."},
   {n:"Extensión de piernas a una pierna", act:89, base:20,
    note:"Más control, corrige asimetrías."},
   {n:"Sissy squat", act:85, base:0, bw:true,
    note:"Sin máquina, con peso corporal. Exigente para las rodillas."}
  ]},
  {id:"gluteo", s:4, r:"8-10", grp:"inf", v:[
   {n:"Hip thrust con barra", act:95, base:90,
    top:"TU OPCIÓN ACTUAL · la más alta que existe para glúteo",
    note:"Ningún ejercicio activa más el glúteo mayor. Aguanta 1 segundo arriba y aprieta: ahí está el chiste."},
   {n:"Hip thrust en máquina", act:93, base:90,
    note:"Misma activación con montaje más rápido."},
   {n:"Patada de glúteo en polea", act:88, base:20, u:"por lado"},
   {n:"Puente de glúteo con mancuerna", act:85, base:30,
    note:"Menos recorrido; opción cuando no hay banco."}
  ]},
  {id:"pantorrilla", s:3, r:"12-15", grp:"inf", v:[
   {n:"Elevación de pantorrilla de pie en máquina", act:91, base:60,
    top:"LA MEJOR PARA GEMELO",
    note:"De pie, con la rodilla estirada, es donde trabaja el gemelo. Baja lento y aguanta abajo 2 segundos."},
   {n:"Elevación de pantorrilla en la prensa", act:88, base:100},
   {n:"Elevación de pantorrilla sentado", act:89, base:40,
    note:"Con la rodilla doblada trabaja el sóleo, que es el músculo de abajo. Complementario, no sustituto."},
   {n:"Elevación en escalón con mancuerna", act:85, base:20}
  ]},
  {id:"core_a", s:3, r:"12-15", grp:"sup", v:[
   {n:"Crunch en polea alta arrodillado", act:91, base:25,
    top:"LA MEJOR DEL PATRÓN",
    note:"Es el único abdominal al que le puedes añadir peso progresivamente, igual que a cualquier otro músculo."},
   {n:"Elevación de piernas colgado en barra", act:90, base:0, bw:true,
    note:"Excelente para la parte baja del abdomen. Sube las rodillas al pecho, no las balancees."},
   {n:"Rueda abdominal", act:88, base:0, bw:true},
   {n:"Plancha con disco en la espalda", act:78, base:10,
    note:"Estabilidad más que crecimiento."}
  ]}
 ],
 torso:[
  {id:"militar_b", s:4, r:"6-8", grp:"sup", v:[
   {n:"Press militar sentado con mancuernas", act:90, base:20, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Hoy el hombro va primero y descansado: aquí es donde debes buscar la carga."},
   {n:"Press militar con barra de pie", act:87, base:35},
   {n:"Press de hombro en máquina", act:86, base:35},
   {n:"Press Arnold", act:85, base:15, u:"por mancuerna"}
  ]},
  {id:"remo_b", s:4, r:"8-10", grp:"sup", v:[
   {n:"Remo en máquina con apoyo en el pecho", act:91, base:50,
    top:"LA MÁS RECOMENDABLE EN DÉFICIT",
    note:"El grosor de la espalda va temprano en la sesión. Sin fatiga lumbar, puedes empujar de verdad."},
   {n:"Remo con barra a 45°", act:92, base:65},
   {n:"Remo con mancuerna a un brazo", act:90, base:32},
   {n:"Remo T con agarre neutro", act:90, base:50}
  ]},
  {id:"press_incl_b", s:3, r:"8-10", grp:"sup", v:[
   {n:"Press inclinado 30° con mancuernas", act:93, base:20, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Segunda dosis semanal de pectoral superior, que es la zona que más cuesta desarrollar."},
   {n:"Press inclinado 30° con barra", act:89, base:40},
   {n:"Press inclinado en máquina", act:88, base:40}
  ]},
  {id:"jalon_b", s:3, r:"10-12", grp:"sup", v:[
   {n:"Jalón al pecho con agarre neutro", act:89, base:50,
    top:"COMPLEMENTA TUS DOMINADAS",
    note:"Aquí sí conviene la máquina: en repeticiones altas puedes ajustar el peso exacto, cosa que con dominadas no."},
   {n:"Dominadas con peso corporal", act:93, base:0, bw:true,
    note:"Si te quedan fuerzas después del remo, adelante."},
   {n:"Jalón al pecho agarre prono ancho", act:90, base:50},
   {n:"Pullover en polea alta", act:89, base:30}
  ]},
  {id:"lateral_b", s:3, r:"15-20", grp:"sup", v:[
   {n:"Elevación lateral en polea a un brazo", act:95, base:7, u:"por lado",
    top:"LA MEJOR DEL PATRÓN",
    note:"Hoy en repeticiones altas. El deltoides medio responde muy bien a mucho volumen y poca carga."},
   {n:"Elevación lateral tumbado de lado en banco", act:91, base:5, u:"por mancuerna"},
   {n:"Elevación lateral con mancuernas de pie", act:90, base:7, u:"por mancuerna"},
   {n:"Elevación lateral en máquina", act:89, base:18}
  ]},
  {id:"delt_post_b", s:3, r:"15-20", grp:"sup", v:[
   {n:"Face pull en polea", act:90, base:22,
    top:"LA MÁS ÚTIL PARA TI",
    note:"Compensa todo el trabajo de empuje de la semana y mantiene el hombro sano. No la saltes."},
   {n:"Aperturas posteriores en polea cruzada", act:91, base:9, u:"por lado"},
   {n:"Pec deck invertido", act:89, base:28},
   {n:"Pájaros con mancuernas inclinado", act:86, base:7, u:"por mancuerna"}
  ]},
  {id:"biceps_b", s:3, r:"10-12", grp:"sup", v:[
   {n:"Curl en polea baja de pie", act:89, base:22,
    top:"LA MEJOR PARA HOY",
    note:"Tensión constante. Hoy que el bíceps ya viene cansado del remo, la polea perdona más que la mancuerna."},
   {n:"Curl inclinado con mancuernas", act:93, base:9, u:"por mancuerna"},
   {n:"Curl con barra Z", act:87, base:22},
   {n:"Curl en banco predicador", act:86, base:18}
  ]},
  {id:"triceps_b", s:3, r:"12-15", grp:"sup", v:[
   {n:"Extensión de tríceps sobre la cabeza en polea", act:94, base:17.5,
    top:"LA MEJOR DEL PATRÓN",
    note:"Segunda dosis semanal en posición estirada, hoy con más repeticiones."},
   {n:"Extensión sobre la cabeza con mancuerna a dos manos", act:90, base:17.5},
   {n:"Jalón de tríceps en polea con cuerda", act:82, base:22},
   {n:"Patada de tríceps en polea", act:80, base:10, u:"por lado"}
  ]}
 ],
 legsB:[
  {id:"rumano", s:4, r:"8-10", grp:"inf", v:[
   {n:"Peso muerto rumano con barra", act:92, base:70,
    top:"LA MEJOR DEL PATRÓN",
    note:"Sustituye al peso muerto convencional: mismo estímulo en femoral y glúteo con mucha menos fatiga sistémica, que en déficit calórico es justo lo que necesitas. Baja hasta sentir el estirón, no hasta el suelo."},
   {n:"Peso muerto rumano con mancuernas", act:90, base:30, u:"por mancuerna",
    note:"Más recorrido, más fácil de sentir el femoral."},
   {n:"Buenos días con barra", act:85, base:40},
   {n:"Peso muerto convencional", act:88, base:80,
    note:"Muy demandante para el sistema nervioso. En déficit no compensa."}
  ]},
  {id:"femoral", s:4, r:"10-12", grp:"inf", v:[
   {n:"Curl femoral SENTADO", act:94, base:35,
    top:"MEJOR QUE EL ACOSTADO · cámbialo",
    note:"Sentado, la cadera flexionada mantiene el femoral estirado durante todo el ejercicio. Los estudios comparativos le dan bastante más crecimiento que el curl acostado. Si tu gimnasio tiene la máquina sentado, úsala siempre."},
   {n:"Curl femoral acostado", act:85, base:35,
    note:"Funciona, pero el femoral trabaja acortado. Es la opción B."},
   {n:"Curl nórdico", act:90, base:0, bw:true,
    note:"Brutal para el femoral, no necesita máquina. Baja lo más lento que puedas."},
   {n:"Curl femoral de pie a una pierna", act:87, base:20}
  ]},
  {id:"prensa_b", s:3, r:"12-15", grp:"inf", v:[
   {n:"Prensa 45° con pies altos y separados", act:88, base:130,
    top:"LA MEJOR PARA HOY",
    note:"Con los pies altos el trabajo se va a glúteo e isquios en vez de cuádriceps: complementa lo que ya hiciste en Pierna A."},
   {n:"Hack squat", act:93, base:70,
    note:"Si hoy quieres más cuádriceps."},
   {n:"Sentadilla búlgara", act:90, base:14, u:"por mancuerna"},
   {n:"Zancadas caminando", act:87, base:12, u:"por mancuerna"}
  ]},
  {id:"abductor", s:3, r:"15-20", grp:"inf", v:[
   {n:"Abducción de cadera en máquina", act:87, base:45,
    top:"LA MEJOR DEL PATRÓN",
    note:"Trabaja el glúteo medio, que es el que da la forma redondeada de lado y estabiliza la cadera al caminar y correr."},
   {n:"Abducción en polea de pie", act:86, base:12, u:"por lado"},
   {n:"Abducción con banda sentado", act:80, base:0, bw:true}
  ]},
  {id:"pantorrilla_b", s:3, r:"15-20", grp:"inf", v:[
   {n:"Elevación de pantorrilla sentado", act:89, base:40,
    top:"HOY TOCA SÓLEO",
    note:"Con la rodilla doblada trabaja el sóleo, que es más de la mitad del volumen de la pantorrilla y casi nadie lo entrena."},
   {n:"Elevación de pantorrilla de pie en máquina", act:91, base:60},
   {n:"Elevación de pantorrilla en la prensa", act:88, base:100}
  ]},
  {id:"core_c", s:3, r:"12-15", grp:"sup", v:[
   {n:"Crunch en polea alta arrodillado", act:91, base:25,
    top:"LA MEJOR DEL PATRÓN",
    note:"Añade peso cada vez que llegues a 15 repeticiones limpias."},
   {n:"Elevación de piernas colgado", act:90, base:0, bw:true},
   {n:"Plancha lateral con peso", act:80, base:8}
  ]}
 ]
};

/* Bloques de calentamiento y cardio (marcables como los ejercicios) */
const CALENTAMIENTO = {
 t:"Calentamiento · 8–10 min",
 d:"5 min de caminadora o elíptica subiendo el ritmo · movilidad de hombro y cadera · 2 series de aproximación del primer ejercicio al 50 % y al 70 % del peso."
};

/* Fases del mes (la descarga siempre cae en la última semana) */
const CYCLE = [
 {n:"Arranque", d:"Ajusta pesos al 80 %. Técnica primero, sin llegar al fallo.", c:"#38d6e8"},
 {n:"Carga", d:"Aplica el doble progreso: sube donde hayas completado el rango alto.", c:"#f2b544"},
 {n:"Alta intensidad", d:"Acércate al fallo en la última serie de los compuestos.", c:"#ff6b6b"},
 {n:"DESCARGA", d:"60–65 % del peso de la semana previa, sin fallo. Aquí es donde se consolida lo ganado.", c:"#4d8dff"}
];

/* ============================================================
   SNACKS DEL PLAN (ya contados en las 2,400 kcal)
   ============================================================ */
const SNACKS = [
 {n:"Galletas de avena (1 paquete)", kcal:150, p:"3 g prot", note:"Deja 2 paquetes en el cajón del trabajo. Ya vienen porcionadas, por eso funcionan.", hair:"fibra + zinc"},
 {n:"Pepitas · 30 g", kcal:170, p:"9 g prot", note:"Tu mejor snack: zinc y magnesio en un puño. Llévalas en un frasquito.", hair:"zinc + magnesio + hierro"},
 {n:"Cacahuate natural · 25 g", kcal:145, p:"7 g prot", note:"El más barato de todos. Que diga solo cacahuate y sal.", hair:"biotina + niacina + vitamina E"},
 {n:"Manzana + 15 g de crema de cacahuate", kcal:170, p:"4 g prot", note:"Dulce y saciante a la vez. Muy buena a media tarde.", hair:"biotina + vitamina C"},
 {n:"Yogurt griego 170 g + fruta", kcal:150, p:"16 g prot", note:"El de más proteína por caloría. Compra el bote de 1 kg.", hair:"proteína + calcio"},
 {n:"Chocolate amargo 70 %+ · 20 g", kcal:110, p:"1.5 g prot", note:"Diseñado a propósito para el antojo de dulce entre semana. Come 2 cuadritos despacio, no la barra.", hair:"magnesio + hierro"},
 {n:"1 lata de atún en agua", kcal:110, p:"24 g prot", note:"Si el hambre es real y no antojo, esto la corta en seco.", hair:"selenio + omega-3"},
 {n:"2 huevos cocidos", kcal:140, p:"13 g prot", note:"Los cueces el domingo y duran toda la semana.", hair:"biotina + zinc + selenio"},
 {n:"Palomitas naturales · 30 g", kcal:120, p:"3 g prot", note:"Mucho volumen por pocas calorías: perfecto cuando el antojo es de 'picar', no de comer.", hair:null},
 {n:"Jícama o pepino con limón y chile", kcal:60, p:"1 g prot", note:"Prácticamente gratis en calorías. Cómelo sin culpa y sin contarlo.", hair:"vitamina C"},
 {n:"Gelatina light", kcal:40, p:"1 g prot", note:"Dulce, frío y casi sin calorías. Buena carta para la noche.", hair:null},
 {n:"Café con leche + cacao sin azúcar", kcal:90, p:"7 g prot", note:"Sabor a chocolate sin azúcar. Es tu antojo de chocolate resuelto.", hair:"magnesio"}
];

const ANTOJOS = [
 {id:"choco20", n:"Chocolate amargo 70 % · 20 g", kcal:110, tag:"free", tagT:"Libre", note:"Puedes tomarlo cualquier día, ya está en el plan"},
 {id:"galleta", n:"Galletas de avena · 1 paquete", kcal:150, tag:"free", tagT:"Libre", note:"Snack del plan, no gasta presupuesto si es el único"},
 {id:"helado", n:"Helado / nieve · 1 bola", kcal:200, tag:"mod", tagT:"Moderado", note:"Ideal para sábado o domingo"},
 {id:"barra45", n:"Barra de chocolate · 45 g", kcal:240, tag:"mod", tagT:"Moderado", note:"Una vez por fin de semana"},
 {id:"frituras", n:"Frituras · bolsa chica", kcal:220, tag:"mod", tagT:"Moderado", note:"Cómpralas ya porcionadas, nunca la bolsa familiar"},
 {id:"pan", n:"Pan dulce / dona", kcal:350, tag:"high", tagT:"Alto", note:"Máximo cada 2 semanas"},
 {id:"barra90", n:"Barra de chocolate · 90 g", kcal:480, tag:"high", tagT:"Alto", note:"Se lleva casi la mitad de la semana de un golpe"},
 {id:"fuera", n:"Comida fuera / evento", kcal:700, tag:"var", tagT:"Variable", note:"Ese día: solo 2 tortillas y sin snack del trabajo"}
];

/* ============================================================
   HELPERS
   ============================================================ */
/* Ya existen MEALS, RUTINA y las demás tablas: ahora sí se puede sanear
   el estado guardado y recalcular la persona con las mediciones ordenadas. */
saneaEstado();
applyPersona();

const $ = id => document.getElementById(id);
const toast = $("toast"); let toastT;
function showToast(m){ toast.textContent=m; toast.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>toast.classList.remove("show"),2200); }
/* esc() también escapa la comilla simple: sin eso, cualquier atributo
   escrito con '…' o cualquier string JS dentro de un atributo convertía
   esta función en decorativa. */
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
/* para números que se interpolan en HTML: si el dato viene de un respaldo
   manipulado puede ser una cadena con etiquetas. Devuelve número o "—". */
const numero = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numeroTxt = (v, dec) => { const n = Number(v);
  return Number.isFinite(n) ? (dec!==undefined ? n.toFixed(dec) : String(n)) : "—"; };

/* Fallo de carga de imágenes, con UN handler delegado en vez de JS
   incrustado en atributos onerror. El `error` de <img> no burbujea, pero
   sí se puede capturar en la fase de captura. */
document.addEventListener("error", e=>{
  const el = e.target;
  if(!el || el.tagName !== "IMG") return;
  if(el.dataset.noimg && el.parentNode) el.parentNode.classList.add("noimg");
  else if(el.dataset.fbk !== undefined)
    el.replaceWith(document.createTextNode(el.dataset.fbk));
}, true);

/* ==================================================================
   TONOS SEGÚN EL TEMA
   Los colores de MEALS, CYCLE, CATS y las gráficas están elegidos para
   fondo oscuro. Sobre blanco daban 1.1:1 — invisibles. En vez de
   duplicar la paleta a mano, se oscurece el mismo tono hasta que llega
   a 4.5:1 sobre blanco, y se emite con light-dark(): el navegador elige
   solo y NO hay que volver a pintar nada al cambiar de tema.
   ================================================================== */
const _tonoCache = {};
function _rgb(hex){
  let h = String(hex).replace("#","");
  if(h.length===3) h = h.split("").map(c=>c+c).join("");
  return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
}
function _hex(c){ return "#"+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join(""); }
function _lum(c){
  const f = c.map(v=>{ v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); });
  return .2126*f[0] + .7152*f[1] + .0722*f[2];
}
function _ratioBlanco(c){ return 1.05 / (_lum(c) + .05); }
/* oscurece conservando el matiz hasta alcanzar el contraste pedido */
function tonoOscuro(hex, minimo){
  /* 4.9 y no 4.5: estos tonos casi siempre caen sobre una píldora
     tintada, que baja el contraste ~0.5 respecto al blanco puro. */
  const min = minimo || 5.4;
  const clave = hex + "|" + min;
  if(_tonoCache[clave]) return _tonoCache[clave];
  let c = _rgb(hex), guarda = 0;
  while(_ratioBlanco(c) < min && guarda++ < 40) c = c.map(v=>v*0.92);
  return (_tonoCache[clave] = _hex(c));
}
/* un color que se resuelve solo en los dos temas */
function tono(hex, minimo){
  if(!hex || String(hex)[0] !== "#") return hex;    /* ya es var(--x) */
  return `light-dark(${tonoOscuro(hex, minimo)}, ${hex})`;
}
const fmtQty = (v,u)=> (u==="paquete"||u==="paquetes") ? (Math.round(v)+" paquete"+(v>1?"s":"")) :
  (u==="latas"||u==="lata") ? (Math.round(v*10)/10+" "+(v>1?"latas":"lata")) :
  (u==="pzas"||u==="claras"||u==="reb"||u==="bolsas"||u==="barras") ? Math.round(v)+" "+u :
  (u==="al gusto") ? u :
  v>=1000 ? (Math.round(v/10)/100)+" "+(u==="ml"?"L":"kg") : Math.round(v)+" "+u;
function selAlt(id){ const i=S.swaps[id]; return (i===undefined||i<0)?null:(shopById[id].alts[i]||null); }
function dispName(id){ const a=selAlt(id); return a?a.n:shopById[id].name; }
function dispHair(id){ const a=selAlt(id); return a?(a.hair!==undefined?a.hair:null):shopById[id].hair; }
function dispPrep(id){ const a=selAlt(id); return (a&&a.prep)||shopById[id].prep; }
function dispAmt(id, base, unitOv){
  const it=shopById[id], a=selAlt(id);
  const unit = (a&&a.unit)||unitOv||it.unit;
  /* MISMO factor que usa el motor de macros y el costo del mandado.
     Antes esto usaba a.f directo, así que la app te decía una cantidad
     y sumaba los macros de otra distinta. */
  const val = base*factorOf(id, S.swaps[id]);
  return fmtQty(val, unit);
}
/* ==================================================================
   IMÁGENES DE LAS EQUIVALENCIAS
   Ninguna de las 90 equivalencias tiene foto propia: sólo hay imagen de
   los 25 alimentos base. Antes se mostraba el emoji suelto, que rompía
   el estilo. Ahora cada equivalencia toma la imagen del alimento que
   REALMENTE la representa (Requesón → queso, Atún → sardina) y lleva
   una marca de "equivalencia" para no fingir que es ese producto exacto.
   También puedes ponerle tu propia foto desde Ajustes → Alimentos.
   ================================================================== */
const IMG_EQUIV = [
  [/pollo|pechuga|pavo/i,                                   "pollo"],
  [/at[úu]n|sardina|salm[óo]n|tilapia|pescado|camar[óo]n/i,  "sardina"],
  [/res\b|bistec|falda|diezmillo|h[íi]gado|molida|cerdo/i,   "res"],
  [/huevo|clara/i,                                           "claras"],
  [/queso|cottage|reques[óo]n|panela|oaxaca/i,               "queso"],
  [/yogurt|griego|skyr/i,                                    "yogurt"],
  [/leche|soya|bebida/i,                                     "leche"],
  [/arroz|pasta|quinoa|c[úu]scus/i,                          "arroz"],
  [/tortilla|tostada|pan\b|bolillo/i,                        "tortillas"],
  [/avena|amaranto|granola|hojuela/i,                        "avena"],
  [/frijol|lenteja|garbanzo|haba/i,                          "frijoles"],
  [/pl[áa]tano|banana/i,                                     "platano"],
  [/manzana|pera|naranja|mandarina|papaya|sand[íi]a|mel[óo]n|pi[ñn]a|fruta|guayaba|kiwi|uva|durazno|d[áa]til/i, "manzana"],
  [/espinaca|acelga|kale|br[óo]coli|lechuga|nopal|calabac|ejote|chayote|pimiento|verdura/i, "espinaca"],
  [/zanahoria|betabel|j[íi]cama|pepino/i,                    "zanahoria"],
  [/papa|camote|elote|ma[íi]z/i,                             "verdura"],
  [/aceite|oliva|aguacate|mantequilla/i,                     "aceite"],
  [/pepita|cacahuate|almendra|nuez|semilla|crema de/i,       "pepitas"],
  [/linaza|ch[íi]a|ajonjol[íi]/i,                            "linaza"],
  [/cacao|cocoa|chocolate/i,                                 "cacao"],
  [/galleta|barra|palomita/i,                                "galletas"],
  [/lim[óo]n|lima/i,                                         "limon"],
  [/chispa/i,                                                "chispas"],
];
/* qué imagen le toca a una equivalencia: primero por su nombre, y si no
   se reconoce, la del alimento base al que sustituye */
function imgDeEquivalencia(nombre, idBase){
  const r = IMG_EQUIV.find(([re]) => re.test(nombre));
  return r ? r[1] : idBase;
}
/* icono de un alimento. `alt` es la equivalencia activa, si la hay. */
function foodIcon(it, alt){
  if(!CONFIG.usarFotos) return `<span class="emoji">${it.e}</span>`;
  if(!alt){
    const src = srcImagen("food:"+it.id, "img/"+it.id+".png");
    return `<span class="fico"><img src="${src}" alt="" loading="lazy" `+
           `data-noimg="1"><span class="fe">${esc(it.e)}</span></span>`;
  }
  const clave = "food:" + (alt.customId ? "custom:"+alt.customId : slugName(alt.n));
  const base  = imgDeEquivalencia(alt.n, it.id);
  const src   = srcImagen(clave, "img/"+base+".png");
  return `<span class="fico equiv" title="Equivalencia de ${esc(it.name)}">`+
         `<img src="${src}" alt="" loading="lazy" data-noimg="1">`+
         `<span class="fe">${esc(it.e)}</span><span class="eq-mk" aria-hidden="true">↻</span></span>`;
}
/* ---------- Imágenes personalizadas (se guardan en este navegador) ---------- */
const IMG_KEY = "mi_plan_salvador_imgs_v1";
let CIMG = {};
try{ CIMG = JSON.parse(localStorage.getItem(IMG_KEY) || "{}"); }catch(e){ CIMG = {}; }
if(!CIMG || typeof CIMG!=="object" || Array.isArray(CIMG)) CIMG = {};
/* sólo aceptamos data:image — es lo único que genera fileToSquare, y evita
   que un valor manipulado se salga del atributo src e inyecte HTML */
const ES_IMAGEN = v => typeof v==="string" && /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
Object.keys(CIMG).forEach(k=>{ if(!ES_IMAGEN(CIMG[k])) delete CIMG[k]; });
const srcImagen = (clave, fallback) => ES_IMAGEN(CIMG[clave]) ? CIMG[clave] : fallback;
function saveImgs(){
  try{ localStorage.setItem(IMG_KEY, JSON.stringify(CIMG)); return true; }
  catch(e){ showToast("⚠️ Sin espacio: borra alguna imagen personalizada"); return false; }
}

function slugName(s){
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
const DUMBBELL_SVG = `<svg class="ph" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7"/></svg>`;
function exPhoto(v, small){
  if(!CONFIG.fotosEjercicios) return "";
  const sl = slugName(v.n);
  const src = srcImagen("ex:"+sl, "img/ej-"+sl+".png");
  return `<span class="ex-photo${small?' sm':''}"><img src="${src}" alt="" loading="lazy" data-noimg="1">${DUMBBELL_SVG}</span>`;
}

/* ---------- Submenú deslizante (equivalencias / variantes) ---------- */
const sheetOv = document.getElementById("sheetOv");
function openSheet(title, sub, html){
  document.getElementById("sheetTitle").textContent = title;
  document.getElementById("sheetSub").textContent = sub || "";
  document.getElementById("sheetBody").innerHTML = html;
  sheetOv.classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeSheet(){
  devuelveReferencia();
  detalleCtx = null; compraCtx = null;
  sheetOv.classList.remove("show");
  document.body.style.overflow = "";
}
document.getElementById("sheetClose").onclick = closeSheet;
sheetOv.addEventListener("click", e=>{ if(e.target===sheetOv) closeSheet(); });
/* el número se actualiza mientras arrastras; el sonido de prueba sólo al soltar
   (con "input" sonaría 20 veces seguidas y sería insoportable) */
document.getElementById("cfgPanel").addEventListener("input", e=>{
  const rg = e.target.closest('[data-uirange="volumen"]');
  if(!rg) return;
  const out = document.getElementById("volVal");
  if(out) out.textContent = Math.round(numero(rg.value)) + " %";
});
document.getElementById("cfgPanel").addEventListener("change", e=>{
  const ui = e.target.closest("input[type=checkbox][data-ui]");
  if(ui){ if(!S.ui) S.ui={};
    /* la lista blanca de antes dejaba fuera cualquier interruptor nuevo */
    const permitidos = ["fotosAlimentos","fotosEjercicios","anim","sonido","soloVibrar"];
    if(permitidos.includes(ui.dataset.ui)) S.ui[ui.dataset.ui] = ui.checked;
    save(); applyUI(); renderMeals(); renderShop(); renderRoutine();
    if(ui.dataset.ui==="sonido" && ui.checked){ desbloqueaAudio(); sonar("comida"); }
    if(ui.dataset.ui==="soloVibrar") avisar("serie", 60);
    showToast(ui.checked?"Activado ✓":"Desactivado ✓"); return; }
  /* deslizador de volumen: se aplica en vivo y suena al soltar */
  const rg = e.target.closest("[data-uirange]");
  if(rg){
    if(rg.dataset.uirange === "volumen"){
      if(!S.ui) S.ui = {};
      S.ui.volumen = Math.min(1, Math.max(0, numero(rg.value) / 100));
      const out = document.getElementById("volVal");
      if(out) out.textContent = Math.round(S.ui.volumen*100) + " %";
      save(); desbloqueaAudio(); sonar("comida");
    }
    return;
  }
  const bk = e.target.closest("[data-bkimport]");
  if(bk && bk.files && bk.files[0]){ importBackup(bk.files[0]); return; }
  const inp = e.target.closest("[data-imgkey]");
  if(!inp || !inp.files || !inp.files[0]) return;
  const k = inp.dataset.imgkey;
  fileToSquare(inp.files[0], durl=>{
    CIMG[k] = durl;
    if(saveImgs()){ refreshAfterImg(); showToast("Imagen actualizada ✓"); }
    else delete CIMG[k];
  });
});

/* ---------- Respaldo (archivo HTML con el diseño de la app) ---------- */
function buildBackupHtml(data){
  const d = new Date();
  const fecha = DAYS[d.getDay()]+" "+d.getDate()+" de "+MONTHS_FULL[d.getMonth()]+" "+d.getFullYear()+
                ", "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  /* Un respaldo cifrado no presume nada: ni saldos ni conteos. Cuántas
     mediciones o cuántas deudas traes también es información sobre ti. */
  const cifrado = !!(data && data.cifrado);
  const st = cifrado ? [] : [
    [ (S.body||[]).length, "mediciones corporales" ],
    [ Object.keys(S.lifts||{}).length, "pesos de ejercicios" ],
    [ Object.keys(S.trained||{}).length, "días entrenados" ],
    [ (S.customFoods||[]).length, "alimentos agregados" ],
    [ Object.keys(S.nutEdits||{}).length, "etiquetas y precios editados" ],
    [ Object.keys(CIMG).length, "imágenes personalizadas" ]
  ];
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  const logo = `<svg width="52" height="52" viewBox="0 0 48 48"><rect width="48" height="48" rx="11" fill="#1b396b"/><rect x="13" y="9" width="22" height="8" rx="4" fill="#2a9d8e"/><rect x="10" y="20.5" width="28" height="8" rx="4" fill="#e8f6f6"/><rect x="6" y="32" width="36" height="8" rx="4" fill="#2a9d8e"/></svg>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Respaldo · Mi Plan</title></head>
<body style="margin:0;min-height:100vh;background:#081427;color:#eef7f6;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box">
<div style="max-width:420px;width:100%;background:#12274a;border:1px solid #24416f;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5)">
  <div style="padding:26px 22px 20px;text-align:center;background:linear-gradient(160deg,#1b396b,#0c1f40)">
    ${logo}
    <div style="font-size:11px;font-weight:800;letter-spacing:.18em;color:#59cfe0;margin-top:12px">${cifrado?"RESPALDO CIFRADO":"RESPALDO COMPLETO"}</div>
    <div style="font-size:24px;font-weight:800;margin-top:4px">Mi Plan</div>
    <div style="font-size:12.5px;color:#9db3d2;margin-top:5px">${fecha}</div>
  </div>
  ${cifrado ? `<div style="margin:20px 22px 6px;padding:20px 16px;background:rgba(89,207,224,.07);border:1px solid rgba(89,207,224,.3);border-radius:16px;text-align:center">
    <div style="font-size:30px;line-height:1">🔒</div>
    <div style="font-size:15px;font-weight:800;margin-top:8px">Contenido cifrado</div>
    <div style="font-size:12.5px;color:#9db3d2;line-height:1.6;margin-top:6px">
      Este archivo trae tus datos cifrados con AES-GCM de 256 bits.
      Sin tu frase de respaldo no se pueden leer, ni por ti ni por nadie más.
    </div></div>`
  : `<div style="padding:18px 22px 6px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
    ${st.map(x=>`<div style="background:rgba(232,246,246,.04);border:1px solid #24416f;border-radius:14px;padding:12px 10px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#2fb5a3">${x[0]}</div>
      <div style="font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9db3d2;margin-top:2px">${x[1]}</div>
    </div>`).join("")}
  </div>`}
  <div style="margin:14px 22px;padding:13px 15px;background:rgba(47,181,163,.08);border:1px solid rgba(47,181,163,.3);border-radius:14px;font-size:12.5px;line-height:1.6;color:#c9dcda">
    <b style="color:#2fb5a3">Para restaurar:</b> abre la app Mi Plan → pestaña <b>Ajustes</b> → 🎯 → <b>Importar respaldo</b> → elige este archivo${cifrado?" y escribe tu frase de respaldo":""}. Todo regresa tal cual: progreso, ajustes, alimentos e imágenes.
  </div>
  <div style="padding:0 22px 22px;text-align:center;font-size:10px;color:#6d83a6;font-weight:700">
    Guarda este archivo en tu nube (Drive, iCloud) · No lo edites: tus datos viajan dentro de él<br>
    ${cifrado?`<span style="color:#ff8b80">Si olvidas tu frase, este archivo se vuelve inservible: no hay servidor que la recupere</span><br>`:""}
    <span style="letter-spacing:.14em">SÓLIDA APLICACIONES</span>
  </div>
</div>
<script type="application/json" id="mi-plan-datos">${json}</script>
</body></html>`;
}
/* ==================================================================
   SANEADO DE UN RESPALDO IMPORTADO
   El escape en el punto de pintado es la defensa principal. Esto es la
   segunda: un respaldo es un archivo que se comparte por WhatsApp o Drive,
   así que su contenido es dato NO CONFIABLE. Aquí se fuerza el tipo de
   cada campo, para que ni un sink futuro sin escapar pueda explotarse.
   ================================================================== */
function saneaImportado(St){
  if(!St || typeof St !== "object") return;
  const n = (v, def) => { const x = Number(v); return Number.isFinite(x) ? x : (def===undefined?0:def); };
  const texto = (v, max) => typeof v === "string" ? v.slice(0, max||120) : "";
  const fecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

  /* números que se pintan en la interfaz */
  if(St.persona && typeof St.persona === "object"){
    ["estatura","edad","act","metaGrasa","metaMusculo","cardioMin"].forEach(k=>{
      if(St.persona[k] !== undefined) St.persona[k] = n(St.persona[k]);
    });
    if(St.persona.sexo !== "f") St.persona.sexo = "m";
    if(!["perder","recomp","mantener","subir"].includes(St.persona.objetivo)) delete St.persona.objetivo;
  }
  St.sessions   = n(St.sessions);
  St.cicloShift = n(St.cicloShift);
  if(St.presupuestoMes !== undefined) St.presupuestoMes = n(St.presupuestoMes);
  if(!["kg","lb"].includes(St.unidad)) St.unidad = "kg";
  if(St.lastBackup !== undefined) St.lastBackup = n(St.lastBackup);

  /* mediciones: fecha válida y números */
  if(Array.isArray(St.body)) St.body = St.body
    .filter(b => b && fecha(b.d))
    .map(b => ({ d:b.d, kg:n(b.kg,null), grasa:n(b.grasa,null), mme:n(b.mme,null), imc:n(b.imc,null) }));

  /* alimentos propios: id sin caracteres raros, texto acotado */
  if(Array.isArray(St.customFoods)) St.customFoods = St.customFoods
    .filter(c => c && typeof c === "object")
    .map(c => ({ id: String(c.id||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,40) || ("f"+n(Math.abs(n(c.kcal)))),
                 base: String(c.base||"").replace(/[^a-z0-9-]/g,"").slice(0,40),
                 n: texto(c.n, 80), hair: texto(c.hair, 80) || null,
                 kcal:n(c.kcal), p:n(c.p), c:n(c.c), f:n(c.f),
                 precio:n(c.precio), pz:!!c.pz, pzTxt: texto(c.pzTxt, 24) }))
    .filter(c => c.id && c.base);

  /* ediciones de etiqueta: sólo campos conocidos, con su tipo */
  if(St.nutEdits && typeof St.nutEdits === "object") Object.keys(St.nutEdits).forEach(k=>{
    const e = St.nutEdits[k];
    if(!e || typeof e !== "object"){ delete St.nutEdits[k]; return; }
    const limpio = {};
    ["kcal","p","c","f","precio"].forEach(x=>{ if(e[x]!==undefined) limpio[x] = n(e[x]); });
    if(e.pz !== undefined)    limpio.pz = !!e.pz;
    if(e.pzTxt !== undefined) limpio.pzTxt = texto(e.pzTxt, 24);
    St.nutEdits[k] = limpio;
  });

  /* snacks y compras: los ts y cantidades se pintan en atributos */
  if(St.snacks && typeof St.snacks === "object") Object.keys(St.snacks).forEach(d=>{
    if(!fecha(d) || !Array.isArray(St.snacks[d])){ delete St.snacks[d]; return; }
    St.snacks[d] = St.snacks[d].filter(x=>x && typeof x==="object")
      .map(x=>({ id: texto(x.id,40), n: texto(x.n,80), kcal:n(x.kcal), p:n(x.p), ts:n(x.ts) }));
  });
  if(St.compras && typeof St.compras === "object") Object.keys(St.compras).forEach(w=>{
    const c = St.compras[w];
    if(!fecha(w) || !c || typeof c!=="object"){ delete St.compras[w]; return; }
    c.cerrada = !!c.cerrada;
    if(c.items && typeof c.items === "object") Object.keys(c.items).forEach(id=>{
      const it = c.items[id];
      if(!it || typeof it!=="object"){ delete c.items[id]; return; }
      c.items[id] = { e:n(it.e), $:n(it.$), q: it.q===undefined?undefined:n(it.q),
                      u: texto(it.u, 24), pu: it.pu===undefined?undefined:n(it.pu) };
    }); else c.items = {};
  });
  if(St.precios && typeof St.precios === "object") Object.keys(St.precios).forEach(k=>{
    if(!Array.isArray(St.precios[k])){ delete St.precios[k]; return; }
    St.precios[k] = St.precios[k].filter(x=>x && fecha(x.d))
      .map(x=>({ d:x.d, pu:n(x.pu), u:texto(x.u,24) }));
  });
  /* historial de cargas y notas */
  if(St.liftHist && typeof St.liftHist === "object") Object.keys(St.liftHist).forEach(k=>{
    if(!Array.isArray(St.liftHist[k])){ delete St.liftHist[k]; return; }
    St.liftHist[k] = St.liftHist[k].filter(x=>x && fecha(x.d)).map(x=>({d:x.d, kg:n(x.kg)}));
  });
  if(St.note && typeof St.note === "object") Object.keys(St.note).forEach(k=>{
    St.note[k] = texto(St.note[k], 4000);
  });
  if(St.antojos && typeof St.antojos === "object") Object.keys(St.antojos).forEach(w=>{
    if(!Array.isArray(St.antojos[w])){ delete St.antojos[w]; return; }
    St.antojos[w] = St.antojos[w].filter(x=>x && typeof x==="object")
      .map(x=>({ id:texto(x.id,40), n:texto(x.n,80), kcal:n(x.kcal), d:fecha(x.d)||undefined, ts:n(x.ts) }));
  });

  /* unidades propias por alimento: {n:"lata", f:4.25} */
  if(St.unidades && typeof St.unidades === "object" && !Array.isArray(St.unidades)){
    Object.keys(St.unidades).forEach(id=>{
      if(!Array.isArray(St.unidades[id])){ delete St.unidades[id]; return; }
      St.unidades[id] = St.unidades[id]
        .filter(u => u && typeof u === "object")
        .map(u => ({ n: texto(u.n, 24).trim(), f: n(u.f) }))
        .filter(u => u.n && u.f > 0 && Number.isFinite(u.f))
        .slice(0, 12);
      if(!St.unidades[id].length) delete St.unidades[id];
    });
  } else if(St.unidades !== undefined) St.unidades = {};

  /* tiendas donde compras: sólo textos cortos */
  if(St.tiendas !== undefined){
    St.tiendas = Array.isArray(St.tiendas)
      ? St.tiendas.filter(t => typeof t === "string").map(t => texto(t, 40).trim())
                  .filter(Boolean).slice(0, 8)
      : [];
  }

  /* preferencias de interfaz: lista blanca estricta. Un respaldo ajeno no
     puede meter llaves nuevas ni valores de otro tipo. */
  if(St.ui && typeof St.ui === "object" && !Array.isArray(St.ui)){
    const u = St.ui, limpio = {};
    if(["auto","claro","oscuro"].includes(u.tema))      limpio.tema = u.tema;
    if(["chico","normal","grande"].includes(u.texto))   limpio.texto = u.texto;
    if(["lista","contraer","foco"].includes(u.vistaRutina)) limpio.vistaRutina = u.vistaRutina;
    ["fotosAlimentos","fotosEjercicios","anim","sonido","soloVibrar"].forEach(k=>{
      if(u[k] !== undefined) limpio[k] = !!u[k];
    });
    if(u.volumen !== undefined){
      const v = n(u.volumen, 0.85);
      limpio.volumen = Math.min(1, Math.max(0, v));
    }
    St.ui = limpio;
  } else if(St.ui !== undefined) St.ui = {};

  /* módulo financiero: el saneado vive en finanzas.js, junto al motor.
     Reconstruye S.fin campo por campo contra lista blanca. */
  if(typeof saneaFin === "function") saneaFin(St);
}

function parseBackup(text){
  let raw = text.trim();
  if(raw[0] !== "{"){
    const m = raw.match(/<script[^>]*id="mi-plan-datos"[^>]*>([\s\S]*?)<\/script>/);
    if(!m) return null;
    raw = m[1].replace(/<\\\//g, "</");
  }
  try{
    const d = JSON.parse(raw);
    if(!d || d.app!=="mi-plan") return null;
    /* Respaldo cifrado: aquí no hay nada que sanear todavía. Se devuelve el
       sobre y quien importa pide la frase; abreSobreRespaldo() hace el
       saneado en cuanto el contenido se vuelve legible. */
    if(d.cifrado === true){
      if(!d.sobre || typeof d.sobre !== "object" || Array.isArray(d.sobre)) return null;
      return { app:"mi-plan", v:3, cifrado:true, fecha:d.fecha, sobre:d.sobre };
    }
    /* S tiene que ser un objeto de verdad: antes pasaba un string o un array
       y la app quedaba en blanco al recargar, sin forma de volver a Ajustes. */
    if(!d.S || typeof d.S!=="object" || Array.isArray(d.S)) return null;
    if(typeof d.v === "number" && d.v > 3) return null;   /* respaldo de una versión futura */
    saneaImportado(d.S);      /* defensa en profundidad: el contenido también */
    /* las imágenes sólo pueden ser data:image — si no, cualquiera podría
       inyectar HTML dentro de la app mandándote un respaldo por WhatsApp */
    if(d.CIMG && typeof d.CIMG==="object" && !Array.isArray(d.CIMG)){
      Object.keys(d.CIMG).forEach(k=>{
        const v = d.CIMG[k];
        if(typeof v!=="string" || !/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))
          delete d.CIMG[k];
      });
    } else d.CIMG = null;
    return d;
  }catch(e){ return null; }
}
/* las imágenes sólo pueden ser data:image — misma regla dentro y fuera del sobre */
function limpiaCIMG(obj){
  if(!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  Object.keys(obj).forEach(k=>{
    if(ES_IMAGEN(obj[k])) out[String(k).slice(0,120)] = obj[k];
  });
  return out;
}

/* ---------- respaldo cifrado (AES-GCM · la frase sólo la tienes tú) ----------
   El respaldo salía en texto plano. Con deudas, saldos y tasas dentro, quien
   abriera el archivo en Drive o WhatsApp veía todo. Ahora el contenido va
   cifrado y el archivo sigue siendo un HTML que se puede guardar donde sea. */
async function sobreDeRespaldo(frase){
  const sobre = await cifraRespaldo({ S, CIMG }, frase);
  if(!sobre) return null;
  return { app:"mi-plan", v:3, cifrado:true, fecha:new Date().toISOString(), sobre };
}

/* devuelve el mismo formato que parseBackup para un respaldo normal, así el
   resto del flujo de importación es idéntico. null = frase equivocada. */
async function abreSobreRespaldo(pkg, frase){
  if(!pkg || pkg.cifrado !== true || !pkg.sobre) return null;
  const dentro = await descifraRespaldo(pkg.sobre, frase);
  if(!dentro || typeof dentro !== "object") return null;
  if(!dentro.S || typeof dentro.S !== "object" || Array.isArray(dentro.S)) return null;
  saneaImportado(dentro.S);          /* el contenido del sobre también es dato no confiable */
  return { app:"mi-plan", v:3, fecha:pkg.fecha, S:dentro.S, CIMG:limpiaCIMG(dentro.CIMG) };
}

/* nombre con hora, para que dos respaldos del mismo día no se pisen */
function nombreRespaldo(){
  const n = new Date(), z = v => String(v).padStart(2,"0");
  return `mi-plan-respaldo-${n.getFullYear()}-${z(n.getMonth()+1)}-${z(n.getDate())}`+
         `-${z(n.getHours())}${z(n.getMinutes())}.html`;
}
function marcaRespaldo(){ S.lastBackup = Date.now(); save(); renderRespaldoAviso(); }

/* ¿ya hay algo financiero que valga la pena proteger? */
function hayDatosDeDinero(){
  const f = fin();
  return !!(f.ingresos.length || f.deudas.length || f.apartados.length || f.movimientos.length);
}

/* Puerta de entrada del respaldo: decide si toca cifrar antes de generar nada.
   Con datos de dinero dentro, un archivo en texto plano en WhatsApp o Drive
   es una fuga esperando ocurrir, así que la primera vez se pregunta. */
function exportBackup(){
  const pref = fin().perfil.cifrarRespaldo;
  if(pref === true || (pref === null && hayDatosDeDinero())){ abrirFraseSheet(); return; }
  entregaRespaldo(null);
}

function abrirFraseSheet(){
  openSheet("Frase de respaldo", "Para cifrar el archivo", `
    <div class="alta-form">
      <label class="nf"><span>Tu frase (mínimo 8 caracteres)</span>
        <input id="frA" type="password" autocomplete="off" maxlength="120"></label>
      <label class="nf"><span>Repítela</span>
        <input id="frB" type="password" autocomplete="off" maxlength="120">
        <small>Con esta frase se cifra el archivo. No se guarda en ningún lado:
          si la olvidas, ese respaldo queda inservible. Usa algo que recuerdes
          y anótalo donde guardas tus contraseñas.</small></label>
      <div class="ases-btns">
        <button id="frGuardar">Cifrar y exportar</button>
        <button class="sec" id="frSin">Esta vez sin cifrar</button>
      </div>
    </div>`);
  const g = $("frGuardar");
  if(g) g.onclick = async ()=>{
    const a = String(($("frA")||{}).value || ""), b = String(($("frB")||{}).value || "");
    if(a.length < 8){ showToast("La frase necesita al menos 8 caracteres"); return; }
    if(a !== b){ showToast("Las dos frases no coinciden"); return; }
    g.disabled = true; g.textContent = "Cifrando…";
    fin().perfil.cifrarRespaldo = true; save();
    closeSheet(); await entregaRespaldo(a);
  };
  const s = $("frSin");
  if(s) s.onclick = async ()=>{
    if(!confirm("Sin cifrar, cualquiera que abra el archivo verá tus ingresos, deudas y saldos.\n\n¿Exportar así?")) return;
    fin().perfil.cifrarRespaldo = false; save();
    closeSheet(); await entregaRespaldo(null);
  };
}

async function entregaRespaldo(frase){
  let data;
  if(frase){
    data = await sobreDeRespaldo(frase);
    if(!data){ alertaGrave("No se pudo cifrar",
      "Este navegador no dejó cifrar el respaldo. Tus datos siguen intactos.", null); return; }
  }else{
    data = { app:"mi-plan", v:2, fecha:new Date().toISOString(), S, CIMG };
  }
  const blob = new Blob([buildBackupHtml(data)], {type:"text/html"});
  const nombre = nombreRespaldo();
  /* En iPhone la descarga se pierde en Archivos. La hoja de compartir deja
     mandarlo a iCloud, Drive o WhatsApp de un toque: es la única forma
     realista de sincronizar entre teléfonos. */
  try{
    const f = new File([blob], nombre, {type:"text/html"});
    if(navigator.canShare && navigator.canShare({files:[f]})){
      await navigator.share({files:[f], title:"Respaldo de Mi Plan"});
      marcaRespaldo(); showToast("⬆️ Respaldo compartido ✓");
      return;
    }
  }catch(e){ if(e && e.name==="AbortError") return; /* si falla, descargamos */ }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  marcaRespaldo();
  showToast(frase ? "⬇️ Respaldo cifrado descargado ✓"
                  : "⬇️ Respaldo descargado · ábrelo para verlo bonito");
}

/* resumen legible de un respaldo, para poder comparar antes de sobrescribir */
function resumenDe(St){
  const dias = St && St.trained ? Object.keys(St.trained).length : 0;
  const comidas = St && St.meals ? Object.keys(St.meals).length : 0;
  const med = St && Array.isArray(St.body) ? St.body.length : 0;
  return `${dias} días entrenados · ${comidas} días de comidas · ${med} mediciones`;
}
function importBackup(file){
  const rd = new FileReader();
  rd.onerror = ()=> showToast("No se pudo leer ese archivo 😕 vuelve a intentar");
  rd.onload = ()=>{
    const d = parseBackup(rd.result);
    if(!d){ showToast("Ese archivo no parece un respaldo de Mi Plan 😕"); return; }
    if(d.cifrado){ pideFraseImport(d); return; }
    aplicaRespaldo(d);
  };
  rd.readAsText(file);
}

/* respaldo cifrado: sin la frase no hay nada que hacer, ni siquiera saber
   qué trae dentro */
function pideFraseImport(pkg){
  openSheet("Respaldo cifrado", "Escribe tu frase de respaldo", `
    <div class="alta-form">
      <label class="nf"><span>Frase de respaldo</span>
        <input id="imFrase" type="password" autocomplete="off" maxlength="120">
        <small>Es la frase que escribiste cuando exportaste este archivo.
          No hay forma de recuperarla ni de abrirlo sin ella.</small></label>
      <div class="ases-btns"><button id="imAbrir">Abrir respaldo</button></div>
      <div class="cd-err" id="imErr"></div>
    </div>`);
  const b = $("imAbrir");
  if(b) b.onclick = async ()=>{
    const frase = String(($("imFrase")||{}).value || "");
    b.disabled = true; b.textContent = "Descifrando…";
    const d = await abreSobreRespaldo(pkg, frase);
    if(!d){
      b.disabled = false; b.textContent = "Abrir respaldo";
      if($("imErr")) $("imErr").textContent = "Esa frase no abre este archivo.";
      return;
    }
    closeSheet();
    aplicaRespaldo(d);
  };
}

function aplicaRespaldo(d){
  {
    /* comparar contra lo que hay hoy y PEDIR CONFIRMACIÓN: un dedazo en la
       lista de archivos no puede borrar meses de progreso. */
    const f = d.fecha ? new Date(d.fecha) : null;
    const cuando = f && !isNaN(f) ?
      `${f.getDate()} de ${MONTHS_FULL[f.getMonth()]} de ${f.getFullYear()}` : "fecha desconocida";
    const ok = confirm(
      `Vas a REEMPLAZAR todo tu progreso.\n\n`+
      `El respaldo es del ${cuando}\n   ${resumenDe(d.S)}\n\n`+
      `Lo que tienes ahora\n   ${resumenDe(S)}\n\n`+
      `¿Continuar? Se guarda una copia de lo actual por si te arrepientes.`);
    if(!ok){ showToast("Importación cancelada · nada cambió"); return; }

    try{
      /* red de seguridad: copia de lo actual ANTES de tocar nada */
      try{ localStorage.setItem(PRE_KEY, localStorage.getItem(LS_KEY) || ""); }catch(e){}
      /* a partir de aquí, la memoria está desfasada: nadie más puede guardar */
      restaurando = true;
      localStorage.setItem(LS_KEY, JSON.stringify(d.S));
      if(d.CIMG){
        try{ localStorage.setItem(IMG_KEY, JSON.stringify(d.CIMG)); }
        catch(e){ showToast("Progreso restaurado, pero no cupieron las fotos"); }
      }
      showToast("⬆️ Respaldo restaurado · recargando…");
      setTimeout(()=>location.reload(), 900);
    }catch(e){
      restaurando = false;                 /* falló: la memoria vuelve a ser la verdad */
      alertaGrave("No se pudo restaurar",
        "No hay espacio suficiente en este navegador. Tu progreso anterior sigue intacto.", null);
      try{ const prev = localStorage.getItem(PRE_KEY); if(prev) localStorage.setItem(LS_KEY, prev); }catch(e2){}
    }
  }
}

/* ---------- Tuerca: Imágenes · Nutrición · Ajustes ---------- */
let gearTab = "ali", imgFilter = "", nutFilter = "", nutOpen = null, nutAdd = false;
function exVariantList(){
  const seen = {}, out = [];
  Object.values(RUTINA).forEach(list => list.forEach(ex => ex.v.forEach(v => {
    const sl = slugName(v.n);
    if(seen[sl]) return; seen[sl] = 1;
    out.push({sl, n: v.n});
  })));
  return out.sort((a,b)=>a.n.localeCompare(b.n,"es"));
}
function allFoodKeys(){
  const out = [];
  SHOP.forEach(it=>{
    if(it.total===0 && it.id==="sazon") return;
    out.push({key:nutKey(it.id), name:it.name, base:it.id, isBase:true});
    it.alts.forEach((a,j)=> out.push({key:nutKey(it.id,j), name:a.n, base:it.id, alt:j,
      custom:!!a.customId, sub:"equivalencia de "+it.name}));
  });
  return out;
}
function fmtN(v){ return (Math.round(v*10)/10).toString(); }
function nutField(k,l,v){
  return `<label class="nf"><span>${esc(l)}</span><input type="number" inputmode="decimal" step="any" min="0" data-nf="${esc(k)}" value="${v===""?"":numeroTxt(v,1)}"></label>`;
}
function nutRowsHtml(){
  const f = nutFilter.trim().toLowerCase();
  const list = allFoodKeys().filter(x=>!f || x.name.toLowerCase().includes(f));
  if(!list.length) return `<div class="sheet-note">Nada coincide con tu búsqueda.</div>`;
  return list.map(x=>{
    const n = nutOf(x.key), edited = !!S.nutEdits[x.key];
    const per = esc(n.pz ? "por "+(n.pzTxt||"pieza") : "por 100 "+(shopById[x.base].unit==="ml"?"ml":"g"));
    const open = nutOpen===x.key;
    const imgK = "food:"+x.base, hasCustomImg = ES_IMAGEN(CIMG[imgK]);
    const imgSrc = srcImagen(imgK, "img/"+x.base+".png");
    return `<div class="nut-row${open?' open':''}${x.isBase?'':' isalt'}" data-nutrow="${esc(x.key)}">
      <div class="nut-head" data-nutopen="${esc(x.key)}">
        ${x.isBase?`<span class="img-th sm"><img src="${imgSrc}" alt="" loading="lazy" data-fbk="${esc(shopById[x.base].e)}"></span>`:""}
        <span class="nut-nm">${esc(x.name)}
          ${x.sub?`<small>${esc(x.sub)}</small>`:""}
          ${edited?`<small class="ed">★ editado por ti</small>`:""}${x.custom?`<small class="ed">★ agregado por ti</small>`:""}</span>
        <span class="nut-vals">${Math.round(n.kcal)} kcal · ${fmtN(n.p)}P/${fmtN(n.c)}C/${fmtN(n.f)}G
          <em>${per} · ${n.precio?fmt$(numero(n.precio))+" "+(n.pz?"c/u":"por 100"):"sin precio"}</em></span>
        <span class="nut-arrow">${open?"▴":"▾"}</span>
      </div>
      ${open?`<div class="nut-form">
        ${nutField("kcal","Kcal",n.kcal)}${nutField("p","Proteína g",n.p)}
        ${nutField("c","Carbos g",n.c)}${nutField("f","Grasa g",n.f)}
        ${nutField("precio","Precio $ "+(n.pz?"por "+(n.pzTxt||"pieza"):"por 100"),n.precio||0)}
        ${x.isBase?`<div class="nut-photo">
          <span class="img-th"><img src="${imgSrc}" alt="" data-fbk="${esc(shopById[x.base].e)}"></span>
          <label class="chg">📷 Cambiar imagen<input type="file" accept="image/*" data-imgkey="${esc(imgK)}"></label>
          ${hasCustomImg?`<button class="del" data-imgdel="${esc(imgK)}" aria-label="Quitar imagen">✕</button>`:""}
        </div>`:""}
        <div class="nut-btns">
          <button class="nb-save" data-nutsave="${esc(x.key)}">Guardar</button>
          ${edited?`<button class="nb-reset" data-nutreset="${esc(x.key)}">Restaurar original</button>`:""}
          ${x.custom?`<button class="nb-del" data-nutdel="${esc(x.key)}">Eliminar alimento</button>`:""}
        </div>
        <div class="nut-hint">Valores ${per}. Ideal para copiar la etiqueta real del producto que compras. Al guardar, la dieta y el mandado se recalculan solos.</div>
      </div>`:""}
    </div>`;
  }).join("");
}
function nutAddFormHtml(){
  return `<div class="nut-form add">
    <label class="nf wide"><span>Nombre del alimento</span><input type="text" data-nf="n" placeholder="Ej. Pechuga de pavo molida"></label>
    <label class="nf wide"><span>Es equivalente de…</span><select data-nf="base">
      ${SHOP.filter(it=>it.total!==0).map(it=>`<option value="${it.id}">${esc(it.name)}</option>`).join("")}
    </select></label>
    <label class="nf wide chk"><input type="checkbox" data-nf="pz"><span>Se mide por pieza (no por gramos)</span></label>
    ${nutField("kcal","Kcal por 100 g (o por pieza)","")}
    ${nutField("p","Proteína g","")}${nutField("c","Carbos g","")}${nutField("f","Grasa g","")}
    ${nutField("precio","Precio $ por 100 g (o por pieza)","")}
    <div class="nut-btns"><button class="nb-save" data-nutadd="1">Agregar al plan</button>
      <button class="nb-reset" data-nutaddcancel="1">Cancelar</button></div>
    <div class="nut-hint">Copia los valores de la etiqueta del producto. La app calcula sola la cantidad equivalente para conservar tus macros, y aparecerá en el submenú de equivalencias y en el mandado.</div>
  </div>`;
}
/* ---- filas de fotos de ejercicios ---- */
function exRowsHtml(){
  const f = imgFilter.trim().toLowerCase();
  return exVariantList().filter(x => !f || x.n.toLowerCase().includes(f)).map(x => {
    const k = "ex:"+x.sl, custom = ES_IMAGEN(CIMG[k]);
    const src = srcImagen(k, "img/ej-"+x.sl+".png");
    return `<div class="img-row">
      <span class="img-th"><img src="${src}" alt="" loading="lazy" data-fbk="🏋️"></span>
      <span class="img-nm">${esc(x.n)}${custom?`<small>★ TU IMAGEN</small>`:""}</span>
      <span class="img-act">
        <label class="chg">📷 Cambiar<input type="file" accept="image/*" data-imgkey="${esc(k)}"></label>
        ${custom?`<button class="del" data-imgdel="${esc(k)}" aria-label="Quitar">✕</button>`:""}
      </span></div>`;
  }).join("") || `<div class="sheet-note">Ningún ejercicio coincide con tu búsqueda.</div>`;
}
/* ---- pestaña Ajustes: datos de la persona + resultados bloqueados ---- */
function lockedRow(l,v){
  return `<div class="lk-row"><span class="lk-l">${l}</span><span class="lk-v">${v}</span><span class="lk-i">🔒</span></div>`;
}
function personaHtml(){
  const P = personaGet(), kg = pesoActual();
  const sel = (k,l,opts,cur)=>`<label class="nf"><span>${l}</span><select data-per="${esc(k)}">
    ${opts.map(o=>`<option value="${o[0]}" ${String(cur)===String(o[0])?"selected":""}>${o[1]}</option>`).join("")}</select></label>`;
  const num = (k,l,v,step)=>`<label class="nf"><span>${esc(l)}</span><input type="number" inputmode="decimal" step="${esc(step||1)}" min="0" data-per="${esc(k)}" value="${numero(v)}"></label>`;
  return `
    <div class="set-h">Tus datos (esto es lo único que editas)</div>
    <div class="nut-form open2">
      <div class="lk-row peso"><span class="lk-l">Peso actual</span>
        <span class="lk-v">${kg} kg</span>
        <span class="lk-i" title="Se toma de tu último registro">📈</span>
        <small class="lk-src">se toma solo de tu último registro en Progreso → Registrar medición</small></div>
      ${num("estatura","Estatura (cm)",P.estatura)}${num("edad","Edad (años)",P.edad)}
      ${sel("sexo","Sexo",[["m","Hombre"],["f","Mujer"]],P.sexo)}
      ${sel("act","Actividad fuera del gym",[["1.4","Ligera (oficina)"],["1.55","Media (te mueves algo)"],["1.7","Alta (trabajo físico)"]],P.act)}
      ${sel("objetivo","Objetivo",[["perder","Perder grasa"],["recomp","Recomposición"],["mantener","Mantener"],["subir","Subir masa"]],P.objetivo)}
      ${num("metaGrasa","% de grasa meta",P.metaGrasa,0.5)}
      ${num("metaMusculo","Músculo meta (kg)",P.metaMusculo,0.5)}
      ${num("cardioMin","Cardio al terminar (min)",P.cardioMin,5)}
    </div>
    <div class="nut-btns"><button class="nb-save" data-psave="1">Guardar y recalcular</button>
      <button class="nb-reset" data-preset="1">Volver a valores originales</button></div>
    <div class="set-h">Tu dieta, calculada de tus datos</div>
    <div class="lk-card">
      ${lockedRow("Calorías diarias", CONFIG.kcal.toLocaleString("es-MX")+" kcal")}
      ${lockedRow("Proteína", CONFIG.prot+" g · 2.1 g por kg")}
      ${lockedRow("Grasa", CONFIG.fat+" g")}
      ${lockedRow("Carbohidratos", CONFIG.carb+" g · lo que resta")}
      ${lockedRow("Agua", CONFIG.aguaLitros+" L")}
      ${lockedRow("Presupuesto de antojos", CONFIG.antojosSemana.toLocaleString("es-MX")+" kcal/sem")}
      <div class="nut-hint" style="padding:10px 2px 2px">🔒 Estos valores se calculan solos con la fórmula Mifflin-St Jeor y van bloqueados a propósito: así un dedazo no te descompone la dieta. Cambia tus datos de arriba (o registra un peso nuevo en Progreso) y se actualizan al momento.</div>
    </div>
    <div class="set-h">Respaldo</div>
    <div id="respaldoAviso">${respaldoAvisoHtml()}</div>
    <div class="img-note" style="margin-top:0">Todo tu progreso vive en este dispositivo. Exporta un respaldo de vez en cuando: es tu seguro y tu forma de pasar todo a otro teléfono.</div>
    <div class="nut-btns">
      <button class="nb-save" data-bkexport="1">⬇️ Exportar respaldo</button>
      <label class="nb-reset bk-imp">⬆️ Importar respaldo<input type="file" accept=".html,.json,text/html,application/json" data-bkimport="1" style="display:none"></label>
    </div>
    <div class="set-h">Sin señal en el gimnasio</div>
    <div class="img-note" style="margin-top:0">Las fotos se guardan solas la primera vez que las ves. Si vas a un gimnasio sin señal, bájalas todas de una vez desde aquí.</div>
    <div id="precacheBox">${precacheHtml()}</div>

    <div class="set-h">Instalar como aplicación</div>
    <div class="img-note" style="margin-top:0">
      <b>Android (Chrome):</b> menú ⋮ → «Agregar a pantalla de inicio» o «Instalar app».<br>
      <b>iPhone (Safari):</b> botón Compartir <span style="font-size:13px">⬆️</span> → «Agregar a inicio».<br>
      Queda con el icono de Sólida, abre a pantalla completa y funciona sin señal en el gimnasio.</div>`;
}
/* ---- pestaña Diseño ---- */
function disenoHtml(){
  const u = S.ui || {};
  const chk = (k,l,d,on)=>`<label class="nf wide chk"><input type="checkbox" data-ui="${esc(k)}" ${on?"checked":""}><span>${l}<small class="ui-d">${d}</small></span></label>`;
  const seg = (k,l,opts,cur)=>`<div class="nf wide"><span>${l}</span><div class="ui-seg">${opts.map(o=>
    `<button data-ui="${esc(k)}" data-v="${esc(o[0])}" class="${cur===o[0]?'on':''}">${o[1]}</button>`).join("")}</div></div>`;
  return `
    <div class="set-h">Apariencia</div>
    <div class="nut-form open2">
      ${seg("tema","Tema",[["auto","Automático"],["claro","Claro"],["oscuro","Oscuro"]], u.tema||"auto")}
      <div class="ui-nota">Automático sigue el modo de tu teléfono. El claro se lee mejor a pleno sol.</div>
      ${seg("texto","Tamaño del texto",[["chico","Chico"],["normal","Normal"],["grande","Grande"]], u.texto||"normal")}
      ${seg("vistaRutina","Vista de la rutina",
            [["lista","Lista"],["contraer","Auto-contraer"],["foco","Foco"]], vistaRutina())}
      <div class="ui-nota"><b>Lista:</b> todos los ejercicios abiertos, como siempre.
        <b>Auto-contraer:</b> el ejercicio que terminas se recoge solo y la app te lleva
        al siguiente. <b>Foco:</b> una tarjeta por pantalla, se desliza con el dedo —
        pensado para el gimnasio, con las manos ocupadas.</div>
      ${chk("fotosAlimentos","Imágenes de alimentos","En comidas y mandado", CONFIG.usarFotos)}
      ${chk("fotosEjercicios","Fotos de ejercicios","En la rutina y sus variantes", CONFIG.fotosEjercicios)}
      ${chk("anim","Animaciones","Timer, confeti y transiciones. Apágalas si tu teléfono va lento", u.anim!==false)}
      ${chk("sonido","Sonidos","Al marcar comidas, series y productos, y al terminar el descanso", u.sonido!==false)}
      <div class="nf wide"><span>Volumen</span>
        <div class="ui-rango">
          <input type="range" min="0" max="100" step="5" data-uirange="volumen"
                 value="${Math.round(volumenActual()*100)}" aria-label="Volumen de los sonidos">
          <output id="volVal">${Math.round(volumenActual()*100)} %</output>
        </div>
        <small class="ui-d">Suena una nota de prueba al soltarlo.</small></div>
      ${chk("soloVibrar","Sólo vibrar","Nada de sonido, pero los avisos siguen vibrando. Útil con audífonos puestos.", u.soloVibrar===true)}
      <div class="ui-nota">En iPhone el switch de silencio apaga el sonido de las apps web. Por eso el fin del descanso siempre vibra además de sonar. Si otra app te toma el audio (música, una llamada), la app lo recupera sola al volver.</div>
    </div>
    <div class="img-note">Los cambios se aplican al instante y se recuerdan en este dispositivo. Nada de aquí afecta tu dieta ni tu rutina: solo cómo se ve la app.</div>`;
}
function renderGearSheet(){
  const body = document.getElementById("cfgPanel");
  let inner = "";
  if(gearTab==="ali"){
    inner = `
      <button class="nut-addbtn" data-nutaddopen="1">➕ Agregar alimento nuevo</button>
      ${nutAdd?nutAddFormHtml():""}
      <input class="img-flt" id="nutFlt" type="search" placeholder="Buscar alimento o equivalencia…" value="${esc(nutFilter)}">
      <div id="nutRows">${nutRowsHtml()}</div>
      <div class="img-note">🍎 Cada alimento junta aquí su etiqueta, su precio y su imagen. Estos valores alimentan TODA la app: los kcal de cada comida, el resumen del día, las equivalencias y los totales del mandado.</div>`;
  } else if(gearTab==="ejer"){
    inner = `
      <div class="set-h" style="margin-top:0">Unidad de peso</div>
      <div class="ui-seg" style="margin-bottom:14px">
        <button data-unit="kg" class="${S.unidad!=="lb"?"on":""}">Kilogramos</button>
        <button data-unit="lb" class="${S.unidad==="lb"?"on":""}">Libras</button>
      </div>
      <div class="set-h">Fotos de los ejercicios</div>
      <input class="img-flt" id="imgFlt" type="search" placeholder="Buscar ejercicio…" value="${esc(imgFilter)}">
      <div id="imgRows">${exRowsHtml()}</div>
      <div class="img-note">💡 Puedes reemplazar cualquier foto con una tuya (una captura de tu técnica funciona perfecto). Con ✕ regresas a la original. Series, repeticiones y variantes se manejan directo en la pestaña Rutina.</div>`;
  } else if(gearTab==="set"){
    inner = personaHtml();
  } else {
    inner = disenoHtml();
  }
  body.innerHTML = `
    <div class="ctabs">
      <button data-geartab="ali" class="${gearTab==='ali'?'on':''}"><i><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7c-1.6-1.4-4-1.6-5.7-.2C4.2 8.5 4 12 5.4 15c1 2.2 2.6 4.4 4.2 4.4.9 0 1.5-.5 2.4-.5s1.5.5 2.4.5c1.6 0 3.2-2.2 4.2-4.4 1.4-3 1.2-6.5-.9-8.2C16 5.4 13.6 5.6 12 7Z"/><path d="M12 7c0-1.7.9-3.3 2.6-3.9"/></svg></i>Alimentos</button>
      <button data-geartab="ejer" class="${gearTab==='ejer'?'on':''}"><i><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7"/></svg></i>Ejercicios</button>
      <button data-geartab="set" class="${gearTab==='set'?'on':''}"><i><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/></svg></i>Ajustes</button>
      <button data-geartab="dis" class="${gearTab==='dis'?'on':''}"><i><svg class="ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 1 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6Z"/></svg></i>Diseño</button>
    </div>${inner}`;
  const flt = document.getElementById("imgFlt");
  if(flt) flt.addEventListener("input", ()=>{ imgFilter = flt.value;
    document.getElementById("imgRows").innerHTML = exRowsHtml(); });
  const nflt = document.getElementById("nutFlt");
  if(nflt) nflt.addEventListener("input", ()=>{ nutFilter = nflt.value;
    document.getElementById("nutRows").innerHTML = nutRowsHtml(); });
}
function refreshAfterImg(){
  renderMeals(); renderShop(); renderRoutine();
  const r=document.getElementById("imgRows"); if(r) r.innerHTML = exRowsHtml();
  const n=document.getElementById("nutRows"); if(n) n.innerHTML = nutRowsHtml();
}
function refreshAfterNut(){
  attachCustomFoods();
  renderMeals(); renderShop(); renderTierBar();
  const r=document.getElementById("nutRows"); if(r) r.innerHTML = nutRowsHtml();
}
/* archivo → recorte cuadrado 360px → JPEG comprimido */
function fileToSquare(file, cb){
  const rd = new FileReader();
  rd.onload = () => {
    const im = new Image();
    im.onload = () => {
      const S = 360, c = document.createElement("canvas");
      c.width = S; c.height = S;
      const x = c.getContext("2d");
      const s = Math.min(im.width, im.height);
      x.drawImage(im, (im.width-s)/2, (im.height-s)/2, s, s, 0, 0, S, S);
      cb(c.toDataURL("image/jpeg", .82));
    };
    im.onerror = () => showToast("No pude leer esa imagen 😕");
    im.src = rd.result;
  };
  rd.readAsDataURL(file);
}

const PREP_TXT = {listo:"LISTO", rapido:"RÁPIDO", cocina:"COCINA"};
const PREP_CLS = {listo:"listo", rapido:"rapido", cocina:"cocina"};
function hairBadge(h){ return h?`<span class="hair-b">💇 ${esc(h)}</span>`:""; }
function prepBadge(p){ return p?`<span class="prep-b ${PREP_CLS[p]}">${PREP_TXT[p]}</span>`:""; }

/* ============================================================
   HOY — comidas, agua
   ============================================================ */
if(!S.meals[dayKey]) S.meals[dayKey]=MEALS.map(()=>false);
$("dateMeta").textContent = DAYS[now.getDay()]+" "+now.getDate()+" "+MONTHS[now.getMonth()]+" · dieta y entrenamiento";
$("todayName").textContent = DAYS[now.getDay()];
/* Macros de lo que YA marcaste como comido hoy (no del plan completo) */
function macrosComidos(){
  const hechas = S.meals[dayKey] || [];
  const lista = MEALS.map((m,i)=> hechas[i] ? mealMacros(m,i) : {kcal:0,p:0,c:0,f:0});
  const t = sumM(lista);
  /* lo que registraste aparte (snacks y antojos) también cuenta */
  (S.snacks[dayKey]||[]).forEach(x=>{ t.kcal += x.kcal||0; t.p += x.p||0; });
  Object.keys(S.antojos||{}).forEach(w=>{
    (S.antojos[w]||[]).forEach(x=>{ if(x.d===dayKey) t.kcal += x.kcal||0; });
  });
  return t;
}
/* Los 4 recuadros del header ahora son BARRAS que se llenan durante el día.
   Antes eran las metas fijas: el número más grande de la pantalla no
   reflejaba nada de lo que hacías. */
function renderTargets(){
  const hecho = macrosComidos();
  const filas = [
    ["mKcal", hecho.kcal, CONFIG.kcal, v=>Math.round(v).toLocaleString("es-MX"), ""],
    ["mProt", hecho.p,    CONFIG.prot, v=>Math.round(v), "g"],
    ["mCarb", hecho.c,    CONFIG.carb, v=>Math.round(v), "g"],
    ["mFat",  hecho.f,    CONFIG.fat,  v=>Math.round(v), "g"],
  ];
  filas.forEach(([id, val, meta, fmt, u])=>{
    const el = $(id); if(!el) return;
    el.innerHTML = `${fmt(val)}<em> / ${fmt(meta)}${u?" "+u:""}</em>`;
    const caja = el.closest(".macro"); if(!caja) return;
    const barra = caja.querySelector("i");
    const pct = meta ? Math.min(100, val/meta*100) : 0;
    if(barra) barra.style.width = pct.toFixed(1)+"%";
    caja.classList.toggle("over", meta>0 && val > meta*1.05);
    el.setAttribute("aria-label", `${fmt(val)} de ${fmt(meta)} ${u||"kcal"}`);
  });
  renderHdrMini(hecho);
  renderHdrExtra();
  if($("aguaFig")){ $("aguaFig").textContent = CONFIG.aguaLitros+" L";
    $("aguaSub").innerHTML = "≈ "+Math.round(CONFIG.aguaLitros*4)+" vasos de 250 ml<br>repartidos en el día"; }
}
/* Resumen de una línea que aparece cuando el header se encoge */
function renderHdrMini(hecho){
  const el = $("hdrMini"); if(!el) return;
  const h = hecho || macrosComidos();
  const tab = document.body.dataset.tab || "hoy";
  const hechas = (S.meals[dayKey]||[]).filter(Boolean).length;
  if(tab==="rutina"){
    const b = bloqueDe(viewKey), f = faseDe(viewKey);
    el.innerHTML = `<span>${b?esc(b.short||b.title):"Descanso"}</span><span class="sep">·</span>`+
                   `<span>${esc(CYCLE[f.idx].n)}</span>`;
  } else if(tab==="progreso"){
    el.innerHTML = `<b>${pesoActual()}</b><span>kg</span><span class="sep">·</span>`+
                   `<span>meta ${metaPesoKg()} kg</span>`;
  } else {
    el.innerHTML = `<b>${Math.round(h.kcal).toLocaleString("es-MX")}</b>`+
                   `<span>de ${CONFIG.kcal.toLocaleString("es-MX")} kcal</span>`+
                   `<span class="sep">·</span><span>${hechas}/${MEALS.length} comidas</span>`;
  }
}
/* En Rutina / Progreso / Ajustes el header muestra datos de ESA pestaña */
function renderHdrExtra(){
  const el = $("hdrExtra"); if(!el) return;
  const tab = document.body.dataset.tab || "hoy";
  const caja = (v,l)=>`<div class="he"><b>${v}</b><span>${l}</span></div>`;
  if(tab==="rutina"){
    const b = bloqueDe(viewKey), f = faseDe(viewKey);
    const lista = b ? (RUTINA[b.id]||[]) : [];
    const hechas = lista.filter(x=>{
      const st = (S.sets[viewKey]||{})[x.id]||0; return x.s>0 && st >= x.s;
    }).length;
    el.innerHTML = caja(b?esc(b.short||b.title):"Descanso","bloque")+
                   caja(`${hechas}/${lista.length}`,"ejercicios")+
                   caja(esc(CYCLE[f.idx].n.split(" ")[0]),`semana ${f.w} de ${f.tot}`);
  } else if(tab==="progreso"){
    const p = pesoActual(), meta = metaPesoKg();
    const dif = Math.round((p-meta)*10)/10;
    el.innerHTML = caja(p+" kg","peso")+
                   caja(meta+" kg","meta")+
                   caja(Math.abs(dif)+" kg", dif>0?"por bajar":dif<0?"por subir":"en meta");
  } else if(tab==="config"){
    const d = diasSinRespaldo();
    el.innerHTML = caja(Object.keys(S.trained||{}).length,"entrenos")+
                   caja((S.customFoods||[]).length,"tuyos")+
                   caja(d===null?"—":(d===0?"hoy":d+"d"),"respaldo");
  } else el.innerHTML = "";
}

/* El header se encoge SIGUIENDO el scroll, no de golpe.
   Un solo listener pasivo con rAF escribe --h de 0 a 1; el CSS interpola
   tamaños y opacidades. Antes era un salto al cruzar 56 px. */
(function headerScroll(){
  const RECORRIDO = 96;          /* px de scroll para colapsar del todo */
  let ticking = false, ultimo = -1, tQuieto;
  const header = document.querySelector("header");
  if(!header || !header.style || !header.style.setProperty) return;   /* sin header no hay nada que animar */
  function pinta(){
    ticking = false;
    const y = Math.max(0, window.scrollY || 0);
    const h = Math.min(1, y / RECORRIDO);
    if(Math.abs(h - ultimo) < 0.004) return;   /* evita escrituras inútiles */
    const antes = ultimo;
    ultimo = h;
    header.style.setProperty("--h", h.toFixed(3));
    /* el resumen de una línea se rellena justo antes de empezar a verse */
    if(antes < 0.45 && h >= 0.45) renderHdrMini();
  }
  window.addEventListener("scroll", ()=>{
    /* mientras el dedo scrollea, sin transiciones: el CSS sigue al dedo */
    document.body.classList.add("scrolleando");
    clearTimeout(tQuieto);
    tQuieto = setTimeout(()=>document.body.classList.remove("scrolleando"), 140);
    if(!ticking){ ticking = true; requestAnimationFrame(pinta); }
  }, {passive:true});
  pinta();
})();
applyUI(); renderTargets();

/* ------------------------------------------------------------------
   "AHORA" — la tarjeta que dice qué sigue.
   Es lo único de la pantalla con jerarquía 1: más grande, con acento y
   con un botón que hace la acción sin buscarla.
   ------------------------------------------------------------------ */
/* "7:00–8:30 am" → minutos desde medianoche del INICIO de la ventana */
function minutosDe(txt){
  const m = String(txt||"").match(/(\d{1,2})(?::(\d{2}))?\s*(–|-|a\.?m|p\.?m)?/i);
  if(!m) return null;
  let h = +m[1], min = m[2]?+m[2]:0;
  const tarde = /p\.?\s?m/i.test(txt);
  const finVentana = String(txt).split(/[–-]/)[1] || "";
  const pmFinal = /p\.?\s?m/i.test(finVentana) || tarde;
  if(pmFinal && h < 12) h += 12;
  return h*60 + min;
}
function siguienteComida(){
  const hechas = S.meals[dayKey] || [];
  const ahora = new Date(); const min = ahora.getHours()*60 + ahora.getMinutes();
  const pendientes = MEALS.map((m,i)=>({m,i,t:minutosDe(m.time)}))
                          .filter(x=>!hechas[x.i]);
  if(!pendientes.length) return null;
  /* la primera pendiente cuya ventana ya empezó; si ninguna, la más próxima */
  const vencidas = pendientes.filter(x=>x.t!==null && x.t<=min);
  return vencidas.length ? vencidas[vencidas.length-1] : pendientes[0];
}
function renderAhora(){
  const box = $("ahora"); if(!box) return;
  const bloque = bloqueDe(dayKey);
  const sig = siguienteComida();
  const hechas = (S.meals[dayKey]||[]).filter(Boolean).length;
  const ahora = new Date(); const min = ahora.getHours()*60 + ahora.getMinutes();

  /* si es día de entreno y ya pasó de las 4pm sin entrenar, eso es lo urgente */
  const entrenado = !!S.trained[dayKey];
  const tocaEntrenar = bloque && !entrenado && min >= 16*60;

  if(tocaEntrenar){
    const lista = RUTINA[bloque.id]||[];
    const listos = lista.filter(x=>{
      const st = (S.sets[dayKey]||{})[x.id]||0;
      return x.s > 0 && st >= x.s;
    }).length;
    box.innerHTML = `
      <div class="ahora ahora-gym" style="--ac:var(--blue)">
        <div class="ah-tag">Ahora</div>
        <div class="ah-body">
          <div class="ah-t">${esc(bloque.short||bloque.title)}</div>
          <div class="ah-s">${listos} de ${lista.length} ejercicios · ${esc(CYCLE[faseDe(dayKey).idx].n)}</div>
        </div>
        <button class="ah-btn" data-ir="rutina">Ir a la rutina</button>
      </div>`;
    return;
  }
  if(!sig){
    box.innerHTML = `
      <div class="ahora ahora-fin" style="--ac:var(--em)">
        <div class="ah-tag">Hoy</div>
        <div class="ah-body">
          <div class="ah-t">Ya comiste todo 🎉</div>
          <div class="ah-s">${hechas} de ${MEALS.length} comidas · ${Math.round(macrosComidos().kcal).toLocaleString("es-MX")} kcal</div>
        </div>
      </div>`;
    return;
  }
  const m = sig.m, mm = mealMacros(m, sig.i);
  const tarde = sig.t!==null && min > sig.t + 90;
  box.innerHTML = `
    <div class="ahora${tarde?' ah-tarde':''}" style="--ac:${m.color?tono(m.color):'var(--em)'}">
      <div class="ah-tag">${tarde?"Pendiente":"Ahora"}</div>
      <div class="ah-body">
        <div class="ah-t">${esc(m.name)}</div>
        <div class="ah-s">${esc(m.time)} · ${Math.round(mm.kcal)} kcal · ${Math.round(mm.p)} g proteína</div>
      </div>
      <button class="ah-btn" data-comer="${sig.i}" aria-label="Marcar ${esc(m.name)} como comida">Ya comí</button>
    </div>`;
}
$("ahora").addEventListener("click", e=>{
  const c = e.target.closest("[data-comer]");
  if(c){
    const i = +c.dataset.comer;
    S.meals[dayKey][i] = true; save();
    renderMeals(); renderTargets(); renderAhora();
    celebra(c);
    showToast(S.meals[dayKey].every(Boolean) ? "¡Completaste todas tus comidas! 🎉" : "Comida registrada ✓");
    return;
  }
  const ir = e.target.closest("[data-ir]");
  if(ir) irAPestana(ir.dataset.ir);
});
/* chispita al completar: confirma la acción sin robar atención */
function celebra(el){
  if((S.ui||{}).anim===false) return;
  const r = el.getBoundingClientRect();
  const d = document.createElement("div");
  d.className = "chispa";
  d.style.left = (r.left + r.width/2) + "px";
  d.style.top  = (r.top + r.height/2) + "px";
  document.body.appendChild(d);
  setTimeout(()=>d.remove(), 700);
}

function mealOpt(i){ return S.mealOpt[i] || "A"; }
function renderMeals(){
  const done=S.meals[dayKey];
  $("meals").innerHTML = MEALS.map((m,i)=>{
    const items = m.options ? m.options[mealOpt(i)] : m.items;
    const mm = mealMacros(m,i);
    const keys = m.options ? Object.keys(m.options) : [];
    const optHtml = m.options ? `<div class="opt-toggle">${keys.map((k,j)=>
      `<button data-opt="${k}" data-meal="${i}" class="${mealOpt(i)===k?'on':''}">${esc(m.optLabel?m.optLabel[j]:("Opción "+k))}<small>${Math.round(optionMacros(m,k).kcal)} kcal</small></button>`).join("")}</div>` : "";
    return `<div class="meal${done[i]?' done':''}" style="--mc:${tono(m.color,3)};--mc-txt:${tono(m.color)}">
      <div class="meal-top">
        <div class="check${done[i]?' on':''}" data-i="${i}" role="button" tabindex="0">${done[i]?'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</div>
        <div><div class="meal-time">${m.time}</div><div class="meal-name">${m.name}</div></div>
        <div class="kcal">~<b>${Math.round(mm.kcal)}</b> kcal<br>${Math.round(mm.p)} g prot</div>
      </div>
      ${optHtml}
      <ul class="foods">${items.map(f=>{
        const altF=selAlt(f.ref), swapped=!!altF, h=dispHair(f.ref);
        return `<li class="food${swapped?' swapped':''}" role="button" tabindex="0"
            data-detalle="${esc(f.ref)}" data-g="${esc(f.g)}" data-u="${esc(f.unit||'')}"
            aria-label="Ver detalle de ${esc(dispName(f.ref))}">
          ${foodIcon(shopById[f.ref], altF)}
          <span class="txt"><b>${esc(dispName(f.ref))}</b>${(!swapped && f.extra)?` <small>${esc(f.extra)}</small>`:''}
            ${swapped?'<span class="sw-note">↻ sustituido</span>':''}</span>
          <span class="amt">${(f.tag && !(f.tagBase && swapped))?esc(f.tag)+" ":""}${dispAmt(f.ref,f.g,f.unit)}</span>
          <span class="row-mas" aria-hidden="true">›</span></li>`;
      }).join("")}</ul>
    </div>`;
  }).join("");
  renderDaySummary();
  updateRing();
}
/* resumen calculado del día vs objetivo */
function renderDaySummary(){
  const el=$("daySum"); if(!el) return;
  const d=dayMacros();
  const row=(lbl,val,goal,unit,col)=>{
    const pct=Math.min(130, val/goal*100);
    return `<div class="ds-row"><span class="ds-l">${lbl}</span>
      <span class="ds-bar"><i style="width:${Math.min(pct,100)}%;background:${tono(col,3)}${pct>112?';opacity:.55':''}"></i></span>
      <span class="ds-v" style="color:${tono(col)}">${Math.round(val)}<small>/${goal}${unit}</small></span></div>`;
  };
  const diff=Math.round(d.kcal-CONFIG.kcal);
  el.innerHTML = `
    <div class="lbl">Tu día, calculado de tus platillos</div>
    ${row("Kcal", d.kcal, CONFIG.kcal, "", "#ff8f80")}
    ${row("Proteína", d.p, CONFIG.prot, " g", "#57d6c3")}
    ${row("Carbos", d.c, CONFIG.carb, " g", "#f2b544")}
    ${row("Grasa", d.f, CONFIG.fat, " g", "#b09bff")}
    <div class="ds-note">${Math.abs(diff)<=90
      ? "✓ Con las opciones y sustituciones de hoy quedas a "+Math.abs(diff)+" kcal del objetivo: dentro del margen."
      : (diff>0?"▲ Hoy vas "+diff+" kcal arriba del objetivo — revisa porciones o elige la opción más ligera de alguna comida.":"▼ Hoy vas "+(-diff)+" kcal abajo del objetivo — súbele a la porción de arroz o fruta.")}
      Se recalcula solo al cambiar opciones, equivalencias o etiquetas (Ajustes → 🍎 Alimentos).</div>`;
}
function updateRing(){
  const done=S.meals[dayKey], c=done.filter(Boolean).length;
  $("ringNum").textContent=c+"/"+MEALS.length;
  $("ringProg").style.strokeDashoffset = 270.2*(1-c/MEALS.length);
  if($("stMeals")) $("stMeals").textContent=c+"/"+MEALS.length;
}
$("meals").addEventListener("click",e=>{
  const det=e.target.closest("[data-detalle]");
  if(det){ abrirDetalle(det.dataset.detalle, +det.dataset.g, det.dataset.u || undefined); return; }
  const chk=e.target.closest(".check");
  if(chk){ const i=+chk.dataset.i; S.meals[dayKey][i]=!S.meals[dayKey][i]; save(); renderMeals();
    renderTargets(); renderAhora();  /* header y tarjeta "Ahora" al momento */
    avisar(S.meals[dayKey][i] ? "comida" : "deshacer");
    if(S.meals[dayKey].every(Boolean)) showToast("¡Completaste todas tus comidas! 🎉");
    else if(S.meals[dayKey][i]) showToast("Comida registrada ✓"); return; }
  const opt=e.target.closest("[data-opt]");
  if(opt){ S.mealOpt[+opt.dataset.meal]=opt.dataset.opt; save(); renderMeals(); renderTargets(); renderAhora(); }
});


/* nutrientes del cabello */
$("nutList").innerHTML = NUTRIENTES.map(n=>`
  <div class="nut"><span class="n-i">${n.e}</span>
    <span class="n-t"><b>${esc(n.n)}</b><small>${n.d}</small></span>
    <span class="ev ${n.ev.startsWith("alta")?"alta":n.ev==="cuidado"?"media":n.ev.startsWith("media")?"media":"baja"}">${esc(n.ev)}</span>
  </div>`).join("");

/* ============================================================
   MANDADO
   ============================================================ */
/* costo semanal de un alimento del mandado con su sustitución activa (o forzada) */
function shopItemCost(it, altIdx){
  const ai = (altIdx!==undefined) ? altIdx : (S.swaps[it.id]!==undefined?S.swaps[it.id]:-1);
  const key = nutKey(it.id, ai<0?undefined:ai);
  const f = factorOf(it.id, ai<0?undefined:ai);
  const n = nutOf(key);
  if(it.total===0) return 0;
  const qty = it.total * f;
  return (n.pz ? qty : qty/100) * (n.precio||0);
}
function weekCost(tier){
  return SHOP.reduce((t,it)=>{
    let ai;
    if(tier===undefined) ai = undefined;                       /* estado actual */
    else if(tier==="med") ai = -1;
    else ai = (TIER_DEF[it.id] && TIER_DEF[it.id][tier]!==undefined) ? TIER_DEF[it.id][tier] : -1;
    return t + shopItemCost(it, ai);
  }, 0);
}
function fmt$(v){ return "$"+Math.round(v).toLocaleString("es-MX"); }

/* ==================================================================
   REGISTRO DE COMPRA
   Un toque en la fila marca lo que ya surtiste y cobra el precio que
   la app ya estimaba. Sólo si el precio real difiere lo corriges, y
   ese precio se queda para la próxima semana (va a S.nutEdits, que es
   de donde sale el estimado). Así el estimado se afina solo.

   Estados por ítem:  0 pendiente · 1 comprado · 2 no lo encontré
   ================================================================== */
const COMPRA_PEND = 0, COMPRA_OK = 1, COMPRA_NO = 2;
let modoMandado = false;

function compraDe(semana){
  const k = semana || thisWeek;
  if(!S.compras[k]) S.compras[k] = { items:{}, cerrada:false };
  return S.compras[k];
}
function estadoItem(id, semana){
  const it = compraDe(semana).items[id];
  return it ? (it.e|0) : COMPRA_PEND;
}
function gastoItem(id, semana){
  const it = compraDe(semana).items[id];
  return (it && it.e===COMPRA_OK) ? (+it.$ || 0) : 0;
}
/* Ciclo de un solo control: pendiente → comprado → no había → pendiente.
   Al pasar a "comprado" se abre el submenú para capturar lo REAL. */
function ciclaItem(id){
  const c = compraDe(), it = shopById[id];
  if(!it) return;
  const actual = estadoItem(id);
  const siguiente = (actual + 1) % 3;
  if(siguiente === COMPRA_PEND) delete c.items[id];
  else if(siguiente === COMPRA_NO) c.items[id] = { e: COMPRA_NO, $: 0 };
  else c.items[id] = { e: COMPRA_OK, $: Math.round(shopItemCost(it)) };
  save();
  return siguiente;
}

/* ==================================================================
   SUBMENÚ DE COMPRA
   En el súper nunca compras exactamente lo que pide el plan: el paquete
   viene de 1 kg, la bolsa de 907 g, el pollo pesó 1.14 kg. Aquí se
   captura lo que DE VERDAD llevaste y a qué precio, y de ahí sale el
   gasto real y la tendencia de precios.

   Prioridad: que se pueda cerrar en UN toque si todo salió como el plan.
   ================================================================== */
let compraCtx = null;

/* último precio por unidad que registraste para este alimento */
function ultimoPrecio(id, unidad){
  const h = (S.precios && S.precios[id]) || [];
  const igual = h.filter(x=>x.u === unidad);
  const lista = igual.length ? igual : h;
  return lista.length ? lista[lista.length-1].pu : null;
}
/* cantidad objetivo de la semana, en la unidad de compra elegida */
function objetivoEn(it, n, unidad, factorU){
  const ai = S.swaps[it.id];
  const qty = it.total * factorOf(it.id, ai);      /* en unidad interna */
  if(n.pz) return qty / factorU;                   /* piezas → cartones, etc. */
  return (qty / 100) / factorU;                    /* 100 g → kilos, etc. */
}
function abrirCompra(id){
  const it = shopById[id]; if(!it || !it.total) return;
  const ai  = S.swaps[id];
  const key = nutKey(id, ai);
  const n   = nutOf(key);
  const unidades = priceUnits(it, n);
  const alt = selAlt(id);
  const nombre = alt ? alt.n : it.name;
  const prev = compraDe().items[id] || {};

  /* unidad por defecto: la que usaste la última vez, si no la primera */
  let ui = 0;
  if(prev.u){ const k = unidades.findIndex(u=>u[0]===prev.u); if(k>=0) ui = k; }
  else if(S.precios && S.precios[id] && S.precios[id].length){
    const u = S.precios[id][S.precios[id].length-1].u;
    const k = unidades.findIndex(x=>x[0]===u); if(k>=0) ui = k;
  }

  const obj = objetivoEn(it, n, unidades[ui][0], unidades[ui][1]);
  const cant = prev.q !== undefined ? prev.q : +obj.toFixed(2);
  const pu   = prev.pu !== undefined ? prev.pu
             : (ultimoPrecio(id, unidades[ui][0]) ?? +((n.precio||0) * unidades[ui][1]).toFixed(2));

  compraCtx = { id, key, unidades, n, it, ui, nuevaUnidad:false };

  openSheet("¿Cuánto llevaste?", nombre, `
    <div class="cp-obj">
      <span>Tu plan pide</span>
      <b id="cpObj">${fmtQty(it.total * factorOf(id, ai), (alt&&alt.unit)||it.unit)}</b>
      <em>si llevaste otra cosa, ajústalo abajo</em>
    </div>
    <div class="price-form">
      <div class="nf"><span>Unidad en que lo compraste</span>
        <div class="uni-chips" id="cpUnis"></div>
        <div class="uni-nueva" id="cpNueva" hidden>
          <div class="cp-fila">
            <label class="nf"><span>Cómo le dices</span>
              <input id="unNombre" type="text" maxlength="24" placeholder="lata, paquete, manojo…"></label>
            <label class="nf"><span>Equivale a</span>
              <input id="unCuanto" type="number" inputmode="decimal" step="any" min="0" placeholder="425"></label>
            <label class="nf" id="unMedidaBox"><span>&nbsp;</span>
              <select id="unMedida">${(n.pz
                ? [["pz","piezas"]]
                : it.unit==="ml" ? [["ml","ml"],["l","litros"]] : [["g","gramos"],["kg","kilos"]])
                .map(m=>`<option value="${m[0]}">${m[1]}</option>`).join("")}</select></label>
          </div>
          <button class="cp-rapido" id="unGuardar">Guardar esta unidad</button>
          <div class="nut-hint">Se guarda para este alimento: la próxima vez ya te aparece como opción y no la vuelves a escribir.</div>
        </div>
      </div>
      <div class="cp-fila">
        <label class="nf"><span>Cuánto llevaste</span>
          <input id="cpCant" type="number" inputmode="decimal" step="any" min="0" value="${numero(cant)}"></label>
        <label class="nf"><span>Precio por <b id="cpUniTxt">unidad</b></span>
          <input id="cpPu" type="number" inputmode="decimal" step="any" min="0" value="${+(+pu).toFixed(2)}"></label>
        <label class="nf"><span>o total pagado</span>
          <input id="cpTot" type="number" inputmode="decimal" step="any" min="0"></label>
      </div>
      <div class="cp-total">
        <span id="cpDesglose">—</span>
        <div class="pt-fig">Pagaste <b id="cpTotal">$0</b></div>
      </div>
      <div class="cp-aviso" id="cpAviso"></div>
      <div class="nf"><span>Dónde compraste</span>
        <div class="uni-chips" id="cpTiendas"></div>
        <small class="ui-d">Se guarda para todo el mandado de esta semana, no producto por producto.</small></div>
      <button class="cp-rapido" data-cpplan="1">Lo llevé tal cual el plan</button>
      <div class="nut-btns">
        <button class="nb-save" data-cpsave="1">Guardar con estos datos</button>
        <button class="nb-del" data-cpno="1">No lo encontré</button>
      </div>
      <div class="nut-hint">El precio se guarda con su fecha y su unidad: así la app aprende tus precios reales y puedes ver cómo suben o bajan en Historial → Dinero.</div>
    </div>`);
  pintaChipsUnidad();
  pintaChipsTienda();
  actualizaCompra();
  ["cpCant","cpPu"].forEach(k=>{
    const el = document.getElementById(k);
    if(el) el.addEventListener("input", ()=>actualizaCompra());
  });
  /* escribir el total recalcula el precio por unidad: en la tienda ves el
     ticket, no el precio por kilo. Se acabó la aritmética mental. */
  const tot = document.getElementById("cpTot");
  if(tot) tot.addEventListener("input", ()=>{
    const cant = numero(document.getElementById("cpCant").value);
    const t = numero(tot.value);
    if(cant > 0 && t >= 0) document.getElementById("cpPu").value = +(t/cant).toFixed(2);
    actualizaCompra(true);
  });
  const gu = document.getElementById("unGuardar");
  if(gu) gu.onclick = guardaUnidadNueva;
}

function pintaChipsUnidad(){
  if(!compraCtx) return;
  const caja = document.getElementById("cpUnis"); if(!caja) return;
  const { unidades, ui } = compraCtx;
  caja.innerHTML = unidades.map((u,i)=>
    `<button type="button" class="uni-chip${i===ui?" on":""}" data-uni="${i}">${esc(u[0])}</button>`).join("") +
    `<button type="button" class="uni-chip nueva" data-uninueva="1">＋ Otra…</button>`;
  const t = document.getElementById("cpUniTxt");
  if(t) t.textContent = unidades[ui] ? unidades[ui][0] : "unidad";
}

function pintaChipsTienda(){
  const caja = document.getElementById("cpTiendas"); if(!caja) return;
  const actual = compraDe().tienda || "";
  caja.innerHTML = tiendasUsadas().map(t=>
    `<button type="button" class="uni-chip${t===actual?" on":""}" data-tienda="${esc(t)}">${esc(t)}</button>`).join("") +
    `<button type="button" class="uni-chip nueva" data-tiendanueva="1">＋ Otra…</button>`;
}

/* Cambiar de unidad CONVIERTE la cantidad escrita en vez de borrarla.
   Antes te reemplazaba lo que tecleaste por el objetivo del plan. */
function eligeUnidad(i){
  if(!compraCtx) return;
  const { unidades, ui, it } = compraCtx;
  if(i === ui || !unidades[i]) return;
  const antes = { n:unidades[ui][0], f:unidades[ui][1] };
  const ahora = { n:unidades[i][0],  f:unidades[i][1] };
  const cantEl = document.getElementById("cpCant"), puEl = document.getElementById("cpPu");
  const totAntes = numero(cantEl.value) * numero(puEl.value);
  const nuevaCant = convierteCantidad(numero(cantEl.value), antes, ahora);
  compraCtx.ui = i;
  cantEl.value = nuevaCant;
  /* el total pagado no cambia porque cambies de unidad: sólo su reparto */
  if(nuevaCant > 0 && totAntes > 0) puEl.value = +(totAntes / nuevaCant).toFixed(2);
  else {
    const ult = ultimoPrecio(it.id, ahora.n);
    if(ult != null) puEl.value = +(+ult).toFixed(2);
  }
  pintaChipsUnidad();
  actualizaCompra();
}

function guardaUnidadNueva(){
  if(!compraCtx) return;
  const nom = document.getElementById("unNombre").value;
  const cua = document.getElementById("unCuanto").value;
  const med = document.getElementById("unMedida").value;
  if(!guardaUnidad(compraCtx.id, nom, cua, med)){
    showToast("Ponle nombre y cuánto equivale"); return;
  }
  const it = compraCtx.it, n = compraCtx.n;
  compraCtx.unidades = priceUnits(it, n);
  const i = compraCtx.unidades.findIndex(u=>u[0].toLowerCase() === String(nom).trim().toLowerCase().slice(0,24));
  document.getElementById("cpNueva").hidden = true;
  pintaChipsUnidad();
  if(i >= 0) eligeUnidad(i);
  showToast("📏 Unidad guardada ✓");
}
function actualizaCompra(vieneDelTotal){
  if(!compraCtx) return;
  const { it, n, unidades, ui } = compraCtx;
  const uni  = unidades[ui] || ["unidad", 1];
  const cant = numero(document.getElementById("cpCant").value);
  const pu   = numero(document.getElementById("cpPu").value);
  const total = cant * pu;
  document.getElementById("cpTotal").textContent = fmt$(total);
  document.getElementById("cpDesglose").textContent =
    `${numeroTxt(cant,3)} × ${fmt$(pu)} por ${uni[0]}`;
  /* el campo de total se rellena solo, salvo mientras lo estás escribiendo */
  const totEl = document.getElementById("cpTot");
  if(totEl && !vieneDelTotal && document.activeElement !== totEl)
    totEl.value = total ? +total.toFixed(2) : "";

  const av = document.getElementById("cpAviso");
  const partes = [];

  /* aviso si te alejaste mucho del objetivo: no bloquea, sólo informa */
  const obj = objetivoEn(it, n, uni[0], uni[1]);
  const dif = obj ? (cant - obj) / obj : 0;
  if(Math.abs(dif) >= 0.12) partes.push(`<span class="${dif>0?'mas':'menos'}">${
    dif>0 ? `Llevas ${Math.round(dif*100)} % más de lo que pide el plan — te va a sobrar.`
          : `Llevas ${Math.round(-dif*100)} % menos — puede que no alcance la semana.`}</span>`);

  /* precio fuera de tu propio rango: sólo aviso, el estimado no se toca */
  const at = precioAtipico(it.id, uni[0], pu);
  if(at) partes.push(`<span class="${at.pct>0?'mas':'menos'}">${
    at.pct>0 ? `Ese precio está ${at.pct} % arriba de tu mediana (${fmt$(at.mediana)} por ${esc(uni[0])}). ¿Seguro?`
             : `Está ${-at.pct} % abajo de tu mediana (${fmt$(at.mediana)}). Si no es oferta, revisa el dedazo.`}</span>`);

  av.innerHTML = partes.join("");
}
function guardarCompra(){
  if(!compraCtx) return;
  const { id, unidades, n, it, ui } = compraCtx;
  const cant = numero(document.getElementById("cpCant").value);
  const pu   = numero(document.getElementById("cpPu").value);
  const unidad = unidades[ui][0], factorU = unidades[ui][1];

  /* con centavos: redondear a pesos enteros desviaba la suma de la semana */
  compraDe().items[id] = { e: COMPRA_OK, $: +(cant*pu).toFixed(2), q: cant, u: unidad, pu };

  /* el precio real alimenta el estimado de las próximas semanas */
  if(pu > 0){
    const key = compraCtx.key;
    if(!S.nutEdits[key]) S.nutEdits[key] = {};
    S.nutEdits[key].precio = pu / factorU;
    /* y se guarda con fecha para la tendencia */
    if(!S.precios[id]) S.precios[id] = [];
    const h = S.precios[id], ult = h[h.length-1];
    if(ult && ult.d === dayKey && ult.u === unidad) ult.pu = pu;
    else h.push({ d: dayKey, pu, u: unidad });
    if(h.length > 200) h.splice(0, h.length-200);
  }
  save(); closeSheet(); renderShop(); renderHistorial();
  avisar("carrito");
  const r = resumenCompra();
  if(r.pendientes === 0) setTimeout(()=>{
    if(confirm(`Ya marcaste todo.\n\n${r.ok} productos · ${fmt$(r.gasto)}\n\n¿Cerrar el mandado de la semana?`)) cerrarMandado();
  }, 350);
}
function resumenCompra(semana){
  const c = compraDe(semana);
  let ok=0, no=0, gasto=0;
  const conPrecio = SHOP.filter(it=>it.total>0);
  conPrecio.forEach(it=>{
    const e = estadoItem(it.id, semana);
    if(e===COMPRA_OK){ ok++; gasto += gastoItem(it.id, semana); }
    else if(e===COMPRA_NO) no++;
  });
  return { ok, no, gasto, total:conPrecio.length,
           pendientes: conPrecio.length - ok - no, cerrada: !!c.cerrada };
}
/* semanas ya cerradas, de la más nueva a la más vieja */
/* Todo lo que marcaste cuenta como gasto, esté "cerrada" la semana o no.
   "Cerrar" sólo sirve para quitar la barra flotante y dar por terminado el
   mandado; NO es un requisito para que aparezca en Dinero. Antes sí lo era,
   y una semana sin cerrar se perdía para siempre. */
function historialCompras(){
  return Object.keys(S.compras)
    .filter(k=>{ const r = resumenCompra(k); return r.ok > 0; })
    .sort().reverse()
    .map(k=>Object.assign({semana:k}, resumenCompra(k)));
}
/* Al empezar una semana nueva, la anterior se cierra sola: si no, la barra
   flotante seguiría ahí para siempre pidiendo un botón que ya no aplica. */
function cierraSemanasViejas(){
  let cambio = false;
  Object.keys(S.compras).forEach(k=>{
    const c = S.compras[k];
    if(!c || c.cerrada || k >= thisWeek) return;
    if(resumenCompra(k).ok > 0){ c.cerrada = true; c.auto = true; cambio = true; }
    else delete S.compras[k];        /* semana sin nada marcado: no ensucia */
  });
  if(cambio) save();
}
function cerrarMandado(){
  const c = compraDe(), r = resumenCompra();
  if(!r.ok){ showToast("Marca al menos un producto antes de cerrar"); return; }
  c.cerrada = true; c.ts = Date.now(); c.total = r.gasto;
  save(); renderShop(); renderHistorial();
  avisar("mandado", [40,60,90]);
  showToast(`Mandado cerrado · ${fmt$(r.gasto)} en ${r.ok} productos ✓`);
}
function reabrirMandado(){
  const c = compraDe(); c.cerrada = false; save(); renderShop();
  showToast("Mandado reabierto");
}

function renderShop(){
  const groups={prot:[],carb:[],veg:[],fat:[]};
  SHOP.forEach(it=>groups[it.cat].push(it));
  const tot = weekCost();
  const r = resumenCompra();
  $("shopTotal").innerHTML = r.ok || r.no
    ? `<span class="st-l">Llevas surtido</span>
       <b>${fmt$(r.gasto)}</b>
       <small>${r.ok} de ${r.total} productos${r.no?` · ${r.no} no había`:""} · estimado ${fmt$(tot)}</small>`
    : `<span class="st-l">Mandado de la semana, como lo tienes ahora</span>
       <b>≈ ${fmt$(tot)}</b><small>toca un producto cuando lo eches al carrito</small>`;
  $("shopTotal").className = "shop-total" + (r.ok||r.no ? " surtiendo" : "");
  $("shopList").innerHTML = Object.entries(groups).map(([cat,items])=>`
    <div class="shop-cat" style="--cc:${tono(CATS[cat].c)}">
      <div class="shop-cat-h"><span class="sq"></span><h3>${CATS[cat].t}</h3></div>
      ${items.map(it=>{
        const a=selAlt(it.id), swapped=!!a;
        const qty = it.total===0 ? it.unit :
          a ? (a.totalTxt || fmtQty(it.total*factorOf(it.id, S.swaps[it.id]), a.unit||it.unit)) :
          (it.totalTxt || fmtQty(it.total,it.unit));
        const hasAlts=it.alts.length>0;
        const h = swapped ? (a.hair!==undefined?a.hair:null) : it.hair;
        const p = swapped ? (a.prep||it.prep) : it.prep;
        const sub = swapped ? ("en lugar de "+it.name+(a.note?" · "+a.note:"")) : "";
        const est = it.total ? estadoItem(it.id) : COMPRA_PEND;
        const clsE = est===COMPRA_OK ? " comprado" : est===COMPRA_NO ? " nohabia" : "";
        const gastado = est===COMPRA_OK ? gastoItem(it.id) : null;
        /* si capturaste una cantidad distinta a la del plan, manda la real */
        const reg = compraDe().items[it.id];
        const real = (reg && reg.e===COMPRA_OK && reg.q!==undefined)
          ? `${+(+reg.q).toFixed(2)} ${esc(reg.u)}` : null;
        return `<div class="shop-item${swapped?' swapped':''}${clsE}" data-id="${it.id}">
          <div class="shop-row" data-detalle="${esc(it.id)}" role="button" tabindex="0"
               aria-label="Ver detalle de ${esc(swapped?a.n:it.name)}">
            ${it.total?`<button class="sc-chk" data-comprar="${esc(it.id)}" aria-pressed="${est===COMPRA_OK}"
               aria-label="${est===COMPRA_OK?"Comprado":est===COMPRA_NO?"No lo encontré":"Marcar como comprado"}: ${esc(swapped?a.n:it.name)}">
               <span class="sc-box"></span></button>`:""}
            ${foodIcon(it, a)}
            <span class="nm"><b>${esc(swapped?a.n:it.name)}</b>
              ${swapped?`<small>equivalencia de ${esc(it.name)}</small>`:""}</span>
            <span class="qty">${real || qty}${it.total?`<small class="q-pr${gastado!=null?' pagado':''}">${gastado!=null?fmt$(gastado):"≈ "+fmt$(shopItemCost(it))}</small>`:""}</span>
            <span class="row-mas" aria-hidden="true">›</span>
          </div>
        </div>`;
      }).join("")}
    </div>`).join("");
  renderBarraMandado();
}

/* Barra fija mientras surtes: avance, gasto y cierre. Es lo único que
   necesitas ver con el carrito en la mano. */
function renderBarraMandado(){
  let bar = document.getElementById("mandadoBar");
  const r = resumenCompra();
  /* La barra es de la pestaña Mandado y de nadie más. Antes se colgaba del
     body y seguía ahí en Snacks, Rutina e Historial. */
  const enMandado = document.body.dataset.tab === "mandado";
  const activa = enMandado && (r.ok || r.no) && !r.cerrada;
  if(!activa){ if(bar) bar.remove(); document.body.classList.remove("con-barra"); return; }
  if(!bar){
    bar = document.createElement("div");
    bar.id = "mandadoBar"; bar.className = "mandado-bar";
    document.body.appendChild(bar);
    bar.addEventListener("click", ev=>{
      if(ev.target.closest("[data-cerrarmandado]")) cerrarMandado();
      if(ev.target.closest("[data-modomandado]")) toggleModoMandado();
    });
  }
  document.body.classList.add("con-barra");
  const pct = r.total ? Math.round((r.ok+r.no)/r.total*100) : 0;
  bar.innerHTML = `
    <div class="mb-prog"><i style="width:${pct}%"></i></div>
    <div class="mb-row">
      <div class="mb-txt"><b>${fmt$(r.gasto)}</b><span>${r.ok} de ${r.total}${r.pendientes?` · faltan ${r.pendientes}`:""}</span></div>
      <button class="mb-modo" data-modomandado="1" aria-pressed="${modoMandado}">${modoMandado?"Salir":"Modo súper"}</button>
      <button class="mb-cerrar" data-cerrarmandado="1">Cerrar</button>
    </div>`;
}
function toggleModoMandado(){
  modoMandado = !modoMandado;
  document.body.classList.toggle("modo-mandado", modoMandado);
  renderBarraMandado();
  if(modoMandado){
    showToast("Modo súper: filas grandes, sin distracciones");
    window.scrollTo({top:0, behavior:"smooth"});
  }
}

/* ==================================================================
   DETALLE DE UN ALIMENTO
   La fila queda en una línea y todo lo demás vive aquí: imagen grande,
   macros REALES (calculados con tu motor, no fijos), costo por unidad y
   el contexto de compra. Mismo componente para el Mandado y para Hoy.
   ================================================================== */
let detalleCtx = null;   /* {id, gramos, unidad} */

function detalleHtml(id, gramos, unidadOv){
  const it = shopById[id]; if(!it) return "";
  const alt = selAlt(id), ai = S.swaps[id];
  const key = nutKey(id, ai);
  const n   = nutOf(key);
  const f   = factorOf(id, ai);
  const nombre = alt ? alt.n : it.name;

  /* cantidad de referencia: la del platillo si viene de Hoy, si no la semanal */
  const base  = gramos !== undefined ? gramos : it.total;
  const qty   = base * f;
  const unidad = (alt && alt.unit) || unidadOv || it.unit;
  const m = macrosOf(key, qty);

  const porTxt = esc(n.pz ? `por ${n.pzTxt||"pieza"}` : (it.unit==="ml" ? "por 100 ml" : "por 100 g"));
  const precioUnit = n.precio ? fmt$(n.precio) + " " + porTxt : null;
  const costo = qty ? (n.pz ? qty : qty/100) * (n.precio||0) : 0;

  const macro = (v,l,c)=>`<div class="dt-m" style="--dc:${c}">
    <b>${Math.round(v)}<em>${l==="kcal"?"":" g"}</em></b><span>${l}</span></div>`;

  const h = alt ? (alt.hair!==undefined?alt.hair:null) : it.hair;
  const p = alt ? (alt.prep||it.prep) : it.prep;

  return `
  <div class="dt-top">
    ${foodIcon(it, alt)}
    <div class="dt-ti">
      <b>${esc(nombre)}</b>
      ${alt?`<small>equivalencia de ${esc(it.name)}</small>`:""}
      <span class="badges">${hairBadge(h)}${prepBadge(p)}</span>
    </div>
    <div class="dt-q"><b>${fmtQty(qty, unidad)}</b>
      <span>${gramos!==undefined ? "en este platillo" : (it.dur?esc(it.dur):"a la semana")}</span></div>
  </div>

  <div class="dt-macros">
    ${macro(m.kcal,"kcal","var(--coral)")}
    ${macro(m.p,"proteína","var(--em)")}
    ${macro(m.c,"carbos","var(--amber)")}
    ${macro(m.f,"grasa","var(--violet)")}
  </div>

  <div class="dt-fila">
    <span class="dt-l">Etiqueta</span>
    <span class="dt-v">${Math.round(n.kcal)} kcal · ${fmtN(n.p)}P / ${fmtN(n.c)}C / ${fmtN(n.f)}G <em>${porTxt}</em></span>
  </div>
  ${precioUnit?`<div class="dt-fila">
    <span class="dt-l">Precio</span>
    <span class="dt-v">${precioUnit}${costo?` <em>≈ ${fmt$(costo)} en total</em>`:""}</span>
  </div>`:""}

  ${alt && alt.note?`<div class="dt-nota">${esc(alt.note)}</div>`:""}
  ${(!alt && it.tip)?`<div class="dt-nota">${it.tip}</div>`:""}

  <div class="dt-btns">
    ${it.total?`<button class="dt-b dt-precio" data-dtprecio="${esc(id)}">Cambiar precio</button>`:""}
    ${it.alts.length?`<button class="dt-b dt-swap" data-dtswap="${esc(id)}">${alt?"Otra equivalencia":"Equivalencias"} · ${it.alts.length}</button>`:""}
  </div>`;
}

function abrirDetalle(id, gramos, unidadOv){
  const it = shopById[id]; if(!it) return;
  detalleCtx = { id, gramos, unidad: unidadOv };
  const alt = selAlt(id);
  openSheet(alt ? alt.n : it.name,
            alt ? "equivalencia · toca para ver o cambiar" : "información nutricional y de compra",
            detalleHtml(id, gramos, unidadOv));
}
/* ==================================================================
   HOJAS DE REFERENCIA
   "Compra inteligente" (28 consejos, ~750 palabras) y "Prep del domingo"
   se leen de vez en cuando, no cada semana. Ocupaban media pestaña.
   Ahora viven en hojas: el contenido se MUEVE (no se clona) para que
   conserve sus listeners.
   ================================================================== */
let refAbierta = null;
const REFS = {
  smart: { id:"refSmart", t:"Compra inteligente",
           s:"Precios de Monterrey · lo que importa es la proporción" },
  prep:  { id:"refPrep",  t:"Prep del domingo",
           s:"35 minutos, una vez por semana" }
};
function abrirReferencia(clave){
  const def = REFS[clave]; if(!def) return;
  const nodo = document.getElementById(def.id); if(!nodo) return;
  openSheet(def.t, def.s, "");
  nodo.hidden = false;
  document.getElementById("sheetBody").appendChild(nodo);
  refAbierta = def.id;
}
/* al cerrar, el contenido vuelve a su sitio oculto dentro de la pestaña */
function devuelveReferencia(){
  if(!refAbierta) return;
  const nodo = document.getElementById(refAbierta);
  const destino = document.getElementById("tab-mandado");
  if(nodo && destino){ nodo.hidden = true; destino.appendChild(nodo); }
  refAbierta = null;
}
document.addEventListener("click", e=>{
  const b = e.target.closest("[data-ref]");
  if(b) abrirReferencia(b.dataset.ref);
});

/* ---------- Submenú de precio (desde el mandado) ---------- */
/* unidades disponibles según cómo se mide el alimento; k = cuántas
   "bases internas" (100 g / 100 ml / pieza) caben en esa unidad */
/* ==================================================================
   UNIDADES DE COMPRA
   ------------------------------------------------------------------
   Antes esto devolvía una lista fija y corta: para casi todos los
   alimentos por pieza había UNA sola opción, así que el selector
   no se podía cambiar y las cantidades registradas eran "cercanas
   pero falsas". Ahora la lista base se puede ampliar con unidades
   propias por alimento ("lata" = 425 g), que se guardan y vuelven
   a aparecer como opción la próxima vez.

   El factor `f` está en UNIDAD INTERNA: 100 g / 100 ml para lo que
   se pesa (kilo = 10) y piezas para lo que se cuenta.
   Los nombres se guardan SIN escapar: el escape va al pintar.
   ================================================================== */
function unidadesBase(it, n){
  if(n.pz){
    const u = [{ n: n.pzTxt || "pieza", f: 1 }];
    if(it.id==="huevos")    u.push({n:"cartón (30 pzas)", f:30});
    if(it.id==="tortillas") u.push({n:"kilo (≈30 pzas)",  f:30});
    if(it.id==="galletas")  u.push({n:"caja (6 paquetes)",f:6});
    u.push({ n:"docena", f:12 });
    return u;
  }
  if(it.unit==="ml") return [{n:"litro",f:10},{n:"100 ml",f:1},{n:"botella de 600 ml",f:6}];
  return [{n:"kilo",f:10},{n:"100 g",f:1},{n:"250 g",f:2.5},{n:"bolsa de 500 g",f:5}];
}

/* base + las tuyas, sin repetir nombres */
function unidadesDe(id){
  const it = shopById[id]; if(!it) return [];
  const n = nutOf(nutKey(id, S.swaps[id]));
  const base = unidadesBase(it, n);
  const propias = (S.unidades && Array.isArray(S.unidades[id])) ? S.unidades[id] : [];
  const vistas = new Set(base.map(u=>u.n.toLowerCase()));
  const out = base.slice();
  propias.forEach(u=>{
    if(!u || typeof u.n !== "string") return;
    const k = u.n.toLowerCase();
    if(vistas.has(k)) return;
    vistas.add(k); out.push({ n:u.n, f:numero(u.f) });
  });
  return out.filter(u=>u.n && Number.isFinite(u.f) && u.f > 0);
}

/* Guarda "una lata son 425 g" como factor reutilizable.
   medida: "g" | "ml" | "kg" | "l" | "pz" */
function guardaUnidad(id, nombre, cuanto, medida){
  const it = shopById[id]; if(!it) return false;
  const txt = String(nombre == null ? "" : nombre).trim().slice(0, 24);
  if(!txt) return false;
  const c = numero(cuanto);
  if(!(c > 0)) return false;
  const n = nutOf(nutKey(id, S.swaps[id]));
  let f;
  if(n.pz)                       f = c;              /* piezas por paquete */
  else if(medida === "kg" || medida === "l") f = c * 10;   /* 1 kg = 10 × 100 g */
  else                           f = c / 100;        /* gramos o ml → 100 g/ml */
  if(!(f > 0) || !Number.isFinite(f)) return false;
  if(!S.unidades || typeof S.unidades !== "object") S.unidades = {};
  if(!Array.isArray(S.unidades[id])) S.unidades[id] = [];
  const lista = S.unidades[id];
  const i = lista.findIndex(u => u && String(u.n).toLowerCase() === txt.toLowerCase());
  if(i >= 0) lista[i] = { n:txt, f };
  else lista.push({ n:txt, f });
  if(lista.length > 12) lista.splice(0, lista.length-12);
  save();
  return true;
}

/* Cambiar de unidad CONVIERTE lo que ya escribiste. Antes lo borraba y
   lo reemplazaba por el objetivo del plan: si tecleabas la cantidad real
   y luego cambiabas de unidad, perdías el dato. */
function convierteCantidad(cant, desde, hacia){
  const c = numero(cant);
  const fa = desde && numero(desde.f), fb = hacia && numero(hacia.f);
  if(!(fa > 0) || !(fb > 0)) return c;
  return +(c * fa / fb).toFixed(4);
}

/* mediana del precio por unidad de las últimas capturas, comparando
   sólo contra la MISMA unidad (peras con peras) */
function medianaPrecio(id, unidad, cuantas){
  const h = (S.precios && Array.isArray(S.precios[id])) ? S.precios[id] : [];
  const v = h.filter(x=>x && x.u === unidad && numero(x.pu) > 0)
             .slice(-(cuantas || 8)).map(x=>numero(x.pu)).sort((a,b)=>a-b);
  if(!v.length) return null;
  const m = Math.floor(v.length/2);
  return v.length % 2 ? v[m] : (v[m-1] + v[m]) / 2;
}

/* Aviso, NO corrección: el estimado sigue usando la última compra, como
   pediste. Esto sólo te enseña cuándo esa última compra se salió del
   rango, para que decidas tú. */
function precioAtipico(id, unidad, pu, umbral){
  const med = medianaPrecio(id, unidad);
  const p = numero(pu);
  const h = (S.precios && Array.isArray(S.precios[id])) ? S.precios[id] : [];
  const cuentan = h.filter(x=>x && x.u === unidad && numero(x.pu) > 0).length;
  if(!med || p <= 0 || cuentan < 3) return null;      /* sin historia, sin opinión */
  const pct = (p - med) / med * 100;
  const lim = umbral === undefined ? 25 : umbral;
  if(Math.abs(pct) < lim) return null;
  return { pct: Math.round(pct), mediana: med, muestras: cuentan };
}

const TIENDAS_DEF = ["Supermercado","Tiendita","Mercado","Mayoreo"];
function tiendasUsadas(){
  const t = Array.isArray(S.tiendas) ? S.tiendas.filter(x=>typeof x==="string" && x.trim()) : [];
  const vistas = new Set(t.map(x=>x.toLowerCase()));
  return t.concat(TIENDAS_DEF.filter(d=>!vistas.has(d.toLowerCase()))).slice(0, 8);
}
function recuerdaTienda(nombre){
  const t = String(nombre||"").trim().slice(0,40);
  if(!t) return;
  if(!Array.isArray(S.tiendas)) S.tiendas = [];
  const i = S.tiendas.findIndex(x=>String(x).toLowerCase()===t.toLowerCase());
  if(i >= 0) S.tiendas.splice(i,1);
  S.tiendas.unshift(t);                       /* la más reciente, primero */
  if(S.tiendas.length > 8) S.tiendas.length = 8;
}

/* compatibilidad: el resto del código sigue pidiendo pares [nombre, factor] */
function priceUnits(it, n){
  return unidadesDe(it.id).map(u=>[u.n, u.f]);
}
let priceCtx = null; /* {id, key, qty, units} */
function openPriceSheet(id){
  const it = shopById[id]; if(!it || !it.total) return;
  const ai = S.swaps[id]!==undefined ? S.swaps[id] : -1;
  const key = nutKey(id, ai<0?undefined:ai);
  const n = nutOf(key);
  const f = factorOf(id, ai<0?undefined:ai);
  const qty = it.total * f;                      /* cantidad semanal en su unidad propia */
  const units = priceUnits(it, n);
  const name = ai<0 ? it.name : it.alts[ai].n;
  priceCtx = { id, key, qty, units, pz:!!n.pz };
  const curUnit = 0;
  const curPrice = (n.precio||0) * units[curUnit][1];
  const qtyTxt = n.pz ? Math.round(qty)+" "+esc(n.pzTxt||"pieza")+(Math.round(qty)===1?"":"s")
                      : fmtQty(qty, it.unit);
  openSheet("Precio de "+name, "Lo que pagas en TU tienda", `
    <div class="price-form">
      <label class="nf"><span>Unidad en que lo compras</span>
        <select id="prUnit">${units.map((u,i)=>`<option value="${i}">${u[0]}</option>`).join("")}</select></label>
      <label class="nf"><span>Precio por esa unidad ($)</span>
        <input id="prVal" type="number" inputmode="decimal" step="any" min="0" value="${+curPrice.toFixed(2)}"></label>
      <div class="price-total">
        <span>Esta semana necesitas <b>${qtyTxt}</b></span>
        <div class="pt-fig">≈ <b id="prTotal">${fmt$(shopItemCost(it))}</b><small>total del producto</small></div>
      </div>
      <div class="nut-btns">
        <button class="nb-save" data-prsave="1">Guardar precio</button>
        ${S.nutEdits[key] && S.nutEdits[key].precio!==undefined?`<button class="nb-reset" data-prreset="1">Restaurar estimado</button>`:""}
      </div>
      <div class="nut-hint">El total se calcula solo: precio ÷ unidad × lo que pide tu plan. Si este alimento está sustituido, editas el precio del producto que realmente compras. También puedes editarlo en Ajustes → 🍎 Alimentos.</div>
    </div>`);
  const upd = ()=>{
    const ui=+document.getElementById("prUnit").value, v=+document.getElementById("prVal").value||0;
    const per = v / priceCtx.units[ui][1];       /* a base interna */
    const tot = (priceCtx.pz ? priceCtx.qty : priceCtx.qty/100) * per;
    document.getElementById("prTotal").textContent = fmt$(tot);
  };
  document.getElementById("prUnit").addEventListener("change", upd);
  document.getElementById("prVal").addEventListener("input", upd);
}

/* submenú de equivalencias de un alimento */
function openAltsSheet(id){
  const it=shopById[id]; if(!it || !it.alts.length) return;
  const curIdx = (S.swaps[id]===undefined) ? -1 : S.swaps[id];
  const optBtn = (name, note, hair, prep, qty, idx, tag)=>`
    <button class="alt${curIdx===idx?' on':''}" data-pick="${esc(id)}" data-alt="${esc(idx)}">
      <span class="a-nm">${tag?`<span class="v-top">★ ${tag}</span>`:""}${esc(name)}${note?`<small>${esc(note)}</small>`:""}
        <span class="badges">${hairBadge(hair)}${prepBadge(prep)}</span></span>
      <span class="a-q">${qty}<em class="a-pr">≈ ${fmt$(shopItemCost(it, idx))}</em></span>
    </button>`;
  let html = `<div class="sheet-list">`;
  html += optBtn(it.name, "opción original del plan", it.hair, it.prep,
                 it.total===0?it.unit:(it.totalTxt||fmtQty(it.total,it.unit)), -1, "EL PLAN");
  html += it.alts.map((al,j)=>optBtn(al.n, al.note, al.hair, al.prep||it.prep,
                 al.totalTxt||fmtQty(it.total*factorOf(it.id, j), al.unit||it.unit), j)).join("");
  html += `</div><div class="sheet-note">La cantidad ya viene ajustada para cubrir los mismos macros.<br>Al elegir, el mandado y tus platillos del día se actualizan solos.</div>`;
  openSheet("Cambiar alimento", it.alts.length+" equivalencias · mismos macros", html);
}
$("shopList").addEventListener("click",e=>{
  const pb=e.target.closest("[data-price]");
  if(pb){ openPriceSheet(pb.dataset.price); return; }
  const open=e.target.closest("[data-open]");
  if(open){ openAltsSheet(open.dataset.open); return; }
  /* El check siempre abre la captura de compra. La fila abre la ficha en
     modo normal y también la captura en Modo súper: registrar lo real es
     el punto, y en el súper es justo cuando lo sabes. La velocidad la da
     el botón "Tal cual el plan", no saltarse el paso. */
  const chk = e.target.closest("[data-comprar]");
  const fila = e.target.closest("[data-detalle]");
  if(!chk && fila && !modoMandado){ abrirDetalle(fila.dataset.detalle); return; }
  const id = chk ? chk.dataset.comprar : (fila ? fila.dataset.detalle : null);
  if(id && shopById[id] && shopById[id].total){
    const est = estadoItem(id);
    if(est === COMPRA_PEND){
      /* pendiente → se abre el submenú para capturar cantidad y precio reales */
      abrirCompra(id);
      return;
    }
    /* ya estaba marcado: el toque avanza el ciclo sin preguntar nada */
    const nuevo = ciclaItem(id);
    renderShop();
    if(nuevo === COMPRA_NO) showToast("Marcado como «no había»");
    else showToast("Desmarcado");
  }
});
$("tierBar").addEventListener("click",e=>{
  const b=e.target.closest("[data-tier]"); if(!b) return;
  applyTier(b.dataset.tier);
});
/* acciones dentro del submenú (equivalencias y variantes de ejercicio) */
document.getElementById("cfgPanel").addEventListener("click",e=>{
  const gt=e.target.closest("[data-geartab]");
  if(gt){ gearTab=gt.dataset.geartab; renderGearSheet(); return; }
  const un=e.target.closest("[data-unit]");
  if(un){ S.unidad=un.dataset.unit; save(); renderUnitToggle(); renderRoutine(); renderGearSheet();
    showToast("Pesos en "+(S.unidad==="lb"?"libras":"kilogramos")+" ✓"); return; }
  const seg=e.target.closest(".ui-seg [data-ui]");
  if(seg){ if(!S.ui) S.ui={}; S.ui[seg.dataset.ui]=seg.dataset.v; save(); applyUI();
    /* cambiar la vista de la rutina tiene que repintarla, no sólo Ajustes */
    if(seg.dataset.ui==="vistaRutina"){ exAbiertos.clear(); renderRoutine(); }
    renderGearSheet(); return; }
  const idel=e.target.closest("[data-imgdel]");
  if(idel){ delete CIMG[idel.dataset.imgdel]; saveImgs(); refreshAfterImg();
    showToast("Imagen original restaurada ✓"); return; }

  /* --- Nutrición --- */
  const no=e.target.closest("[data-nutopen]");
  if(no){ nutOpen = (nutOpen===no.dataset.nutopen)?null:no.dataset.nutopen;
    document.getElementById("nutRows").innerHTML = nutRowsHtml(); return; }
  const ns=e.target.closest("[data-nutsave]");
  if(ns){ const k=ns.dataset.nutsave, row=ns.closest(".nut-row"), vals={};
    row.querySelectorAll("[data-nf]").forEach(inp=>{ const v=parseFloat(inp.value); if(!isNaN(v)) vals[inp.dataset.nf]=v; });
    S.nutEdits[k]=vals; save(); nutOpen=null; refreshAfterNut();
    showToast("🍽 Guardado · dieta y mandado recalculados"); return; }
  const nr=e.target.closest("[data-nutreset]");
  if(nr){ delete S.nutEdits[nr.dataset.nutreset]; save(); refreshAfterNut();
    showToast("Valores originales restaurados ✓"); return; }
  const nd=e.target.closest("[data-nutdel]");
  if(nd){ const cid=nd.dataset.nutdel.replace("custom:","");
    S.customFoods = S.customFoods.filter(c=>c.id!==cid);
    delete S.nutEdits[nd.dataset.nutdel];
    SHOP.forEach(b=>{ b.alts = b.alts.filter(a=>a.customId!==cid); });
    Object.keys(S.swaps).forEach(id=>{ const b=shopById[id];
      if(b && !b.alts[S.swaps[id]]) delete S.swaps[id]; });
    save(); nutOpen=null; refreshAfterNut();
    showToast("Alimento eliminado"); return; }
  const nao=e.target.closest("[data-nutaddopen]");
  if(nao){ nutAdd=!nutAdd; renderGearSheet(); return; }
  const nac=e.target.closest("[data-nutaddcancel]");
  if(nac){ nutAdd=false; renderGearSheet(); return; }
  const na=e.target.closest("[data-nutadd]");
  if(na){ const form=na.closest(".nut-form"), get=k=>form.querySelector('[data-nf="'+k+'"]');
    const name=get("n").value.trim();
    if(!name){ showToast("Ponle nombre al alimento"); return; }
    const cf={ id:"cf"+Date.now().toString(36), base:get("base").value, n:name,
      pz:get("pz").checked, pzTxt:"pieza",
      kcal:+get("kcal").value||0, p:+get("p").value||0, c:+get("c").value||0,
      f:+get("f").value||0, precio:+get("precio").value||0 };
    if(!cf.kcal && !cf.p && !cf.c && !cf.f){ showToast("Captura al menos un valor de la etiqueta"); return; }
    S.customFoods.push(cf); save(); nutAdd=false; refreshAfterNut(); renderGearSheet();
    showToast("➕ "+name+" agregado como equivalencia"); return; }

  /* --- Ajustes: datos de la persona --- */
  const cs=e.target.closest("[data-psave]");
  if(cs){ const body=document.getElementById("cfgPanel"); if(!S.persona) S.persona={};
    body.querySelectorAll("[data-per]").forEach(inp=>{
      const k=inp.dataset.per;
      let v = inp.tagName==="SELECT" ? inp.value : parseFloat(inp.value);
      if(k==="act") v=parseFloat(v);
      if(inp.tagName!=="SELECT" && isNaN(v)) return;
      S.persona[k]=v;
    });
    save(); applyPersona(); renderTargets(); renderMeals(); renderShop(); renderRoutine(); renderBody(); renderGearSheet();
    showToast("🎯 Datos guardados · dieta recalculada"); return; }
  const cr=e.target.closest("[data-preset]");
  if(cr){ delete S.persona; save(); applyPersona();
    renderTargets(); renderMeals(); renderShop(); renderRoutine(); renderBody(); renderGearSheet();
    showToast("Valores originales restaurados ✓"); return; }
  const be=e.target.closest("[data-bkexport]");
  if(be){ exportBackup(); return; }
  const pc=e.target.closest("[data-precache]");
  if(pc){ descargarImagenes(); return; }

});
document.getElementById("sheetBody").addEventListener("click",e=>{
  /* --- unidades: chips, y la de "otra…" --- */
  const uc = e.target.closest("[data-uni]");
  if(uc){ eligeUnidad(+uc.dataset.uni); return; }
  const un = e.target.closest("[data-uninueva]");
  if(un){ const c = document.getElementById("cpNueva");
    if(c){ c.hidden = !c.hidden; if(!c.hidden) document.getElementById("unNombre").focus(); }
    return; }
  /* --- tienda del mandado: se elige una vez y aplica a toda la semana --- */
  const tc = e.target.closest("[data-tienda]");
  if(tc){ compraDe().tienda = tc.dataset.tienda; recuerdaTienda(tc.dataset.tienda);
          save(); pintaChipsTienda(); return; }
  const tn = e.target.closest("[data-tiendanueva]");
  if(tn){ const nom = prompt("¿Dónde compraste?");
    if(nom && nom.trim()){ compraDe().tienda = nom.trim().slice(0,40);
      recuerdaTienda(compraDe().tienda); save(); pintaChipsTienda(); }
    return; }

  const cp=e.target.closest("[data-cpplan]");
  if(cp && compraCtx){
    /* un toque: cantidad objetivo y el precio que ya trae precargado */
    const { it, n, unidades, ui } = compraCtx;
    document.getElementById("cpCant").value =
      +objetivoEn(it, n, unidades[ui][0], unidades[ui][1]).toFixed(2);
    guardarCompra(); return; }
  const cs=e.target.closest("[data-cpsave]");
  if(cs){ guardarCompra(); return; }
  const cn=e.target.closest("[data-cpno]");
  if(cn && compraCtx){
    compraDe().items[compraCtx.id] = { e: COMPRA_NO, $: 0 };
    save(); closeSheet(); renderShop(); renderHistorial();
    showToast("Marcado como «no había»"); return; }
  const dp=e.target.closest("[data-dtprecio]");
  if(dp){ openPriceSheet(dp.dataset.dtprecio); return; }
  const ds=e.target.closest("[data-dtswap]");
  if(ds){ openAltsSheet(ds.dataset.dtswap); return; }
  const ps=e.target.closest("[data-prsave]");
  if(ps && priceCtx){
    const ui=+document.getElementById("prUnit").value, v=+document.getElementById("prVal").value||0;
    if(!S.nutEdits[priceCtx.key]) S.nutEdits[priceCtx.key]={};
    S.nutEdits[priceCtx.key].precio = v / priceCtx.units[ui][1];
    /* si ya lo habías marcado como comprado, el gasto de esta semana se
       corrige con el precio real que acabas de poner */
    const c = compraDe();
    if(c.items[priceCtx.id] && c.items[priceCtx.id].e===COMPRA_OK)
      c.items[priceCtx.id].$ = Math.round(shopItemCost(shopById[priceCtx.id]));
    const volverP = detalleCtx;
    save(); closeSheet(); refreshAfterNut(); renderHistorial();
    if(volverP) setTimeout(()=>abrirDetalle(volverP.id, volverP.gramos, volverP.unidad), 120);
    showToast("Precio guardado · se queda para las próximas semanas ✓"); return; }
  const pr=e.target.closest("[data-prreset]");
  if(pr && priceCtx){
    if(S.nutEdits[priceCtx.key]){ delete S.nutEdits[priceCtx.key].precio;
      if(!Object.keys(S.nutEdits[priceCtx.key]).length) delete S.nutEdits[priceCtx.key]; }
    save(); closeSheet(); refreshAfterNut();
    showToast("Precio estimado restaurado ✓"); return; }
  const pick=e.target.closest("[data-pick]");
  if(pick){ const id=pick.dataset.pick, j=+pick.dataset.alt;
    if(j<0) delete S.swaps[id]; else S.swaps[id]=j;
    save(); renderShop(); renderMeals(); renderTargets();
    /* si veníamos del detalle, volvemos a él ya actualizado en vez de
       cerrar todo: se puede comparar equivalencias sin salir */
    const volver = detalleCtx;
    closeSheet();
    if(volver && volver.id === id){
      setTimeout(()=>abrirDetalle(volver.id, volver.gramos, volver.unidad), 120);
    }
    showToast(j<0?"Volviste a la opción original ✓":"Mandado y platillos actualizados 🔄");
    return; }
  const pv=e.target.closest("[data-pickvar]");
  if(pv){ S.varSel[pv.dataset.pickvar]=+pv.dataset.vi;
    save(); renderRoutine(); closeSheet();
    showToast("Variante cambiada · el peso se guarda por separado 🔄"); }
});

/* compra inteligente */
$("smartList").innerHTML = COMPRA.map(g=>`
  <div class="smart-group" id="sg-${g.id}">
    <div class="smart-head" data-sg="${esc(g.id)}" role="button" tabindex="0">
      <span class="si">${g.e}</span>
      <span class="st"><b>${esc(g.t)}</b><small>${esc(g.sub)}</small></span>
      <span class="sv">${esc(g.save)}</span>
      <svg class="caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </div>
    <div class="smart-body"><div class="sb-in">${g.items.map(it=>`
      <div class="smart-item">
        <div class="si-top"><b>${esc(it.n)}</b><span class="save">${esc(it.save)}</span></div>
        <p>${it.p}</p>
        <div class="metrics">${it.m.map(([c,t])=>`<span class="metric ${c}">${esc(t)}</span>`).join("")}</div>
      </div>`).join("")}</div>
    </div>
  </div>`).join("");
$("smartList").addEventListener("click",e=>{
  const h=e.target.closest("[data-sg]"); if(!h) return;
  $("sg-"+h.dataset.sg).classList.toggle("open");
});
$("prepSteps").innerHTML = PREP_STEPS.map((s,i)=>`<div class="prep-step"><span class="n">${i+1}</span><span>${esc(s)}</span></div>`).join("");

/* ============================================================
   RUTINA — semana fija 3-1-2-1 y selector de días
   ============================================================ */
function weekOfMonth(d){ const f=new Date(d.getFullYear(),d.getMonth(),1); const o=(f.getDay()+6)%7;
  return Math.floor((d.getDate()-1+o)/7)+1; }
function weeksInMonth(y,m){ const f=new Date(y,m,1); const o=(f.getDay()+6)%7;
  return Math.ceil((new Date(y,m+1,0).getDate()+o)/7); }
/* Fases del mes: 0 Arranque · 1 Carga · 2 Alta intensidad · 3 DESCARGA.
   La descarga es SIEMPRE la última semana y sólo esa. Antes, en los meses de
   6 semanas, las semanas 5 y 6 caían las dos en descarga: dos semanas
   seguidas al 62 %. Ahora las de en medio reparten Carga. */
function cycleIndexFor(w,tot){
  if(w >= tot)    return 3;   /* última semana: descarga, siempre y sólo ella */
  if(w <= 1)      return 0;   /* primera: arranque */
  if(w === tot-1) return 2;   /* penúltima: alta intensidad */
  return 1;                   /* todo lo de en medio: carga */
}
/* La fase se calcula con el LUNES de la semana de entrenamiento, no con el día
   suelto. Si no, el lunes 31 de agosto era descarga y el martes 1 de septiembre
   arranque: dos fases distintas dentro de la misma semana de entrenamiento. */
function faseDe(key){
  const lunes = fromKey(weekKey(fromKey(key)));
  const tot = weeksInMonth(lunes.getFullYear(), lunes.getMonth());
  const w = weekOfMonth(lunes);
  return {idx:cycleIndexFor(w,tot), w, tot};
}

function bloqueDe(key){ return BLOQUES[ PLAN_SEMANAL[fromKey(key).getDay()] ]; }

let viewKey = dayKey;          // día que se está viendo en la pestaña Rutina
let weekOffset = 0;            // 0 = semana actual

function getVarIdx(exId){ const i=S.varSel[exId]; return (i===undefined)?0:i; }
function getVar(ex){ return ex.v[Math.min(getVarIdx(ex.id), ex.v.length-1)]; }
function liftKey(ex){ return ex.id+"|"+getVarIdx(ex.id); }
/* Historial de cargas: antes sólo se guardaba el ÚLTIMO peso, así que no
   había forma de ver si el press subió en tres meses. Un registro por
   día y variante: barato de guardar y suficiente para graficar. */
function guardarCarga(ex, kg){
  const k = liftKey(ex);
  if(!S.liftHist[k]) S.liftHist[k] = [];
  const h = S.liftHist[k];
  const ultimo = h[h.length-1];
  if(ultimo && ultimo.d === dayKey) ultimo.kg = kg;      /* mismo día: se corrige */
  else h.push({ d: dayKey, kg });
  if(h.length > 400) h.splice(0, h.length-400);          /* tope sano */
}
function getW(ex){ const k=liftKey(ex); const v=getVar(ex);
  return S.lifts[k]!==undefined ? S.lifts[k] : v.base; }
function roundP(v){ return Math.round(v/2.5)*2.5; }

const KG2LB = 2.20462;
function toUnit(kg){ return S.unidad==="lb" ? Math.round(kg*KG2LB/2.5)*2.5 : kg; }
function unitLabel(){ return S.unidad==="lb" ? "lb" : "kg"; }
function fmtW(kg){ const v=toUnit(kg); return (Number.isInteger(v)?v:v.toFixed(1))+" "+unitLabel(); }

function restFor(ex){
  const lo = parseInt(String(ex.r).split(/[-–]/)[0],10) || 10;
  const heavy = ex.grp==="inf" || /press|muerto|remo|dominada|sentadilla|hack|prensa|hip|militar|rumano/i.test(getVar(ex).n);
  if(lo<=8)  return heavy?180:150;
  if(lo<=10) return 120;
  if(lo<=12) return 90;
  return 60;
}
function fmtRest(s){ const m=Math.floor(s/60), r=s%60; return m?(r?m+" min "+r+" s":m+" min"):s+" s"; }

function setsDone(key, exId){ const d=S.sets[key]; return d&&d[exId] ? d[exId] : 0; }
function toggleSet(key, exId, total){
  if(!S.sets[key]) S.sets[key]={};
  const cur=S.sets[key][exId]||0;
  S.sets[key][exId] = cur>=total ? 0 : cur+1;
  save(); return S.sets[key][exId];
}

/* --- Timer de descanso --- */
let restTimer=null, restEnd=0, restTotal=0, restActive=false;
const RING_C = 314.16;
function paintRest(){
  const left=Math.max(0, Math.ceil((restEnd-Date.now())/1000));
  const m=Math.floor(left/60), s=left%60;
  $("restTime").textContent = (m?m+":":"")+String(s).padStart(m?2:1,"0");
  $("restFill").style.strokeDashoffset = (RING_C*(1-(restTotal?left/restTotal:0))).toFixed(1);
  $("restBar").classList.toggle("low", left<=5 && left>0);
  return left;
}
function startRest(sec,name){
  clearInterval(restTimer); restTotal=sec; restEnd=Date.now()+sec*1000; restActive=true;
  $("restName").textContent=name; $("restBar").classList.add("show"); paintRest();
  restTimer=setInterval(()=>{ if(paintRest()<=0) finishRest(); },500);
}
function finishRest(){ clearInterval(restTimer); restActive=false; $("restBar").classList.remove("show","low");
  showToast("¡A darle! Siguiente serie 💪"); avisar("descanso", [180,90,180]); }
function stopRest(){ clearInterval(restTimer); restActive=false; $("restBar").classList.remove("show","low"); }
$("restSkip").onclick = stopRest;
document.addEventListener("visibilitychange",()=>{
  if(document.hidden || !restActive) return;
  if(Date.now()>=restEnd) finishRest(); else paintRest();
});

function renderUnitToggle(){
  $("unitToggle").innerHTML = ["kg","lb"].map(u=>`<button data-u="${esc(u)}" class="${S.unidad===u?'on':''}">${u.toUpperCase()}</button>`).join("");
}

/* --- Cardio pendiente: días entrenados sin cardio marcado --- */
function cardioPendientes(){
  const out=[];
  for(let i=1;i<=10;i++){
    const k=localKey(addDays(now,-i));
    if(bloqueDe(k).t!=="entreno") continue;
    if(S.trained[k]===true && S.cardio[k]!==true) out.push(k);
  }
  return out;
}

/* --- Tira de días de la semana --- */
function renderWeekStrip(){
  const base = fromKey(thisWeek); base.setDate(base.getDate()+weekOffset*7);
  const start = localKey(base);
  $("weekLabel").textContent = weekOffset===0 ? "Esta semana"
    : weekOffset===-1 ? "Semana pasada" : weekOffset===1 ? "Próxima semana"
    : (fromKey(start).getDate()+" "+MONTHS[fromKey(start).getMonth()]);
  $("dayStrip").innerHTML = Array.from({length:7},(_,i)=>{
    const k = localKey(addDays(fromKey(start), i));
    const b = bloqueDe(k), d = fromKey(k);
    const isToday = k===dayKey, sel = k===viewKey;
    const done = S.trained[k]===true;
    return `<button class="day-btn ${b.t==="entreno"?"train":"rest"}${sel?" sel":""}${isToday?" today":""}${done?" done-day":""}" data-day="${esc(k)}">
      <span class="dn">${DSHORT[i]}</span>
      <span class="dd">${d.getDate()}</span>
      <span class="dt">${b.t==="entreno"?esc(b.short):"Descanso"}</span>
    </button>`;
  }).join("");
}
$("dayStrip").addEventListener("click",e=>{
  const b=e.target.closest("[data-day]"); if(!b) return;
  viewKey=b.dataset.day; renderWeekStrip(); renderRoutine(); renderTrained();
});
$("wPrev").onclick=()=>{ weekOffset--; renderWeekStrip(); };
$("wNext").onclick=()=>{ weekOffset++; renderWeekStrip(); };


/* --- Fase del mes --- */
function renderFase(){
  const f=faseDe(viewKey), cyc=CYCLE[f.idx];
  $("cycleChip").textContent = "Semana "+f.w+" de "+f.tot;
  $("cycleChip").style.background="color-mix(in srgb, var(--ink) 6%, transparent)";
  $("cycleChip").style.color=tono(cyc.c);
  $("fasePill").textContent = CYCLE[faseDe(dayKey).idx].n;
  $("cycleCal").innerHTML = Array.from({length:f.tot},(_,k)=>{
    const wn=k+1, c=CYCLE[cycleIndexFor(wn,f.tot)];
    return `<div class="cw${wn===f.w?' now':''}" style="--wc:${tono(c.c,3)};--wc-txt:${tono(c.c)}"><b>Sem ${wn}</b><span>${c.n}</span></div>`;
  }).join("");
  const banner=$("deloadBanner");
  if(f.idx===3){
    banner.innerHTML = `<div class="banner em"><span class="i"><svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="2"/><path d="M12 7v6M12 13 7 20M12 13l5 7M5 10h14"/></svg></span>
      <div><b>Semana de DESCARGA.</b> Usa el 60–65 % del peso de la semana previa (ya calculado abajo), sin llegar al fallo.
      La descarga no frena el progreso: es donde el cuerpo consolida lo que ganaste.</div></div>`;
  }else{
    const rest=f.tot-f.w;
    banner.innerHTML = `<div class="banner ${f.idx===2?'coral':'amber'}"><span class="i">${f.idx===2?`<svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c1.5 3.5-1 5-1 7a3 3 0 0 0 6 0c0-1-.3-2-.8-2.8C18.7 8 20 10.7 20 13a8 8 0 1 1-16 0C4 8.5 8.5 6 12 2Z"/></svg>`:`<svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`}</span>
      <div><b>Semana ${f.w} · ${cyc.n}.</b> ${cyc.d} ${rest>0?`Faltan <b>${rest} semana${rest>1?'s':''}</b> para la descarga.`:''}</div></div>`;
  }
}

/* --- Render de la rutina del día seleccionado --- */
/* ==================================================================
   RUTINA — tres vistas sobre la MISMA tarjeta
     lista     todo abierto, como siempre
     contraer  el ejercicio terminado se recoge solo (por omisión)
     foco      una tarjeta por pantalla, deslizable con el dedo
   La tarjeta se genera una sola vez aquí para que las tres vistas
   no se desincronicen nunca.
   ================================================================== */
function vistaRutina(){
  const v = (S.ui||{}).vistaRutina;
  return ["lista","contraer","foco"].includes(v) ? v : "contraer";
}
/* ejercicios que TÚ volviste a abrir aunque estén terminados.
   var, no let: renderRoutine() está definida antes de esta línea. */
var exAbiertos = new Set();

function exTarjetaHtml(ex, isDeload){
    const v=getVar(ex);
    const w=getW(ex), showW = isDeload ? roundP(w*0.62) : w;
    const inc = ex.grp==="inf"?5:2.5;
    const hiDone = S.liftHi[liftKey(ex)]===thisWeek;
    const bodyweight = !!v.bw;
    const done = setsDone(viewKey, ex.id);
    const rest = restFor(ex);
    const sqs = Array.from({length:ex.s},(_,i)=>
      `<button class="set-sq${i<done?' on':''}" data-sq="${ex.id}" data-k="${i}" data-rest="${rest}" data-total="${ex.s}" data-name="${esc(v.n)}" aria-label="Serie ${i+1}" aria-pressed="${i<done}">${i<done?'✓':i+1}</button>`).join("");
    return `<div class="ex${done>=ex.s?' ex-complete':''}" data-ex="${esc(ex.id)}">
      <div class="ex-top">
        ${exPhoto(v)}
        <span class="nm"><b>${esc(v.n)}</b>
          <small>${ex.s}×${ex.r} · descanso ${fmtRest(rest)}${v.u?" · "+esc(v.u):""}</small>
          <span class="act"><span class="a-lbl">Activación</span><span class="a-bar"><i style="width:${v.act}%"></i></span><span class="a-num">${v.act}</span></span>
        </span>
      </div>
      <div class="ex-wrow">
        <button data-w="-" aria-label="Bajar peso">−</button>
        <span class="wv"><input class="wv-in" data-exw="${esc(ex.id)}" type="number" inputmode="decimal" min="0" max="600" step="any" value="${+toUnit(w).toFixed(1)}" aria-label="Peso"><small>Peso · ${bodyweight?"lastre":unitLabel()}</small></span>
        <button data-w="+" aria-label="Subir peso">+</button>
      </div>
      ${isDeload?`<div class="deload-line">🧘 <b>Hoy levantas ${bodyweight?"solo tu peso corporal":fmtW(showW)}</b>${bodyweight?", sin lastre, con una serie menos y lejos del fallo":" · 62 % de tu peso de trabajo ("+fmtW(w)+"), sin llegar al fallo"}. El campo de arriba es tu <b>peso normal</b>: edítalo cuando quieras.</div>`:""}
      <div class="set-lbl">Series · toca un cuadro al terminar cada una</div>
      <div class="set-grid">${sqs}</div>
      ${!isDeload?`
      <div class="ex-done${hiDone?' on':''}" data-hi="${esc(ex.id)}">
        <span class="box">${hiDone?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span>
        <span>Completé todas las series en el rango alto</span>
      </div>
      <div class="next-up${hiDone?' show':''}">▲ Próxima sesión ${bodyweight?"añade lastre hasta "+fmtW(roundP(w+inc)):"sube a "+fmtW(roundP(w+inc))}</div>`:""}
      <button class="var-btn" data-varsheet="${ex.id}">
        <svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg> <span>Cambiar variante del ejercicio</span><span class="vb-n">${ex.v.length}</span>
      </button>
    </div>`;
}

/* fila compacta del ejercicio ya terminado */
function exCompactaHtml(ex){
  const v = getVar(ex);
  const w = getW(ex);
  const bodyweight = !!v.bw;
  return `<div class="ex ex-compacta" data-ex="${esc(ex.id)}" data-reabrir="${esc(ex.id)}"
               role="button" tabindex="0" aria-label="Reabrir ${esc(v.n)}">
    <span class="exc-ok" aria-hidden="true">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg></span>
    <span class="exc-nm"><b>${esc(v.n)}</b>
      <small>${ex.s}×${ex.r}${bodyweight?"":" · "+fmtW(w)}</small></span>
    <span class="exc-abrir" aria-hidden="true">Ver</span>
  </div>`;
}

function pintaEjercicios(list, isDeload){
  const modo = vistaRutina();

  if(modo === "foco"){
    const puntos = list.map((ex,i)=>{
      const listo = setsDone(viewKey, ex.id) >= ex.s;
      return `<button class="fp${listo?" ok":""}" data-foco="${i}" aria-label="Ir a ${esc(getVar(ex).n)}"></button>`;
    }).join("");
    const cards = list.map((ex,i)=>
      `<section class="foco-card" data-fi="${i}" aria-label="Ejercicio ${i+1} de ${list.length}">
         <div class="foco-num">${i+1} de ${list.length}</div>
         ${exTarjetaHtml(ex, isDeload)}
       </section>`).join("");
    return `<div class="foco">
      <div class="foco-puntos" role="tablist">${puntos}</div>
      <div class="foco-pista" id="focoPista">${cards}</div>
      <div class="foco-flechas">
        <button data-focoir="-1" aria-label="Ejercicio anterior">‹</button>
        <button data-focoir="1" aria-label="Ejercicio siguiente">›</button>
      </div>
    </div>`;
  }

  return list.map(ex=>{
    const listo = setsDone(viewKey, ex.id) >= ex.s;
    if(modo === "contraer" && listo && !exAbiertos.has(ex.id)) return exCompactaHtml(ex);
    return exTarjetaHtml(ex, isDeload);
  }).join("");
}

/* Tras completar un ejercicio, llevarte al siguiente pendiente: en el
   gimnasio eso es lo que de verdad ahorra toques. */
function avanzaAlPendiente(exIdTerminado){
  const b = bloqueDe(viewKey);
  if(!b || b.t !== "entreno") return;
  const list = RUTINA[b.id] || [];
  const i = list.findIndex(x=>x.id === exIdTerminado);
  const sig = list.slice(i+1).find(x=>setsDone(viewKey, x.id) < x.s);
  if(!sig) return;
  if(vistaRutina() === "foco"){
    const k = list.findIndex(x=>x.id === sig.id);
    setTimeout(()=>vaAFoco(k), 260);
    return;
  }
  setTimeout(()=>{
    const el = document.querySelector(`.ex[data-ex="${CSS.escape(sig.id)}"]`);
    if(el) el.scrollIntoView({behavior: (S.ui||{}).anim===false ? "auto" : "smooth", block:"center"});
  }, 260);
}

function focoActual(){
  const pista = document.getElementById("focoPista");
  if(!pista) return 0;
  const card = pista.querySelector(".foco-card");
  if(!card) return 0;
  return Math.round(pista.scrollLeft / card.offsetWidth);
}
function vaAFoco(i){
  const pista = document.getElementById("focoPista");
  if(!pista) return;
  const cards = pista.querySelectorAll(".foco-card");
  const k = Math.max(0, Math.min(cards.length-1, i));
  if(!cards[k]) return;
  pista.scrollTo({ left: k * cards[0].offsetWidth,
                   behavior: (S.ui||{}).anim===false ? "auto" : "smooth" });
  marcaPunto(k);
}
function marcaPunto(k){
  document.querySelectorAll(".foco-puntos .fp").forEach((p,i)=>
    p.classList.toggle("aqui", i === k));
}

function renderRoutine(){
  const b = bloqueDe(viewKey);
  const f = faseDe(viewKey), isDeload = f.idx===3;
  const d = fromKey(viewKey);
  const fecha = DAYS[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()];
  renderFase();

  /* ---- DÍA DE DESCANSO (jueves y domingo) ---- */
  if(b.t!=="entreno"){
    $("routineDayTitle").textContent = fecha+" · Descanso";
    $("warmBox").innerHTML="";
    $("exList").innerHTML = `<div class="card" style="text-align:center">
      <div style="font-size:34px;margin-bottom:6px">😌</div>
      <b style="font-family:'Space Grotesk';font-size:16px">Hoy no hay pesas</b>
      <div class="subtle" style="margin-top:6px">El jueves y el domingo son tus días fijos de descanso: entrenas 3, descansas 1, entrenas 2 y cierras la semana descansando. Llegas fresco a cada bloque y el fin de semana sigue siendo tuyo.<br>Duerme 7–8 h y come igual que siempre: <b>el día de descanso no se recorta comida.</b></div></div>`;
    const pend = cardioPendientes();
    $("pendCardio").innerHTML = pend.length ? `
      <div class="pend"><span class="p-i">🏃</span>
        <div class="p-t"><b>Tienes cardio rezagado</b>Entrenaste estos días pero no marcaste el cardio. Hoy que descansas de pesas es el momento ideal para recuperarlo.</div>
        <span class="p-n">${pend.length}</span></div>
      <ul class="pend-list">${pend.slice(0,4).map(k=>{
        const dd=fromKey(k);
        return `<li><span class="pl-d">${DAYS[dd.getDay()]} ${dd.getDate()} ${MONTHS[dd.getMonth()]}</span>
          <button data-recover="${k}">Recuperar 20 min</button></li>`;
      }).join("")}</ul>` : "";
    const cOn = S.cardio[viewKey]===true;
    $("cardioBox").innerHTML = `<div class="block${cOn?' on':''}" data-blk="cardio" style="--bc:rgba(89,207,224,.32);--bbg:var(--card);--bc2:var(--sky);--bbg2:var(--sky-soft)">
      <span class="b-i">🚶</span>
      <div class="b-t"><b>Caminata suave · 30–45 min</b>
      <small>${pend.length?`Súmale ${Math.min(pend.length,2)*10} min extra para bajar el rezago sin castigarte.`:"Opcional, pero suma al gasto del día sin fatigar para el siguiente bloque."}</small></div>
      <span class="b-c">${cOn?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span></div>`;
    return;
  }

  /* ---- DÍA DE ENTRENAMIENTO ---- */
  $("routineDayTitle").textContent = fecha+" · "+b.title;
  $("pendCardio").innerHTML="";

  const wOn = S.warm[viewKey]===true;
  $("warmBox").innerHTML = `<div class="block${wOn?' on':''}" data-blk="warm">
    <span class="b-i">🔥</span>
    <div class="b-t"><b>${CALENTAMIENTO.t}</b><small>${CALENTAMIENTO.d}</small></div>
    <span class="b-c">${wOn?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span></div>`;

  const list = RUTINA[b.id];
  $("exList").innerHTML = pintaEjercicios(list, isDeload);

  const cOn = S.cardio[viewKey]===true;
  $("cardioBox").innerHTML = `<div class="block${cOn?' on':''}" data-blk="cardio" style="--bc:rgba(89,207,224,.32);--bc2:var(--sky);--bbg2:var(--sky-soft)">
    <span class="b-i">🏃</span>
    <div class="b-t"><b>Cardio final · ${numero(CONFIG.cardioMin)} min</b>
    <small>Caminadora en pendiente o elíptica a ritmo cómodo. Si hoy no te da el tiempo, no pasa nada: aparecerá como pendiente en tu próximo día de descanso.</small></div>
    <span class="b-c">${cOn?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span></div>`;
}

/* submenú de variantes de un ejercicio */
function openVarSheet(exId){
  const b=bloqueDe(viewKey); if(b.t!=="entreno") return;
  const ex=RUTINA[b.id].find(x=>x.id===exId); if(!ex) return;
  const vi=getVarIdx(exId);
  const html = `<div class="sheet-list">`+ex.v.map((vv,j)=>`
    <button class="var${vi===j?' on':''}" data-pickvar="${exId}" data-vi="${j}">
      ${exPhoto(vv,true)}
      <span class="v-nm">${vv.top?`<span class="v-top">★ ${esc(vv.top)}</span>`:""}<b>${esc(vv.n)}</b>
        ${vv.note?`<small>${esc(vv.note)}</small>`:""}</span>
      <span class="v-act"><b>${vv.act}</b><span>ACTIV.</span></span>
    </button>`).join("")+`</div>
    <div class="sheet-note">El peso se guarda por variante: si regresas a la anterior, tu peso sigue ahí.<br>El número es el índice de activación (0–100) dentro de este patrón.</div>`;
  openSheet("Elegir variante", ex.s+"×"+ex.r+" · ordenadas por recomendación", html);
}

/* --- interacciones de la rutina --- */
document.addEventListener("click",e=>{
  const blk=e.target.closest("[data-blk]");
  if(blk){
    const kind=blk.dataset.blk;
    const store = kind==="warm" ? S.warm : S.cardio;
    if(store[viewKey]) delete store[viewKey]; else store[viewKey]=true;
    save(); renderRoutine();
    showToast(store[viewKey] ? (kind==="warm"?"Calentamiento hecho ✓":"Cardio registrado ✓") : "Desmarcado");
    return;
  }
  const rec=e.target.closest("[data-recover]");
  if(rec){ S.cardio[rec.dataset.recover]=true; save(); renderRoutine(); showToast("Cardio recuperado ✓"); }
});

$("exList").addEventListener("change",e=>{
  const inp=e.target.closest(".wv-in"); if(!inp) return;
  let v=parseFloat(String(inp.value).replace(",","."));
  if(isNaN(v)||v<0) v=0; if(v>600) v=600;
  const kg = S.unidad==="lb" ? v/KG2LB : v;
  const b=bloqueDe(viewKey); const ex=RUTINA[b.id].find(x=>x.id===inp.dataset.exw);
  S.lifts[liftKey(ex)]=Math.round(kg*100)/100;
  guardarCarga(ex, Math.round(kg*100)/100);
  save(); renderRoutine(); showToast("Peso guardado ✓");
});
$("exList").addEventListener("keydown",e=>{
  if(e.key==="Enter" && e.target.classList.contains("wv-in")) e.target.blur();
});
$("exList").addEventListener("click",e=>{
  const b=bloqueDe(viewKey); if(b.t!=="entreno") return;
  const list=RUTINA[b.id];

  const vs=e.target.closest("[data-varsheet]");
  if(vs){ openVarSheet(vs.dataset.varsheet); return; }

  const sq=e.target.closest("[data-sq]");
  if(sq){
    const exId=sq.dataset.sq, k=+sq.dataset.k, total=+sq.dataset.total,
          rest=+sq.dataset.rest, name=sq.dataset.name;
    if(!S.sets[viewKey]) S.sets[viewKey]={};
    const cur=S.sets[viewKey][exId]||0;
    /* tocar el último cuadro marcado lo desmarca; tocar cualquier otro marca hasta ahí */
    const target = (k+1===cur) ? k : k+1;
    S.sets[viewKey][exId]=target;
    /* si lo estás reabriendo para quitar una serie, que no se te vuelva a
       cerrar en la cara */
    if(target < total) exAbiertos.add(exId); else exAbiertos.delete(exId);
    const posFoco = vistaRutina()==="foco" ? focoActual() : -1;
    save(); renderRoutine(); renderHdrExtra();
    if(posFoco >= 0) vaAFoco(posFoco);
    if(target>cur && target<total){ startRest(rest,name); avisar("serie"); }
    else if(target>=total){ stopRest(); avisar("ejercicio", [30,50,60]);
      showToast("Ejercicio completo ✓"); avanzaAlPendiente(exId); }
    else stopRest();
    return; }
  /* volver a abrir un ejercicio contraído */
  const rb=e.target.closest("[data-reabrir]");
  if(rb){ exAbiertos.add(rb.dataset.reabrir); renderRoutine(); return; }
  /* vista Foco: puntos y flechas */
  const fp=e.target.closest("[data-foco]");
  if(fp){ vaAFoco(+fp.dataset.foco); return; }
  const fi=e.target.closest("[data-focoir]");
  if(fi){ vaAFoco(focoActual() + (+fi.dataset.focoir)); return; }

  const wb=e.target.closest("[data-w]");
  if(wb){ const exId=wb.closest(".ex").dataset.ex; const ex=list.find(x=>x.id===exId);
    /* El paso va en la unidad que el usuario VE. Antes siempre sumaba 2.5 kg,
       que en libras se mostraba como saltos erráticos de 5 lb. */
    const pasoVisible = ex.grp==="inf" ? 5 : 2.5;
    const enLb = S.unidad==="lb";
    const actualVisible = enLb ? Math.round(getW(ex)*KG2LB/2.5)*2.5 : getW(ex);
    let nuevoVisible = actualVisible + (wb.dataset.w==="+"?pasoVisible:-pasoVisible);
    if(nuevoVisible<0) nuevoVisible=0;
    const w = enLb ? Math.round(nuevoVisible/KG2LB*100)/100 : nuevoVisible;
    S.lifts[liftKey(ex)]=w; guardarCarga(ex, w); save(); renderRoutine(); return; }

  const hi=e.target.closest("[data-hi]");
  if(hi){ const ex=list.find(x=>x.id===hi.dataset.hi); const k=liftKey(ex);
    if(S.liftHi[k]===thisWeek) delete S.liftHi[k];
    else { S.liftHi[k]=thisWeek; showToast("¡Doble progreso! La próxima sesión sube el peso 📈"); }
    save(); renderRoutine(); }
});
document.addEventListener("click",e=>{
  const u=e.target.closest("#unitToggle [data-u]"); if(!u) return;
  S.unidad=u.dataset.u; save(); renderUnitToggle(); renderRoutine();
  showToast("Pesos en "+(S.unidad==="lb"?"libras":"kilogramos"));
});

/* --- Botón "Entrené" --- */
function renderTrained(){
  const box=$("trainedBox");
  if(bloqueDe(viewKey).t!=="entreno"){ box.innerHTML=""; return; }
  const on = S.trained[viewKey]===true;
  const esHoy = viewKey===dayKey;
  box.innerHTML = `
    <button class="trained-hero${on?' on':''}" id="trainedBtn" aria-pressed="${on}">
      <span class="lifter" aria-hidden="true"><span class="l-head"></span><span class="l-body"></span><span class="l-arm"></span><span class="l-bar"><i></i><i></i></span></span>
      <span class="t-txt">
        <b>${on?'¡Sesión completada! 💥':(esHoy?'Marcar: entrené hoy':'Marcar este día como entrenado')}</b>
        <small>${on?'Sumaste otro día. Así se construye.':'Registra tu día de entrenamiento'}</small>
      </span>
      <span class="t-check">${on?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span>
    </button>
    <div class="session-count"><span class="sc-num">${numero(S.sessions)}</span> <span class="sc-lbl">sesiones completadas en total</span></div>`;
  $("trainedBtn").onclick=()=>{
    const btn=$("trainedBtn");
    if(S.trained[viewKey]){ delete S.trained[viewKey]; S.sessions=Math.max(0,(S.sessions||0)-1); }
    else{
      S.trained[viewKey]=true; S.sessions=(S.sessions||0)+1;
      btn.classList.add("celebrate"); launchConfetti(btn); showCongrats();
      try{navigator.vibrate&&navigator.vibrate([120,60,120]);}catch(e){}
    }
    save(); renderTrained(); renderWeekStrip(); renderBody();
  };
}
function showCongrats(){
  const msgs=["¡Bien hecho! 💪","¡Otro día ganado! 🔥","¡Constancia pura! 🏆","¡Así se hace! 🚀","¡Máquina! ⚡"];
  const el=document.createElement("div"); el.className="congrats";
  el.innerHTML=`<div class="congrats-in"><span class="c-emoji">🏋️</span><b>${msgs[Math.floor(Math.random()*msgs.length)]}</b><small>Sesión registrada en tu progreso</small></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add("show"));
  setTimeout(()=>{ el.classList.remove("show"); setTimeout(()=>el.remove(),350); },1900);
}
function launchConfetti(anchor){
  if(S.ui && S.ui.anim===false) return;
  const cols=["#2fb5a3","#59cfe0","#b09bff","#7ee081","#f2b544"];
  const r=anchor.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
  for(let i=0;i<26;i++){
    const p=document.createElement("i"); p.className="confetti";
    p.style.left=cx+"px"; p.style.top=cy+"px"; p.style.background=cols[i%cols.length];
    const ang=Math.random()*Math.PI*2, dist=60+Math.random()*90;
    p.style.setProperty("--dx",Math.cos(ang)*dist+"px");
    p.style.setProperty("--dy",(Math.sin(ang)*dist-40)+"px");
    p.style.setProperty("--rot",(Math.random()*540-270)+"deg");
    document.body.appendChild(p); setTimeout(()=>p.remove(),900);
  }
}

/* ============================================================
   SNACKS Y ANTOJOS
   ============================================================ */
/* ==================================================================
   SNACKS REGISTRABLES
   Un toque = registrado. Nada de formularios. Los que más repites
   suben solos a la primera fila, así el de siempre queda al alcance.
   ================================================================== */
SNACKS.forEach((s,i)=>{ if(!s.id) s.id = "sn"+i; });
const protDe = t => { const m = String(t||"").match(/([\d.]+)/); return m ? +m[1] : 0; };

function snacksHoy(){ return S.snacks[dayKey] || (S.snacks[dayKey] = []); }
function vecesUsado(id){
  let n = 0;
  Object.keys(S.snacks).forEach(d=>{ (S.snacks[d]||[]).forEach(x=>{ if(x.id===id) n++; }); });
  return n;
}
function macrosSnacks(){
  return snacksHoy().reduce((t,x)=>({kcal:t.kcal+(x.kcal||0), p:t.p+(x.p||0)}), {kcal:0,p:0});
}
function registrarSnack(id){
  const s = SNACKS.find(x=>x.id===id); if(!s) return;
  snacksHoy().push({ id:s.id, n:s.n, kcal:s.kcal, p:protDe(s.p), ts:Date.now() });
  save(); renderSnacks(); renderTargets(); renderAhora();
  avisar("comida");
  showToast(s.n.split("(")[0].trim()+" registrado ✓");
}
function quitarSnack(ts){
  S.snacks[dayKey] = snacksHoy().filter(x=>String(x.ts)!==String(ts));
  save(); renderSnacks(); renderTargets(); renderAhora();
  sonar("deshacer");
  showToast("Quitado");
}
function renderSnacks(){
  const hoy = snacksHoy();
  const m = macrosSnacks();
  $("snackHoy").innerHTML = hoy.length
    ? `<div class="sn-hoy">
        <div class="sn-hoy-h"><b>Hoy comiste</b>
          <span>${Math.round(m.kcal)} kcal · ${Math.round(m.p)} g prot</span></div>
        <div class="sn-chips">${hoy.map(x=>`
          <button class="sn-chip" data-quitar="${numero(x.ts)}" aria-label="Quitar ${esc(x.n)}">
            ${esc(x.n.split("·")[0].split("(")[0].trim())}<i>✕</i></button>`).join("")}</div>
      </div>`
    : `<div class="sn-vacio">Toca un snack cuando te lo comas. Se suma a tu día y puedes deshacerlo.</div>`;

  /* los más repetidos primero, conservando el orden original al empatar */
  const orden = SNACKS.map((s,i)=>({s, i, n:vecesUsado(s.id)}))
    .sort((a,b)=> b.n-a.n || a.i-b.i);
  const veces = orden[0] ? orden[0].n : 0;
  $("snackList").innerHTML = orden.map(({s,n})=>{
    const hoyN = hoy.filter(x=>x.id===s.id).length;
    return `
    <button class="antojo sn-btn${hoyN?' usado':''}" data-snack="${esc(s.id)}"
            aria-label="Registrar ${esc(s.n)}">
      <span class="nm"><b>${esc(s.n)}${hoyN>1?` <span class="sn-x">×${hoyN}</span>`:""}</b>
        <small>${esc(s.note)}</small>
        ${s.hair?`<span class="badges">${hairBadge(s.hair)}</span>`:""}</span>
      <span class="kc">~${s.kcal} kcal<br><small>${esc(s.p)}</small>
        ${n>0 && n===veces && veces>1?`<em class="sn-fav">tu favorito</em>`:""}</span>
      <span class="sn-add">${hoyN?"✓":"+"}</span>
    </button>`;
  }).join("");
}
$("snackList").addEventListener("click", e=>{
  const b = e.target.closest("[data-snack]"); if(!b) return;
  registrarSnack(b.dataset.snack);
  celebra(b.querySelector(".sn-add") || b);
});
$("snackHoy").addEventListener("click", e=>{
  const b = e.target.closest("[data-quitar]"); if(!b) return;
  quitarSnack(b.dataset.quitar);
});

if(!S.antojos[thisWeek]) S.antojos[thisWeek]=[];
function usedKcal(){ return S.antojos[thisWeek].reduce((a,x)=>a+x.kcal,0); }
function renderBudget(){
  const used=usedKcal(), left=Math.max(0,CONFIG.antojosSemana-used);
  const pct=Math.min(100, used/CONFIG.antojosSemana*100);
  $("budgetLeft").textContent = left.toLocaleString("es-MX");
  $("budgetUsed").textContent = used.toLocaleString("es-MX");
  $("budgetFill").style.width = pct+"%";
  $("budgetBar").classList.toggle("over", used>CONFIG.antojosSemana);
  if($("stBudget")) $("stBudget").textContent = Math.round(used/CONFIG.antojosSemana*100)+"%";
  const msg=$("budgetMsg"), dow=now.getDay(), finde=(dow===0||dow===6||dow===5);
  if(used>CONFIG.antojosSemana){
    msg.className="banner coral";
    msg.innerHTML=`<span class="i"><svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.5 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg></span><div><b>Te pasaste ${(used-CONFIG.antojosSemana).toLocaleString("es-MX")} kcal.</b> No compenses saltándote comidas: al día siguiente quita 1 tortilla y el snack del trabajo, y suma 10 min de cardio. Nada más.</div>`;
  }else if(used>CONFIG.antojosSemana*0.7){
    msg.className="banner amber";
    msg.innerHTML=`<span class="i"><svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="7"/></svg></span><div><b>Vas al ${Math.round(pct)}% del presupuesto.</b> El resto de la semana quédate con los snacks del plan, que no gastan presupuesto.</div>`;
  }else if(!finde && used>0){
    msg.className="banner amber";
    msg.innerHTML=`<span class="i"><svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span><div><b>Estás usando antojo entre semana.</b> No es grave, pero si lo guardas para sábado y domingo tienes ${Math.round(left/2)} kcal para cada día del fin: mucho más margen para disfrutarlo de verdad.</div>`;
  }else{
    msg.className="banner em";
    msg.innerHTML=`<span class="i"><svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.3 2.4 2.4 4.6-4.9"/></svg></span><div><b>Este presupuesto es tuyo, úsalo.</b> Está calculado para que aun gastándolo completo el fin de semana sigas bajando grasa.</div>`;
  }
}
function renderAntojos(){
  $("antojoList").innerHTML = ANTOJOS.map(a=>`
    <div class="antojo">
      <span class="nm"><b>${esc(a.n)} <span class="tag ${a.tag}">${a.tagT}</span></b><small>${esc(a.note)}</small></span>
      <span class="kc">~${a.kcal} kcal</span>
      <button class="log-btn" data-log="${esc(a.id)}">+ Registrar</button>
    </div>`).join("");
}
$("antojoList").addEventListener("click",e=>{
  const b=e.target.closest("[data-log]"); if(!b) return;
  const a=ANTOJOS.find(x=>x.id===b.dataset.log);
  S.antojos[thisWeek].push({id:a.id, n:a.n, kcal:a.kcal, d:dayKey, ts:Date.now()});
  save(); renderBudget(); renderTargets(); renderHistorial();
  avisar("comida");
  showToast(a.n+" registrado · −"+a.kcal+" kcal");
});
$("budgetSplit").textContent = "Sáb + dom: ~"+Math.round(CONFIG.antojosSemana/2)+" c/u";

/* ============================================================
   PROGRESO
   ============================================================ */
function bodyHistory(){
  let h = S.body.slice();
  const seed=[MEDICION_BASE].concat(SEMILLAS);
  seed.forEach(s=>{ if(!h.some(x=>x.d===s.d)) h.push(Object.assign({},s)); });
  return h.sort((a,b)=>a.d.localeCompare(b.d));
}
function fmtDateShort(d){ const t=fromKey(d); return t.getDate()+" "+MONTHS[t.getMonth()]; }
function trendCard(label, unit, cur, prev, goalDir, color){
  let arrow="", cls="flat", delta="";
  if(prev!=null && cur!=null){
    const d=cur-prev;
    if(Math.abs(d)<0.05){ arrow="→"; cls="flat"; }
    else { const down=d<0; arrow=down?"▼":"▲";
      cls=((goalDir==="down"&&down)||(goalDir==="up"&&!down))?"good":"bad"; }
    delta=(d>0?"+":"")+d.toFixed(1);
  }
  return `<div class="ind" style="--ic:${tono(color,3)};--ic-txt:${tono(color)}">
    <span class="ind-lbl">${label}</span>
    <b class="ind-val">${cur!=null?cur.toFixed(1):"—"}<i>${unit}</i></b>
    <span class="ind-tr ${cls}">${arrow} ${delta?delta+" "+unit:"sin cambio"}</span></div>`;
}
function lineChart(series, color, unit, goal){
  const pts=series.filter(p=>p.v!=null);
  if(pts.length<2) return `<div class="subtle" style="text-align:center;padding:12px 0">Registra 2 o más mediciones para ver la tendencia</div>`;
  const vals=pts.map(p=>p.v).concat(goal!=null?[goal]:[]);
  const min=Math.min(...vals), max=Math.max(...vals);
  const pad=(max-min)*0.15||1, lo=min-pad, hi=max+pad;
  const Wd=320,H=96,m=8;
  const X=i=>m+i*(Wd-2*m)/(pts.length-1), Y=v=>m+(hi-v)*(H-2*m)/(hi-lo);
  const line=pts.map((p,i)=>X(i)+","+Y(p.v)).join(" ");
  const goalLine = goal!=null ? `<line x1="${m}" x2="${Wd-m}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="${color}" stroke-width="1.4" stroke-dasharray="5 5" opacity=".55"/>
    <text x="${m+2}" y="${Y(goal)-4}" fill="${color}" font-size="9.5" font-weight="800" opacity=".85">meta ${goal}${unit}</text>` : "";
  const area=`${X(0)},${H-m} `+line+` ${X(pts.length-1)},${H-m}`;
  const gid="g"+color.replace('#','');
  return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Tendencia">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".28"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${goalLine}<polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.v)}" r="3" fill="#081427" stroke="${color}" stroke-width="2"/>`).join("")}
    <text x="${X(pts.length-1)}" y="${Y(pts[pts.length-1].v)-7}" fill="#e9eefb" font-size="10.5" font-weight="700" text-anchor="end">${pts[pts.length-1].v.toFixed(1)}${unit}</text></svg>`;
}
function goalBar(label, unit, base, cur, meta, color){
  if(cur==null||base==null||meta==null) return "";
  const total=Math.abs(meta-base); if(total<0.01) return "";
  const adv=Math.max(0, meta>base ? cur-base : base-cur);
  const pct=Math.min(100, Math.round(adv/total*100));
  const left=Math.max(0, +(total-Math.min(adv,total)).toFixed(1));
  return `<div class="goal">
    <div class="g-top"><span>${label}</span><b style="color:${pct>0?tono(color):'var(--muted)'}">${
      pct>0?pct+"%":"sin avance aún"}</b></div>
    <div class="g-bar${pct===0?' cero':''}"><i style="width:${pct}%;background:${tono(color,3)}"></i></div>
    <small>Hoy: ${numeroTxt(cur,1)}${esc(unit)} · Meta: ${numeroTxt(meta)}${esc(unit)} · ${left>0?`Te faltan ${numeroTxt(left)}${esc(unit)}`:"¡Meta alcanzada!"}</small></div>`;
}
function mealStreak(){
  const doneAll=k=>{const m=S.meals[k]; return !!m && m.length>0 && m.every(Boolean);};
  let n=0; const d=new Date();
  if(!doneAll(localKey(d))) d.setDate(d.getDate()-1);
  while(doneAll(localKey(d))){ n++; d.setDate(d.getDate()-1); }
  return n;
}
function paceLine(series, unit, meta){
  const pts=series.filter(p=>p.v!=null); if(pts.length<2) return "";
  const a=pts[0], b=pts[pts.length-1];
  const days=(fromKey(b.d)-fromKey(a.d))/864e5; if(days<6) return "";
  const rate=(b.v-a.v)/days*7;
  if(Math.abs(rate)<0.005) return `<div class="pace">Ritmo: <b>estable</b> (sin cambio semanal)</div>`;
  let txt=`Ritmo: <b>${(rate>0?"+":"")+rate.toFixed(2)} ${unit}/semana</b>`;
  if(meta!=null){
    const rem=meta-b.v;
    if(Math.abs(rem)<0.05) txt+=" · ¡estás en tu meta! 🎉";
    else{ const weeks=rem/rate;
      if(weeks>0 && weeks<160){ const eta=new Date(fromKey(b.d).getTime()+weeks*7*864e5);
        txt+=` · a este ritmo llegas ~<b>${eta.getDate()} ${MONTHS[eta.getMonth()]} ${eta.getFullYear()}</b>`; }
      else if(weeks<=0) txt+=" · ojo: el ritmo actual te aleja de la meta"; }
  }
  return `<div class="pace">${txt}</div>`;
}
let bodyMetric="kg";
function renderBody(){
  const H=bodyHistory();
  const last=H[H.length-1]||null, prev=H.length>=2?H[H.length-2]:null;
  const lastW=[...H].reverse().find(x=>x.kg!=null)||null;
  const prevW=[...H].reverse().filter(x=>x.kg!=null)[1]||null;
  const lastF=[...H].reverse().find(x=>x.grasa!=null)||null;
  const prevF=[...H].reverse().filter(x=>x.grasa!=null)[1]||null;
  const lastM=[...H].reverse().find(x=>x.mme!=null)||null;
  const prevM=[...H].reverse().filter(x=>x.mme!=null)[1]||null;

  if(lastW&&prevW){ const d=lastW.kg-prevW.kg;
    $("stDelta").textContent=(d>0?"+":"")+d.toFixed(1)+" kg";
    $("stDelta").style.color = d<=0 ? "var(--lime)" : "var(--coral)";
  } else $("stDelta").textContent="—";

  $("indGrid").innerHTML =
    trendCard("Peso","kg", lastW?lastW.kg:null, prevW?prevW.kg:null, "down", "#59cfe0")+
    trendCard("% grasa","%", lastF?lastF.grasa:null, prevF?prevF.grasa:null, "down", "#ff7b6e")+
    trendCard("Músculo (MME)","kg", lastM?lastM.mme:null, prevM?prevM.mme:null, "up", "#7ee081");

  $("metricTabs").innerHTML = [["kg","Peso"],["grasa","% grasa"],["mme","Músculo"]]
    .map(([k,t])=>`<button data-metric="${k}" class="${bodyMetric===k?'on':''}">${t}</button>`).join("");
  const series = H.map(p=>({d:p.d, v: bodyMetric==="kg"?p.kg : bodyMetric==="grasa"?p.grasa : p.mme}));
  const col = bodyMetric==="kg"?"#59cfe0":bodyMetric==="grasa"?"#ff7b6e":"#7ee081";
  const unit = bodyMetric==="grasa"?"%":"kg";
  /* la meta de peso se deduce de tu objetivo y tu meta de grasa, no de un
     85.5 fijo que no tenía nada que ver contigo */
  const metaSel = bodyMetric==="grasa"?CONFIG.perfil.metaGrasa
                : bodyMetric==="mme"  ?CONFIG.perfil.metaMusculo
                : metaPesoKg();
  $("bodyChart").innerHTML = lineChart(series, col, unit, metaSel) + paceLine(series, unit, metaSel);

  $("goalGrid").innerHTML =
    (goalBar("% de grasa","%", MEDICION_BASE.grasa, lastF?lastF.grasa:null, CONFIG.perfil.metaGrasa, "#ff7b6e")+
     goalBar("Músculo (MME)","kg", MEDICION_BASE.mme, lastM?lastM.mme:null, CONFIG.perfil.metaMusculo, "#7ee081"))
    || `<div class="subtle" style="margin-top:8px">Registra una medición para ver tu avance.</div>`;

  const streak=mealStreak();
  const sesSem=Object.keys(S.trained||{}).filter(k=>S.trained[k]===true && weekKey(fromKey(k))===thisWeek).length;
  const cardSem=Object.keys(S.cardio||{}).filter(k=>S.cardio[k]===true && weekKey(fromKey(k))===thisWeek).length;
  $("streakBox").innerHTML =
    `<span><svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c1.5 3.5-1 5-1 7a3 3 0 0 0 6 0c0-1-.3-2-.8-2.8C18.7 8 20 10.7 20 13a8 8 0 1 1-16 0C4 8.5 8.5 6 12 2Z"/></svg> Comidas completas: <b style="color:var(--em)">${streak} día${streak===1?"":"s"} seguido${streak===1?"":"s"}</b></span>`+
    `<span><svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1M3 3l1 1M18 22l4-4M2 6l4-4M3 10l7-7M14 21l7-7"/></svg> Sesiones esta semana: <b style="color:var(--sky)">${sesSem}</b></span>`+
    `<span><svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="14" cy="4.5" r="2"/><path d="m9 20 2.5-5.5L9 12l1-5 4 2.5 3 .5"/><path d="m10 7-3 1.5L5.5 12"/><path d="m14 14.5 2 2 1.5 3.5"/></svg> Cardios: <b style="color:var(--violet)">${cardSem}</b></span>`;

  $("bodyList").innerHTML = H.slice().reverse().slice(0,10).map(p=>{
    const isBase = S.body.findIndex(x=>x.d===p.d)===-1;
    return `<li><span class="bl-date">${fmtDateShort(p.d)}${isBase?' <i class="base-tag">base</i>':''}</span>
      <span class="bl-vals">
        <span>${p.kg?p.kg.toFixed(1):"—"}<i>kg</i></span>
        <span>${p.grasa?p.grasa.toFixed(1):"—"}<i>%gr</i></span>
        <span>${p.mme?p.mme.toFixed(1):"—"}<i>MME</i></span>
        ${isBase?'':`<button class="del" data-delbody="${esc(p.d)}" aria-label="Borrar">✕</button>`}
      </span></li>`;
  }).join("") || `<li><span>Aún no hay mediciones</span></li>`;
}
$("bodySave").onclick=()=>{
  const fecha=$("bDate").value || dayKey;
  const kg=parseFloat($("bKg").value), grasa=parseFloat($("bFat").value), mme=parseFloat($("bMme").value);
  if(!kg && !grasa && !mme){ showToast("Escribe al menos un dato"); return; }
  if(kg && (kg<30||kg>250)){ showToast("Peso fuera de rango"); return; }
  const rec={d:fecha};
  if(kg) rec.kg=kg; if(grasa) rec.grasa=grasa; if(mme) rec.mme=mme;
  const ex=S.body.find(x=>x.d===fecha);
  if(ex) Object.assign(ex,rec); else S.body.push(rec);
  save(); $("bKg").value=""; $("bFat").value=""; $("bMme").value="";
  applyPersona(); renderTargets(); renderMeals(); renderShop(); renderGearSheet();
  renderBody(); showToast(kg?"Medición guardada · dieta recalculada a tu nuevo peso ✓":"Medición guardada: "+fmtDateShort(fecha)+" ✓");
};
document.addEventListener("click",e=>{
  const del=e.target.closest("[data-delbody]");
  if(del){ S.body=S.body.filter(x=>x.d!==del.dataset.delbody); save(); renderBody(); return; }
  const mt=e.target.closest("#metricTabs [data-metric]");
  if(mt){ bodyMetric=mt.dataset.metric; renderBody(); }
});

/* ============================================================
   RESUMEN SEMANAL (imagen personal, sin coach ni WhatsApp)
   ============================================================ */
function weekDates(k){ const o=[]; const d=fromKey(k);
  for(let i=0;i<7;i++){ o.push(localKey(d)); d.setDate(d.getDate()+1); } return o; }
function reportMetrics(){
  const days=weekDates(thisWeek);
  const trainedDays=days.filter(k=>S.trained[k]);
  const cardioDays=days.filter(k=>S.cardio[k]);
  let mealDone=0, mealPoss=0;
  days.forEach(k=>{ if(S.meals[k]){ mealDone+=S.meals[k].filter(Boolean).length; mealPoss+=MEALS.length; } });
  const mealPct = mealPoss? Math.round(mealDone/mealPoss*100):0;
  const liftNames=Object.keys(S.liftHi).filter(id=>S.liftHi[id]===thisWeek).map(k=>{
    const [exId,vi]=k.split("|");
    for(const b in RUTINA){ const ex=RUTINA[b].find(x=>x.id===exId); if(ex) return (ex.v[+vi]||ex.v[0]).n; }
    return null;
  }).filter(Boolean);
  const H=bodyHistory();
  const wArr=H.filter(x=>x.kg!=null), fArr=H.filter(x=>x.grasa!=null), mArr=H.filter(x=>x.mme!=null);
  const f=faseDe(dayKey);
  return {trainedDays, cardioDays, mealPct, liftNames,
    lastW: wArr.length?wArr[wArr.length-1].kg:null,
    deltaW: wArr.length>=2?(wArr[wArr.length-1].kg-wArr[wArr.length-2].kg):null,
    lastFat: fArr.length?fArr[fArr.length-1].grasa:null,
    lastMme: mArr.length?mArr[mArr.length-1].mme:null,
    totalSessions:S.sessions||0, used:usedKcal(), budget:CONFIG.antojosSemana,
    note:(S.note[thisWeek]||"").trim(), weekNo:f.w, totalWeeks:f.tot, cycName:CYCLE[f.idx].n};
}
function drawReport(){
  const m=reportMetrics();
  const cv=document.createElement("canvas"); const Wd=1080, H=1560;
  cv.width=Wd; cv.height=H;
  const ctx=cv.getContext("2d");
  const em="#2fb5a3", sky="#59cfe0", amber="#f2b544", coral="#ff7b6e", lime="#7ee081";
  const ink="#eef7f6", muted="#9db3d2", card="#12274a", line="#24416f";
  ctx.fillStyle="#081427"; ctx.fillRect(0,0,Wd,H);
  const grad=ctx.createLinearGradient(0,0,Wd,0); grad.addColorStop(0,em); grad.addColorStop(1,sky);
  ctx.fillStyle=grad; ctx.fillRect(0,0,Wd,14);
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  const PAD=64; let y=90;
  ctx.textAlign="left";
  ctx.fillStyle=em; ctx.font="700 26px 'Space Grotesk',sans-serif";
  ctx.fillText("RESUMEN SEMANAL", PAD, y);
  ctx.fillStyle=muted; ctx.font="500 24px Manrope,sans-serif";
  const dt=new Date();
  ctx.textAlign="right"; ctx.fillText(dt.getDate()+" "+MONTHS[dt.getMonth()]+" "+dt.getFullYear(), Wd-PAD, y); ctx.textAlign="left";
  y+=52; ctx.fillStyle=ink; ctx.font="700 52px 'Space Grotesk',sans-serif"; ctx.fillText(CONFIG.cliente, PAD, y);
  y+=40; ctx.fillStyle=muted; ctx.font="500 25px Manrope,sans-serif";
  ctx.fillText("Semana "+m.weekNo+" de "+m.totalWeeks+"  ·  "+m.cycName, PAD, y);
  y+=46;
  const gap=22, cw=(Wd-PAD*2-gap)/2, ch=185;
  function statCard(cx,cy,accent,big,small,sub){
    ctx.fillStyle=card; rr(cx,cy,cw,ch,22); ctx.fill();
    ctx.strokeStyle=line; ctx.lineWidth=1.5; rr(cx,cy,cw,ch,22); ctx.stroke();
    ctx.fillStyle=accent; rr(cx,cy,10,ch,22); ctx.fill();
    ctx.fillStyle=muted; ctx.font="700 20px Manrope,sans-serif"; ctx.fillText(small.toUpperCase(), cx+40, cy+48);
    ctx.fillStyle=ink; ctx.font="700 56px 'Space Grotesk',sans-serif"; ctx.fillText(big, cx+40, cy+114);
    if(sub){ ctx.fillStyle=muted; ctx.font="500 21px Manrope,sans-serif"; ctx.fillText(sub, cx+40, cy+154); }
  }
  statCard(PAD, y, sky, m.lastW!=null?m.lastW.toFixed(1)+" kg":"— kg", "Peso actual",
    m.deltaW!=null?((m.deltaW>0?"+":"")+m.deltaW.toFixed(1)+" kg vs. anterior"):"registra 2 mediciones");
  statCard(PAD+cw+gap, y, coral, m.lastFat!=null?m.lastFat.toFixed(1)+"%":"—%", "Grasa corporal", "meta: "+CONFIG.perfil.metaGrasa+"%");
  y+=ch+gap;
  statCard(PAD, y, lime, m.lastMme!=null?m.lastMme.toFixed(1)+" kg":"— kg", "Músculo (MME)", "conservarlo es la prioridad");
  statCard(PAD+cw+gap, y, em, m.trainedDays.length+"", "Entrenamientos", "esta semana · "+m.totalSessions+" en total");
  y+=ch+gap;
  statCard(PAD, y, amber, m.mealPct+"%", "Cumpl. de dieta", "de las comidas marcadas");
  statCard(PAD+cw+gap, y, m.used>m.budget?coral:lime, Math.round(m.used/m.budget*100)+"%", "Antojos usados",
    m.used>m.budget?"se pasó del presupuesto":"de "+m.budget.toLocaleString("es-MX")+" kcal");
  y+=ch+gap+18;
  statCard(PAD, y, sky, m.cardioDays.length+"", "Cardios hechos", "de 5 posibles");
  ctx.fillStyle=card; rr(PAD+cw+gap,y,cw,ch,22); ctx.fill();
  ctx.strokeStyle=line; ctx.lineWidth=1.5; rr(PAD+cw+gap,y,cw,ch,22); ctx.stroke();
  ctx.fillStyle=em; rr(PAD+cw+gap,y,10,ch,22); ctx.fill();
  ctx.fillStyle=muted; ctx.font="700 20px Manrope,sans-serif"; ctx.fillText("SUBIÓ DE PESO EN", PAD+cw+gap+40, y+48);
  ctx.font="600 22px Manrope,sans-serif";
  if(m.liftNames.length){
    m.liftNames.slice(0,3).forEach((nm,i)=>{ ctx.fillStyle=ink;
      ctx.fillText("• "+(nm.length>26?nm.slice(0,25)+"…":nm), PAD+cw+gap+40, y+90+i*32); });
  } else { ctx.fillStyle=muted; ctx.fillText("Sin nuevas progresiones", PAD+cw+gap+40, y+92); }
  y+=ch+gap+24;
  ctx.fillStyle=amber; ctx.font="700 24px 'Space Grotesk',sans-serif"; ctx.fillText("📝  CÓMO ME SENTÍ", PAD, y); y+=18;
  const note=m.note||"(sin nota esta semana)";
  ctx.fillStyle=m.note?ink:muted; ctx.font=(m.note?"500":"italic 500")+" 24px Manrope,sans-serif";
  const maxW=Wd-PAD*2-16, words=note.split(/\s+/); let lineTxt=""; const lines=[];
  words.forEach(w=>{ const t=lineTxt?lineTxt+" "+w:w; if(ctx.measureText(t).width>maxW){ lines.push(lineTxt); lineTxt=w; } else lineTxt=t; });
  if(lineTxt) lines.push(lineTxt);
  lines.slice(0,4).forEach(ln=>{ y+=36; ctx.fillText(ln, PAD+8, y); });
  const fy=H-56;
  ctx.strokeStyle=line; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(PAD,fy-28); ctx.lineTo(Wd-PAD,fy-28); ctx.stroke();
  ctx.fillStyle=muted; ctx.font="600 21px Manrope,sans-serif";
  ctx.fillText("Objetivo: "+CONFIG.perfil.metaGrasa+" % de grasa conservando el músculo", PAD, fy);
  return { canvas:cv, dataUrl:cv.toDataURL("image/png") };
}
function renderReportDue(){
  const due=$("reportDue"); if(!due) return;
  let overdue = S.lastReport ? (Date.now()-S.lastReport)>=7*864e5 : (S.body.length>0||Object.keys(S.trained).length>0);
  if(overdue){
    due.innerHTML = `<div class="banner amber" style="margin-bottom:12px"><span class="i"><svg class="bi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg></span><div><b>Toca cerrar la semana.</b> Genera tu resumen y guárdalo: en 2 meses vas a poder comparar.</div></div>`;
    $("reportChip").textContent="pendiente"; $("reportChip").style.background="var(--amber-soft)"; $("reportChip").style.color="var(--amber)";
  } else {
    due.innerHTML=""; $("reportChip").textContent="al día";
    $("reportChip").style.background="var(--em-soft)"; $("reportChip").style.color="var(--em)";
  }
}
$("noteArea").value = S.note[thisWeek]||"";
let notaT;
$("noteArea").addEventListener("input", e=>{
  S.note[thisWeek]=e.target.value;
  /* sin esto, cada tecla serializaba meses de comidas, series y mediciones
     y escribía a disco de forma síncrona: escribir un párrafo se pegaba */
  clearTimeout(notaT); notaT = setTimeout(save, 400);
});
window.addEventListener("pagehide", ()=>{ clearTimeout(notaT); save(); });
let currentReport=null;
$("genReport").onclick=()=>{
  currentReport = drawReport();
  $("rpImg").src = currentReport.dataUrl;
  const canShareFiles = navigator.canShare && (()=>{ try{ return navigator.canShare({files:[new File([],"x.png",{type:"image/png"})]});}catch(e){return false;} })();
  $("rpShare").style.display = canShareFiles ? "block" : "none";
  $("rpOverlay").classList.add("show");
  S.lastReport=Date.now(); save(); renderReportDue();
};
$("rpShare").onclick=async()=>{
  if(!currentReport) return;
  try{
    const blob=await (await fetch(currentReport.dataUrl)).blob();
    const file=new File([blob],"resumen-semanal.png",{type:"image/png"});
    await navigator.share({ files:[file], title:"Mi resumen semanal" });
  }catch(e){ showToast("No se pudo compartir; usa \u201CDescargar imagen\u201D"); }
};
$("rpDl").onclick=()=>{
  if(!currentReport) return;
  const a=document.createElement("a");
  a.href=currentReport.dataUrl; a.download="resumen-"+dayKey+".png"; a.click();
  showToast("Imagen descargada 📥");
};
$("rpClose").onclick=()=>$("rpOverlay").classList.remove("show");
$("rpOverlay").addEventListener("click",e=>{ if(e.target===$("rpOverlay")) $("rpOverlay").classList.remove("show"); });

/* Los elementos con role="button" que no son <button> no disparan click con
   Enter o Espacio. Antes recibían el foco del teclado y ahí se quedaban. */
document.addEventListener("keydown", e=>{
  if(e.key!=="Enter" && e.key!==" " && e.key!=="Spacebar") return;
  const el = e.target.closest && e.target.closest('[role="button"][tabindex]');
  if(!el || el.tagName==="BUTTON" || el.tagName==="A") return;
  e.preventDefault();
  el.click();
});

/* ============================================================
   NAVEGACIÓN Y ARRANQUE
   ============================================================ */
function irAPestana(nombre, scroll){
  const btn = document.querySelector(`.nb[data-tab="${nombre}"]`);
  if(!btn) return false;
  document.querySelectorAll(".nb").forEach(x=>{
    const on = x===btn;
    x.classList.toggle("active", on);
    /* aria-current: sin esto un lector de pantalla no sabe en qué pestaña estás */
    if(on) x.setAttribute("aria-current","page"); else x.removeAttribute("aria-current");
  });
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active", t.id==="tab-"+nombre));
  document.body.dataset.tab = nombre;
  /* nada de una pestaña debe quedarse encendido en otra */
  if(nombre !== "mandado" && modoMandado){
    modoMandado = false;
    document.body.classList.remove("modo-mandado");
  }
  renderBarraMandado();
  renderHdrExtra(); renderHdrMini();
  if(scroll!==false) window.scrollTo({top:0,behavior:"smooth"});
  return true;
}
document.querySelectorAll(".nb").forEach(b=>b.onclick=()=>irAPestana(b.dataset.tab));

/* atajos del icono de la app: ./?tab=rutina */
try{
  const t = new URLSearchParams(location.search).get("tab");
  if(t) irAPestana(t, false);
  else irAPestana("hoy", false);
}catch(e){ irAPestana("hoy", false); }
$("bDate").value = dayKey;

/* ------------------------------------------------------------------
   ARRANQUE A PRUEBA DE FALLOS
   Si algo del estado guardado hace tronar un render, antes la app se
   quedaba en blanco ANTES de pintar la pestaña Ajustes — o sea, sin
   forma de volver a importar el respaldo bueno. Ahora hay salida.
   ------------------------------------------------------------------ */
function rolloverCheck(){ if(localKey(new Date())!==dayKey){ save(); location.reload(); } }

function pantallaRescate(err){
  const hayCopia = !!localStorage.getItem(PRE_KEY);
  document.body.innerHTML = `
    <div class="rescate">
      <div class="rescate-card">
        <div class="rescate-i">🛟</div>
        <h1>Algo salió mal al abrir tus datos</h1>
        <p>Tu información sigue guardada en este teléfono. Puedes restaurar un
           respaldo o, si acabas de importar uno, volver a como estabas antes.</p>
        <div class="rescate-btns">
          <label class="rb rb-1">⬆️ Restaurar un respaldo
            <input type="file" accept=".html,.json,text/html,application/json" id="rescateFile" style="display:none"></label>
          ${hayCopia?`<button class="rb rb-2" id="rescateUndo">↩️ Deshacer la última importación</button>`:``}
          <button class="rb rb-3" id="rescateDescarga">⬇️ Descargar mis datos tal cual</button>
        </div>
        <details class="rescate-det"><summary>Detalle técnico</summary><pre>${esc(String(err && err.stack || err))}</pre></details>
      </div>
    </div>`;
  document.getElementById("rescateFile").addEventListener("change", ev=>{
    const f = ev.target.files && ev.target.files[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = ()=>{
      const d = parseBackup(rd.result);
      if(!d){ alert("Ese archivo no parece un respaldo de Mi Plan."); return; }
      try{ localStorage.setItem(PRE_KEY, localStorage.getItem(LS_KEY)||""); }catch(e){}
      localStorage.setItem(LS_KEY, JSON.stringify(d.S));
      if(d.CIMG){ try{ localStorage.setItem(IMG_KEY, JSON.stringify(d.CIMG)); }catch(e){} }
      location.reload();
    };
    rd.readAsText(f);
  });
  const undo = document.getElementById("rescateUndo");
  if(undo) undo.addEventListener("click", ()=>{
    const prev = localStorage.getItem(PRE_KEY);
    if(prev){ localStorage.setItem(LS_KEY, prev); localStorage.removeItem(PRE_KEY); location.reload(); }
  });
  document.getElementById("rescateDescarga").addEventListener("click", ()=>{
    const crudo = JSON.stringify({app:"mi-plan", v:2, fecha:new Date().toISOString(),
      S: JSON.parse(localStorage.getItem(LS_KEY)||"{}"), CIMG: JSON.parse(localStorage.getItem(IMG_KEY)||"{}")});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([crudo],{type:"application/json"}));
    a.download = "mi-plan-rescate.json"; a.click();
  });
}

try{
  renderMeals(); renderShop(); renderTierBar(); renderUnitToggle(); renderGearSheet();
  renderWeekStrip(); renderRoutine(); renderTrained(); renderAhora();
  cierraSemanasViejas();   /* la semana pasada se cierra sola */
  renderSnacks();
  renderBudget(); renderAntojos(); renderBody(); renderReportDue();
  renderRespaldoAviso();

  /* cambio de día */
  setInterval(rolloverCheck, 30000);
  document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) rolloverCheck(); });

  if(!canStore) alertaGrave("Este navegador no guarda nada",
    "Estás en modo privado o con el almacenamiento bloqueado. Nada de lo que registres se va a conservar.", null);
  else if(cargaCorrupta) alertaGrave("No se pudieron leer tus datos",
    "El archivo guardado estaba dañado y la app abrió vacía. Si tienes un respaldo, impórtalo desde Ajustes.", null);

  /* pedir almacenamiento persistente: sin esto el sistema puede desalojar
     los datos cuando el teléfono anda bajo de espacio */
  if(navigator.storage && navigator.storage.persist){
    navigator.storage.persisted().then(ya=>{ if(!ya) navigator.storage.persist(); }).catch(()=>{});
  }
}catch(err){
  console.error("Mi Plan · fallo al arrancar", err);
  pantallaRescate(err);
}

/* ==================================================================
   HISTORIAL — tres vistas dentro de la misma pestaña
   ================================================================== */
let histVista = "cuerpo";

/* barras sencillas, sin librerías: SVG inline y accesible */
function barras(datos, opciones){
  const o = opciones || {};
  if(!datos.length) return `<div class="hist-vacio">${esc(o.vacio || "Todavía no hay datos.")}</div>`;
  const max = Math.max(o.min || 0, ...datos.map(d=>d.v)) || 1;
  const color = o.color || "var(--em)";
  return `<div class="barras" role="img" aria-label="${esc(o.alt || "")}">
    ${datos.map(d=>{
      /* un valor de 0 no debe pintar una rayita: parecía un error */
      const pct = d.v > 0 ? Math.max(6, d.v/max*100) : 0;
      return `<div class="ba" title="${esc(d.t)}: ${esc(d.txt||d.v)}">
        <span class="ba-v">${esc(d.txt!==undefined?d.txt:d.v)}</span>
        <span class="ba-col"><i style="height:${pct}%;background:${d.c||color}"></i></span>
        <span class="ba-t">${esc(d.t)}</span></div>`;
    }).join("")}
  </div>`;
}
function nombreSemana(k){
  const d = fromKey(k), f = addDays(d,6);
  return d.getDate()+" "+MONTHS[d.getMonth()]+(d.getMonth()!==f.getMonth()?"":"");
}
function mesDe(k){ return k.slice(0,7); }
function nombreMes(ym){
  const [a,m] = ym.split("-").map(Number);
  return MONTHS_FULL[m-1]+" "+a;
}

/* ---------- vista GIMNASIO ---------- */
function semanasEntrenadas(n){
  const out = [];
  for(let i=n-1; i>=0; i--){
    const lunes = weekKey(addDays(now, -7*i));
    const dias = Object.keys(S.trained||{}).filter(k=>S.trained[k]===true && weekKey(fromKey(k))===lunes).length;
    const card = Object.keys(S.cardio||{}).filter(k=>S.cardio[k]===true && weekKey(fromKey(k))===lunes).length;
    out.push({ semana:lunes, dias, cardio:card });
  }
  return out;
}
function ejerciciosConHistorial(){
  const out = [];
  Object.keys(S.liftHist).forEach(k=>{
    if(!S.liftHist[k] || S.liftHist[k].length < 1) return;
    const [id, vi] = k.split("|");
    let nombre = id;
    Object.keys(RUTINA).forEach(b=>{
      const ex = RUTINA[b].find(x=>x.id===id);
      if(ex){ const v = ex.v[+vi]; nombre = v ? v.n : ex.id; }
    });
    out.push({ k, nombre, n:S.liftHist[k].length });
  });
  return out.sort((a,b)=> b.n-a.n || a.nombre.localeCompare(b.nombre));
}
function renderGym(){
  if(!$("gymStats")) return;
  const sem = semanasEntrenadas(8);
  const totalSes = Object.keys(S.trained||{}).filter(k=>S.trained[k]===true).length;
  const totalCard = Object.keys(S.cardio||{}).filter(k=>S.cardio[k]===true).length;
  const ultimas4 = sem.slice(-4);
  const prom = ultimas4.length ? (ultimas4.reduce((a,x)=>a+x.dias,0)/ultimas4.length) : 0;
  const st = (v,l,c)=>`<div class="stat" style="--sc:${c}"><b>${v}</b><span>${l}</span></div>`;
  $("gymStats").innerHTML = st(totalSes,"sesiones","var(--em)")+
                            st(prom.toFixed(1),"prom. x semana","var(--sky)")+
                            st(totalCard,"cardios","var(--violet)");

  $("gymSemanas").innerHTML = barras(
    sem.map(x=>({ t:nombreSemana(x.semana), v:x.dias, txt:x.dias,
                  c: x.dias>=5 ? "var(--em)" : x.dias>=3 ? "var(--amber)" : "var(--coral)" })),
    { min:5, alt:"Sesiones de las últimas 8 semanas", vacio:"Marca «Entrené hoy» y aquí verás tus semanas." });

  const lista = ejerciciosConHistorial();
  const sel = $("gymEjercicio");
  if(!lista.length){
    sel.style.display = "none";
    $("gymCarga").innerHTML = `<div class="hist-vacio">Cambia el peso de algún ejercicio en Rutina y aquí verás cómo progresa.</div>`;
  }else{
    sel.style.display = "";
    const actual = sel.value && lista.some(x=>x.k===sel.value) ? sel.value : lista[0].k;
    sel.innerHTML = lista.map(x=>`<option value="${esc(x.k)}"${x.k===actual?" selected":""}>${esc(x.nombre)}</option>`).join("");
    const h = (S.liftHist[actual]||[]).slice(-12);
    const primero = h[0], ultimo = h[h.length-1];
    const dif = (primero && ultimo) ? +(ultimo.kg - primero.kg).toFixed(1) : 0;
    $("gymCarga").innerHTML =
      barras(h.map(x=>({ t:fmtDateShort(x.d), v:x.kg, txt:toUnit(x.kg)+"" })),
             { color:"var(--sky)", alt:"Peso levantado" }) +
      (h.length>1 ? `<div class="hist-pie">${dif>0?"Subiste":dif<0?"Bajaste":"Sin cambio:"} <b style="color:${dif>0?"var(--lime)":dif<0?"var(--coral)":"var(--muted)"}">${dif>0?"+":""}${toUnit(Math.abs(dif))} ${unitLabel()}</b> desde ${fmtDateShort(primero.d)}</div>` : "");
  }

  const dias = Object.keys(S.trained||{}).filter(k=>S.trained[k]===true).sort().reverse().slice(0,12);
  $("gymSesiones").innerHTML = dias.length ? dias.map(k=>{
    const b = bloqueDe(k);
    const series = Object.values(S.sets[k]||{}).reduce((a,v)=>a+(v||0),0);
    return `<li><span class="hl-d">${fmtDateShort(k)}</span>
      <span class="hl-n">${b?esc(b.short||b.title):"Entreno"}</span>
      <span class="hl-v">${series} series</span></li>`;
  }).join("") : `<li class="hist-vacio">Sin sesiones registradas todavía.</li>`;
}

/* ---------- vista DINERO ---------- */
function gastoPorCategoria(semana){
  const c = compraDe(semana), acc = {prot:0, carb:0, veg:0, fat:0};
  Object.keys(c.items).forEach(id=>{
    const it = shopById[id];
    if(it && c.items[id].e===COMPRA_OK) acc[it.cat] += (+c.items[id].$||0);
  });
  return acc;
}
function gastoDelMes(ym){
  return Object.keys(S.compras)
    .filter(k=>mesDe(k)===ym)          /* también la semana en curso */
    .reduce((a,k)=>a+resumenCompra(k).gasto, 0);
}
function renderDinero(){
  if(!$("dinStats")) return;
  /* Con el candado puesto no basta esconder el contenedor: las cifras no se
     pintan, para que no queden en el DOM de una pantalla bloqueada. */
  if(dineroCerrado()){
    ["dinStats","dinSemanas","dinPrecio","dinCategorias","dinMes","dinLista"]
      .forEach(k=>{ if($(k)) $(k).innerHTML = ""; });
    return;
  }
  const hist = historialCompras();
  const st = (v,l,c)=>`<div class="stat" style="--sc:${c}"><b>${v}</b><span>${l}</span></div>`;
  const totales = hist.map(h=>h.gasto);
  const prom = totales.length ? totales.reduce((a,b)=>a+b,0)/totales.length : 0;
  const esteMes = gastoDelMes(mesDe(dayKey));
  $("dinStats").innerHTML = st(fmt$(esteMes),"este mes","var(--em)")+
                            st(totales.length?fmt$(prom):"—","prom. semanal","var(--sky)")+
                            st(hist.length,"mandados","var(--violet)");

  const ult = hist.slice(0,8).reverse();
  $("dinSemanas").innerHTML = barras(
    ult.map(h=>({ t:nombreSemana(h.semana), v:h.gasto, txt:fmt$(h.gasto) })),
    { alt:"Gasto de las últimas semanas",
      vacio:"Marca productos en el Mandado y cierra la semana para empezar tu historial." });

  /* ---- tendencia de precios ---- */
  const conHist = Object.keys(S.precios||{})
    .filter(k=>Array.isArray(S.precios[k]) && S.precios[k].length)
    .map(k=>({ id:k, n: shopById[k] ? shopById[k].name : k, n2: S.precios[k].length }))
    .sort((a,b)=> b.n2-a.n2 || a.n.localeCompare(b.n));
  const selP = $("dinPrecioSel");
  if(!conHist.length){
    selP.style.display = "none";
    $("dinPrecio").innerHTML = `<div class="hist-vacio">Registra una compra en el Mandado y aquí verás cómo cambia el precio de cada alimento.</div>`;
  }else{
    selP.style.display = "";
    const act = selP.value && conHist.some(x=>x.id===selP.value) ? selP.value : conHist[0].id;
    selP.innerHTML = conHist.map(x=>`<option value="${esc(x.id)}"${x.id===act?" selected":""}>${esc(x.n)}</option>`).join("");
    const h = S.precios[act].slice(-10);
    const uni = h[h.length-1].u;
    const mismos = h.filter(x=>x.u===uni);          /* comparar peras con peras */
    const primero = mismos[0], ultimo = mismos[mismos.length-1];
    const dif = (primero && ultimo && primero.pu) ? (ultimo.pu-primero.pu)/primero.pu*100 : 0;
    $("dinPrecio").innerHTML =
      barras(mismos.map(x=>({ t:fmtDateShort(x.d), v:x.pu, txt:fmt$(x.pu) })),
             { color:"var(--amber)", alt:"Precio por "+uni }) +
      `<div class="hist-pie">Precio por <b>${esc(uni)}</b>` +
      (mismos.length>1
        ? ` · ${dif>0?"subió":dif<0?"bajó":"sin cambio"} <b style="color:${dif>0?"var(--coral)":dif<0?"var(--lime)":"var(--muted)"}">${dif>0?"+":""}${Math.round(dif)} %</b> desde ${fmtDateShort(primero.d)}`
        : ` · una sola captura por ahora`) + `</div>`;
  }

  const refSemana = hist.length ? hist[0].semana : thisWeek;
  const cats = gastoPorCategoria(refSemana);
  const sumaCat = Object.values(cats).reduce((a,b)=>a+b,0);
  $("dinCategorias").innerHTML = sumaCat ? `<div class="cat-list">${
    Object.keys(cats).sort((a,b)=>cats[b]-cats[a]).map(k=>{
      const pct = Math.round(cats[k]/sumaCat*100);
      return `<div class="cat-row">
        <span class="cat-n" style="--cc:${tono(CATS[k].c)}">${CATS[k].t}</span>
        <span class="cat-bar"><i style="width:${pct}%;background:${tono(CATS[k].c,3)}"></i></span>
        <span class="cat-v">${fmt$(cats[k])}<em>${pct}%</em></span></div>`;
    }).join("")}</div>` : `<div class="hist-vacio">Marca productos en el Mandado para ver en qué se te va.</div>`;

  const meta = +S.presupuestoMes || 0;
  if($("dinMeta") && document.activeElement !== $("dinMeta")) $("dinMeta").value = meta || "";
  $("dinMes").innerHTML = meta ? (()=>{
    const pct = Math.min(100, Math.round(esteMes/meta*100));
    const sobra = meta - esteMes;
    return `<div class="pres">
      <div class="pres-bar${esteMes>meta?" over":""}"><i style="width:${pct}%"></i></div>
      <div class="pres-t"><b>${fmt$(esteMes)}</b> de ${fmt$(meta)} en ${nombreMes(mesDe(dayKey))}
        <span>${sobra>=0?`te quedan ${fmt$(sobra)}`:`te pasaste ${fmt$(-sobra)}`}</span></div>
    </div>`;
  })() : `<div class="hist-vacio">Pon una cantidad y te aviso cómo vas cada mes.</div>`;

  $("dinLista").innerHTML = hist.length ? hist.slice(0,12).map(h=>
    `<li><span class="hl-d">${fmtDateShort(h.semana)}</span>
      <span class="hl-n">${h.ok} productos${h.no?` · ${h.no} sin encontrar`:""}${
        h.semana===thisWeek && !h.cerrada?` <em class="en-curso">en curso</em>`:""}</span>
      <span class="hl-v">${fmt$(h.gasto)}</span></li>`).join("")
    : `<li class="hist-vacio">Marca productos en el Mandado y aquí aparecerá tu gasto, sin hacer nada más.</li>`;
}

/* ==================================================================
   ASESOR FINANCIERO — capa de interfaz (FASE 0)
   Los cálculos NO viven aquí: están en finanzas.js. Esta capa sólo
   pinta lo que el motor devuelve, y siempre con la operación a la
   vista para que ningún número pida un acto de fe.
   ================================================================== */

/* S.fin lo crea saneaFin() al arrancar; esto es la red por si acaso */
function fin(){
  if(!S.fin || typeof S.fin !== "object"){ S.fin = finDef(); }
  return S.fin;
}

/* Abierto sólo durante esta sesión: al recargar vuelve a pedir el PIN.
   Nunca se persiste, para que un respaldo robado no venga desbloqueado. */
/* `var` a propósito: renderDinero() está definida ANTES de esta línea y una
   `let` la dejaría en zona muerta si algo la llama durante el arranque
   (ya pasó con histVista). Con var arranca en undefined, que es falsy. */
var dineroAbierto = false;
const NOMBRE_DIA = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];

function dineroCerrado(){
  const c = fin().candado;
  return !!(c && c.hash) && !dineroAbierto;
}

/* ---------- candado ---------- */
function renderCandado(err){
  const caja = $("dinCandado"), cuerpo = $("dinCuerpo"), ases = $("dinAsesor");
  if(!caja) return;
  const cerrado = dineroCerrado();
  caja.hidden = !cerrado;
  if(cuerpo) cuerpo.hidden = cerrado;
  if(ases)   ases.hidden   = cerrado;
  if(!cerrado){ caja.innerHTML = ""; return; }
  caja.innerHTML = `
    <div class="cd-ic" aria-hidden="true">🔒</div>
    <b>Tu dinero está protegido</b>
    <p class="cd-sub">Escribe tu PIN para ver ingresos, deudas y gastos.
      El resto de la app funciona sin PIN.</p>
    <div class="cd-fila">
      <input id="pinEntra" type="password" inputmode="numeric" autocomplete="off"
             maxlength="8" aria-label="PIN" placeholder="••••">
      <button id="pinAbrir" class="log-btn" style="min-width:96px">Abrir</button>
    </div>
    ${err ? `<div class="cd-err">${esc(err)}</div>` : ""}`;
  const inp = $("pinEntra"), btn = $("pinAbrir");
  if(btn) btn.onclick = intentaAbrirDinero;
  if(inp) inp.addEventListener("keydown", e=>{ if(e.key==="Enter") intentaAbrirDinero(); });
}

async function intentaAbrirDinero(){
  const inp = $("pinEntra"), btn = $("pinAbrir");
  if(!inp) return;
  const pin = String(inp.value || "");
  if(btn){ btn.disabled = true; btn.textContent = "…"; }
  const bien = await verificaPin(pin, fin().candado);
  /* al abrir hay que volver a pintar el resumen: mientras estaba cerrado se
     vació a propósito para no dejar cifras en el DOM */
  if(bien){ dineroAbierto = true; renderCandado(); renderAsesor(); renderDinero();
            sonar("comida"); return; }
  renderCandado("Ese PIN no es correcto. Vuelve a intentar.");
}

function abrirPinSheet(){
  const tiene = !!(fin().candado && fin().candado.hash);
  openSheet(tiene ? "Cambiar el PIN" : "Proteger con PIN",
            "Sólo para la sección de Dinero", `
    <div class="alta-form">
      <label class="nf"><span>PIN nuevo (4 a 8 dígitos)</span>
        <input id="pinA" type="password" inputmode="numeric" autocomplete="off" maxlength="8"></label>
      <label class="nf"><span>Repítelo</span>
        <input id="pinB" type="password" inputmode="numeric" autocomplete="off" maxlength="8">
        <small>No se guarda el PIN, sólo una huella suya. Si lo olvidas no hay
          forma de recuperarlo: no existe ningún servidor con tus datos.</small></label>
      <div class="ases-btns">
        <button id="pinGuardar">${tiene ? "Cambiar PIN" : "Activar candado"}</button>
        ${tiene ? `<button class="sec" id="pinQuitar">Quitar candado</button>` : ""}
      </div>
    </div>`);
  const g = $("pinGuardar"); if(g) g.onclick = guardarPin;
  const q = $("pinQuitar");  if(q) q.onclick = quitarPin;
}

async function guardarPin(){
  const a = $("pinA"), b = $("pinB"), btn = $("pinGuardar");
  if(!a || !b) return;
  const p1 = String(a.value||""), p2 = String(b.value||"");
  if(!/^\d{4,8}$/.test(p1)){ showToast("El PIN son de 4 a 8 dígitos"); return; }
  if(p1 !== p2){ showToast("Los dos PIN no coinciden"); return; }
  if(btn){ btn.disabled = true; btn.textContent = "Cifrando…"; }
  const reg = await creaPin(p1);
  if(!reg){ showToast("Ese PIN no sirve, usa 4 a 8 dígitos");
            if(btn){ btn.disabled=false; btn.textContent="Activar candado"; } return; }
  fin().candado = reg;
  dineroAbierto = true;                       /* no te encierres al configurarlo */
  save(); closeSheet(); renderAsesor(); renderCandado();
  showToast("🔒 Candado activado ✓");
}

function quitarPin(){
  if(!confirm("¿Quitar el candado? Cualquiera que tome tu teléfono podrá ver tus deudas y saldos.")) return;
  fin().candado = null;
  save(); closeSheet(); renderAsesor(); renderCandado();
  showToast("Candado quitado");
}

/* ---------- alta inicial (genérica: sirve para cualquier persona) ---------- */
const MONEDAS = [["MXN","Peso mexicano"],["USD","Dólar"],["EUR","Euro"],
                 ["COP","Peso colombiano"],["ARS","Peso argentino"],
                 ["CLP","Peso chileno"],["PEN","Sol"],["BRL","Real"]];

function abrirAlta(){
  const f = fin(), ing = f.ingresos[0] || {};
  const frec = ing.frecuencia || "semanal";
  openSheet("¿Cómo entra tu dinero?", "Se puede cambiar después", `
    <div class="alta-form">
      <label class="nf"><span>De dónde viene</span>
        <input id="altaNombre" type="text" maxlength="80" placeholder="Sueldo"
               value="${esc(ing.nombre || "")}"></label>
      <label class="nf"><span>Cada cuándo te pagan</span>
        <select id="altaFrec">
          ${[["semanal","Cada semana"],["quincenal","Cada quincena"],
             ["mensual","Una vez al mes"],["irregular","Sin fecha fija"]]
            .map(o=>`<option value="${o[0]}"${o[0]===frec?" selected":""}>${o[1]}</option>`).join("")}
        </select></label>
      <div class="fila">
        <label class="nf"><span>Cuánto por pago</span>
          <input id="altaMonto" type="number" inputmode="decimal" step="any" min="0"
                 placeholder="0" value="${ing.monto ? numero(ing.monto) : ""}"></label>
        <label class="nf" id="altaDiaSemBox"><span>Qué día</span>
          <select id="altaDiaSem">${NOMBRE_DIA.map((d,i)=>
            `<option value="${i}"${i===(ing.diaSemana===null||ing.diaSemana===undefined?6:ing.diaSemana)?" selected":""}>${d}</option>`).join("")}</select></label>
        <label class="nf" id="altaDiaMesBox" hidden><span>Qué día del mes</span>
          <input id="altaDiaMes" type="number" inputmode="numeric" min="1" max="31"
                 value="${ing.diaMes || 15}"></label>
      </div>
      <label class="nf"><span>Moneda</span>
        <select id="altaMoneda">${MONEDAS.map(m=>
          `<option value="${m[0]}"${m[0]===f.perfil.moneda?" selected":""}>${m[0]} · ${m[1]}</option>`).join("")}</select></label>
      <label class="nf"><span>Colchón mínimo en la cuenta</span>
        <input id="altaColchon" type="number" inputmode="decimal" step="any" min="0"
               placeholder="0" value="${f.perfil.colchonMinimo || ""}">
        <small>Lo que nunca quieres que baje tu saldo. Si no sabes, deja 0 y lo
          ajustamos después: el asesor no gastará por debajo de esta línea.</small></label>
      <div class="ases-btns">
        <button id="altaGuardar">Guardar</button>
      </div>
      <div class="nut-hint">Con esto ya puedo calcular tu ingreso real por mes.
        Un sueldo semanal no son cuatro pagos y un tercio: hay meses de cuatro y
        meses de cinco, y eso cambia todo.</div>
    </div>`);
  const sel = $("altaFrec");
  const pinta = ()=>{
    const v = sel.value;
    const bs = $("altaDiaSemBox"), bm = $("altaDiaMesBox"), bt = $("altaMonto");
    if(bs) bs.hidden = v !== "semanal";
    if(bm) bm.hidden = !(v === "quincenal" || v === "mensual");
    if(bt) bt.closest(".nf").hidden = false;
  };
  if(sel){ sel.onchange = pinta; pinta(); }
  const g = $("altaGuardar"); if(g) g.onclick = guardarAlta;
}

function guardarAlta(){
  const f = fin();
  const frec   = $("altaFrec").value;
  const monto  = numero($("altaMonto").value);
  const nombre = String($("altaNombre").value || "").trim() || "Ingreso";
  if(frec !== "irregular" && monto <= 0){ showToast("Pon cuánto te pagan por pago"); return; }

  const ing = { id: f.ingresos[0] ? f.ingresos[0].id : "ing"+Date.now().toString(36),
                nombre, tipo:"recurrente", monto, frecuencia:frec, activo:true,
                diaSemana:null, diaMes:null, diaMes2:null };
  if(frec === "semanal")   ing.diaSemana = numero($("altaDiaSem").value);
  if(frec === "quincenal"){ ing.diaMes = numero($("altaDiaMes").value) || 15; ing.diaMes2 = 0; }
  if(frec === "mensual")    ing.diaMes = numero($("altaDiaMes").value) || 1;

  f.ingresos = [ing];
  f.perfil.moneda = $("altaMoneda").value;
  f.perfil.colchonMinimo = Math.max(0, numero($("altaColchon").value));
  f.perfil.altaHecha = true;
  saneaFin(S);                       /* que pase por el mismo filtro que un respaldo */
  save(); closeSheet(); renderAsesor();
  showToast("💰 Listo · ya puedo calcular tu mes");
}

/* ---------- resumen del asesor ---------- */
function renderAsesor(){
  const caja = $("dinAsesor");
  if(!caja) return;
  if(dineroCerrado()){ caja.innerHTML = ""; return; }
  const f = fin();

  if(!f.perfil.altaHecha){
    caja.innerHTML = `
      <div class="ases">
        <span class="ases-eyebrow">Asesor financiero</span>
        <h3>Todavía no sé cómo entra tu dinero</h3>
        <p class="ases-sub">Con tu ingreso y cada cuándo te pagan puedo calcular tu
          mes real, avisarte de los meses que traen un pago extra y decirte cuánto
          puedes gastar sin romper nada.</p>
        <div class="ases-btns"><button id="dinAltaBtn">Configurar mi dinero</button></div>
      </div>`;
    const b = $("dinAltaBtn"); if(b) b.onclick = abrirAlta;
    return;
  }

  const hoy = new Date(), anio = hoy.getFullYear(), mes = hoy.getMonth()+1;
  const total  = ingresoDelMes(f, anio, mes);
  const base   = ingresoDelMes(f, anio, mes, {base:true});
  const extra  = total - base;
  const ing    = f.ingresos[0] || {};
  const veces  = pagosEnMes(ing, anio, mes);
  const fechas = fechasDePago(ing, anio, mes);
  const nMes   = MONTHS_FULL[mes-1];
  const tiene  = !!(f.candado && f.candado.hash);

  /* Sin fecha fija no hay calendario que proyectar. Pintar $0 sería mentir con
     cara de dato: mejor decir qué falta. (Un freelance vive así.) */
  const sinFecha = ing.frecuencia === "irregular" || !fechas.length;

  caja.innerHTML = `
    <div class="ases" id="dinResumen">
      <span class="ases-eyebrow">Asesor financiero</span>
      <h3>${sinFecha ? "Tu ingreso no tiene fecha fija" : "Tu " + esc(nMes) + " real"}</h3>
      <p class="ases-sub">${sinFecha
        ? "Con un ingreso irregular no puedo proyectar el mes por calendario. En cuanto registres lo que va entrando, el asesor trabaja sobre lo real en vez de sobre un supuesto."
        : "Calculado con el calendario, no con un promedio."}</p>
      ${sinFecha ? "" : `<div class="ases-cifra">
        <b>${fmt$(total)}</b>
        <span>${veces} pago${veces===1?"":"s"} de ${esc(ing.nombre||"tu ingreso")} en ${esc(nMes)}</span>
      </div>`}
      ${extra > 0 ? `<div class="ases-nota"><b>Este mes trae un pago extra de ${fmt$(extra)}.</b>
        Presupuesta con ${fmt$(base)} y trata ese sobrante como ingreso
        extraordinario: a deuda cara o al colchón, nunca a gasto corriente.</div>` : ""}
      ${sinFecha ? "" : `<details class="ases-cuentas"><summary></summary>
        <code>${esc(veces + " pagos × " + fmt$(numero(ing.monto)) + " = " + fmt$(total))}
${esc("base conservadora (" + pagosBase(ing) + " pagos) = " + fmt$(base))}
${esc("fechas: " + fechas.join(", "))}</code>
      </details>`}
      <div class="ases-btns">
        <button class="sec" id="dinAltaBtn">Cambiar mi ingreso</button>
        <button class="sec" id="dinPinBtn">${tiene ? "Cambiar PIN" : "Proteger con PIN"}</button>
      </div>
    </div>`;
  const b = $("dinAltaBtn"); if(b) b.onclick = abrirAlta;
  const c = $("dinPinBtn");  if(c) c.onclick = abrirPinSheet;
}

function renderHistorial(){
  if(!document.getElementById("hv-cuerpo")) return;
  if(histVista==="gym") renderGym();
  else if(histVista==="dinero"){ renderCandado(); renderAsesor(); renderDinero(); }
}
function irAVista(v){
  histVista = v;
  document.querySelectorAll(".hist-tabs [data-hv]").forEach(b=>{
    const on = b.dataset.hv===v;
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.classList.toggle("on", on);
  });
  document.querySelectorAll(".hv").forEach(x=>x.classList.toggle("activa", x.id==="hv-"+v));
  renderHistorial();
}
document.querySelector(".hist-tabs").addEventListener("click", e=>{
  const b = e.target.closest("[data-hv]"); if(!b) return;
  irAVista(b.dataset.hv);
});
$("gymEjercicio").addEventListener("change", renderGym);
$("dinPrecioSel").addEventListener("change", renderDinero);
$("dinMeta").addEventListener("input", e=>{
  S.presupuestoMes = +e.target.value || 0;
  clearTimeout(window._presT);
  window._presT = setTimeout(()=>{ save(); renderDinero(); }, 400);
});
irAVista("cuerpo");

/* ==================================================================
   ASISTENTE — botón flotante, chat y acciones
   ------------------------------------------------------------------
   Corre COMPLETO dentro del teléfono: no hay servidor, no hay API,
   no sale un byte. El intérprete vive en asistente.js (puro); aquí
   están las acciones, que son las únicas que tocan tus datos.

   Regla que no se rompe: el asistente PROPONE y tú confirmas. Cada
   acción que escribe algo muestra el antes, el después y su efecto,
   guarda cómo estaba, y deja un deshacer. Todo queda en la bitácora.
   ================================================================== */
var chatMsgs = [];          /* {quien:"tu"|"bot", texto, tarjeta, id} */
var pendiente = null;       /* acción esperando confirmación */
var asistenteAbierto = false;

const AVATAR = `<svg viewBox="0 0 40 40" aria-hidden="true" class="ava">
  <defs><linearGradient id="avg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#2fb5a3"/><stop offset="1" stop-color="#1b396b"/></linearGradient></defs>
  <circle cx="20" cy="20" r="20" fill="url(#avg)"/>
  <rect x="10" y="13" width="20" height="16" rx="7" fill="#eef7f6"/>
  <circle cx="16" cy="21" r="2.4" fill="#1b396b"/><circle cx="24" cy="21" r="2.4" fill="#1b396b"/>
  <circle cx="16.8" cy="20.2" r=".8" fill="#fff"/><circle cx="24.8" cy="20.2" r=".8" fill="#fff"/>
  <path d="M17 25.4c1.8 1.3 4.2 1.3 6 0" stroke="#1b396b" stroke-width="1.6"
        stroke-linecap="round" fill="none"/>
  <path d="M20 13V9.5" stroke="#eef7f6" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="20" cy="8.2" r="1.9" fill="#59cfe0"/>
  <rect x="6.6" y="18" width="2.6" height="6" rx="1.3" fill="#eef7f6" opacity=".85"/>
  <rect x="30.8" y="18" width="2.6" height="6" rx="1.3" fill="#eef7f6" opacity=".85"/>
</svg>`;

/* catálogos que el intérprete usa para reconocer de qué hablas */
function contextoAsistente(){
  const alimentos = SHOP.map(it=>{
    const a = selAlt(it.id);
    return { id: it.id, nombre: (a ? a.n : it.name) };
  });
  const ejercicios = [];
  Object.values(RUTINA).forEach(list => list.forEach(ex=>{
    if(!ejercicios.some(x=>x.id===ex.id))
      ejercicios.push({ id: ex.id, nombre: getVar(ex).n });
  }));
  return {
    hoy: new Date(), hoyClave: dayKey,
    alimentos, ejercicios,
    categorias: Object.keys(CATS).map(k=>({ id:k, nombre:CATS[k].t }))
      .concat([{id:"salidas",nombre:"Salidas"},{id:"despensa",nombre:"Despensa"},
               {id:"transporte",nombre:"Transporte"},{id:"servicios",nombre:"Servicios"},
               {id:"salud",nombre:"Salud"},{id:"ropa",nombre:"Ropa"}]),
    snacks: SNACKS.map((s,i)=>({ id:"sn"+i, nombre:s.n, ref:s }))
  };
}

/* ---------- acciones: lo ÚNICO que puede tocar tus datos ---------- */
const ACCIONES = {

  registrarGasto: { dominio:"dinero", escribe:true,
    previo(p){
      const cat = p.etiqueta || "sin categoría";
      const mes = mesDe(p.fecha || dayKey);
      const yaVa = gastoDelMes(mes);
      const meta = numero(S.presupuestoMes);
      const lineas = [["Monto", fmt$(p.monto)], ["Categoría", cat],
                      ["Fecha", p.fecha || dayKey]];
      let efecto = "";
      if(meta > 0){
        const desp = yaVa + p.monto;
        efecto = desp > meta
          ? `Con esto llevarías ${fmt$(desp)} contra tu presupuesto de ${fmt$(meta)}: te pasarías ${fmt$(desp-meta)}.`
          : `Llevarías ${fmt$(desp)} de ${fmt$(meta)}; te quedarían ${fmt$(meta-desp)} para el resto del mes.`;
      }
      return { titulo:"Registrar un gasto", lineas, efecto };
    },
    aplica(p){
      const antes = { fin: JSON.parse(JSON.stringify(S.fin)) };
      fin().movimientos.push({ id:"mv"+Date.now().toString(36), fecha:p.fecha || dayKey,
        monto:numero(p.monto), tipo:"gasto", cuenta:"", categoria:String(p.categoria||""),
        deudaId:null, apartadoId:null, nota:"", planeado:false });
      return { resumen:`Gasto de ${fmt$(p.monto)} registrado`, antes };
    } },

  ajustarPresupuesto: { dominio:"dinero", escribe:true,
    previo(p){ return { titulo:"Cambiar el presupuesto del mes",
      lineas:[["Antes", fmt$(numero(S.presupuestoMes))], ["Después", fmt$(p.monto)]],
      efecto:`Llevas ${fmt$(gastoDelMes(mesDe(dayKey)))} gastados este mes.` }; },
    aplica(p){ const antes = { presupuestoMes: S.presupuestoMes };
      S.presupuestoMes = numero(p.monto);
      return { resumen:`Presupuesto en ${fmt$(p.monto)}`, antes }; } },

  puedoGastar: { dominio:"dinero", escribe:false,
    responde(p){
      const meta = numero(S.presupuestoMes), yaVa = gastoDelMes(mesDe(dayKey));
      if(meta <= 0) return `Todavía no me has puesto un presupuesto del mes, así que no tengo contra qué comparar. Ponlo en Historial → Dinero y te contesto con números.`;
      const queda = meta - yaVa;
      const desp = queda - numero(p.monto);
      return desp >= 0
        ? `Sí te alcanza. Llevas ${fmt$(yaVa)} de ${fmt$(meta)}; después de ese gasto te quedarían ${fmt$(desp)} para el resto del mes.`
        : `No sin pasarte. Te quedan ${fmt$(queda)} del presupuesto y ese gasto es de ${fmt$(p.monto)}: te pasarías ${fmt$(-desp)}.`;
    } },

  comoVoy: { dominio:"dinero", escribe:false,
    responde(){
      const meta = numero(S.presupuestoMes), yaVa = gastoDelMes(mesDe(dayKey));
      const nm = nombreMes(mesDe(dayKey));
      if(meta <= 0) return `En ${nm} llevas ${fmt$(yaVa)} de mandado. No tienes presupuesto puesto, así que no puedo decirte si vas bien o mal.`;
      const pct = Math.round(yaVa / meta * 100);
      return `En ${nm} llevas ${fmt$(yaVa)} de ${fmt$(meta)} — ${pct} % del presupuesto. ${
        yaVa > meta ? `Te pasaste ${fmt$(yaVa-meta)}.` : `Te quedan ${fmt$(meta-yaVa)}.`}`;
    } },

  ordenDeuda: { dominio:"dinero", escribe:false,
    responde(p){
      const d = fin().deudas.filter(x=>numero(x.saldo) > 0);
      if(!d.length) return `Todavía no me has capturado ninguna deuda. En cuanto estén, te comparo avalancha contra bola de nieve con tus tasas reales.`;
      const conInteres = d.map(x=>({ n:x.nombre || "sin nombre", saldo:numero(x.saldo),
        tasa:numero(x.tasaAnual), mes: numero(x.saldo) * numero(x.tasaAnual) / 12,
        msi: x.tipo === "msi" && numero(x.tasaAnual) === 0 }));
      const avalancha = conInteres.slice().sort((a,b)=> b.tasa - a.tasa);
      const nieve     = conInteres.slice().sort((a,b)=> a.saldo - b.saldo);
      const total = conInteres.reduce((s,x)=>s + x.mes, 0);
      const protegidas = conInteres.filter(x=>x.msi);
      return `Al saldo de hoy, tus deudas te cuestan ${fmt$(total)} de interés al mes.\n\n`+
        `Avalancha (menos interés total): ${avalancha.map(x=>x.n).join(" → ")}\n`+
        `Bola de nieve (victorias antes): ${nieve.map(x=>x.n).join(" → ")}\n\n`+
        (protegidas.length
          ? `Ojo: ${protegidas.map(x=>x.n).join(", ")} está a 0 % real. Adelantarla no te ahorra un peso de interés y te quita liquidez, así que va al final pase lo que pase.`
          : `Yo iría por avalancha: paga primero la de tasa más alta.`);
    } },

  precioAlimento: { dominio:"mandado", escribe:true,
    previo(p){
      const uni = p.unidad === "kg" ? "kilo" : p.unidad === "l" ? "litro"
                : p.unidad === "pz" ? "pieza" : (p.unidad || "unidad");
      const at = precioAtipico(p.alimento, uni, p.precio);
      return { titulo:"Guardar un precio",
        lineas:[["Alimento", p.nombre], ["Precio", fmt$(p.precio) + " por " + uni]],
        efecto: at ? `Ese precio está ${Math.abs(at.pct)} % ${at.pct>0?"arriba":"abajo"} de tu mediana (${fmt$(at.mediana)} por ${uni}).`
                   : `Se guarda con la fecha de hoy para tu tendencia de precios.` };
    },
    aplica(p){
      const antes = { precios: JSON.parse(JSON.stringify(S.precios||{})),
                      nutEdits: JSON.parse(JSON.stringify(S.nutEdits||{})) };
      const uni = p.unidad === "kg" ? "kilo" : p.unidad === "l" ? "litro"
                : p.unidad === "pz" ? "pieza" : (p.unidad || "unidad");
      const factorU = uni === "kilo" || uni === "litro" ? 10 : 1;
      const key = nutKey(p.alimento, S.swaps[p.alimento]);
      if(!S.nutEdits[key]) S.nutEdits[key] = {};
      S.nutEdits[key].precio = numero(p.precio) / factorU;
      if(!S.precios[p.alimento]) S.precios[p.alimento] = [];
      S.precios[p.alimento].push({ d:dayKey, pu:numero(p.precio), u:uni });
      return { resumen:`${p.nombre} a ${fmt$(p.precio)} por ${uni}`, antes,
               repinta:["shop","historial"] };
    } },

  definirUnidad: { dominio:"mandado", escribe:true,
    previo(p){ return { titulo:"Guardar una unidad tuya",
      lineas:[["Alimento", p.nombre], ["Unidad", p.unidad],
              ["Equivale a", p.cuanto + " " + p.medida]],
      efecto:`La próxima vez que registres ${p.nombre} vas a poder elegir "${p.unidad}" de un toque.` }; },
    aplica(p){
      const antes = { unidades: JSON.parse(JSON.stringify(S.unidades||{})) };
      guardaUnidad(p.alimento, p.unidad, p.cuanto, p.medida);
      return { resumen:`"${p.unidad}" = ${p.cuanto} ${p.medida} en ${p.nombre}`, antes };
    } },

  cambiarCarga: { dominio:"rutina", escribe:true,
    previo(p){
      const ex = _asEjercicio(p.ejercicio);
      if(!ex) return null;
      return { titulo:"Cambiar la carga",
        lineas:[["Ejercicio", p.nombre], ["Antes", fmtW(getW(ex))],
                ["Después", p.peso + " " + p.unidad]],
        efecto:`Cambia el peso de trabajo; tu progresión sigue igual.` };
    },
    aplica(p){
      const ex = _asEjercicio(p.ejercicio);
      const antes = { lifts: JSON.parse(JSON.stringify(S.lifts||{})),
                      liftHist: JSON.parse(JSON.stringify(S.liftHist||{})) };
      const kg = roundP(p.unidad === "lb" ? numero(p.peso) / KG2LB : numero(p.peso));
      /* dos cosas distintas: S.lifts es el peso de TRABAJO (lo que ves y
         usa la progresión) y guardarCarga() sólo anota el histórico.
         Escribir sólo el histórico dejaba la carga sin cambiar. */
      S.lifts[liftKey(ex)] = kg;
      guardarCarga(ex, kg);
      return { resumen:`${p.nombre} en ${p.peso} ${p.unidad}`, antes, repinta:["rutina"] };
    } },

  sustituirEjercicio: { dominio:"rutina", escribe:true,
    previo(p){
      const ex = _asEjercicio(p.ejercicio);
      if(!ex) return null;
      const cand = buscaEnCatalogo(p.busca, ex.v.map((v,i)=>({id:i, nombre:v.n})), 0.55);
      if(!cand) return { titulo:"Cambiar la variante", lineas:[["Ejercicio", p.nombre]],
        efecto:`No encontré "${p.busca}" entre las ${ex.v.length} variantes de ese ejercicio. Ábrelo y elígela a mano.`, sinAccion:true };
      return { titulo:"Cambiar la variante",
        lineas:[["Antes", getVar(ex).n], ["Después", ex.v[cand.item.id].n]],
        efecto:`Cambia el ejercicio de hoy en adelante. Las cargas se guardan por variante, así que no pierdes tu historial.`,
        _vi: cand.item.id };
    },
    aplica(p, prev){
      const ex = _asEjercicio(p.ejercicio);
      const antes = { varSel: JSON.parse(JSON.stringify(S.varSel||{})) };
      S.varSel[ex.id] = prev._vi;
      return { resumen:`${p.nombre} → ${ex.v[prev._vi].n}`, antes, repinta:["rutina"] };
    } },

  registrarSnack: { dominio:"dieta", escribe:true,
    previo(p){ return { titulo:"Registrar un snack",
      lineas:[["Snack", p.nombre]],
      efecto:`Se suma a tus snacks de hoy y a los macros del día.` }; },
    aplica(p){
      const antes = { snacks: JSON.parse(JSON.stringify(S.snacks||{})) };
      const i = +String(p.snack).replace("sn","");
      const s = SNACKS[i];
      if(s) snacksHoy().push({ id:p.snack, n:s.n, kcal:numero(s.kcal),
                               p:numero(String(s.p).replace(/\D/g,"")), ts:Date.now() });
      return { resumen:`${p.nombre} registrado`, antes, repinta:["snacks","hoy"] };
    } },

  cambiarMacros: { dominio:"dieta", escribe:true,
    previo(p){
      const key = nutKey(p.alimento, S.swaps[p.alimento]);
      const n = nutOf(key);
      const etq = {kcal:"calorías", p:"proteína", c:"carbohidratos", f:"grasa"}[p.campo];
      return { titulo:"Cambiar la etiqueta",
        lineas:[["Alimento", p.nombre], ["Campo", etq],
                ["Antes", fmtN(n[p.campo])], ["Después", fmtN(p.valor)]],
        efecto:`Recalcula los macros de toda la app: comidas, día completo y equivalencias.` };
    },
    aplica(p){
      const antes = { nutEdits: JSON.parse(JSON.stringify(S.nutEdits||{})) };
      const key = nutKey(p.alimento, S.swaps[p.alimento]);
      if(!S.nutEdits[key]) S.nutEdits[key] = {};
      S.nutEdits[key][p.campo] = numero(p.valor);
      return { resumen:`${p.nombre}: ${p.campo} = ${fmtN(p.valor)}`, antes,
               repinta:["todo"] };
    } },

  sustituirAlimento: { dominio:"dieta", escribe:false,
    responde(p){ return `Para cambiar ${p.nombre} por una equivalencia, ábrelo en el Mandado y toca "Cambiar por otra opción": ahí te muestro las equivalencias que mantienen tus macros.`; } }
};

function _asEjercicio(id){
  for(const list of Object.values(RUTINA)){
    const ex = list.find(x=>x.id === id);
    if(ex) return ex;
  }
  return null;
}

const ETIQUETA_ACCION = {
  registrarGasto:"Registrar un gasto", ajustarPresupuesto:"Cambiar el presupuesto",
  puedoGastar:"¿Me alcanza para…?", comoVoy:"¿Cómo voy este mes?",
  ordenDeuda:"¿Qué deuda pago primero?", precioAlimento:"Guardar un precio",
  definirUnidad:"Definir una unidad", cambiarCarga:"Cambiar una carga",
  sustituirEjercicio:"Cambiar de variante", registrarSnack:"Registrar un snack",
  cambiarMacros:"Cambiar una etiqueta", sustituirAlimento:"Sustituir un alimento"
};
const PIDE_DATO = {
  monto:"¿de cuánto?", precio:"¿a qué precio?", alimento:"¿de cuál alimento?",
  ejercicio:"¿de cuál ejercicio?", peso:"¿cuánto peso?", cuanto:"¿de cuánto es?",
  nombreUnidad:"¿cómo le dices a esa unidad?", snack:"¿cuál snack?",
  valor:"¿qué valor?", cual:"¿cuál macro: proteína, carbos, grasa o calorías?",
  reemplazo:"¿por cuál lo cambio?"
};

/* ---------- bitácora ---------- */
function anotaBitacora(accion, resumen){
  if(!Array.isArray(S.bitacora)) S.bitacora = [];
  S.bitacora.unshift({ ts:Date.now(), accion:String(accion).slice(0,40),
                       resumen:String(resumen).slice(0,200) });
  if(S.bitacora.length > 100) S.bitacora.length = 100;
}

/* ---------- conversación ---------- */
function diAsistente(texto, tarjeta){
  chatMsgs.push({ quien:"bot", texto, tarjeta, id:"m"+(chatMsgs.length+1) });
  renderChat();
}
function mandaAlAsistente(txt){
  const frase = String(txt||"").trim();
  if(!frase) return;
  chatMsgs.push({ quien:"tu", texto:frase, id:"m"+(chatMsgs.length+1) });
  renderChat();

  const r = interpreta(frase, contextoAsistente());

  if(!r.accion){
    if(r.motivo === "falta-dato"){
      diAsistente(`Entendí que quieres ${ (ETIQUETA_ACCION[r.intencion]||"eso").toLowerCase() }, pero me falta un dato: ${PIDE_DATO[r.falta] || "¿me lo dices?"}`);
      return;
    }
    diAsistente("No te entendí esa. ¿Quisiste alguna de éstas?", {
      tipo:"botones", opciones:(r.sugerencias||[]).map(s=>({ id:s.id,
        txt: ETIQUETA_ACCION[s.id] || s.id })) });
    return;
  }

  const def = ACCIONES[r.accion];
  if(!def){ diAsistente("Eso todavía no lo sé hacer."); return; }

  /* el candado manda: con Dinero cerrado, el asistente no toca dinero */
  if(def.dominio === "dinero" && dineroCerrado()){
    diAsistente("Tu sección de Dinero está protegida con PIN. Ábrela en Historial → Dinero y aquí seguimos.");
    return;
  }

  if(!def.escribe){
    diAsistente(def.responde ? def.responde(r.params) : "Sin datos suficientes todavía.");
    return;
  }

  const prev = def.previo(r.params);
  if(!prev){ diAsistente("No pude preparar ese cambio. Revisa que el dato exista."); return; }
  if(prev.sinAccion){ diAsistente(prev.efecto); return; }

  /* id propio: sin esto, una tarjeta vieja seguía con su botón activo y
     aplicaba la propuesta ACTUAL, que no es la que estaba mostrando */
  const pid = "p" + Date.now().toString(36) + chatMsgs.length;
  pendiente = { id:pid, accion:r.accion, params:r.params, prev };
  diAsistente(null, { tipo:"confirmar", pid, titulo:prev.titulo, lineas:prev.lineas,
                      efecto:prev.efecto });
}

function aplicaPendiente(pid){
  if(!pendiente || (pid && pendiente.id !== pid)) return;
  const { accion, params, prev } = pendiente;
  const def = ACCIONES[accion];
  const res = def.aplica(params, prev);
  anotaBitacora(accion, res.resumen);
  save();
  pendiente = null;
  refrescaPor(res.repinta);
  const idDeshacer = "u" + Date.now().toString(36);
  chatMsgs.push({ quien:"bot", texto:"✓ " + res.resumen, id:idDeshacer,
                  tarjeta:{ tipo:"deshacer", antes:res.antes, repinta:res.repinta } });
  renderChat(); avisar("comida");
}

function deshaceCambio(idx){
  const m = chatMsgs[idx];
  if(!m || !m.tarjeta || m.tarjeta.tipo !== "deshacer") return;
  Object.keys(m.tarjeta.antes).forEach(k=>{ S[k] = m.tarjeta.antes[k]; });
  save();
  refrescaPor(m.tarjeta.repinta);
  m.tarjeta = null;
  m.texto = "↩︎ Deshecho. Tus datos quedaron como estaban.";
  anotaBitacora("deshacer", m.texto);
  renderChat();
}

function refrescaPor(lista){
  const q = lista || [];
  if(q.includes("todo")){ applyPersona(); renderTargets(); renderMeals(); renderShop();
                          renderRoutine(); renderHistorial(); renderSnacks(); return; }
  if(q.includes("shop"))      renderShop();
  if(q.includes("rutina"))    renderRoutine();
  if(q.includes("snacks"))    renderSnacks();
  if(q.includes("hoy"))     { renderMeals(); renderTargets(); }
  if(q.includes("historial") || !q.length) renderHistorial();
}

/* ---------- pintado ---------- */
function renderChat(){
  const caja = $("chatMsgs"); if(!caja) return;
  caja.innerHTML = chatMsgs.map((m,i)=>{
    if(m.quien === "tu") return `<div class="ch-tu">${esc(m.texto)}</div>`;
    let extra = "";
    const t = m.tarjeta;
    if(t && t.tipo === "confirmar"){
      extra = `<div class="ch-conf">
        <b>${esc(t.titulo)}</b>
        <dl>${t.lineas.map(l=>`<div><dt>${esc(l[0])}</dt><dd>${esc(String(l[1]))}</dd></div>`).join("")}</dl>
        ${t.efecto?`<p class="ch-ef">${esc(t.efecto)}</p>`:""}
        ${(pendiente && pendiente.id === t.pid)
          ? `<div class="ch-btns">
               <button data-aplicar="${esc(t.pid)}">Sí, hazlo</button>
               <button class="sec" data-cancelar="1">Cancelar</button>
             </div>`
          : `<p class="ch-caduca">Esta propuesta ya no está vigente.</p>`}</div>`;
    } else if(t && t.tipo === "botones"){
      extra = `<div class="ch-ops">${t.opciones.map(o=>
        `<button data-sugerencia="${esc(o.id)}">${esc(o.txt)}</button>`).join("")}</div>`;
    } else if(t && t.tipo === "deshacer"){
      extra = `<div class="ch-btns"><button class="sec" data-deshacer="${i}">Deshacer</button></div>`;
    }
    return `<div class="ch-bot">${AVATAR}<div class="ch-burb">${
      m.texto ? `<p>${esc(m.texto).replace(/\n/g,"<br>")}</p>` : ""}${extra}</div></div>`;
  }).join("");
  caja.scrollTop = caja.scrollHeight;
}

function abreAsistente(){
  asistenteAbierto = true;
  $("chatOv").classList.add("show");
  document.body.classList.add("chat-abierto");
  document.body.style.overflow = "hidden";
  if(!chatMsgs.length){
    diAsistente("Hola, soy tu asistente. Dime qué hiciste y yo lo registro: «gasté 300 con mi novia», «el pollo a 148 el kilo», «subí a 52.5 en sentadilla». Nada de esto sale de tu teléfono.");
  }
  setTimeout(()=>{ const i = $("chatIn"); if(i) i.focus(); }, 120);
}
function cierraAsistente(){
  asistenteAbierto = false; pendiente = null;
  $("chatOv").classList.remove("show");
  document.body.classList.remove("chat-abierto");
  document.body.style.overflow = "";
}

/* ---------- micrófono (sólo donde el navegador lo trae) ---------- */
function hayDictado(){ return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
var _rec = null;
function alternaDictado(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ showToast("Usa el micrófono de tu teclado para dictar"); return; }
  if(_rec){ try{ _rec.stop(); }catch(e){} _rec = null;
            $("chatMic").classList.remove("oyendo"); return; }
  _rec = new SR();
  _rec.lang = "es-MX"; _rec.interimResults = false; _rec.maxAlternatives = 1;
  _rec.onresult = ev=>{ const txt = ev.results[0][0].transcript;
    const i = $("chatIn"); if(i){ i.value = txt; } };
  _rec.onend = ()=>{ _rec = null; $("chatMic").classList.remove("oyendo"); };
  _rec.onerror = ()=>{ _rec = null; $("chatMic").classList.remove("oyendo");
                       showToast("No pude escuchar; escríbelo o usa el teclado"); };
  try{ _rec.start(); $("chatMic").classList.add("oyendo"); }
  catch(e){ _rec = null; }
}

/* ---------- eventos ---------- */
(function(){
  const fab = $("fabIA");
  if(fab) fab.onclick = abreAsistente;
  const cerrar = $("chatClose");
  if(cerrar) cerrar.onclick = cierraAsistente;
  const ov = $("chatOv");
  if(ov) ov.addEventListener("click", e=>{ if(e.target === ov) cierraAsistente(); });
  const enviar = ()=>{ const i = $("chatIn"); if(!i) return;
                       const v = i.value; i.value = ""; mandaAlAsistente(v); };
  const bEnv = $("chatSend");
  if(bEnv) bEnv.onclick = enviar;
  const inp = $("chatIn");
  if(inp) inp.addEventListener("keydown", e=>{ if(e.key === "Enter") enviar(); });
  const mic = $("chatMic");
  if(mic){ mic.hidden = !hayDictado(); mic.onclick = alternaDictado; }

  const msgs = $("chatMsgs");
  if(msgs) msgs.addEventListener("click", e=>{
    const ap = e.target.closest("[data-aplicar]");
    if(ap){ aplicaPendiente(ap.dataset.aplicar); return; }
    if(e.target.closest("[data-cancelar]")){ pendiente = null;
      diAsistente("Listo, no cambié nada."); return; }
    const d = e.target.closest("[data-deshacer]");
    if(d){ deshaceCambio(+d.dataset.deshacer); return; }
    const s = e.target.closest("[data-sugerencia]");
    if(s){ const id = s.dataset.sugerencia;
      diAsistente(`Va. Dímelo así: ${EJEMPLOS[id] || "descríbelo con el dato que falta"}`); return; }
  });
})();

const EJEMPLOS = {
  registrarGasto:"«gasté 300 en salidas»", ajustarPresupuesto:"«pon el presupuesto en 6000»",
  puedoGastar:"«me alcanza para unos tenis de 1800»", comoVoy:"«cómo voy este mes»",
  ordenDeuda:"«qué deuda pago primero»", precioAlimento:"«el pollo a 148 el kilo»",
  definirUnidad:"«la lata de atún es de 425 gramos»", cambiarCarga:"«subí a 52.5 en sentadilla»",
  sustituirEjercicio:"«cambia el press inclinado por aperturas»",
  registrarSnack:"«me comí unas pepitas»", cambiarMacros:"«el pollo tiene 120 calorías»"
};

/* el botón se encoge al bajar para no estorbar la lectura */
(function(){
  const fab = $("fabIA"); if(!fab) return;
  let ultimo = 0;
  window.addEventListener("scroll", ()=>{
    const y = window.scrollY || 0;
    fab.classList.toggle("chico", y > ultimo && y > 80);
    ultimo = y;
  }, {passive:true});
})();

/* ---------- Quitar la pantalla de apertura ----------
   La animación CSS ya la oculta sola aunque este código no llegue a
   correr (fill:forwards + visibility:hidden), así que un error nunca
   deja la app tapada. Aquí sólo la sacamos del DOM. */
(function(){
  const sp = document.getElementById("splash");
  if(!sp) return;
  if(document.documentElement.classList.contains("sin-splash")){ sp.remove(); return; }
  const quitar = ()=>{ sp.setAttribute("aria-hidden","true"); sp.remove(); };
  sp.addEventListener("animationend", ev=>{ if(ev.animationName==="spSalida") quitar(); });
  setTimeout(quitar, 3200);            /* red de seguridad */
})();

/* ---------- PWA: instalable y funciona sin conexión ---------- */
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").then(reg=>{
      /* avisar cuando hay versión nueva esperando */
      reg.addEventListener("updatefound", ()=>{
        const sw = reg.installing; if(!sw) return;
        sw.addEventListener("statechange", ()=>{
          if(sw.state==="installed" && navigator.serviceWorker.controller)
            showToast("Hay una versión nueva · ciérrala y ábrela para actualizar");
        });
      });
    }).catch(()=>{ /* sin https o sin soporte: la página funciona igual */ });
  });
}
