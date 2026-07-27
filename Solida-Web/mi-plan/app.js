/* ============================================================
   MI PLAN — página personal de Salvador
   Todo lo editable vive en CONFIG y en las tablas de abajo.
   ============================================================ */
const CONFIG = {
  cliente: "Salvador",
  kcal: 2400, prot: 195, carb: 235, fat: 75,
  // Presupuesto semanal de antojos LIBRES (aparte de los snacks del plan)
  antojosSemana: 1200,
  cardioMin: 20,
  unidad: "kg",
  // Día 0 del ciclo 3-1-3-1 (lunes 27 jul 2026 = Empuje A)
  anclaCiclo: "2026-07-27",
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
          varSel:{}, warm:{}, cardio:{}, cicloShift:0 };
const LS_KEY = "mi_plan_salvador_v1";
let canStore = true;
try { const raw = localStorage.getItem(LS_KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); }
catch(e){ canStore = false; }
function save(){ if(!canStore) return; try{ localStorage.setItem(LS_KEY, JSON.stringify(S)); }catch(e){ canStore=false; } }

/* ============================================================
   MANDADO
   f  = factor de cantidad para igualar macros
   hair = nutriente capilar que aporta
   prep = listo | rapido | cocina
   tip  = cómo conviene comprarlo
   ============================================================ */
