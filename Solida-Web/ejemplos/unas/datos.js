/* ============================================================
   DATOS DEL NEGOCIO — lo único que cambia de un estudio de uñas y pestañas a otro.
   Las tres versiones (basico, intermedio, avanzado) leen de aquí; el diseño no se toca.
   Fotos: pon la ruta de cada foto en «foto». Si está vacía, la página enseña un fondo
   elegante con el nombre, así nunca se ve un hueco.
   Este es el ejemplo ficticio «Atelier Mía».
   ============================================================ */
window.NEGOCIO = {
  ejemplo: true,                       // sólo en el ejemplo de Solida; un cliente real va en false
  nombre: "Atelier Mía",
  giro: "Uñas · Pestañas · Cejas",
  eslogan: "El detalle que te hace sentir impecable",
  frase: "Diseños a mano, productos de primera y una cita que se respeta.",
  fotoPortada: "",
  logo: "",                            // ruta del logo (png o svg). Vacío: se usan sus iniciales en un sello dorado

  whatsapp: "528443604349",            // 52 + 10 dígitos
  whatsappVisible: "844 360 4349",
  direccion: "Calzada Antonio Narro 1500, local 4",
  colonia: "Col. Saltillo 400, Saltillo, Coah.",
  mapa: "https://maps.google.com/?q=Calzada+Antonio+Narro+1500+Saltillo",
  instagram: "",
  resenas: "",                         // enlace «Pedir reseñas» del Perfil de Negocio en Google (g.page/r/…/review)

  // Horario por día: [día, abre (hora 0-24), cierra]. null = cerrado. Las citas se ofrecen dentro de este horario.
  horarios: [["Lun", 10, 19], ["Mar", 10, 19], ["Mié", 10, 19], ["Jue", 10, 20], ["Vie", 10, 20], ["Sáb", 9, 15], ["Dom", null, null]],
  intervaloMin: 30,                    // cada cuánto se ofrecen horas

  equipo: [
    { id: "mia", nombre: "Mía", rol: "Nail artist · fundadora", foto: "" },
    { id: "fer", nombre: "Fernanda", rol: "Lash artist", foto: "" }
  ],

  // Servicios: duración en minutos, precio en pesos. «desde» = el precio empieza ahí.
  servicios: [
    { id: "gelish", categoria: "Uñas", nombre: "Gelish en manos", desc: "Limado, cutícula y gelish de larga duración. Incluye retiro.", min: 60, precio: 280 },
    { id: "acrilico", categoria: "Uñas", nombre: "Acrílico esculpido", desc: "Forma y largo a tu elección, con diseño sencillo.", min: 120, precio: 450, desde: true },
    { id: "pies", categoria: "Uñas", nombre: "Pedicure spa con gelish", desc: "Exfoliación, hidratación y gelish.", min: 75, precio: 380 },
    { id: "clasicas", categoria: "Pestañas", nombre: "Pestañas clásicas", desc: "Pelo a pelo, efecto natural.", min: 120, precio: 650 },
    { id: "volumen", categoria: "Pestañas", nombre: "Volumen ruso", desc: "Abanicos hechos a mano para una mirada intensa.", min: 150, precio: 850 },
    { id: "lifting", categoria: "Pestañas", nombre: "Lifting de pestañas", desc: "Curvatura natural que dura de 6 a 8 semanas.", min: 60, precio: 400 },
    { id: "cejas", categoria: "Cejas", nombre: "Diseño de cejas", desc: "Visagismo, depilación y tinte.", min: 45, precio: 250 }
  ],

  // Diseños de la galería. servicio = el id del servicio que se agenda. extra = lo que se suma al servicio.
  disenos: [
    { id: "french", nombre: "French clásico", tecnica: "Gelish", servicio: "gelish", extra: 40, dura: "3 semanas", foto: "" },
    { id: "perla", nombre: "Chrome perla", tecnica: "Gelish", servicio: "gelish", extra: 80, dura: "3 semanas", foto: "" },
    { id: "nude", nombre: "Nude satinado", tecnica: "Gelish", servicio: "gelish", extra: 0, dura: "3 semanas", foto: "" },
    { id: "almendra", nombre: "Almendra ombré", tecnica: "Acrílico", servicio: "acrilico", extra: 120, dura: "4 semanas", foto: "" },
    { id: "minimal", nombre: "Línea dorada", tecnica: "Acrílico", servicio: "acrilico", extra: 90, dura: "4 semanas", foto: "" },
    { id: "noche", nombre: "Negro y oro", tecnica: "Acrílico", servicio: "acrilico", extra: 150, dura: "4 semanas", foto: "" },
    { id: "natural", nombre: "Natural de día", tecnica: "Pestañas", servicio: "clasicas", extra: 0, dura: "3 semanas", foto: "" },
    { id: "gala", nombre: "Mirada de gala", tecnica: "Pestañas", servicio: "volumen", extra: 0, dura: "3 semanas", foto: "" }
  ],
  largos: [["Corto", 0], ["Medio", 0], ["Largo", 50]],   // sólo para uñas

  cuidados: [
    "Llega sin esmalte y con las manos limpias.",
    "Para pestañas: sin maquillaje en los ojos y sin rizador ese día.",
    "Las primeras 24 h evita agua muy caliente, vapor y sauna."
  ],

  // Sólo Agenda Total (avanzado)
  // Dirección del servicio de citas para este negocio: "https://citas.solidaaplicaciones.com/api/<id>". Vacía en el ejemplo.
  citasApi: "",
  anticipo: 100,                       // pesos para apartar
  enlacePago: "",                      // el enlace de cobro DEL NEGOCIO (Mercado Pago, Stripe…); el dinero va a su cuenta
  // En el ejemplo, algunas horas salen ocupadas para que se vea cómo funciona. Un cliente real no lo usa.
  ocupadasEjemplo: ["10:00", "12:30", "16:00"]
};
