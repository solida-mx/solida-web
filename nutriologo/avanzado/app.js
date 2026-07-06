/* ============================================================
   PLAN PREMIUM · Salvador — Configurable por el nutriólogo/coach
   ============================================================ */
const WA = "528443604349";
const CONFIG = {
  cliente: "Salvador",
  coach: "Karla Méndez",
  // WhatsApp del NUTRIÓLOGO/COACH (a donde el cliente envía su reporte semanal).
  // Formato: código de país + número, sin signos. Ej. 52 + 10 dígitos.
  coachWa: "528443604349",
  kcal: 2100, prot: 185, carb: 210, fat: 60,
  // Fecha en que arrancó el ciclo actual (lunes de la Semana 1)
  inicioCiclo: "2026-06-15",
  // Presupuesto semanal de antojos (kcal)
  antojosSemana: 2000,
  cardioMin: 20
};

/* ---------- utilidades de fecha ---------- */
const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const now = new Date();
const dayKey = now.toISOString().slice(0,10);
function weekKey(d){ // lunes como inicio de semana
  const t = new Date(d); const wd = (t.getDay()+6)%7; t.setDate(t.getDate()-wd);
  return t.toISOString().slice(0,10);
}
const thisWeek = weekKey(now);

/* ---------- almacenamiento (localStorage con respaldo en memoria) ---------- */
let S = { meals:{}, water:{}, swaps:{}, mealOpt:"A", lifts:{}, liftHi:{}, antojos:{}, weights:[], trained:{}, note:{}, lastReport:null };
const LS_KEY = "solida_plan_premium_v1";
let canStore = true;
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) S = Object.assign(S, JSON.parse(raw));
} catch(e){ canStore = false; }
function save(){
  if(!canStore) return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch(e){ canStore = false; }
}

/* ============================================================
   MANDADO — cada alimento con alternativas macro-equivalentes.
   f = factor de cantidad para igualar macros. Al elegir una
   alternativa se recalcula el mandado Y los platillos del día.
   ============================================================ */
const SHOP = [
 // Proteínas
 {id:"pollo", cat:"prot", e:"🍗", name:"Pechuga de pollo cruda", total:1890, unit:"g",
  alts:[{n:"Filete de tilapia", f:1.15, note:"misma proteína, menos grasa"},
        {n:"Atún en agua (drenado)", f:0.9, note:"misma proteína"},
        {n:"Falda de res magra", f:0.95, note:"+1 g grasa por porción"}]},
 {id:"huevos", cat:"prot", e:"🥚", name:"Huevos enteros", total:14, unit:"pzas",
  alts:[{n:"Claras de huevo", f:3, unit:"claras", note:"misma proteína, sin grasa", totalTxt:"42 claras (~1.5 kg)"}]},
 {id:"claras", cat:"prot", e:"🥛", name:"Claras pasteurizadas", total:1400, unit:"g",
  alts:[{n:"Claras de huevo fresco", f:1, note:"~6 claras por porción"},
        {n:"Pechuga de pavo molida", f:0.55, note:"misma proteína, +1 g grasa"}]},
 {id:"jamon", cat:"prot", e:"🥓", name:"Jamón pechuga de pavo", total:560, unit:"g",
  alts:[{n:"Pechuga de pavo natural", f:1, note:"menos sodio"},
        {n:"Atún en agua", f:0.9, note:"misma proteína"}]},
 {id:"yogurt", cat:"prot", e:"🥛", name:"Yogurt griego Oikos", total:1750, unit:"g",
  alts:[{n:"Queso cottage", f:0.9, note:"misma proteína"},
        {n:"Skyr natural", f:1, note:"macros casi idénticos"},
        {n:"Yogurt natural sin azúcar", f:1.25, note:"+25% para igualar proteína"}]},
 {id:"queso", cat:"prot", e:"🧀", name:"Queso panela", total:420, unit:"g",
  alts:[{n:"Queso cottage", f:1.2, note:"misma proteína"},
        {n:"Panela light", f:1, note:"menos grasa"}]},
 // Carbohidratos
 {id:"leche", cat:"carb", e:"🥛", name:"Leche Lala 100", total:2800, unit:"ml",
  alts:[{n:"Leche descremada", f:1, note:"+2 g carbos por vaso"},
        {n:"Bebida de soya sin azúcar", f:1, note:"un poco menos proteína"}]},
 {id:"avena", cat:"carb", e:"🌾", name:"Avena Quaker", total:490, unit:"g",
  alts:[{n:"Amaranto inflado", f:1, note:"macros equivalentes"},
        {n:"Arroz inflado natural", f:1, note:"mismos carbos"},
        {n:"Granola sin azúcar", f:0.85, note:"más densa: menos gramos"}]},
 {id:"tortillas", cat:"carb", e:"🫓", name:"Tortillas Sanísimas", total:1, unit:"paquete",
  alts:[{n:"Tortilla de maíz normal", f:0.8, unit:"pzas", note:"4 en vez de 5", totalTxt:"~28 pzas"},
        {n:"Tostadas horneadas", f:1, unit:"pzas", note:"mismas piezas"}]},
 {id:"frijoles", cat:"carb", e:"🫘", name:"Frijoles refritos Isadora", total:420, unit:"g",
  alts:[{n:"Frijoles de olla", f:1.5, note:"menos densos: sube la porción"},
        {n:"Lentejas cocidas", f:1.4, note:"mismos carbos + fibra"}]},
 {id:"cacao", cat:"carb", e:"🍫", name:"Cacao en polvo", total:140, unit:"g",
  alts:[{n:"Cocoa sin azúcar", f:1, note:"equivalente directo"}]},
 {id:"chispas", cat:"carb", e:"🍫", name:"Chispas choc. Hershey's", total:105, unit:"g", fixedNote:"15 g/día · antojo controlado", alts:[]},
 // Frutas y verduras
 {id:"manzana", cat:"veg", e:"🍎", name:"Manzana Gala", total:840, unit:"g",
  alts:[{n:"Pera", f:1, note:"mismos carbos"},{n:"Guayaba", f:0.9, note:"más fibra"},
        {n:"Plátano", f:0.7, note:"más denso: menos gramos"}]},
 {id:"melon", cat:"veg", e:"🍈", name:"Melón", total:1050, unit:"g",
  alts:[{n:"Papaya", f:1, note:"equivalente directo"},{n:"Piña", f:0.85, note:"más azúcar: menos gramos"},
        {n:"Fresas", f:1.2, note:"menos densas: más gramos"}]},
 {id:"sandia", cat:"veg", e:"🍉", name:"Sandía", total:2000, unit:"g", approx:true,
  alts:[{n:"Melón extra", f:0.9, note:"equivalente"},{n:"Pepino con limón", f:1.3, note:"casi libre"}]},
 {id:"brocoli", cat:"veg", e:"🥦", name:"Brócoli", total:1400, unit:"g",
  alts:[{n:"Coliflor", f:1, note:"equivalente directo"},{n:"Ejotes", f:1, note:"equivalente directo"}]},
 {id:"zanahoria", cat:"veg", e:"🥕", name:"Zanahoria", total:700, unit:"g",
  alts:[{n:"Betabel", f:0.9, note:"un poco más de azúcar"},{n:"Chayote", f:1.3, note:"menos carbos: más gramos"}]},
 {id:"calabacita", cat:"veg", e:"🥒", name:"Calabacita", total:700, unit:"g",
  alts:[{n:"Chayote", f:1, note:"equivalente directo"},{n:"Nopales", f:1.2, note:"más fibra"}]},
 {id:"espinaca", cat:"veg", e:"🥬", name:"Espinaca fresca", total:700, unit:"g",
  alts:[{n:"Acelga", f:1, note:"equivalente directo"},{n:"Kale", f:1, note:"equivalente directo"}]},
 // Grasas y extras
 {id:"aceite", cat:"fat", e:"🫒", name:"Aceite de aguacate", total:126, unit:"ml",
  alts:[{n:"Aceite de oliva", f:1, note:"misma grasa"},
        {n:"Aguacate (fruta)", f:2.5, unit:"g", note:"20 g ≈ 8 ml de aceite"}]},
 {id:"stevia", cat:"fat", e:"🍃", name:"Stevia líquida", total:0, unit:"al gusto", alts:[]},
 {id:"sazon", cat:"fat", e:"🧂", name:"Sal, pimienta, ajo en polvo", total:0, unit:"al gusto", alts:[]}
];
const CATS = {prot:{t:"Proteínas",c:"#3ddc97"}, carb:{t:"Carbohidratos",c:"#f2b544"}, veg:{t:"Frutas y verduras",c:"#5aa9e6"}, fat:{t:"Grasas y extras",c:"#a78bfa"}};
const shopById = Object.fromEntries(SHOP.map(s=>[s.id,s]));

