/* ============================================================
   PAQUETES Y PRECIOS DE SOLIDA — un solo lugar.
   Lo lee la portada (index.html). Las páginas de muestra las arma Solida Citas (citas.solidaaplicaciones.com/ejemplo/).
   ============================================================ */
// Dirección oficial: los ejemplos y sus QR apuntan aquí.
(function () {
var SITIO = "https://solidaaplicaciones.com";
var WHATSAPP = "528443604349";

var SEGMENTS = {
  // Sólo lo que hoy se vende. Los demás giros están guardados en archivo/Solida-Web/datos/paquetes-completo.js
  unas:{
    label:"Uñas y pestañas", short:"Diseños + citas en línea", nuevo:true,
    intro:"Tu portafolio de diseños con agenda",
    blurb:"Para manicuristas, lashistas y estudios de belleza. Tus clientas ven tus diseños con foto, eligen el suyo y apartan su hora sin escribirte veinte mensajes.",
    demoName:"tu estudio",
    note:"Mantenimiento y hosting: $299/mes o $2,490/año. Agenda Total: $399/mes, porque guarda tus citas.",
    tiers:[
      {level:"Básico",name:"Catálogo de Diseños",amount:"$1,390",unit:"pago único",lv:1,
       demo:"https://citas.solidaaplicaciones.com/ejemplo/",
       feats:["Galería de hasta 20 diseños con foto","Servicios con precio y duración","«Agendar» abre tu WhatsApp","Ubicación, horario y código QR","Botón para calificarte en Google"]},
      {level:"Intermedio",name:"Agenda Pro",amount:"$2,590",unit:"pago único",lv:2,reco:true,
       demo:"https://citas.solidaaplicaciones.com/ejemplo/",
       feats:["Todo lo de Catálogo","Diseños sin límite, con filtros","La clienta elige diseño, largo, día y hora","Te manda su cita como ticket en imagen por WhatsApp","Tu equipo y los cuidados antes de la cita"]},
      {level:"Premium",name:"Agenda Total",amount:"$4,290",unit:"pago único",lv:3,
       demo:"https://citas.solidaaplicaciones.com/ejemplo/",
       agenda:"https://agenda.solidaaplicaciones.com/ejemplo/",   // la app de la dueña, aparte de su página
       feats:["Todo lo de Agenda Pro","Las horas ocupadas se bloquean solas","Anticipo para apartar, directo a tu cuenta","Su agenda como app en su celular, aparte de su página, con recordatorio de un toque","Dominio propio incluido (1 año)"]}
    ]
  }
};
// Todo cuelga de window.SOLIDA: los ejemplos tienen sus propias variables y no deben chocar.
window.SOLIDA = { SITIO: SITIO, WHATSAPP: WHATSAPP, SEGMENTS: SEGMENTS };
})();
