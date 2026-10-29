/* ============================================================
   DATOS DEL NEGOCIO — lo único que cambia de un restaurante a otro.
   Las tres versiones (basico, intermedio, avanzado y su página de mesas) leen de aquí;
   el diseño no se toca. Para un cliente nuevo: copia la plantilla y escribe aquí sus datos.
   Este es el ejemplo ficticio «Brasa & Maíz».
   ============================================================ */
window.NEGOCIO = {
  // true sólo en el ejemplo de Solida: enseña el generador de QR de mesas dentro del menú. Un cliente real va en false.
  ejemplo: true,

  nombre: "Brasa & Maíz",
  icono: "🔥",
  giro: "Cocina de humo · Saltillo",          // la línea pequeña arriba del nombre
  eslogan: "Del comal a tu mesa",
  distintivos: ["🌽 Maíz nixtamalizado", "🔥 Leña de mezquite", "⭐ 4.9"],

  // Fotos: la ruta de cada foto (en la carpeta del cliente). Vacías = la página se ve como hasta hoy, con iconos.
  fotoPortada: "",                      // la grande de arriba
  galeria: [],                          // fotos del local: ["fotos/barra.webp", "fotos/terraza.webp"]

  // Enlace «Pedir reseñas» del Perfil de Negocio en Google (g.page/r/…/review). Vacío = no sale el botón.
  resenas: "",

  // WhatsApp a donde llegan reservas y pedidos: 52 + 10 dígitos, sin espacios.
  whatsapp: "528443604349",
  whatsappVisible: "844 360 4349",

  direccion: "Blvd. Venustiano Carranza 2200",
  colonia: "Col. República, Saltillo, Coah.",
  direccionCorta: "Blvd. V. Carranza 2200, Saltillo",
  mapa: "https://maps.google.com/?q=Blvd.+Venustiano+Carranza+2200+Saltillo",

  // [día, horario como se lee, abre (hora 0-24), cierra (hora 0-24)]. null = cerrado.
  horarios: [
    ["Lun", "Cerrado", null, null],
    ["Mar", "1:00 – 11:00 pm", 13, 23],
    ["Mié", "1:00 – 11:00 pm", 13, 23],
    ["Jue", "1:00 – 11:00 pm", 13, 23],
    ["Vie", "1:00 pm – 12:00 am", 13, 24],
    ["Sáb", "12:00 pm – 12:00 am", 12, 24],
    ["Dom", "12:00 – 6:00 pm", 12, 18]
  ],
  horarioCorto: "Mar a Dom · 1:00 – 11:00 pm",

  // Sólo la versión avanzada: minutos que dura la sesión de pedido de una mesa.
  minutosParaOrdenar: 20,

  // El menú. precio en pesos (número). icono = el emoji que sale si no hay foto. etiqueta y destacado son opcionales.
  // id: corto, sin espacios y sin repetir (la versión avanzada lo usa para la cuenta).
  menu: [
    { categoria: "Para empezar", icono: "🫓", platillos: [
      { id: "guac", nombre: "Guacamole al molcajete", desc: "Aguacate, chile de árbol tatemado, cilantro y totopos de maíz azul.", precio: 135, icono: "🥑", foto: "", etiqueta: "Favorito", destacado: true },
      { id: "esq", nombre: "Esquites de la casa", desc: "Elote, epazote, mayonesa de chipotle, queso cotija y limón.", precio: 95, icono: "🌽", foto: "" },
      { id: "tuet", nombre: "Tuétano a la leña", desc: "Hueso asado al mezquite, salsa verde cruda y tortillas hechas a mano.", precio: 165, icono: "🍖", foto: "", etiqueta: "De temporada" }
    ] },
    { categoria: "Del comal", icono: "🔥", platillos: [
      { id: "arra", nombre: "Tacos de arrachera", desc: "Res marinada al carbón, cebollita de cambray y guacamole. Orden de 3.", precio: 185, icono: "🌮", foto: "", etiqueta: "Favorito", destacado: true },
      { id: "cost", nombre: "Costra de chorizo", desc: "Queso dorado, chorizo artesanal y salsa martajada.", precio: 145, icono: "🧀", foto: "" },
      { id: "grin", nombre: "Gringa al pastor", desc: "Pastor de trompo, piña asada, queso y salsa de morita.", precio: 130, icono: "🌮", foto: "" }
    ] },
    { categoria: "Principales", icono: "🍽️", platillos: [
      { id: "ribe", nombre: "Rib eye al mezquite", desc: "400 g madurado, papa rústica y esquites cremosos.", precio: 395, icono: "🥩", foto: "", etiqueta: "La estrella", destacado: true },
      { id: "poll", nombre: "Pollo al carbón", desc: "Medio pollo marinado en achiote, arroz rojo y frijoles charros.", precio: 220, icono: "🍗", foto: "" },
      { id: "truc", nombre: "Trucha a la talla", desc: "Filete al comal con adobo de guajillo y verduras asadas.", precio: 265, icono: "🐟", foto: "" }
    ] },
    { categoria: "Bebidas", icono: "🥤", platillos: [
      { id: "horc", nombre: "Agua de horchata", desc: "Arroz, canela y un toque de vainilla. Jarra o vaso.", precio: 45, icono: "🥛", foto: "" },
      { id: "mich", nombre: "Michelada de la casa", desc: "Clamato, especias, chamoy y escarchado de tajín.", precio: 95, icono: "🍺", foto: "" },
      { id: "cafe", nombre: "Café de olla", desc: "Piloncillo, canela y café de Veracruz.", precio: 50, icono: "☕", foto: "" }
    ] },
    { categoria: "Postres", icono: "🍮", platillos: [
      { id: "flan", nombre: "Flan de cajeta", desc: "Cremoso, con cajeta de Celaya y nuez garapiñada.", precio: 85, icono: "🍮", foto: "", etiqueta: "Favorito", destacado: true },
      { id: "chur", nombre: "Churros rellenos", desc: "Con cajeta o chocolate, azúcar con canela.", precio: 75, icono: "🥖", foto: "" }
    ] }
  ]
};