/* ============================================================
   DIETA DIARIA — los platillos referencian el mandado (ref);
   si cambias un alimento en el mandado, aquí se refleja.
   ============================================================ */
const MEALS = [
 {name:"Desayuno", time:"7:00–8:30 am", kcal:430, prot:28, color:"#3ddc97",
  items:[
   {ref:"yogurt", g:250},
   {ref:"manzana", g:120},
   {ref:"melon", g:150},
   {ref:"avena", g:30},
   {ref:"chispas", g:15, tag:"máx"},
   {ref:"sandia", g:200, tag:"anti-ansiedad · hasta"}
  ]},
 {name:"Media tarde", time:"1:00–2:30 pm", kcal:380, prot:18, color:"#5aa9e6", options:{
   A:[{ref:"leche", g:400, unit:"ml", extra:"+ 20 g cacao"},{ref:"avena", g:40}],
   B:[{ref:"leche", g:200, unit:"ml", extra:"+ café"},{ref:"avena", g:50}]
  }},
 {name:"Comida", time:"3:30–5:00 pm", kcal:510, prot:58, color:"#f2b544",
  items:[
   {ref:"pollo", g:270},
   {ref:"brocoli", g:200},
   {ref:"zanahoria", g:100},
   {ref:"calabacita", g:100},
   {ref:"frijoles", g:60},
   {ref:"aceite", g:8, unit:"ml"}
  ]},
 {name:"Cena", time:"7:30–9:00 pm", kcal:560, prot:52, color:"#ff6b57",
  items:[
   {ref:"claras", g:200},
   {ref:"huevos", g:2, unit:"pzas"},
   {ref:"jamon", g:80},
   {ref:"tortillas", g:5, unit:"pzas", tag:"MÁX"},
   {ref:"queso", g:60, extra:"+ 100 g espinaca"},
   {ref:"aceite", g:5, unit:"ml"}
  ]}
];

/* ============================================================
   RUTINA — frecuencia 2 · cardio diario 20 min
   grp: 'sup' sube +2.5 kg · 'inf' sube +5 kg (doble progreso)
   ============================================================ */
