/* ============================================================
   PAQUETES Y PRECIOS DE SOLIDA — un solo lugar.
   Lo leen la portada (index.html) y la franja de los ejemplos (ejemplos/franja.js).
   Cambia aquí un precio o una característica y cambia en los dos.
   ============================================================ */
// Dirección oficial: los ejemplos y sus QR apuntan aquí.
(function () {
var SITIO = "https://solidaaplicaciones.com";
var WHATSAPP = "528443604349";

var SEGMENTS = {
  restaurantes:{
    label:"Restaurantes y cafés", short:"Menú digital con QR",
    intro:"Menú digital con código QR",
    blurb:"Tus mesas con un QR que abre el menú al instante. Cambia precios y platillos cuando quieras, sin reimprimir nada.",
    demoName:"tu menú digital",
    note:"Mantenimiento «Menú al día»: cambios ilimitados de precios y platillos + hosting + soporte. $349/mes o $2,990/año.",
    tiers:[
      {level:"Básico",name:"Menú Esencial",amount:"$1,490",unit:"pago único",lv:1,
       demo:SITIO+"/ejemplos/restaurante/basico",
       feats:["Menú en una página, hasta 30 platillos","Organizado por categorías","Hasta 6 fotos de platillos","Código QR para tus mesas","Botones de WhatsApp y llamar"]},
      {level:"Intermedio",name:"Menú Pro",amount:"$2,490",unit:"pago único",lv:2,reco:true,
       demo:SITIO+"/ejemplos/restaurante/intermedio",
       feats:["Todo lo de Esencial","Platillos y fotos ilimitados","Secciones: entradas, fuertes, bebidas, postres","Destacados y promociones del día","Ubicación con mapa y redes","Diseño a tu marca"]},
      {level:"Premium",name:"Menú Premium",amount:"$3,990",unit:"pago único",lv:3,
       demo:SITIO+"/ejemplos/restaurante/avanzado",
       feats:["Todo lo de Pro","Pedidos desde la mesa con cuenta en vivo","Comanda enviada directo a cocina por WhatsApp","Forma de pago y número de mesa","Menos errores y meseros más eficientes"]}
    ]
  },
  profesionales:{
    label:"Profesionales y consultorios", short:"Tarjeta y sitio profesional",
    intro:"Tarjeta y sitio profesional",
    blurb:"Ideal para psicólogos, dentistas, abogados, veterinarios o agentes. Todo tu contacto y servicios en un enlace que inspira confianza.",
    demoName:"tu perfil profesional",
    note:"Mantenimiento y hosting: $299/mes o $2,490/año. Incluye cambios razonables y soporte por WhatsApp.",
    tiers:[
      {level:"Básico",name:"Tarjeta Digital",amount:"$1,290",unit:"pago único",lv:1,
       demo:SITIO+"/ejemplos/profesional/basico",
       feats:["Una pantalla con tu foto o logo","Tus servicios y especialidad","Botones: WhatsApp, llamar, mapa, redes","Código QR para tu tarjeta física"]},
      {level:"Intermedio",name:"Perfil Profesional",amount:"$2,390",unit:"pago único",lv:2,reco:true,
       demo:SITIO+"/ejemplos/profesional/intermedio",
       feats:["Todo lo de Tarjeta Digital","Secciones: sobre ti, servicios, testimonios","Botón de agendar cita por WhatsApp","Galería y horarios de atención","Diseño a tu marca"]},
      {level:"Premium",name:"Sitio Profesional",amount:"$3,890",unit:"pago único",lv:3,
       demo:SITIO+"/ejemplos/profesional/avanzado",
       feats:["Todo lo de Perfil Profesional","Mini-sitio de varias páginas","Preguntas frecuentes o artículos","Dominio propio incluido (1 año)"]}
    ]
  },
  talleres:{
    label:"Talleres y servicios", short:"Catálogo + cotización",
    intro:"Catálogo de servicios + cotización",
    blurb:"Para talleres, lavanderías, costura, plomería o jardinería. Muestras tus servicios con precios y el cliente cotiza por WhatsApp en un toque.",
    demoName:"tu catálogo de servicios",
    note:"Mantenimiento y hosting: $299/mes o $2,490/año. Incluye actualización de servicios y precios.",
    tiers:[
      {level:"Básico",name:"Catálogo Express",amount:"$1,390",unit:"pago único",lv:1,
       demo:SITIO+"/ejemplos/taller/basico",
       feats:["Lista de servicios con precios","Hasta 8 fotos de tus trabajos","Botón de cotizar por WhatsApp","Ubicación, horario y código QR"]},
      {level:"Intermedio",name:"Catálogo Pro",amount:"$2,390",unit:"pago único",lv:2,reco:true,
       demo:SITIO+"/ejemplos/taller/intermedio",
       feats:["Todo lo de Express","Servicios por categorías","Galería «antes / después»","Promociones y testimonios","Cotización con mensaje prellenado"]},
      {level:"Premium",name:"Servicio Completo",amount:"$3,690",unit:"pago único",lv:3,
       demo:SITIO+"/ejemplos/taller/avanzado",
       feats:["Todo lo de Pro","Agenda de citas o pedidos","Varias sucursales","Dominio propio incluido (1 año)"]}
    ]
  },
  nutriologos:{
    label:"Nutriólogos y coaches", short:"Planes dinámicos",
    intro:"Planes dinámicos para tus pacientes",
    blurb:"Entrega dietas y rutinas que se sienten como una app: mandado con equivalencias, entrenamiento con progresión automática y seguimiento de peso. Tu marca, tu herramienta.",
    demoName:"un plan dinámico de ejemplo",
    note:"La mensualidad mantiene tu herramienta activa, con soporte y respaldos. Es tu presencia digital que trabaja contigo cada semana.",
    tiers:[
      {level:"Básico",name:"Plan Digital",amount:"$2,490",unit:"inicio",plus:"+ $399/mes",lv:1,
       demo:SITIO+"/ejemplos/nutriologo/basico",
       feats:["Plan diario interactivo con tu marca","Comidas con horarios, porciones y registro","Sustituciones rápidas por alimento","Registro de vasos de agua","La entregas por enlace a cada paciente"]},
      {level:"Intermedio",name:"Práctica Pro",amount:"$3,990",unit:"inicio",plus:"+ $599/mes",lv:2,reco:true,
       demo:SITIO+"/ejemplos/nutriologo/intermedio",
       feats:["Todo lo de Plan Digital","Macros del plan: kcal, proteína, carbos y grasas","Mandado semanal con cantidades exactas","Equivalencias por alimento con cantidad ajustada","Preparación semanal (meal prep) paso a paso"]},
      {level:"Premium",name:"Coach Total",amount:"$5,990",unit:"inicio",plus:"+ $899/mes",lv:3,
       demo:SITIO+"/ejemplos/nutriologo/avanzado",
       feats:["Todo lo de Práctica Pro","Cambias un alimento en el mandado y la dieta se ajusta sola","Rutina del día con pesos editables, doble progreso y timer de descanso tipo reloj que sigue contando aunque cambies de app","Ciclo 3+1 automático con aviso de semana de descarga","Presupuesto semanal de antojos con semáforo","Progreso con metas: barras de avance, racha de constancia, ritmo semanal y fecha proyectada para llegar a tu objetivo"]}
    ]
  },
  invitaciones:{
    label:"Invitaciones de evento", short:"Bodas, XV, cumpleaños…",
    intro:"Invitaciones digitales de evento",
    blurb:"Bodas, XV años, bautizos, cumpleaños o eventos de empresa. Cuenta regresiva, ubicación, confirmación y galería que se comparten solas.",
    demoName:"una invitación de ejemplo",
    note:"Enlace activo hasta 1 mes después del evento. ¿Lo quieres de recuerdo? Extensión de 1 año por +$290.",
    tiers:[
      {level:"Básico",name:"Esencial",amount:"$690",unit:"por evento",lv:1,
       demo:SITIO+"/ejemplos/invitacion/basico",
       feats:["Una pantalla con cuenta regresiva","Textos, colores y hasta 3 fotos","Botón de ubicación con mapa","Enlace para compartir + código QR"]},
      {level:"Intermedio",name:"Pro",amount:"$1,290",unit:"por evento",lv:2,reco:true,
       demo:SITIO+"/ejemplos/invitacion/intermedio",
       feats:["Todo lo de Esencial","Confirmación de asistencia por WhatsApp","Galería, varias secciones y música de fondo (versión libre de derechos de autor)","Itinerario, código de vestimenta, mesa de regalos","Animaciones de entrada"]},
      {level:"Premium",name:"Deluxe",amount:"$2,290",unit:"por evento",lv:3,
       demo:SITIO+"/ejemplos/invitacion/avanzado",
       feats:["Diseño 100% a medida y temática única","Formato libro: cambia de página al tocar los lados","Música de fondo al abrirla (versión libre de derechos) y efectos al tocar","QR diseñado para imprimir, con control de acceso: el staff escanea y registra la entrada de cada invitado","Hasta 2 rondas de cambios"]}
    ]
  },
  uniformes:{
    label:"Uniformes y bordados", short:"Configurador de pedidos",
    intro:"Configurador de uniformes con orden automática",
    blurb:"Tus clientes arman su uniforme (prenda, color, tela, bordado, logo y tallas), reciben un estimado al instante y te envían la orden de trabajo lista por WhatsApp. Menos malentendidos, más ventas cerradas.",
    demoName:"el configurador de uniformes",
    note:"Mantenimiento y hosting: $399/mes o $3,490/año. Incluye ajuste de catálogo, prendas y precios.",
    tiers:[
      {level:"Básico",name:"Catálogo Digital",amount:"$1,690",unit:"pago único",lv:1,
       demo:SITIO+"/ejemplos/uniformes/basico",
       feats:["Catálogo de prendas, colores y telas","Técnicas de decorado y precios de referencia","Botón de cotizar por WhatsApp","Código QR para tu negocio"]},
      {level:"Intermedio",name:"Cotizador",amount:"$2,990",unit:"pago único",lv:2,reco:true,
       demo:SITIO+"/ejemplos/uniformes/intermedio",
       feats:["Todo lo de Catálogo","El cliente elige prendas y cantidades","Estimado de precio al instante","Cotización enviada por WhatsApp"]},
      {level:"Premium",name:"Configurador con OT",amount:"$5,900",unit:"pago único",lv:3,
       demo:SITIO+"/ejemplos/uniformes/avanzado",
       feats:["Configura color, tela, bordado, logo y tallas","Vista previa de la prenda con el logo puesto","Orden de trabajo en imagen a tu WhatsApp","Diseño a tu marca"]}
    ]
  },
  barberias:{
    label:"Barberías y salones", short:"Carta + reservas en línea",
    intro:"Carta de servicios y reservas en línea",
    blurb:"Para barberías, salones de belleza y estudios de uñas. Tu carta con precios en un QR, promociones y equipo, hasta agenda en línea con reservas directo a tu WhatsApp.",
    demoName:"la página de una barbería",
    note:"Mantenimiento y hosting: $299/mes o $2,490/año. Incluye cambios de precios, promociones y equipo.",
    tiers:[
      {level:"Básico",name:"Carta de Servicios",amount:"$1,390",unit:"pago único",lv:1,
       demo:SITIO+"/ejemplos/barberia/basico",
       feats:["Carta de servicios con precios por categorías","Barbería, salón y extras en un solo enlace","Botones de WhatsApp, llamar y mapa","Código QR para tu mostrador y tarjetas"]},
      {level:"Intermedio",name:"Estudio Pro",amount:"$2,590",unit:"pago único",lv:2,reco:true,
       demo:SITIO+"/ejemplos/barberia/intermedio",
       feats:["Todo lo de Carta de Servicios","Estatus abierto / cerrado en automático","Promociones de la semana destacadas","Tu equipo con foto y especialidad","Galería de trabajos y testimonios","Diseño a tu marca"]},
      {level:"Premium",name:"Reserva Total",amount:"$4,290",unit:"pago único",lv:3,
       demo:SITIO+"/ejemplos/barberia/avanzado",
       feats:["Todo lo de Estudio Pro","Agenda en línea paso a paso","El cliente elige servicio, barbero o estilista, día y hora","Reserva formateada directo a tu WhatsApp","Horarios ocupados y días de descanso configurables","Dominio propio incluido (1 año)"]}
    ]
  },
  unas:{
    label:"Uñas y pestañas", short:"Diseños + citas en línea", nuevo:true,
    intro:"Tu portafolio de diseños con agenda",
    blurb:"Para manicuristas, lashistas y estudios de belleza. Tus clientas ven tus diseños con foto, eligen el suyo y apartan su hora sin escribirte veinte mensajes.",
    demoName:"tu estudio",
    note:"Mantenimiento y hosting: $299/mes o $2,490/año. Agenda Total: $399/mes, porque guarda tus citas.",
    tiers:[
      {level:"Básico",name:"Catálogo de Diseños",amount:"$1,390",unit:"pago único",lv:1,
       demo:SITIO+"/ejemplos/unas/basico",
       feats:["Galería de hasta 20 diseños con foto","Servicios con precio y duración","«Agendar» abre tu WhatsApp","Ubicación, horario y código QR","Botón para calificarte en Google"]},
      {level:"Intermedio",name:"Agenda Pro",amount:"$2,590",unit:"pago único",lv:2,reco:true,
       demo:SITIO+"/ejemplos/unas/intermedio",
       feats:["Todo lo de Catálogo","Diseños sin límite, con filtros","La clienta elige diseño, largo, día y hora","Te manda su cita como ticket en imagen por WhatsApp","Tu equipo y los cuidados antes de la cita"]},
      {level:"Premium",name:"Agenda Total",amount:"$4,290",unit:"pago único",lv:3,
       demo:SITIO+"/ejemplos/unas/avanzado",
       agenda:"https://agenda.solidaaplicaciones.com/ejemplo/",   // la app de la dueña, aparte de su página
       feats:["Todo lo de Agenda Pro","Las horas ocupadas se bloquean solas","Anticipo para apartar, directo a tu cuenta","Su agenda como app en su celular, aparte de su página, con recordatorio de un toque","Dominio propio incluido (1 año)"]}
    ]
  }
};
// Todo cuelga de window.SOLIDA: los ejemplos tienen sus propias variables y no deben chocar.
window.SOLIDA = { SITIO: SITIO, WHATSAPP: WHATSAPP, SEGMENTS: SEGMENTS };
})();