const SHOP = [
 /* ---------- PROTEÍNAS ---------- */
 {id:"pollo", cat:"prot", e:"🍗", name:"Pechuga de pollo deshebrada (ya cocida)", total:1200, unit:"g",
  hair:"proteína + zinc", prep:"listo",
  tip:"1 kg ya cocido equivale a ~1.45 kg de pechuga cruda. Cómpralo en paquete de 1 kg o en la rostisería y <b>congélalo el mismo día en bolsas de 200 g</b> ya porcionado: sacas una en la noche y al día siguiente está lista. Enjuágala si viene muy salada.",
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
    note:"El hierro de la res se absorbe 3 veces mejor que el vegetal. 15 min en sartén."}
  ]},
 {id:"res", cat:"prot", e:"🥩", name:"Res magra (molida 90/10 o bistec)", total:500, unit:"g",
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
 {id:"huevos", cat:"prot", e:"🥚", name:"Huevo entero", total:14, unit:"pzas",
  hair:"biotina + zinc + selenio + vitamina D (en la yema)", prep:"rapido",
  tip:"<b>Siempre el cartón de 30.</b> Sale ~25 % más barato por pieza que el paquete de 12 y dura 4 semanas en refri. No tires la yema: ahí está todo lo del cabello.",
  alts:[
   {n:"Huevo cocido (los preparas de golpe)", f:1, prep:"listo", hair:"biotina + zinc + selenio",
    note:"Cuece 12 el domingo en 12 min. Duran 7 días en refri con cáscara."}
  ]},
 {id:"claras", cat:"prot", e:"🥛", name:"Claras pasteurizadas", total:2100, unit:"g",
  hair:"proteína (queratina)", prep:"rapido",
  tip:"El bote de 1 L sale mejor que el de 500 ml y no hay que cascar ni separar nada. Si te da igual el trabajo, 6 claras frescas cuestan ~35 % menos que 200 ml de bote.",
  alts:[
   {n:"Claras de huevo fresco", f:1, unit:"g", prep:"rapido", note:"~6 claras por porción. Más barato, más trabajo."},
   {n:"Pechuga de pavo natural rebanada", f:0.55, prep:"listo", hair:"proteína + zinc", note:"Cero cocina, más caro."},
   {n:"Queso cottage", f:0.85, prep:"listo", hair:"proteína + calcio", note:"Se come frío directo del bote."},
   {n:"Atún en agua", f:0.5, prep:"listo", hair:"selenio + omega-3", note:"Para cenas rápidas."}
  ]},
 {id:"yogurt", cat:"prot", e:"🥣", name:"Yogurt griego natural", total:2100, unit:"g",
  hair:"proteína + calcio + B12", prep:"listo",
  tip:"<b>Bote de 1 kg, nunca los vasitos individuales:</b> los individuales cuestan casi el doble por gramo y suelen traer azúcar. Compra 2 botes de golpe, duran las 2 semanas.",
  alts:[
   {n:"Queso cottage", f:0.9, prep:"listo", hair:"proteína + calcio", note:"Misma proteína, más barato, menos cremoso."},
   {n:"Yogurt natural sin azúcar (no griego)", f:1.35, prep:"listo", note:"Más barato pero tiene menos proteína: sube la porción."},
   {n:"Skyr natural", f:1, prep:"listo", hair:"proteína", note:"Macros casi idénticos, más caro."},
   {n:"Requesón", f:1.1, prep:"listo", hair:"proteína + calcio", note:"El más barato de todos, se consigue en cualquier lado."}
  ]},
 {id:"queso", cat:"prot", e:"🧀", name:"Queso panela", total:560, unit:"g",
  hair:"proteína + calcio", prep:"listo",
  tip:"La pieza entera de 1 kg sale ~30 % más barata que las rebanadas empacadas. Se corta en 7 rebanadas gruesas y listo.",
  alts:[
   {n:"Queso cottage", f:1.3, prep:"listo", hair:"proteína + calcio"},
   {n:"Jamón de pechuga de pavo", f:0.9, prep:"listo", note:"Más sodio; busca el de 90 % pechuga."},
   {n:"Queso Oaxaca (poca cantidad)", f:0.75, prep:"listo", note:"Más grasa; ajusta el aceite del día."},
   {n:"Requesón", f:1.2, prep:"listo", hair:"proteína + calcio", note:"El más económico."}
  ]},
 {id:"sardina", cat:"prot", e:"🐟", name:"Sardina en tomate (lata 425 g)", total:2, unit:"latas",
  hair:"omega-3 EPA/DHA + vitamina D + calcio + selenio", prep:"listo",
  tip:"Cómprala por paquete de 4–6 latas: es de lo más barato por gramo de omega-3 y no caduca pronto. 2 latas por semana ya te cubren la cuota de omega-3.",
  alts:[
   {n:"Atún en agua (paquete de 6)", f:3, unit:"latas", prep:"listo", hair:"selenio + omega-3",
    note:"Menos omega-3 que la sardina, pero más versátil.", totalTxt:"6 latas"},
   {n:"Salmón enlatado", f:1, prep:"listo", hair:"omega-3 + vitamina D", note:"Mismo beneficio, ~3 veces el precio."},
   {n:"Linaza molida + atún", f:1, prep:"listo", hair:"omega-3 vegetal", note:"Opción de emergencia: el omega-3 vegetal se convierte peor."}
  ]},

 /* ---------- CARBOHIDRATOS ---------- */
 {id:"avena", cat:"carb", e:"🌾", name:"Avena en hojuela", total:490, unit:"g",
  hair:"zinc + hierro + silicio + fibra", prep:"rapido",
  tip:"<b>A granel siempre.</b> El kilo a granel cuesta la mitad que la caja de marca y es exactamente el mismo grano. Compra 2 kg de una vez y guárdala en un frasco hermético.",
  alts:[
   {n:"Avena instantánea (sobre)", f:1, prep:"listo", note:"Cara y con azúcar añadida. Solo si tienes cero tiempo."},
   {n:"Amaranto inflado", f:1, prep:"listo", hair:"hierro + proteína vegetal", note:"Se come sin cocinar, muy barato a granel."},
   {n:"Salvado de trigo + avena", f:1, prep:"rapido", hair:"zinc + fibra", note:"Más fibra, mejor saciedad."},
   {n:"Granola sin azúcar", f:0.8, prep:"listo", note:"Más densa: menos gramos. Cara."}
  ]},
 {id:"arroz", cat:"carb", e:"🍚", name:"Arroz (crudo)", total:350, unit:"g",
  hair:null, prep:"cocina",
  tip:"Bolsa de 5 kg a granel: sale ~40 % más barato y dura meses. Cuece 1 kg el domingo en la arrocera (0 esfuerzo) y porciona en topers; aguanta 5 días en refri.",
  alts:[
   {n:"Tortilla de maíz", f:2.4, unit:"pzas", prep:"listo", hair:"calcio + niacina", note:"Cero cocina. 1 tortilla ≈ 25 g de arroz crudo.", totalTxt:"~28 pzas"},
   {n:"Papa o camote", f:3.5, prep:"rapido", hair:"vitamina A (camote) + potasio", note:"6 min en microondas picada con tenedor. Muy saciante."},
   {n:"Pasta integral", f:1, prep:"cocina", hair:"selenio + fibra"},
   {n:"Arroz precocido en bolsa (90 s)", f:2.6, prep:"listo", note:"3 veces más caro. Solo para días de emergencia.", totalTxt:"~5 bolsas"}
  ]},
 {id:"tortillas", cat:"carb", e:"🫓", name:"Tortillas de maíz", total:21, unit:"pzas",
  hair:"calcio + niacina", prep:"listo",
  tip:"De tortillería, no empacadas: mitad de precio y mejor sabor. Compra 1 kg (~35 pzas) y congela la mitad en bolsa; se descongelan en 20 s de micro.",
  alts:[
   {n:"Tortilla de nopal o baja en carbos", f:1, unit:"pzas", prep:"listo", note:"Menos carbos, más cara."},
   {n:"Tostadas horneadas", f:1, unit:"pzas", prep:"listo", note:"Mismas piezas, más crujiente."},
   {n:"Pan integral de caja", f:0.6, unit:"reb", prep:"listo", note:"2 rebanadas ≈ 3 tortillas."}
  ]},
 {id:"frijoles", cat:"carb", e:"🫘", name:"Frijoles cocidos", total:840, unit:"g",
  hair:"hierro vegetal + zinc + folato", prep:"listo",
  tip:"<b>Frijol seco a granel + olla express.</b> 1 kg seco (~$40) rinde 2.5 kg cocido: sale a menos de un tercio de lo que cuestan los de lata. 35 min en la express una vez al mes y congelas en bolsas planas de 500 g.",
  alts:[
   {n:"Frijoles refritos en tetra/lata", f:0.9, prep:"listo", hair:"hierro vegetal", note:"Cero trabajo, ~3 veces el precio del granel."},
   {n:"Lentejas cocidas", f:1.1, prep:"listo", hair:"hierro + folato + zinc", note:"Aún más hierro que el frijol. Se cuecen en 20 min sin remojo."},
   {n:"Garbanzo cocido", f:1, prep:"listo", hair:"hierro + zinc + proteína"},
   {n:"Habas o alubias", f:1, prep:"listo", hair:"hierro vegetal"}
  ]},
 {id:"leche", cat:"carb", e:"🥛", name:"Leche alta en proteína", total:2100, unit:"ml",
  hair:"proteína + calcio + vitamina D", prep:"listo",
  tip:"<b>Paquete completo de 12 piezas, no sueltas.</b> Sale ~12–15 % más barata por litro, es leche UHT (no necesita refri hasta abrirse) y te ahorra ir al súper cada tercer día. Guárdala en la alacena.",
  alts:[
   {n:"Leche descremada normal", f:1.15, prep:"listo", hair:"calcio + vitamina D", note:"Más barata pero menos proteína: sube la porción."},
   {n:"Leche en polvo descremada", f:0.13, unit:"g", prep:"rapido", hair:"proteína + calcio",
    note:"La proteína más barata del súper. 1 bote rinde 8 L. Ideal para batidos.", totalTxt:"~270 g"},
   {n:"Bebida de soya sin azúcar", f:1.2, prep:"listo", note:"Si te cae pesada la leche."},
   {n:"Yogurt griego bebible sin azúcar", f:0.9, prep:"listo", hair:"proteína + calcio"}
  ]},
 {id:"cacao", cat:"carb", e:"🍫", name:"Cacao en polvo sin azúcar", total:70, unit:"g",
  hair:"magnesio + hierro + antioxidantes", prep:"listo",
  tip:"La bolsa grande de 400 g a granel dura 6 semanas y cuesta lo mismo que 2 latitas. Es tu mejor aliado contra el antojo de chocolate: sabor a chocolate con casi cero azúcar.",
  alts:[{n:"Cocoa sin azúcar de marca", f:1, prep:"listo", note:"Equivalente directo, algo más cara."}]},

 /* ---------- FRUTAS Y VERDURAS ---------- */
 {id:"verdura", cat:"veg", e:"🥦", name:"Mezcla de verduras congeladas", total:1750, unit:"g",
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
 {id:"espinaca", cat:"veg", e:"🥬", name:"Espinaca (fresca en bolsa o congelada)", total:700, unit:"g",
  hair:"hierro + folato + vitamina A + vitamina C", prep:"listo",
  tip:"La bolsa de espinaca baby ya lavada cuesta poco más que la de manojo y te ahorra lavar y desinfectar. La congelada sale aún más barata y rinde el triple (viene sin agua).",
  alts:[
   {n:"Espinaca congelada en bloque", f:0.4, prep:"listo", hair:"hierro + folato", note:"Rinde mucho más: 40 g del bloque ≈ 100 g fresca."},
   {n:"Acelga", f:1, prep:"rapido", hair:"hierro + vitamina A"},
   {n:"Kale", f:1, prep:"rapido", hair:"vitamina C + vitamina A"},
   {n:"Nopal en frasco", f:1.2, prep:"listo", hair:"calcio + fibra", note:"Cero preparación, muy barato."}
  ]},
 {id:"fruta", cat:"veg", e:"🍎", name:"Manzana o plátano", total:910, unit:"g",
  hair:"vitamina C + antioxidantes", prep:"listo",
  tip:"Compra por caja o por kilo en el mercado, nunca por pieza en el súper: la diferencia llega al 50 %. La manzana aguanta 3 semanas en refri.",
  alts:[
   {n:"Guayaba", f:0.9, prep:"listo", hair:"vitamina C (4 veces más que la naranja)",
    note:"La fruta con más vitamina C por peso. Cómela junto con frijoles para absorber su hierro."},
   {n:"Papaya", f:1.2, prep:"listo", hair:"vitamina C + vitamina A", note:"Barata en temporada, buena para digestión."},
   {n:"Naranja o mandarina", f:1.1, prep:"listo", hair:"vitamina C"},
   {n:"Fresa congelada", f:1.1, prep:"listo", hair:"vitamina C", note:"No se echa a perder, ideal para el yogurt."},
   {n:"Sandía o melón", f:1.6, prep:"rapido", note:"Mucho volumen y pocas calorías: la mejor arma contra el antojo."}
  ]},
 {id:"zanahoria", cat:"veg", e:"🥕", name:"Zanahoria o camote", total:700, unit:"g",
  hair:"vitamina A (betacaroteno) + vitamina C", prep:"rapido",
  tip:"El betacaroteno de estos NO es tóxico como el retinol de los suplementos: puedes comerlo diario sin riesgo. Compra 1 kg, dura 3 semanas en refri.",
  alts:[
   {n:"Camote", f:0.85, prep:"rapido", hair:"vitamina A + potasio", note:"6 min en microondas entero. Muy saciante."},
   {n:"Calabacita", f:1.3, prep:"listo", note:"Menos carbos, más volumen."},
   {n:"Chayote", f:1.3, prep:"rapido", note:"El más barato del mercado."},
   {n:"Pepino con limón y chile", f:1.5, prep:"listo", note:"Casi cero calorías, perfecto para picar en la tarde."}
  ]},
 {id:"limon", cat:"veg", e:"🍋", name:"Limón", total:500, unit:"g",
  hair:"vitamina C (multiplica la absorción de hierro)", prep:"listo",
  tip:"Compra 1 kg cuando esté barato y congela el jugo en cubitera. <b>Truco clave:</b> exprime limón sobre los frijoles, las lentejas y la espinaca — triplica el hierro que realmente absorbes.",
  alts:[
   {n:"Naranja", f:2, prep:"listo", hair:"vitamina C"},
   {n:"Pimiento morrón crudo", f:0.6, prep:"listo", hair:"vitamina C (más que el limón)"},
   {n:"Guayaba", f:0.5, prep:"listo", hair:"vitamina C"}
  ]},

 /* ---------- GRASAS, SEMILLAS Y EXTRAS ---------- */
 {id:"linaza", cat:"fat", e:"🌱", name:"Linaza molida", total:100, unit:"g",
  hair:"omega-3 vegetal + lignanos + zinc", prep:"listo",
  tip:"<b>A granel es 3 veces más barata</b> que empacada. Cómprala entera y muélela en la licuadora en tandas de 2 semanas (entera pasa de largo sin digerirse). Guárdala en el refri.",
  alts:[
   {n:"Chía", f:1, prep:"listo", hair:"omega-3 + calcio + fibra", note:"No hay que molerla, pero es el doble de cara."},
   {n:"Nuez de Castilla", f:1.5, prep:"listo", hair:"omega-3 + biotina + zinc", note:"La nuez más rica en omega-3. Cara: úsala en poca cantidad."},
   {n:"Semilla de girasol", f:1.4, prep:"listo", hair:"vitamina E + selenio", note:"Muy barata a granel."}
  ]},
 {id:"pepitas", cat:"fat", e:"🎃", name:"Pepitas (semilla de calabaza)", total:200, unit:"g",
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
 {id:"aceite", cat:"fat", e:"🫒", name:"Aceite de oliva o aguacate", total:60, unit:"ml",
  hair:"vitamina E + grasas para la piel", prep:"listo",
  tip:"Botella de 1 L, no la chica: sale ~30 % más barato por mililitro y dura 4 meses. Guárdala lejos del calor de la estufa.",
  alts:[
   {n:"Aguacate en fruta", f:2.5, unit:"g", prep:"listo", hair:"vitamina E + grasas monoinsaturadas",
    note:"20 g de aguacate ≈ 8 ml de aceite. Mejores nutrientes, más volumen."},
   {n:"Aceite de canola", f:1, prep:"listo", note:"Más barato, perfil de grasa aceptable."}
  ]},
 {id:"sazon", cat:"fat", e:"🧂", name:"Sal, pimienta, ajo, comino, chile", total:0, unit:"al gusto",
  hair:null, prep:"listo",
  tip:"A granel en el mercado: pagas por gramo lo que en el súper cuesta el frasco. El ajo en polvo y el comino son lo que hace que la comida repetida no se vuelva insoportable.",
  alts:[]},
 {id:"galletas", cat:"fat", e:"🍪", name:"Galletas de avena (tipo Quaker)", total:5, unit:"paquetes",
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
   {n:"Tu propio pollo deshebrado, porcionado", save:"−20 min/sem", p:"Compra 1 kg ya cocido y el mismo día congélalo en bolsas planas de 200 g. Sacas una en la noche y amanece lista. Las bolsas planas se descongelan 3 veces más rápido que un bloque.",
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
 {name:"Desayuno", time:"7:00–8:30 am", kcal:530, prot:39, color:"#4d8dff",
  items:[
   {ref:"yogurt", g:300},
   {ref:"avena", g:40},
   {ref:"fruta", g:130},
   {ref:"linaza", g:12},
   {ref:"pepitas", g:15},
   {ref:"cacao", g:5, tag:"opcional"}
  ]},
 {name:"Snack del trabajo", time:"10:30–11:30 am", kcal:240, prot:14, color:"#38d6e8", optLabel:["Galleta + café","Pepitas + fruta","Atún"],
  options:{
   A:[{ref:"galletas", g:1, unit:"paquete"},{ref:"leche", g:150, unit:"ml", extra:"+ café"}],
   B:[{ref:"pepitas", g:30},{ref:"fruta", g:130}],
   C:[{ref:"sardina", g:0.35, unit:"lata", extra:"o 1 lata de atún"},{ref:"galletas", g:1, unit:"paquete"}]
  }},
 {name:"Comida", time:"2:00–3:30 pm", kcal:720, prot:62, color:"#f2b544",
  items:[
   {ref:"pollo", g:170, tag:"cocido ·", tagBase:true},
   {ref:"verdura", g:250},
   {ref:"frijoles", g:120},
   {ref:"arroz", g:50, extra:"crudo (≈150 g cocidos) o 2 tortillas"},
   {ref:"aceite", g:8, unit:"ml"},
   {ref:"limon", g:15, extra:"exprimido sobre los frijoles"}
  ]},
 {name:"Pre-entreno", time:"5:30–6:30 pm", kcal:250, prot:18, color:"#b09bff", optLabel:["Leche + cacao","Yogurt + fruta"],
  options:{
   A:[{ref:"leche", g:300, unit:"ml", extra:"+ 10 g cacao"},{ref:"avena", g:30}],
   B:[{ref:"yogurt", g:200},{ref:"fruta", g:120}]
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
 "Saca del congelador 1 kg de pollo deshebrado y repártelo en 7 bolsas planas de ~170 g. Etiqueta con la fecha.",
 "Pon a cocer 1 kg de arroz en la arrocera. Mientras se hace, no lo veas: haz lo demás.",
 "Cuece 12 huevos (12 min desde el hervor). Se guardan con cáscara toda la semana.",
 "Muele 200 g de linaza en la licuadora y guárdala en un frasco en el refri.",
 "Porciona el arroz ya frío en 7 topers con 120 g de frijol cada uno.",
 "No cocines las verduras: se quedan congeladas en su bolsa. Van al micro el mismo día que las comas.",
 "Refrigera los topers de los días 1–5 y congela los del 6 y 7. Listo: ~35 min en total."
];

/* ============================================================
   RUTINA — ciclo 3-1-3-1 (entrenas 3, descansas 1, entrenas 3,
   descansas 1). Son 8 días, así que el ciclo NO cae siempre en
   el mismo día de la semana: se recorre. Por eso hay un selector
   de días arriba y un botón para recorrer el ciclo si faltas.

   act = índice de activación 0-100. Combina electromiografía y
   estudios de hipertrofia. Sirve para comparar variantes DEL
   MISMO patrón, no ejercicios distintos entre sí.
   ============================================================ */
const CICLO = [
 {t:"entreno", id:"pushA", title:"Empuje A · Pecho dominante", short:"Empuje A"},
 {t:"entreno", id:"pullA", title:"Jalón A · Espalda en anchura", short:"Jalón A"},
 {t:"entreno", id:"legsA", title:"Pierna A · Cuádriceps y glúteo", short:"Pierna A"},
 {t:"descanso", id:"restA", title:"Descanso", short:"Descanso"},
 {t:"entreno", id:"pushB", title:"Empuje B · Hombro dominante", short:"Empuje B"},
 {t:"entreno", id:"pullB", title:"Jalón B · Espalda en grosor", short:"Jalón B"},
 {t:"entreno", id:"legsB", title:"Pierna B · Femoral y glúteo", short:"Pierna B"},
 {t:"descanso", id:"restB", title:"Descanso", short:"Descanso"}
];

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
 pushB:[
  {id:"militar_b", s:4, r:"6-8", grp:"sup", v:[
   {n:"Press militar sentado con mancuernas", act:90, base:20, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Hoy el hombro va primero y descansado: aquí es donde debes buscar la carga."},
   {n:"Press militar con barra de pie", act:87, base:35},
   {n:"Press de hombro en máquina", act:86, base:35},
   {n:"Press Arnold", act:85, base:15, u:"por mancuerna"}
  ]},
  {id:"press_incl_b", s:3, r:"8-10", grp:"sup", v:[
   {n:"Press inclinado 30° con mancuernas", act:93, base:20, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Segunda dosis semanal de pectoral superior, que es la zona que más cuesta desarrollar."},
   {n:"Press inclinado 30° con barra", act:89, base:40},
   {n:"Press inclinado en máquina", act:88, base:40}
  ]},
  {id:"lateral_b", s:4, r:"15-20", grp:"sup", v:[
   {n:"Elevación lateral en polea a un brazo", act:95, base:7, u:"por lado",
    top:"LA MEJOR DEL PATRÓN",
    note:"Hoy en repeticiones altas. El deltoides medio responde muy bien a mucho volumen y poca carga."},
   {n:"Elevación lateral tumbado de lado en banco", act:91, base:5, u:"por mancuerna"},
   {n:"Elevación lateral con mancuernas de pie", act:90, base:7, u:"por mancuerna"},
   {n:"Elevación lateral en máquina", act:89, base:18}
  ]},
  {id:"pecho_bajo", s:3, r:"10-12", grp:"sup", v:[
   {n:"Fondos en paralelas con el torso inclinado", act:90, base:0, bw:true,
    top:"LA MEJOR DEL PATRÓN",
    note:"Inclina el tronco hacia adelante para que trabaje el pecho y no el tríceps. Cuando pases de 15 repeticiones, ponte lastre."},
   {n:"Cruce de poleas de arriba hacia abajo", act:89, base:12, u:"por lado",
    note:"Aísla la porción baja del pectoral sin cargar el hombro."},
   {n:"Fondos en máquina asistida", act:85, base:0},
   {n:"Press cerrado en banca plana", act:84, base:45,
    note:"Más tríceps que pecho."}
  ]},
  {id:"triceps_b", s:3, r:"12-15", grp:"sup", v:[
   {n:"Extensión de tríceps sobre la cabeza en polea", act:94, base:17.5,
    top:"LA MEJOR DEL PATRÓN",
    note:"Segunda dosis semanal en posición estirada, hoy con más repeticiones."},
   {n:"Extensión sobre la cabeza con mancuerna a dos manos", act:90, base:17.5},
   {n:"Jalón de tríceps en polea con cuerda", act:82, base:22},
   {n:"Patada de tríceps en polea", act:80, base:10, u:"por lado"}
  ]},
  {id:"delt_post_b", s:3, r:"15-20", grp:"sup", v:[
   {n:"Face pull en polea", act:90, base:22,
    top:"LA MÁS ÚTIL PARA TI",
    note:"Compensa todo el trabajo de empuje del día y mantiene el hombro sano. No la saltes."},
   {n:"Aperturas posteriores en polea cruzada", act:91, base:9, u:"por lado"},
   {n:"Pec deck invertido", act:89, base:28},
   {n:"Pájaros con mancuernas inclinado", act:86, base:7, u:"por mancuerna"}
  ]}
 ],
 pullB:[
  {id:"remo_b", s:4, r:"8-10", grp:"sup", v:[
   {n:"Remo en máquina con apoyo en el pecho", act:91, base:50,
    top:"LA MÁS RECOMENDABLE EN DÉFICIT",
    note:"Hoy el grosor de la espalda va primero. Sin fatiga lumbar, puedes empujar de verdad."},
   {n:"Remo con barra a 45°", act:92, base:65},
   {n:"Remo con mancuerna a un brazo", act:90, base:32},
   {n:"Remo T con agarre neutro", act:90, base:50}
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
  {id:"remo_estrecho", s:3, r:"12-15", grp:"sup", v:[
   {n:"Remo sentado en polea, agarre estrecho", act:88, base:45,
    top:"LA MEJOR DEL PATRÓN",
    note:"Lleva los codos pegados al cuerpo y aprieta los omóplatos 1 segundo."},
   {n:"Remo en polea a un brazo", act:89, base:22},
   {n:"Remo con mancuerna apoyado en banco inclinado", act:88, base:16, u:"por mancuerna"}
  ]},
  {id:"trapecio", s:3, r:"12-15", grp:"sup", v:[
   {n:"Encogimientos con mancuernas", act:89, base:30, u:"por mancuerna",
    top:"LA MEJOR DEL PATRÓN",
    note:"Sube y aguanta arriba 2 segundos. Nada de rotar los hombros."},
   {n:"Encogimientos en multipower", act:87, base:70},
   {n:"Encogimientos en polea baja", act:85, base:50,
    note:"Tensión más constante."}
  ]},
  {id:"biceps_b", s:3, r:"10-12", grp:"sup", v:[
   {n:"Curl en polea baja de pie", act:89, base:22,
    top:"LA MEJOR PARA HOY",
    note:"Tensión constante. Hoy que el bíceps ya viene cansado del remo, la polea perdona más que la mancuerna."},
   {n:"Curl inclinado con mancuernas", act:93, base:9, u:"por mancuerna"},
   {n:"Curl con barra Z", act:87, base:22},
   {n:"Curl en banco predicador", act:86, base:18}
  ]},
  {id:"core_b", s:3, r:"12-15", grp:"sup", v:[
   {n:"Elevación de piernas colgado en barra", act:90, base:0, bw:true,
    top:"LA MEJOR DEL PATRÓN",
    note:"Sube las rodillas al pecho de forma controlada, sin balancearte."},
   {n:"Crunch en polea alta arrodillado", act:91, base:25},
   {n:"Rueda abdominal", act:88, base:0, bw:true}
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
const $ = id => document.getElementById(id);
const toast = $("toast"); let toastT;
function showToast(m){ toast.textContent=m; toast.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(()=>toast.classList.remove("show"),2200); }
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
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
  const val = base*(a?a.f:1);
  return fmtQty(val, unit);
}
const PREP_TXT = {listo:"LISTO", rapido:"RÁPIDO", cocina:"COCINA"};
const PREP_CLS = {listo:"listo", rapido:"rapido", cocina:"cocina"};
function hairBadge(h){ return h?`<span class="hair-b">💇 ${esc(h)}</span>`:""; }
function prepBadge(p){ return p?`<span class="prep-b ${PREP_CLS[p]}">${PREP_TXT[p]}</span>`:""; }

/* ============================================================
   HOY — comidas, agua
   ============================================================ */
if(!S.meals[dayKey]) S.meals[dayKey]=MEALS.map(()=>false);
if(S.water[dayKey]===undefined) S.water[dayKey]=0;
$("dateMeta").textContent = DAYS[now.getDay()]+" "+now.getDate()+" "+MONTHS[now.getMonth()]+" · dieta y entrenamiento";
$("todayName").textContent = DAYS[now.getDay()];
$("mKcal").textContent = CONFIG.kcal.toLocaleString("es-MX");
$("mProt").textContent = CONFIG.prot+" g";
$("mCarb").textContent = CONFIG.carb+" g";
$("mFat").textContent = CONFIG.fat+" g";

function mealOpt(i){ return S.mealOpt[i] || "A"; }
function renderMeals(){
  const done=S.meals[dayKey];
  $("meals").innerHTML = MEALS.map((m,i)=>{
    const items = m.options ? m.options[mealOpt(i)] : m.items;
    const keys = m.options ? Object.keys(m.options) : [];
    const optHtml = m.options ? `<div class="opt-toggle">${keys.map((k,j)=>
      `<button data-opt="${k}" data-meal="${i}" class="${mealOpt(i)===k?'on':''}">${esc(m.optLabel?m.optLabel[j]:("Opción "+k))}</button>`).join("")}</div>` : "";
    return `<div class="meal${done[i]?' done':''}" style="--mc:${m.color}">
      <div class="meal-top">
        <div class="check${done[i]?' on':''}" data-i="${i}" role="button" tabindex="0">${done[i]?'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</div>
        <div><div class="meal-time">${m.time}</div><div class="meal-name">${m.name}</div></div>
        <div class="kcal">~<b>${m.kcal}</b> kcal<br>${m.prot} g prot</div>
      </div>
      ${optHtml}
      <ul class="foods">${items.map(f=>{
        const swapped=!!selAlt(f.ref), h=dispHair(f.ref);
        return `<li class="food${swapped?' swapped':''}">
          <span class="emoji">${shopById[f.ref].e}</span>
          <span class="txt"><b>${esc(dispName(f.ref))}</b>${f.extra?` <small>${esc(f.extra)}</small>`:''}
            ${swapped?'<span class="sw-note">↻ sustituido en el mandado</span>':''}
            ${h?`<span class="badges">${hairBadge(h)}</span>`:''}</span>
          <span class="amt">${(f.tag && !(f.tagBase && swapped))?esc(f.tag)+" ":""}${dispAmt(f.ref,f.g,f.unit)}</span></li>`;
      }).join("")}</ul>
    </div>`;
  }).join("");
  updateRing();
}
function updateRing(){
  const done=S.meals[dayKey], c=done.filter(Boolean).length;
  $("ringNum").textContent=c+"/"+MEALS.length;
  $("ringProg").style.strokeDashoffset = 238.8*(1-c/MEALS.length);
  if($("stMeals")) $("stMeals").textContent=c+"/"+MEALS.length;
}
$("meals").addEventListener("click",e=>{
  const chk=e.target.closest(".check");
  if(chk){ const i=+chk.dataset.i; S.meals[dayKey][i]=!S.meals[dayKey][i]; save(); renderMeals();
    if(S.meals[dayKey].every(Boolean)) showToast("¡Completaste todas tus comidas! 🎉");
    else if(S.meals[dayKey][i]) showToast("Comida registrada ✓"); return; }
  const opt=e.target.closest("[data-opt]");
  if(opt){ S.mealOpt[+opt.dataset.meal]=opt.dataset.opt; save(); renderMeals(); }
});

function renderWater(){
  const w=S.water[dayKey], el=$("water"); el.innerHTML="";
  for(let k=0;k<8;k++){ const g=document.createElement("div");
    g.className="glass"+(k<w?" full":"");
    g.onclick=()=>{ S.water[dayKey]=(k<S.water[dayKey])?k:k+1; save(); renderWater();
      if(S.water[dayKey]===8) showToast("¡Meta de agua cumplida! 💧"); };
    el.appendChild(g); }
  $("waterNum").textContent=w;
}

/* nutrientes del cabello */
$("nutList").innerHTML = NUTRIENTES.map(n=>`
  <div class="nut"><span class="n-i">${n.e}</span>
    <span class="n-t"><b>${esc(n.n)}</b><small>${n.d}</small></span>
    <span class="ev ${n.ev.startsWith("alta")?"alta":n.ev==="cuidado"?"media":n.ev.startsWith("media")?"media":"baja"}">${esc(n.ev)}</span>
  </div>`).join("");

/* ============================================================
   MANDADO
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
          fmtQty(it.total,it.unit);
        const hasAlts=it.alts.length>0;
        const h = swapped ? (a.hair!==undefined?a.hair:null) : it.hair;
        const p = swapped ? (a.prep||it.prep) : it.prep;
        const sub = swapped ? ("en lugar de "+it.name+(a.note?" · "+a.note:"")) : "";
        return `<div class="shop-item${swapped?' swapped':''}" data-id="${it.id}">
          <div class="shop-row">
            <span class="emoji">${it.e}</span>
            <span class="nm"><b>${esc(swapped?a.n:it.name)}</b>
              ${sub?`<small>${esc(sub)}</small>`:""}
              <span class="badges">${hairBadge(h)}${prepBadge(p)}</span></span>
            <span class="qty">${qty}</span>
            ${hasAlts?`<button class="swap-btn" data-open="${it.id}" aria-label="Ver equivalencias">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M21 3 9 15"/><path d="M8 21H3v-5"/><path d="m3 21 6-6"/></svg></button>`:""}
          </div>
          ${it.tip?`<div class="buy-tip"><span class="bt-i">🛒</span><span>${it.tip}</span></div>`:""}
          ${hasAlts?`<div class="alts" id="alts-${it.id}"><div class="alts-in">
            <div class="alts-lbl">${it.alts.length} equivalencias · mismos macros</div>
            <button class="alt${!swapped?' on':''}" data-pick="${it.id}" data-alt="-1">
              <span class="a-nm">${esc(it.name)}<small>opción original del plan</small>
                <span class="badges">${hairBadge(it.hair)}${prepBadge(it.prep)}</span></span>
              <span class="a-q">${fmtQty(it.total,it.unit)}</span></button>
            ${it.alts.map((al,j)=>`<button class="alt${swapped&&S.swaps[it.id]===j?' on':''}" data-pick="${it.id}" data-alt="${j}">
              <span class="a-nm">${esc(al.n)}${al.note?`<small>${esc(al.note)}</small>`:""}
                <span class="badges">${hairBadge(al.hair)}${prepBadge(al.prep||it.prep)}</span></span>
              <span class="a-q">${al.totalTxt||fmtQty(it.total*al.f, al.unit||it.unit)}</span></button>`).join("")}
          </div></div>`:""}
        </div>`;
      }).join("")}
    </div>`).join("");
}
$("shopList").addEventListener("click",e=>{
  const open=e.target.closest("[data-open]");
  if(open){ $("alts-"+open.dataset.open).classList.toggle("open"); return; }
  const pick=e.target.closest("[data-pick]");
  if(pick){ const id=pick.dataset.pick, j=+pick.dataset.alt;
    if(j<0) delete S.swaps[id]; else S.swaps[id]=j;
    save(); renderShop(); renderMeals();
    showToast(j<0?"Volviste a la opción original ✓":"Mandado y platillos actualizados 🔄");
  }
});

/* compra inteligente */
$("smartList").innerHTML = COMPRA.map(g=>`
  <div class="smart-group" id="sg-${g.id}">
    <div class="smart-head" data-sg="${g.id}" role="button" tabindex="0">
      <span class="si">${g.e}</span>
      <span class="st"><b>${esc(g.t)}</b><small>${esc(g.sub)}</small></span>
      <span class="sv">${esc(g.save)}</span>
      <svg class="caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
    </div>
    <div class="smart-body">${g.items.map(it=>`
      <div class="smart-item">
        <div class="si-top"><b>${esc(it.n)}</b><span class="save">${esc(it.save)}</span></div>
        <p>${it.p}</p>
        <div class="metrics">${it.m.map(([c,t])=>`<span class="metric ${c}">${esc(t)}</span>`).join("")}</div>
      </div>`).join("")}
    </div>
  </div>`).join("");
$("smartList").addEventListener("click",e=>{
  const h=e.target.closest("[data-sg]"); if(!h) return;
  $("sg-"+h.dataset.sg).classList.toggle("open");
});
$("prepSteps").innerHTML = PREP_STEPS.map((s,i)=>`<div class="prep-step"><span class="n">${i+1}</span><span>${esc(s)}</span></div>`).join("");

/* ============================================================
   RUTINA — ciclo 3-1-3-1 y selector de días
   ============================================================ */
function weekOfMonth(d){ const f=new Date(d.getFullYear(),d.getMonth(),1); const o=(f.getDay()+6)%7;
  return Math.floor((d.getDate()-1+o)/7)+1; }
function weeksInMonth(y,m){ const f=new Date(y,m,1); const o=(f.getDay()+6)%7;
  return Math.ceil((new Date(y,m+1,0).getDate()+o)/7); }
function cycleIndexFor(w,tot){
  if(tot>=5){ if(w<=1) return 0; if(w===2||w===3) return 1; if(w===4) return 2; return 3; }
  if(w<=1) return 0; if(w===2) return 1; if(w===3) return 2; return 3;
}
function faseDe(key){ const d=fromKey(key); const tot=weeksInMonth(d.getFullYear(),d.getMonth());
  return {idx:cycleIndexFor(weekOfMonth(d),tot), w:weekOfMonth(d), tot}; }

function cicloPos(key){ return ((daysBetween(CONFIG.anclaCiclo,key)+(S.cicloShift||0))%8+8)%8; }
function bloqueDe(key){ return CICLO[cicloPos(key)]; }

let viewKey = dayKey;          // día que se está viendo en la pestaña Rutina
let weekOffset = 0;            // 0 = semana actual

function getVarIdx(exId){ const i=S.varSel[exId]; return (i===undefined)?0:i; }
function getVar(ex){ return ex.v[Math.min(getVarIdx(ex.id), ex.v.length-1)]; }
function liftKey(ex){ return ex.id+"|"+getVarIdx(ex.id); }
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
  showToast("¡A darle! Siguiente serie 💪"); try{navigator.vibrate&&navigator.vibrate(200);}catch(e){} }
function stopRest(){ clearInterval(restTimer); restActive=false; $("restBar").classList.remove("show","low"); }
$("restSkip").onclick = stopRest;
document.addEventListener("visibilitychange",()=>{
  if(document.hidden || !restActive) return;
  if(Date.now()>=restEnd) finishRest(); else paintRest();
});

function renderUnitToggle(){
  $("unitToggle").innerHTML = ["kg","lb"].map(u=>`<button data-u="${u}" class="${S.unidad===u?'on':''}">${u.toUpperCase()}</button>`).join("");
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
    return `<button class="day-btn ${b.t==="entreno"?"train":"rest"}${sel?" sel":""}${isToday?" today":""}${done?" done-day":""}" data-day="${k}">
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
document.querySelectorAll("[data-shift]").forEach(b=>b.onclick=()=>{
  S.cicloShift=(S.cicloShift||0)+ +b.dataset.shift; save();
  renderWeekStrip(); renderRoutine(); renderTrained(); renderFase();
  showToast("Ciclo recorrido "+(+b.dataset.shift>0?"+1":"−1")+" día ✓");
});

/* --- Fase del mes --- */
function renderFase(){
  const f=faseDe(viewKey), cyc=CYCLE[f.idx];
  $("cycleChip").textContent = "Semana "+f.w+" de "+f.tot;
  $("cycleChip").style.background="rgba(255,255,255,.06)";
  $("cycleChip").style.color=cyc.c;
  $("fasePill").textContent = CYCLE[faseDe(dayKey).idx].n;
  $("cycleCal").innerHTML = Array.from({length:f.tot},(_,k)=>{
    const wn=k+1, c=CYCLE[cycleIndexFor(wn,f.tot)];
    return `<div class="cw${wn===f.w?' now':''}" style="--wc:${c.c}"><b>Sem ${wn}</b><span>${c.n}</span></div>`;
  }).join("");
  const banner=$("deloadBanner");
  if(f.idx===3){
    banner.innerHTML = `<div class="banner em"><span class="i">🧘</span>
      <div><b>Semana de DESCARGA.</b> Usa el 60–65 % del peso de la semana previa (ya calculado abajo), sin llegar al fallo.
      La descarga no frena el progreso: es donde el cuerpo consolida lo que ganaste.</div></div>`;
  }else{
    const rest=f.tot-f.w;
    banner.innerHTML = `<div class="banner ${f.idx===2?'coral':'amber'}"><span class="i">${f.idx===2?'🔥':'📅'}</span>
      <div><b>Semana ${f.w} · ${cyc.n}.</b> ${cyc.d} ${rest>0?`Faltan <b>${rest} semana${rest>1?'s':''}</b> para la descarga.`:''}</div></div>`;
  }
}

/* --- Render de la rutina del día seleccionado --- */
function renderRoutine(){
  const b = bloqueDe(viewKey);
  const f = faseDe(viewKey), isDeload = f.idx===3;
  const d = fromKey(viewKey);
  const fecha = DAYS[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()];
  renderFase();

  /* ---- DÍA DE DESCANSO ---- */
  if(b.t!=="entreno"){
    $("routineDayTitle").textContent = fecha+" · Descanso";
    $("warmBox").innerHTML="";
    $("exList").innerHTML = `<div class="card" style="text-align:center">
      <div style="font-size:34px;margin-bottom:6px">😌</div>
      <b style="font-family:'Space Grotesk';font-size:16px">Hoy no hay pesas</b>
      <div class="subtle" style="margin-top:6px">El descanso cada 3 días es lo que hace que el esquema 3-1-3-1 funcione: llegas fresco a cada bloque en vez de arrastrar fatiga toda la semana.<br>Duerme 7–8 h y come igual que siempre: <b>el día de descanso no se recorta comida.</b></div></div>`;
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
    $("cardioBox").innerHTML = `<div class="block${cOn?' on':''}" data-blk="cardio" style="--bc:rgba(56,214,232,.32);--bbg:var(--card);--bc2:var(--sky);--bbg2:var(--sky-soft)">
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
  $("exList").innerHTML = list.map(ex=>{
    const v=getVar(ex), vi=getVarIdx(ex.id);
    const w=getW(ex), showW = isDeload ? roundP(w*0.62) : w;
    const inc = ex.grp==="inf"?5:2.5;
    const hiDone = S.liftHi[liftKey(ex)]===thisWeek;
    const bodyweight = !!v.bw;
    const done = setsDone(viewKey, ex.id);
    const rest = restFor(ex);
    const dots = Array.from({length:ex.s},(_,i)=>`<span class="set-dot${i<done?' on':''}"></span>`).join("");
    return `<div class="ex${done>=ex.s?' ex-complete':''}" data-ex="${ex.id}">
      <div class="ex-top">
        <span class="nm"><b>${esc(v.n)}</b>
          <small>${ex.s}×${ex.r} · descanso ${fmtRest(rest)}${v.u?" · "+esc(v.u):""}</small></span>
        ${bodyweight?`<span class="ex-w"><span class="wv">Corporal<small>peso</small></span></span>`
         :isDeload?`<span class="ex-w"><span class="wv">${fmtW(showW)}<small>descarga 62 %</small></span></span>`
         :`<span class="ex-w">
            <button data-w="-" aria-label="Bajar peso">−</button>
            <span class="wv"><input class="wv-in" data-exw="${ex.id}" type="number" inputmode="decimal" min="0" max="600" step="any" value="${+toUnit(w).toFixed(1)}" aria-label="Peso"><small>${unitLabel()}</small></span>
            <button data-w="+" aria-label="Subir peso">+</button>
          </span>`}
      </div>
      <div class="act">
        <span class="a-lbl">Activación</span>
        <span class="a-bar"><i style="width:${v.act}%"></i></span>
        <span class="a-num">${v.act}</span>
      </div>
      <div class="set-track">
        <div class="set-dots">${dots}</div>
        <button class="set-btn${done>=ex.s?' done':''}" data-set="${ex.id}" data-rest="${rest}" data-total="${ex.s}" data-name="${esc(v.n)}">
          ${done>=ex.s?'✓ Series completas':`Marcar serie ${done+1} de ${ex.s}`}
        </button>
      </div>
      ${!isDeload&&!bodyweight?`
      <div class="ex-done${hiDone?' on':''}" data-hi="${ex.id}">
        <span class="box">${hiDone?'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span>
        <span>Completé todas las series en el rango alto</span>
      </div>
      <div class="next-up${hiDone?' show':''}">▲ Próxima sesión sube a ${fmtW(roundP(w+inc))}</div>`:""}
      <button class="var-btn" data-var="${ex.id}">
        <span>▸ ${ex.v.length} variantes con su activación</span>
        <svg class="vb-c" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="var-wrap" id="vw-${ex.id}"><div class="var-in">
        ${ex.v.map((vv,j)=>`<button class="var${vi===j?' on':''}" data-pickvar="${ex.id}" data-vi="${j}">
          <span class="v-nm">${vv.top?`<span class="v-top">★ ${esc(vv.top)}</span>`:""}<b>${esc(vv.n)}</b>
            ${vv.note?`<small>${esc(vv.note)}</small>`:""}</span>
          <span class="v-act"><b>${vv.act}</b><span>ACTIV.</span></span>
        </button>`).join("")}
      </div></div>
    </div>`;
  }).join("");

  const cOn = S.cardio[viewKey]===true;
  $("cardioBox").innerHTML = `<div class="block${cOn?' on':''}" data-blk="cardio" style="--bc:rgba(56,214,232,.32);--bc2:var(--sky);--bbg2:var(--sky-soft)">
    <span class="b-i">🏃</span>
    <div class="b-t"><b>Cardio final · ${CONFIG.cardioMin} min</b>
    <small>Caminadora en pendiente o elíptica a ritmo cómodo. Si hoy no te da el tiempo, no pasa nada: aparecerá como pendiente en tu próximo día de descanso.</small></div>
    <span class="b-c">${cOn?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>':''}</span></div>`;
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
  save(); renderRoutine(); showToast("Peso guardado ✓");
});
$("exList").addEventListener("keydown",e=>{
  if(e.key==="Enter" && e.target.classList.contains("wv-in")) e.target.blur();
});
$("exList").addEventListener("click",e=>{
  const b=bloqueDe(viewKey); if(b.t!=="entreno") return;
  const list=RUTINA[b.id];

  const vb=e.target.closest("[data-var]");
  if(vb){ const w=$("vw-"+vb.dataset.var); w.classList.toggle("open"); vb.classList.toggle("open"); return; }

  const pv=e.target.closest("[data-pickvar]");
  if(pv){ const id=pv.dataset.pickvar, j=+pv.dataset.vi;
    S.varSel[id]=j; save(); renderRoutine();
    const w=$("vw-"+id); if(w) w.classList.add("open");
    showToast("Variante cambiada · el peso se guarda por separado 🔄"); return; }

  const sb=e.target.closest("[data-set]");
  if(sb){ const exId=sb.dataset.set, total=+sb.dataset.total, rest=+sb.dataset.rest, name=sb.dataset.name;
    const n=toggleSet(viewKey,exId,total); renderRoutine();
    if(n>0 && n<total) startRest(rest,name);
    else if(n>=total){ stopRest(); showToast("Ejercicio completo ✓"); }
    else stopRest();
    return; }

  const wb=e.target.closest("[data-w]");
  if(wb){ const exId=wb.closest(".ex").dataset.ex; const ex=list.find(x=>x.id===exId);
    const step = ex.grp==="inf"?5:2.5;
    let w=getW(ex)+(wb.dataset.w==="+"?step:-step); if(w<0)w=0;
    S.lifts[liftKey(ex)]=w; save(); renderRoutine(); return; }

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
    <div class="session-count"><span class="sc-num">${S.sessions||0}</span> <span class="sc-lbl">sesiones completadas en total</span></div>`;
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
  const cols=["#4d8dff","#38d6e8","#b09bff","#7ee081","#f2b544"];
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
$("snackList").innerHTML = SNACKS.map(s=>`
  <div class="antojo">
    <span class="nm"><b>${esc(s.n)}</b><small>${esc(s.note)}</small>
      ${s.hair?`<span class="badges">${hairBadge(s.hair)}</span>`:""}</span>
    <span class="kc">~${s.kcal} kcal<br><small style="color:var(--faint)">${esc(s.p)}</small></span>
  </div>`).join("");

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
    msg.innerHTML=`<span class="i">⚠️</span><div><b>Te pasaste ${(used-CONFIG.antojosSemana).toLocaleString("es-MX")} kcal.</b> No compenses saltándote comidas: al día siguiente quita 1 tortilla y el snack del trabajo, y suma 10 min de cardio. Nada más.</div>`;
  }else if(used>CONFIG.antojosSemana*0.7){
    msg.className="banner amber";
    msg.innerHTML=`<span class="i">🟡</span><div><b>Vas al ${Math.round(pct)}% del presupuesto.</b> El resto de la semana quédate con los snacks del plan, que no gastan presupuesto.</div>`;
  }else if(!finde && used>0){
    msg.className="banner amber";
    msg.innerHTML=`<span class="i">📅</span><div><b>Estás usando antojo entre semana.</b> No es grave, pero si lo guardas para sábado y domingo tienes ${Math.round(left/2)} kcal para cada día del fin: mucho más margen para disfrutarlo de verdad.</div>`;
  }else{
    msg.className="banner em";
    msg.innerHTML=`<span class="i">✅</span><div><b>Este presupuesto es tuyo, úsalo.</b> Está calculado para que aun gastándolo completo el fin de semana sigas bajando grasa.</div>`;
  }
}
function renderAntojos(){
  $("antojoList").innerHTML = ANTOJOS.map(a=>`
    <div class="antojo">
      <span class="nm"><b>${esc(a.n)} <span class="tag ${a.tag}">${a.tagT}</span></b><small>${esc(a.note)}</small></span>
      <span class="kc">~${a.kcal} kcal</span>
      <button class="log-btn" data-log="${a.id}">+ Registrar</button>
    </div>`).join("");
}
$("antojoList").addEventListener("click",e=>{
  const b=e.target.closest("[data-log]"); if(!b) return;
  const a=ANTOJOS.find(x=>x.id===b.dataset.log);
  S.antojos[thisWeek].push({id:a.id, kcal:a.kcal, ts:Date.now()});
  save(); renderBudget();
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
  return `<div class="ind" style="--ic:${color}">
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
    ${pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.v)}" r="3" fill="#070b13" stroke="${color}" stroke-width="2"/>`).join("")}
    <text x="${X(pts.length-1)}" y="${Y(pts[pts.length-1].v)-7}" fill="#e9eefb" font-size="10.5" font-weight="700" text-anchor="end">${pts[pts.length-1].v.toFixed(1)}${unit}</text></svg>`;
}
function goalBar(label, unit, base, cur, meta, color){
  if(cur==null||base==null||meta==null) return "";
  const total=Math.abs(meta-base); if(total<0.01) return "";
  const adv=Math.max(0, meta>base ? cur-base : base-cur);
  const pct=Math.min(100, Math.round(adv/total*100));
  const left=Math.max(0, +(total-Math.min(adv,total)).toFixed(1));
  return `<div class="goal">
    <div class="g-top"><span>${label}</span><b style="color:${color}">${pct}%</b></div>
    <div class="g-bar"><i style="width:${pct}%;background:${color}"></i></div>
    <small>Hoy: ${cur.toFixed(1)}${unit} · Meta: ${meta}${unit} · ${left>0?`Te faltan ${left}${unit}`:"¡Meta alcanzada! 🎉"}</small></div>`;
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
    $("stDelta").style.color = d<=0 ? "#7ee081" : "#ff6b6b";
  } else $("stDelta").textContent="—";

  $("indGrid").innerHTML =
    trendCard("Peso","kg", lastW?lastW.kg:null, prevW?prevW.kg:null, "down", "#38d6e8")+
    trendCard("% grasa","%", lastF?lastF.grasa:null, prevF?prevF.grasa:null, "down", "#ff6b6b")+
    trendCard("Músculo (MME)","kg", lastM?lastM.mme:null, prevM?prevM.mme:null, "up", "#7ee081");

  $("metricTabs").innerHTML = [["kg","Peso"],["grasa","% grasa"],["mme","Músculo"]]
    .map(([k,t])=>`<button data-metric="${k}" class="${bodyMetric===k?'on':''}">${t}</button>`).join("");
  const series = H.map(p=>({d:p.d, v: bodyMetric==="kg"?p.kg : bodyMetric==="grasa"?p.grasa : p.mme}));
  const col = bodyMetric==="kg"?"#38d6e8":bodyMetric==="grasa"?"#ff6b6b":"#7ee081";
  const unit = bodyMetric==="grasa"?"%":"kg";
  const metaSel = bodyMetric==="grasa"?CONFIG.perfil.metaGrasa : bodyMetric==="mme"?CONFIG.perfil.metaMusculo : 85.5;
  $("bodyChart").innerHTML = lineChart(series, col, unit, metaSel) + paceLine(series, unit, metaSel);

  $("goalGrid").innerHTML =
    (goalBar("% de grasa","%", MEDICION_BASE.grasa, lastF?lastF.grasa:null, CONFIG.perfil.metaGrasa, "#ff6b6b")+
     goalBar("Músculo (MME)","kg", MEDICION_BASE.mme, lastM?lastM.mme:null, CONFIG.perfil.metaMusculo, "#7ee081"))
    || `<div class="subtle" style="margin-top:8px">Registra una medición para ver tu avance.</div>`;

  const streak=mealStreak();
  const sesSem=Object.keys(S.trained||{}).filter(k=>S.trained[k]===true && weekKey(fromKey(k))===thisWeek).length;
  const cardSem=Object.keys(S.cardio||{}).filter(k=>S.cardio[k]===true && weekKey(fromKey(k))===thisWeek).length;
  $("streakBox").innerHTML =
    `<span>🔥 Comidas completas: <b style="color:var(--em)">${streak} día${streak===1?"":"s"} seguido${streak===1?"":"s"}</b></span>`+
    `<span>🏋️ Sesiones esta semana: <b style="color:var(--sky)">${sesSem}</b></span>`+
    `<span>🏃 Cardios: <b style="color:var(--violet)">${cardSem}</b></span>`;

  $("bodyList").innerHTML = H.slice().reverse().slice(0,10).map(p=>{
    const isBase = S.body.findIndex(x=>x.d===p.d)===-1;
    return `<li><span class="bl-date">${fmtDateShort(p.d)}${isBase?' <i class="base-tag">base</i>':''}</span>
      <span class="bl-vals">
        <span>${p.kg?p.kg.toFixed(1):"—"}<i>kg</i></span>
        <span>${p.grasa?p.grasa.toFixed(1):"—"}<i>%gr</i></span>
        <span>${p.mme?p.mme.toFixed(1):"—"}<i>MME</i></span>
        ${isBase?'':`<button class="del" data-delbody="${p.d}" aria-label="Borrar">✕</button>`}
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
  renderBody(); showToast("Medición guardada: "+fmtDateShort(fecha)+" ✓");
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
  const em="#4d8dff", sky="#38d6e8", amber="#f2b544", coral="#ff6b6b", lime="#7ee081";
  const ink="#e9eefb", muted="#8797b2", card="#0f1724", line="#1c2839";
  ctx.fillStyle="#070b13"; ctx.fillRect(0,0,Wd,H);
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
  statCard(PAD, y, sky, m.cardioDays.length+"", "Cardios hechos", "de 6 posibles");
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
    due.innerHTML = `<div class="banner amber" style="margin-bottom:12px"><span class="i">🔔</span><div><b>Toca cerrar la semana.</b> Genera tu resumen y guárdalo: en 2 meses vas a poder comparar.</div></div>`;
    $("reportChip").textContent="pendiente"; $("reportChip").style.background="var(--amber-soft)"; $("reportChip").style.color="var(--amber)";
  } else {
    due.innerHTML=""; $("reportChip").textContent="al día";
    $("reportChip").style.background="var(--em-soft)"; $("reportChip").style.color="var(--em)";
  }
}
$("noteArea").value = S.note[thisWeek]||"";
$("noteArea").addEventListener("input", e=>{ S.note[thisWeek]=e.target.value; save(); });
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

/* ============================================================
   NAVEGACIÓN Y ARRANQUE
   ============================================================ */
document.querySelectorAll(".nb").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".nb").forEach(x=>x.classList.toggle("active",x===b));
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.id==="tab-"+b.dataset.tab));
  window.scrollTo({top:0,behavior:"smooth"});
});
$("bDate").value = dayKey;

renderMeals(); renderWater(); renderShop(); renderUnitToggle();
renderWeekStrip(); renderRoutine(); renderTrained();
renderBudget(); renderAntojos(); renderBody(); renderReportDue();

/* cambio de día */
function rolloverCheck(){ if(localKey(new Date())!==dayKey){ save(); location.reload(); } }
setInterval(rolloverCheck, 30000);
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) rolloverCheck(); });
if(!canStore) showToast("Este navegador no permite guardar: el progreso no se conservará");