const ROUTINE = {
 1:{title:"Empuje A", ex:[
   {id:"pbp_a",n:"Press banca plana",s:4,r:"6-8",grp:"sup",base:60},
   {id:"pbi_a",n:"Press banca inclinada",s:3,r:"8-10",grp:"sup",base:40},
   {id:"pm_a",n:"Press militar",s:4,r:"8-10",grp:"sup",base:30},
   {id:"lat_a",n:"Elevaciones laterales",s:3,r:"12-15",grp:"sup",base:8},
   {id:"tri1_a",n:"Ext. tríceps polea",s:3,r:"10-12",grp:"sup",base:20},
   {id:"tri2_a",n:"Ext. tríceps inclinado",s:3,r:"12-15",grp:"sup",base:15}]},
 2:{title:"Jalón A", ex:[
   {id:"jal_a",n:"Jalón espalda máquina",s:4,r:"8-10",grp:"sup",base:50},
   {id:"remo_a",n:"Remo con polea",s:4,r:"8-10",grp:"sup",base:45},
   {id:"torso_a",n:"Elevaciones de torso",s:3,r:"12",grp:"sup",base:0},
   {id:"apert_a",n:"Aperturas posteriores",s:3,r:"12-15",grp:"sup",base:25},
   {id:"curl1_a",n:"Curl bíceps polea",s:3,r:"10-12",grp:"sup",base:20},
   {id:"curl2_a",n:"Curl bíceps mancuerna",s:3,r:"10-12",grp:"sup",base:10}]},
 3:{title:"Pierna y Glúteo A", ex:[
   {id:"cuad_a",n:"Extensiones cuádriceps",s:4,r:"10-12",grp:"inf",base:40},
   {id:"fem_a",n:"Femoral en máquina",s:4,r:"10-12",grp:"inf",base:35},
   {id:"hip_a",n:"Hip Thrust",s:4,r:"8-10",grp:"inf",base:80},
   {id:"pm_dl",n:"Peso muerto",s:4,r:"6-8",grp:"inf",base:70},
   {id:"pant_a",n:"Elevaciones pantorrilla",s:3,r:"15-20",grp:"inf",base:50}]},
 4:{title:"Empuje/Jalón B", ex:[
   {id:"pbp_b",n:"Press banca plana",s:3,r:"8-10",grp:"sup",base:55},
   {id:"pbi_b",n:"Press banca inclinada",s:3,r:"10-12",grp:"sup",base:35},
   {id:"jal_b",n:"Jalón espalda máquina",s:3,r:"10-12",grp:"sup",base:45},
   {id:"remo_b",n:"Remo con polea",s:3,r:"10-12",grp:"sup",base:40},
   {id:"tri_b",n:"Ext. tríceps polea",s:3,r:"12-15",grp:"sup",base:17.5},
   {id:"curl_b",n:"Curl bíceps polea",s:3,r:"12-15",grp:"sup",base:17.5}]},
 5:{title:"Pierna y Hombro B", ex:[
   {id:"sent_b",n:"Sentadilla Jack / Prensa",s:4,r:"8-10",grp:"inf",base:90},
   {id:"glut_b",n:"Ext. pierna glúteo polea",s:4,r:"12-15",grp:"inf",base:20},
   {id:"pm_b",n:"Press militar",s:3,r:"8-10",grp:"sup",base:27.5},
   {id:"lat_b",n:"Elevaciones laterales",s:3,r:"12-15",grp:"sup",base:8},
   {id:"cuerda_b",n:"Jalón cuerda alta",s:3,r:"12-15",grp:"sup",base:20}]}
};
const CYCLE = [
 {n:"Arranque", d:"Ajusta pesos al 80%. Técnica primero. Sin fallo.", c:"#5aa9e6"},
 {n:"Carga", d:"Aplica doble progreso. Sube donde completaste.", c:"#f2b544"},
 {n:"Alta intensidad", d:"Acércate al fallo en el último set de compuestos.", c:"#ff6b57"},
 {n:"DESCARGA", d:"60–65% del peso de sem. 3. Sin fallo. Recupérate.", c:"#3ddc97"}
];

/* ============================================================
   ANTOJOS
   ============================================================ */
const ANTOJOS = [
 {id:"ch15", n:"Chispas 15 g", kcal:80, tag:"free", tagT:"Libre", note:"Diario si te quedas en 15 g"},
 {id:"ch30", n:"Chispas 30 g", kcal:160, tag:"mod", tagT:"Moderado", note:"Días alternos máximo"},
 {id:"barra90", n:"Barra Hershey's 90 g", kcal:480, tag:"high", tagT:"Alto", note:"Pártela en 2 días"},
 {id:"barra45", n:"Barra Hershey's 45 g", kcal:240, tag:"mod", tagT:"Moderado", note:"1 vez por semana OK"},
 {id:"frituras", n:"Frituras bolsa chica", kcal:220, tag:"mod", tagT:"Moderado", note:"2 veces al mes"},
 {id:"dona", n:"Dona / pan dulce", kcal:350, tag:"mod", tagT:"Moderado", note:"Máx. 1 vez cada 2 semanas"},
 {id:"sandia300", n:"Sandía 300 g", kcal:90, tag:"free", tagT:"Libre", note:"Úsala cuando tengas ansiedad"},
 {id:"fuera", n:"Comida fuera / evento", kcal:600, tag:"var", tagT:"Variable", note:"1x/sem: ese día solo 3 tortillas"}
];

const PREP_STEPS = [
 "Corta el pollo en cubos medianos uniformes.",
 "Corta verduras: brócoli en floretes, zanahoria y calabacita en rodajas.",
 "Calienta aceite en sartén grande a fuego medio-alto.",
 "Sella el pollo hasta dorar (~5 min). Sazona con sal, pimienta y ajo.",
 "Agrega verduras. Saltea 6–8 min al dente. No sobre-cocines.",
 "Enfría completamente antes de porcionar.",
 "Divide en 7 contenedores + 60 g de frijoles cada uno. Refrigera días 1–5, congela 6–7."
];

/* ============================================================
   HELPERS
   ============================================================ */
const $ = id => document.getElementById(id);
const toast = $("toast"); let toastT;
function showToast(m){ toast.textContent=m; toast.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>toast.classList.remove("show"),2200); }
const fmtQty = (v,u)=> u==="paquete" ? (v+" paquete") :
  (u==="pzas"||u==="claras") ? Math.round(v)+" "+u :
  v>=1000 ? (Math.round(v/10)/100)+" "+(u==="ml"?"L":"kg") : Math.round(v)+" "+u;
function selAlt(id){ const i=S.swaps[id]; return (i===undefined||i<0)?null:shopById[id].alts[i]||null; }
function dispName(id){ const a=selAlt(id); return a?a.n:shopById[id].name; }
function dispAmt(id, base, unitOv){
  const it=shopById[id], a=selAlt(id);
  const unit = (a&&a.unit)||unitOv||it.unit;
  const val = base*(a?a.f:1);
  return fmtQty(unit==="pzas"||unit==="claras"?Math.round(val):Math.round(val), unit);
}

/* ============================================================
   HOY — comidas, agua, ring
   ============================================================ */
if(!S.meals[dayKey]) S.meals[dayKey]=[false,false,false,false];
if(S.water[dayKey]===undefined) S.water[dayKey]=0;
$("dateMeta").textContent = DAYS[now.getDay()]+" "+now.getDate()+" "+MONTHS[now.getMonth()]+" · Plan de alimentación y entrenamiento";
$("todayName").textContent = DAYS[now.getDay()];
$("consulta").href = "https://wa.me/"+WA+"?text="+encodeURIComponent("Hola Karla 👋 Tengo una duda con mi plan premium.");

function renderMeals(){
  const done=S.meals[dayKey];
  $("meals").innerHTML = MEALS.map((m,i)=>{
    const items = m.options ? m.options[S.mealOpt] : m.items;
    const optHtml = m.options ? `<div class="opt-toggle">
      <button data-opt="A" class="${S.mealOpt==='A'?'on':''}">Opción A · con cacao</button>
      <button data-opt="B" class="${S.mealOpt==='B'?'on':''}">Opción B · con café</button></div>` : "";
    return `<div class="meal${done[i]?' done':''}" style="--mc:${m.color}">
      <div class="meal-top">
        <div class="check${done[i]?' on':''}" data-i="${i}">${done[i]?'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</div>
        <div><div class="meal-time">${m.time}</div><div class="meal-name">${m.name}</div></div>
        <div class="kcal">~<b>${m.kcal}</b> kcal<br>${m.prot} g prot</div>
      </div>
      ${optHtml}
      <ul class="foods">${items.map(f=>{
        const swapped=!!selAlt(f.ref);
        return `<li class="food${swapped?' swapped':''}">
          <span class="emoji">${shopById[f.ref].e}</span>
          <span class="txt"><b>${dispName(f.ref)}</b>${f.extra?` <small style="display:inline">${f.extra}</small>`:''}
            ${swapped?'<span class="sw-note">↻ sustituido del mandado</span>':''}</span>
          <span class="amt">${f.tag?f.tag+" ":""}${dispAmt(f.ref,f.g,f.unit)}</span></li>`;
      }).join("")}</ul>
    </div>`;
  }).join("");
  updateRing();
}
function updateRing(){
  const done=S.meals[dayKey], c=done.filter(Boolean).length;
  $("ringNum").textContent=c+"/"+MEALS.length;
  $("ringProg").style.strokeDashoffset = 238.8*(1-c/MEALS.length);
  $("stMeals").textContent=c+"/"+MEALS.length;
}
$("meals").addEventListener("click",e=>{
  const chk=e.target.closest(".check");
  if(chk){ const i=+chk.dataset.i; S.meals[dayKey][i]=!S.meals[dayKey][i]; save(); renderMeals();
    if(S.meals[dayKey].every(Boolean)) showToast("¡Completaste todas tus comidas! 🎉");
    else if(S.meals[dayKey][i]) showToast("Comida registrada ✓"); return; }
  const opt=e.target.closest("[data-opt]");
  if(opt){ S.mealOpt=opt.dataset.opt; save(); renderMeals(); showToast("Media tarde: opción "+S.mealOpt); }
});

/* agua */
function renderWater(){
  const w=S.water[dayKey], el=$("water"); el.innerHTML="";
  for(let k=0;k<8;k++){ const g=document.createElement("div");
    g.className="glass"+(k<w?" full":"");
    g.onclick=()=>{ S.water[dayKey]=(k<S.water[dayKey])?k:k+1; save(); $("waterNum").textContent=S.water[dayKey];
      renderWater(); if(S.water[dayKey]===8) showToast("¡Meta de agua cumplida! 💧"); };
    el.appendChild(g); }
  $("waterNum").textContent=w;
}

/* ============================================================
   MANDADO con equivalencias que se propagan
   ============================================================ */
function renderShop(){
  const groups={prot:[],carb:[],veg:[],fat:[]};
  SHOP.forEach(it=>groups[it.cat].push(it));
  $("shopList").innerHTML = Object.entries(groups).map(([cat,items])=>`
    <div class="shop-cat" style="--cc:${CATS[cat].c}">
      <div class="shop-cat-h"><span class="sq"></span><h3>${CATS[cat].t}</h3></div>
      ${items.map(it=>{
        const a=selAlt(it.id), swapped=!!a;
        const qty = it.total===0 ? it.unit :
          a ? (a.totalTxt || fmtQty(it.total*a.f, a.unit||it.unit)) :
          (it.approx?"~":"")+fmtQty(it.total,it.unit);
        const hasAlts=it.alts.length>0;
        return `<div class="shop-item${swapped?' swapped':''}" data-id="${it.id}">
          <div class="shop-row">
            <span class="emoji">${it.e}</span>
            <span class="nm"><b>${swapped?a.n:it.name}</b>
              <small>${swapped?("en lugar de "+it.name+(a.note?" · "+a.note:"")):(it.fixedNote||"")}</small></span>
            <span class="qty">${qty}</span>
            ${hasAlts?`<button class="swap-btn" data-open="${it.id}" aria-label="Ver equivalencias">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M21 3 9 15"/><path d="M8 21H3v-5"/><path d="m3 21 6-6"/></svg></button>`:""}
          </div>
          ${hasAlts?`<div class="alts" id="alts-${it.id}"><div class="alts-in">
            <div class="alts-lbl">Equivalencias · cubren los mismos macros</div>
            <button class="alt${!swapped?' on':''}" data-pick="${it.id}" data-alt="-1">
              <span class="a-nm">${it.name}<small>opción original del plan</small></span>
              <span class="a-q">${(it.approx?"~":"")+fmtQty(it.total,it.unit)}</span></button>
            ${it.alts.map((al,j)=>`<button class="alt${swapped&&S.swaps[it.id]===j?' on':''}" data-pick="${it.id}" data-alt="${j}">
              <span class="a-nm">${al.n}<small>${al.note||""}</small></span>
              <span class="a-q">${al.totalTxt||fmtQty(it.total*al.f, al.unit||it.unit)}</span></button>`).join("")}
          </div></div>`:""}
        </div>`;
      }).join("")}
    </div>`).join("");
}
$("shopList").addEventListener("click",e=>{
  const open=e.target.closest("[data-open]");
  if(open){ const el=$("alts-"+open.dataset.open); el.classList.toggle("open"); return; }
  const pick=e.target.closest("[data-pick]");
  if(pick){ const id=pick.dataset.pick, j=+pick.dataset.alt;
    if(j<0) delete S.swaps[id]; else S.swaps[id]=j;
    save(); renderShop(); renderMeals();
    showToast(j<0?"Volviste a la opción original ✓":"Mandado y platillos de la semana actualizados 🔄");
  }
});
$("prepSteps").innerHTML = PREP_STEPS.map((s,i)=>`<div class="prep-step"><span class="n">${i+1}</span><span>${s}</span></div>`).join("");

/* ============================================================
   RUTINA — día actual, ciclo 3+1, doble progreso, descarga
   ============================================================ */
const start = new Date(CONFIG.inicioCiclo+"T00:00:00");
const diffDays = Math.max(0, Math.floor((now-start)/86400000));
const weekIdx = Math.floor(diffDays/7)%4;           // 0..3
const isDeload = weekIdx===3;
const cyc = CYCLE[weekIdx];
$("cycleChip").textContent = "Semana "+(weekIdx+1)+" de 4";
$("cycleChip").style.background = "rgba(255,255,255,.06)";
$("cycleChip").style.color = cyc.c;

$("cycleCal").innerHTML = CYCLE.map((c,i)=>`
  <div class="cw${i===weekIdx?' now':''}" style="--wc:${c.c}"><b>Sem ${i+1}</b><span>${c.n}</span></div>`).join("");

const banner = $("deloadBanner");
if(isDeload){
  banner.innerHTML = `<div class="banner em"><span class="i">🧘</span>
    <div><b>Esta es tu semana de DESCARGA.</b> Usa el 60–65% del peso de la semana 3 (ya calculado abajo), sin fallo.
    La descarga no frena el progreso — lo acelera al permitir recuperación completa.</div></div>`;
}else{
  const rest = 3-weekIdx;
  banner.innerHTML = `<div class="banner ${weekIdx===2?'coral':'amber'}"><span class="i">${weekIdx===2?'🔥':'📅'}</span>
    <div><b>Semana ${weekIdx+1} · ${cyc.n}.</b> ${cyc.d} Faltan <b>${rest} semana${rest>1?'s':''}</b> para tu descarga.</div></div>`;
}

const dow = now.getDay(); // 0 dom .. 6 sab
const todayRoutine = ROUTINE[dow];
function getW(ex){ return S.lifts[ex.id]!==undefined ? S.lifts[ex.id] : ex.base; }
function roundP(v){ return Math.round(v/2.5)*2.5; }

function renderRoutine(){
  if(!todayRoutine){
    $("routineDayTitle").textContent = DAYS[dow]+" · Descanso activo";
    $("cardioBox").innerHTML = `<span class="i">🚶</span><div><b>Caminata 30–45 min opcional</b><small>Duerme 7–8 h. Mañana vuelves con todo.</small></div>`;
    $("exList").innerHTML = `<div class="card" style="text-align:center">
      <div style="font-size:34px;margin-bottom:6px">😌</div>
      <b style="font-family:'Space Grotesk';font-size:16px">Hoy no hay pesas</b>
      <div class="subtle" style="margin-top:4px">La recuperación es parte del programa. Nos vemos el lunes con <b style="color:var(--em)">Empuje A</b>.</div></div>`;
    return;
  }
  $("routineDayTitle").textContent = DAYS[dow]+" · "+todayRoutine.title;
  $("cardioBox").innerHTML = `<span class="i">🏃</span><div><b>Cardio de hoy: ${CONFIG.cardioMin} min</b><small>+ calentamiento: 10 min caminadora/elíptica antes de la sesión.</small></div>`;
  $("exList").innerHTML = todayRoutine.ex.map(ex=>{
    const w = getW(ex);
    const showW = isDeload ? roundP(w*0.62) : w;
    const inc = ex.grp==="inf"?5:2.5;
    const hiDone = S.liftHi[ex.id]===thisWeek;
    const bodyweight = ex.base===0;
    return `<div class="ex" data-ex="${ex.id}">
      <div class="ex-top">
        <span class="nm"><b>${ex.n}</b><small>${ex.s}×${ex.r} · ${ex.grp==="inf"?"tren inferior (+5 kg)":"tren superior (+2.5 kg)"}</small></span>
        ${bodyweight?`<span class="ex-w"><span class="wv">Corporal<small>peso</small></span></span>`:`
        <span class="ex-w">
          <button data-w="-" aria-label="Bajar peso">−</button>
          <span class="wv">${showW} kg<small>${isDeload?"descarga 62%":"hoy"}</small></span>
          <button data-w="+" aria-label="Subir peso">+</button>
        </span>`}
      </div>
      ${!isDeload&&!bodyweight?`
      <div class="ex-done${hiDone?' on':''}" data-hi="${ex.id}">
        <span class="box">${hiDone?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span>
        <span>Completé todas las series en rango alto</span>
      </div>
      <div class="next-up${hiDone?' show':''}">▲ Próxima sesión sube a ${roundP(w+inc)} kg</div>`:""}
    </div>`;
  }).join("");
}
$("exList").addEventListener("click",e=>{
  const wb=e.target.closest("[data-w]");
  if(wb){ const exId=wb.closest(".ex").dataset.ex;
    const ex=todayRoutine.ex.find(x=>x.id===exId);
    const inc = 2.5;
    let w=getW(ex)+(wb.dataset.w==="+"?inc:-inc);
    if(w<0)w=0; S.lifts[exId]=w; save(); renderRoutine(); return; }
  const hi=e.target.closest("[data-hi]");
  if(hi){ const exId=hi.dataset.hi;
    if(S.liftHi[exId]===thisWeek){ delete S.liftHi[exId]; }
    else { S.liftHi[exId]=thisWeek; showToast("¡Doble progreso! La próxima sesión te sugerimos subir peso 📈"); }
    save(); renderRoutine(); }
});

/* --- Botón "Entrené hoy" (alimenta el reporte semanal) --- */
function renderTrained(){
  const box=$("trainedBox");
  if(!todayRoutine){ box.innerHTML=""; return; }
  const on = S.trained[dayKey]===true;
  box.innerHTML = `<button class="trained-btn${on?' on':''}" id="trainedBtn">
    <span class="bx">${on?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span>
    ${on?'¡Entrenamiento de hoy completado!':'Marcar: entrené hoy'}
  </button>`;
  $("trainedBtn").onclick=()=>{
    if(S.trained[dayKey]){ delete S.trained[dayKey]; }
    else { S.trained[dayKey]=true; showToast("Entrenamiento registrado 💪 aparecerá en tu reporte"); }
    save(); renderTrained();
  };
}

/* ============================================================
   ANTOJOS — presupuesto semanal
   ============================================================ */
if(!S.antojos[thisWeek]) S.antojos[thisWeek]=[];
function usedKcal(){ return S.antojos[thisWeek].reduce((a,x)=>a+x.kcal,0); }
function renderBudget(){
  const used=usedKcal(), left=Math.max(0,CONFIG.antojosSemana-used);
  const pct=Math.min(100, used/CONFIG.antojosSemana*100);
  $("budgetLeft").textContent = left.toLocaleString("es-MX");
  $("budgetUsed").textContent = used.toLocaleString("es-MX");
  $("budgetFill").style.width = pct+"%";
  $("budgetBar").classList.toggle("over", used>CONFIG.antojosSemana);
  $("stBudget").textContent = Math.round(used/CONFIG.antojosSemana*100)+"%";
  const msg=$("budgetMsg");
  if(used>CONFIG.antojosSemana){
    msg.className="banner coral";
    msg.innerHTML=`<span class="i">⚠️</span><div><b>Te pasaste ${ (used-CONFIG.antojosSemana).toLocaleString("es-MX") } kcal.</b> Aplica la regla de compensación: mañana 3 tortillas, sin chispas y +10 min de cardio.</div>`;
  }else if(used>CONFIG.antojosSemana*0.75){
    msg.className="banner amber";
    msg.innerHTML=`<span class="i">🟡</span><div><b>Vas al ${Math.round(pct)}% del presupuesto.</b> Elige antojos "libres" el resto de la semana.</div>`;
  }else{
    msg.className="banner em";
    msg.innerHTML=`<span class="i">✅</span><div><b>Con este margen sigues bajando.</b> Registra cada antojo para no perder la cuenta.</div>`;
  }
}
function renderAntojos(){
  $("antojoList").innerHTML = ANTOJOS.map(a=>`
    <div class="antojo">
      <span class="nm"><b>${a.n} <span class="tag ${a.tag}">${a.tagT}</span></b><small>${a.note}</small></span>
      <span class="kc">~${a.kcal} kcal</span>
      <button class="log-btn" data-log="${a.id}">+ Registrar</button>
    </div>`).join("");
}
$("antojoList").addEventListener("click",e=>{
  const b=e.target.closest("[data-log]"); if(!b) return;
  const a=ANTOJOS.find(x=>x.id===b.dataset.log);
  S.antojos[thisWeek].push({id:a.id, kcal:a.kcal, ts:Date.now()});
  save(); renderBudget();
  showToast(a.n+" registrado · −"+a.kcal+" kcal de tu presupuesto");
});

/* ============================================================
   PROGRESO — peso semanal + gráfica (guardado en el dispositivo)
   ============================================================ */
function renderWeights(){
  const W=S.weights.slice().sort((a,b)=>a.d.localeCompare(b.d));
  // delta
  if(W.length>=2){
    const d=(W[W.length-1].kg-W[W.length-2].kg);
    $("stDelta").textContent=(d>0?"+":"")+d.toFixed(1)+" kg";
    $("stDelta").style.color = d<=0 ? "#3ddc97" : "#ff6b57";
  } else $("stDelta").textContent="—";
  // list
  $("wList").innerHTML = W.slice(-6).reverse().map(w=>{
    const dt=new Date(w.d+"T00:00:00");
    return `<li><span>${dt.getDate()} ${MONTHS[dt.getMonth()]}</span><span style="color:var(--ink)">${w.kg.toFixed(1)} kg
      <button class="del" data-del="${w.d}">✕</button></span></li>`;
  }).join("") || `<li><span>Aún no hay registros</span><span>—</span></li>`;
  // chart
  const box=$("chartBox");
  if(W.length<2){ box.innerHTML = `<div class="subtle" style="text-align:center;padding:14px 0">Registra al menos 2 semanas para ver tu gráfica 📉</div>`; return; }
  const vals=W.map(w=>w.kg), min=Math.min(...vals)-0.5, max=Math.max(...vals)+0.5;
  const Wd=320, H=110, pad=8;
  const X=i=>pad+i*(Wd-2*pad)/(W.length-1);
  const Y=v=>pad+(max-v)*(H-2*pad)/(max-min||1);
  const pts=W.map((w,i)=>X(i)+","+Y(w.kg)).join(" ");
  box.innerHTML=`<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Gráfica de peso">
    <polyline points="${pts}" fill="none" stroke="#3ddc97" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${W.map((w,i)=>`<circle cx="${X(i)}" cy="${Y(w.kg)}" r="3.4" fill="#0c1512" stroke="#3ddc97" stroke-width="2"/>`).join("")}
    <text x="${X(W.length-1)}" y="${Y(W[W.length-1].kg)-8}" fill="#ecf7f0" font-size="11" font-weight="700" text-anchor="end">${W[W.length-1].kg.toFixed(1)} kg</text>
  </svg>`;
}
$("wSave").onclick=()=>{
  const v=parseFloat($("wIn").value);
  if(!v||v<30||v>250){ showToast("Escribe un peso válido en kg"); return; }
  const existing=S.weights.find(w=>w.d===dayKey);
  if(existing) existing.kg=v; else S.weights.push({d:dayKey,kg:v});
  save(); $("wIn").value=""; renderWeights();
  showToast("Peso guardado: "+v.toFixed(1)+" kg ✓");
};
$("wList").addEventListener("click",e=>{
  const d=e.target.closest("[data-del]"); if(!d) return;
  S.weights=S.weights.filter(w=>w.d!==d.dataset.del); save(); renderWeights();
});

/* ============================================================
   REPORTE SEMANAL — genera una imagen con el progreso
   y la comparte con el coach por WhatsApp. Sin backend:
   los datos viven en el dispositivo; el reporte es el puente.
   ============================================================ */
$("coachName2").textContent = CONFIG.coach;

// fechas (YYYY-MM-DD) de los 7 días de la semana en curso (lun→dom)
function weekDates(weekStartKey){
  const out=[]; const d=new Date(weekStartKey+"T00:00:00");
  for(let i=0;i<7;i++){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
  return out;
}
function reportMetrics(){
  const days=weekDates(thisWeek);
  // Entrenamientos de la semana
  const trainedDays=days.filter(k=>S.trained[k]);
  // Cumplimiento de comidas (promedio de comidas hechas / 4, solo días con registro)
  let mealDone=0, mealPoss=0, waterDays=0, waterSum=0;
  days.forEach(k=>{
    if(S.meals[k]){ mealDone+=S.meals[k].filter(Boolean).length; mealPoss+=MEALS.length; }
    if(S.water[k]!==undefined){ waterSum+=S.water[k]; waterDays++; }
  });
  const mealPct = mealPoss? Math.round(mealDone/mealPoss*100):0;
  const waterAvg = waterDays? (waterSum/waterDays):0;
  // Progresos de carga (ejercicios donde marcó rango alto esta semana)
  const lifts=Object.keys(S.liftHi).filter(id=>S.liftHi[id]===thisWeek);
  const liftNames=lifts.map(id=>{
    for(const dw in ROUTINE){ const ex=ROUTINE[dw].ex.find(x=>x.id===id); if(ex) return ex.n; }
    return null;
  }).filter(Boolean);
  // Peso: último y delta
  const W=S.weights.slice().sort((a,b)=>a.d.localeCompare(b.d));
  const lastW = W.length? W[W.length-1].kg : null;
  const deltaW = W.length>=2? (W[W.length-1].kg-W[W.length-2].kg) : null;
  // Antojos
  const used=usedKcal(), budget=CONFIG.antojosSemana;
  return {trainedDays, mealPct, waterAvg, liftNames, lastW, deltaW, used, budget,
          note:(S.note[thisWeek]||"").trim(), weekIdx, cycName:CYCLE[weekIdx].n};
}

// Dibuja el reporte en un canvas y regresa {canvas, dataUrl}
function drawReport(){
  const m=reportMetrics();
  const cv=document.createElement("canvas");
  const Wd=1080, scale=1; cv.width=Wd; let H=1420; cv.height=H;
  const ctx=cv.getContext("2d");
  const em="#3ddc97", amber="#f2b544", coral="#ff6b57", sky="#5aa9e6";
  const ink="#ecf7f0", muted="#8fa89b", card="#16241e", line="#24382f";
  // fondo
  ctx.fillStyle="#0c1512"; ctx.fillRect(0,0,Wd,H);
  // acento superior
  const grad=ctx.createLinearGradient(0,0,Wd,0);
  grad.addColorStop(0,em); grad.addColorStop(1,"#199e68");
  ctx.fillStyle=grad; ctx.fillRect(0,0,Wd,14);
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  const PAD=64; let y=90;
  // encabezado
  ctx.textAlign="left";
  ctx.fillStyle=em; ctx.font="700 26px 'Space Grotesk',sans-serif";
  ctx.fillText("REPORTE SEMANAL", PAD, y);
  ctx.fillStyle=muted; ctx.font="500 24px Manrope,sans-serif";
  const dt=new Date(); const fecha=dt.getDate()+" "+MONTHS[dt.getMonth()]+" "+dt.getFullYear();
  ctx.textAlign="right"; ctx.fillText(fecha, Wd-PAD, y); ctx.textAlign="left";
  y+=52;
  ctx.fillStyle=ink; ctx.font="700 52px 'Space Grotesk',sans-serif";
  ctx.fillText(CONFIG.cliente, PAD, y);
  y+=40;
  ctx.fillStyle=muted; ctx.font="500 25px Manrope,sans-serif";
  ctx.fillText("Coach "+CONFIG.coach+"  ·  Semana "+(m.weekIdx+1)+" de 4 ("+m.cycName+")", PAD, y);
  y+=46;
  // ---- Fila de tarjetas (peso / entrenos / comidas / antojos) ----
  const gap=22, cols=2, cw=(Wd-PAD*2-gap*(cols-1))/cols, ch=190;
  function statCard(cx,cy,accent,big,small,sub){
    ctx.fillStyle=card; rr(cx,cy,cw,ch,22); ctx.fill();
    ctx.strokeStyle=line; ctx.lineWidth=1.5; rr(cx,cy,cw,ch,22); ctx.stroke();
    ctx.fillStyle=accent; rr(cx,cy,10,ch,22); ctx.fill();
    ctx.fillStyle=muted; ctx.font="700 21px Manrope,sans-serif"; ctx.fillText(small.toUpperCase(), cx+40, cy+50);
    ctx.fillStyle=ink; ctx.font="700 58px 'Space Grotesk',sans-serif"; ctx.fillText(big, cx+40, cy+118);
    if(sub){ ctx.fillStyle=muted; ctx.font="500 22px Manrope,sans-serif"; ctx.fillText(sub, cx+40, cy+158); }
  }
  const wTxt = m.lastW!=null ? m.lastW.toFixed(1)+" kg" : "— kg";
  const wSub = m.deltaW!=null ? ((m.deltaW>0?"+":"")+m.deltaW.toFixed(1)+" kg vs. semana pasada") : "registra 2 semanas";
  statCard(PAD, y, sky, wTxt, "Peso actual", wSub);
  statCard(PAD+cw+gap, y, em, m.trainedDays.length+"/5", "Entrenamientos", m.trainedDays.length>=4?"¡excelente asistencia!":"días entrenados");
  y+=ch+gap;
  statCard(PAD, y, amber, m.mealPct+"%", "Cumpl. de comidas", "de la dieta marcada");
  const antTxt = Math.round(m.used/m.budget*100)+"%";
  const antSub = m.used>m.budget ? "se pasó del presupuesto" : "de "+m.budget.toLocaleString("es-MX")+" kcal";
  statCard(PAD+cw+gap, y, m.used>m.budget?coral:em, antTxt, "Antojos usados", antSub);
  y+=ch+gap+24;
  // ---- Progresos de carga ----
  ctx.fillStyle=em; ctx.font="700 24px 'Space Grotesk',sans-serif";
  ctx.fillText("💪  SUBIÓ DE PESO EN", PAD, y); y+=14;
  ctx.fillStyle=ink; ctx.font="500 25px Manrope,sans-serif";
  if(m.liftNames.length){
    m.liftNames.slice(0,4).forEach(nm=>{ y+=40; ctx.fillStyle=ink; ctx.fillText("•  "+nm, PAD+8, y); });
    if(m.liftNames.length>4){ y+=40; ctx.fillStyle=muted; ctx.fillText("+ "+(m.liftNames.length-4)+" ejercicios más", PAD+8, y); }
  } else { y+=40; ctx.fillStyle=muted; ctx.fillText("Sin nuevas progresiones esta semana — a seguir empujando.", PAD+8, y); }
  y+=54;
  // ---- Nota del cliente ----
  ctx.fillStyle=amber; ctx.font="700 24px 'Space Grotesk',sans-serif";
  ctx.fillText("📝  NOTA PARA EL COACH", PAD, y); y+=20;
  const note = m.note || "(sin nota esta semana)";
  ctx.fillStyle = m.note? ink : muted; ctx.font=(m.note?"500":"italic 500")+" 25px Manrope,sans-serif";
  // wrap de texto
  const maxW=Wd-PAD*2-16; const words=note.split(/\s+/); let lineTxt="";
  const lines=[];
  words.forEach(w=>{ const test=lineTxt?lineTxt+" "+w:w; if(ctx.measureText(test).width>maxW){ lines.push(lineTxt); lineTxt=w; } else lineTxt=test; });
  if(lineTxt) lines.push(lineTxt);
  lines.slice(0,5).forEach(ln=>{ y+=40; ctx.fillText(ln, PAD+8, y); });
  if(lines.length>5){ y+=40; ctx.fillStyle=muted; ctx.fillText("…", PAD+8, y); }
  // ---- Footer de marca ----
  const fy=H-70;
  ctx.strokeStyle=line; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(PAD,fy-30); ctx.lineTo(Wd-PAD,fy-30); ctx.stroke();
  ctx.fillStyle=muted; ctx.font="600 22px Manrope,sans-serif"; ctx.textAlign="left";
  ctx.fillText("Generado con "+CONFIG.coach+" · vía Solida Aplicaciones", PAD, fy);
  // logo mini (barras)
  const bx=Wd-PAD-90, by=fy-24;
  [[0.5,em],[0.72,"#e8f6f6"],[0.94,em]].forEach((b,i)=>{ ctx.fillStyle=b[1]; rr(bx+(1-b[0])*40, by+i*13, b[0]*80, 8, 4); ctx.fill(); });
  return { canvas:cv, dataUrl:cv.toDataURL("image/png") };
}

// aviso "toca reportar" si pasó >=7 días desde el último
function renderReportDue(){
  const due=$("reportDue"); if(!due) return;
  let overdue=true;
  if(S.lastReport){ overdue = (Date.now()-S.lastReport) >= 7*86400000; }
  else { // primera vez: solo avisa si ya hay algo de datos
    overdue = S.weights.length>0 || Object.keys(S.trained).length>0;
  }
  if(overdue){
    due.innerHTML = `<div class="report-due"><span class="i">🔔</span><div><b>Toca reportarte.</b> Ya pasó una semana desde tu último reporte. Genera y envía el de esta semana a ${CONFIG.coach}.</div></div>`;
    $("reportChip").textContent="pendiente"; $("reportChip").style.background="var(--amber-soft)"; $("reportChip").style.color="var(--amber)";
  } else {
    due.innerHTML="";
    $("reportChip").textContent="al día"; $("reportChip").style.background="var(--em-soft)"; $("reportChip").style.color="var(--em)";
  }
}

// guardar nota mientras escribe
$("noteArea").value = S.note[thisWeek]||"";
$("noteArea").addEventListener("input", e=>{ S.note[thisWeek]=e.target.value; save(); });

// generar + abrir overlay
let currentReport=null;
$("genReport").onclick=()=>{
  currentReport = drawReport();
  $("rpImg").src = currentReport.dataUrl;
  // Texto para WhatsApp (acompaña la imagen que el usuario adjunta)
  const m=reportMetrics();
  const waTxt = "Hola "+CONFIG.coach+" 👋 Aquí está mi reporte de la semana "+(m.weekIdx+1)+":%0A"+
    "• Peso: "+(m.lastW!=null?m.lastW.toFixed(1)+" kg":"—")+
    (m.deltaW!=null? " ("+(m.deltaW>0?"+":"")+m.deltaW.toFixed(1)+" kg)":"")+"%0A"+
    "• Entrenamientos: "+m.trainedDays.length+"/5%0A"+
    "• Cumplimiento dieta: "+m.mealPct+"%25%0A"+
    "• Antojos: "+Math.round(m.used/m.budget*100)+"%25 del presupuesto%0A"+
    (m.note? "%0A\u201C"+encodeURIComponent(m.note).replace(/%0A/g," ")+"\u201D%0A":"")+
    "%0A(Te adjunto la imagen del reporte 👇)";
  $("rpWa").href = "https://wa.me/"+CONFIG.coachWa+"?text="+waTxt;
  // Web Share API si el dispositivo lo permite (comparte la imagen directo)
  const canShareFiles = navigator.canShare && (()=>{ try{ return navigator.canShare({files:[new File([],"x.png",{type:"image/png"})]});}catch(e){return false;} })();
  $("rpShare").style.display = canShareFiles ? "block" : "none";
  $("rpHint").textContent = canShareFiles
    ? "\u201CCompartir imagen\u201D abre tu WhatsApp con la foto ya adjunta."
    : "Tip: descarga la imagen y adjúntala en el chat del coach que se abre con el botón verde.";
  $("rpOverlay").classList.add("show");
  // marcar como reportado
  S.lastReport = Date.now(); save(); renderReportDue();
};

// compartir imagen nativa (adjunta la foto directo)
$("rpShare").onclick=async()=>{
  if(!currentReport) return;
  try{
    const blob=await (await fetch(currentReport.dataUrl)).blob();
    const file=new File([blob],"reporte-semanal.png",{type:"image/png"});
    await navigator.share({ files:[file], title:"Mi reporte semanal",
      text:"Hola "+CONFIG.coach+" 👋 aquí está mi reporte de la semana." });
  }catch(e){ showToast("No se pudo compartir; usa \u201CDescargar imagen\u201D"); }
};
// descargar imagen
$("rpDl").onclick=()=>{
  if(!currentReport) return;
  const a=document.createElement("a");
  a.href=currentReport.dataUrl; a.download="reporte-semanal-"+dayKey+".png"; a.click();
  showToast("Imagen descargada 📥 adjúntala en WhatsApp");
};
$("rpClose").onclick=()=>$("rpOverlay").classList.remove("show");
$("rpOverlay").addEventListener("click",e=>{ if(e.target===$("rpOverlay")) $("rpOverlay").classList.remove("show"); });


document.querySelectorAll(".nb").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".nb").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.id==="tab-"+b.dataset.tab));
  window.scrollTo({top:0,behavior:"smooth"});
});

/* arranque */
renderMeals(); renderWater(); renderShop(); renderRoutine(); renderTrained(); renderBudget(); renderAntojos(); renderWeights(); renderReportDue();
if(!canStore) showToast("Modo demo: el guardado no está disponible en este navegador");
