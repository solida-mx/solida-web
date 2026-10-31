> **Catálogo de hoy (31 oct 2026):** sólo Uñas y pestañas (con Agenda Total), y las apps Mi Plan y GDP. Los demás
> ejemplos, Invitaciones y SGN están guardados en `archivo/` (ver `archivo/LEEME.md`); sus direcciones llevan a la portada.

# Cómo está ordenado este repositorio

Se publica en **solidaaplicaciones.com** (Cloudflare Worker `solida-web`). Al unir un cambio a `main`, Cloudflare lo publica solo.

| Carpeta | Qué es | ¿Público? |
|---|---|---|
| `Solida-Web/index.html` | La portada | Sí |
| `Solida-Web/datos/paquetes.js` | **Paquetes y precios de las páginas.** Lo leen la portada y la franja de los ejemplos: un precio se cambia aquí y en ningún otro lado | Sí |
| `Solida-Web/ejemplos/<giro>/<nivel>/` | Los ejemplos para posibles clientes (7 giros × 3 niveles) | Sí, sin indexar en Google |
| `Solida-Web/ejemplos/franja.js` | La franja «Ejemplo de Solida». La pone `worker.js` en todo `/ejemplos/`; las páginas no la traen escrita | Sí |
| `Solida-Web/soporte/` | Herramientas para clientes: pedir cambios, mandar su información, pases con QR | Sí |
| `Solida-Web/privacidad.html` | Aviso de privacidad de Solida | Sí |
| `worker.js` | Manda `www` a la dirección oficial, las direcciones viejas de los ejemplos a `/ejemplos/` y pone la franja | — |
| `legal/` | Borradores legales en revisión | **No** |
| `interno/` | QR para imprimir y notas de trabajo | **No** |

## Plantillas con los datos aparte

Un giro ya convertido tiene **un archivo de datos** y las páginas sólo lo leen:

- `ejemplos/restaurante/datos.js`: nombre, WhatsApp, dirección, horarios y menú. Es lo único que cambia de un restaurante a otro.
- `ejemplos/restaurante/plantilla.js`: pone esos datos en la página (y escapa todo lo que viene de ahí).
- `ejemplos/restaurante/{basico,intermedio,avanzado}/`: el diseño de cada nivel.

Para la página de un cliente se copia la plantilla y se escribe su `datos.js` con `ejemplo: false`. Las páginas de clientes **no viven
aquí**: van en su propio espacio y se dan de alta en el panel (fase 1, paso 2).

**Fotos y reseñas (restaurante):** `fotoPortada`, `galeria`, la `foto` de cada platillo y `resenas` (el enlace «Pedir reseñas» de
Google). Lo que esté vacío no sale: sin fotos la página se ve con iconos, como siempre.

**Uñas y pestañas** (`ejemplos/unas/`) ya nace como plantilla: `datos.js` + `estilo.css` + `plantilla.js`, y cada nivel es una página de
diez líneas. La agenda (intermedio y avanzado) arma la cita como **ticket en imagen** con el logo del negocio (`logo` en sus datos, o sus
iniciales en un sello) para mandarla por WhatsApp. En el ejemplo, el avanzado guarda las citas en el propio teléfono; para un cliente real
(Agenda Total, `citasApi` en sus datos) se guardan en el servicio de citas (`servicios/citas/`).

**Dos puertas por negocio.** La página la ven sus clientas (su dominio o `/ejemplos/...`). La **agenda de la dueña** vive aparte, en
`agenda.solidaaplicaciones.com/<negocio>/`: una app instalable que sirve el mismo servicio de citas (archivos en `servicios/citas/agenda/`).
`/citas/` de la página sólo redirige ahí. La de muestra para el catálogo es `agenda.solidaaplicaciones.com/ejemplo/` (citas inventadas,
sin clave); en la portada, el paquete que la incluye enseña «Su página» y «Su agenda».

**Mis tiempos.** En su agenda, la dueña pone el horario de cada persona y aparta su tiempo (una vez, que se repite o días
enteros). El servidor de citas no deja apartar fuera de eso, y la página de uñas pide el horario al servidor (`horario` en
`/ocupado`): si la dueña abre un domingo, la página lo ofrece sola. Sin horario guardado, la página usa el de su `datos.js`.

**Hoy y Semana.** La agenda abre en «Hoy»: el día hora por hora con sus citas, sus tiempos y los huecos libres de cada quien
(tocar uno aparta ahí una cita por teléfono, ya confirmada). «Semana» resume los próximos 7 días. «Para mañana» lista a quién
falta recordarle; mandar el recordatorio queda marcado en el servidor (`recordada`), así se ve desde cualquier teléfono.

**Su calendario.** En «Mis tiempos» la dueña pega la dirección secreta en formato iCal de su Google Calendar (también iCloud
u Outlook). Se guarda cifrada (AES-GCM con una llave sacada de `SECRETO`); cada 15 minutos el servicio la lee (`src/ical.js`)
y guarda sólo de qué hora a qué hora está ocupada en los próximos 90 días (`cal_ocupado`), nunca títulos ni lugares.

**Avisos.** Cada cita que llega de la página avisa a la dueña al celular (`src/avisos.js`): Web Push firmado con VAPID
(secreto `VAPID_PRIVADA`), como una señal sin datos; el teléfono pide el detalle a `/avisos/pendientes` con su propia dirección
de avisos, y al tocarlo se abre esa cita (`?cita=FOLIO`). Un solo aviso: el correo (Resend, secreto `RESEND_API_KEY`, sale de
`avisos@correo.solidaaplicaciones.com`) es sólo respaldo y sale únicamente si ningún teléfono recibió el aviso. A partir de las
8 pm (hora del negocio) llega «Mañana tienes N citas». Si en un teléfono los avisos están apagados, la agenda lo dice en Hoy.

Pendientes de convertir: profesional, taller, nutriólogo, invitación, uniformes y barbería.

## Direcciones viejas

`/restaurante/basico` (y las demás) mandan solas a `https://solidaaplicaciones.com/ejemplos/restaurante/basico`, también desde
`solida-web.j23salva.workers.dev`, que es la que está impresa en los QR viejos. **No borrar esa redirección** mientras haya QR impresos.
Los QR nuevos se hacen siempre con `solidaaplicaciones.com`.

**La app de la clienta.** La página del negocio (con Agenda Total) se instala como app: `app-clienta.js` agrega «Mis citas»
(próxima cita, «Repetir mi última cita», «Cambiar o cancelar», anteriores), la guía para instalarla (botón en Android, 3 pasos
en iPhone, «copiar el enlace» desde Instagram/Facebook) y los avisos a su teléfono (confirmada, cancelada, recordatorio 1 h
o 2 h antes o la noche anterior, «te proponen otra hora»). Sin cuenta: el teléfono guarda un número al azar (`X-Dispositivo`).
Cada sitio de cliente lleva su `manifest.webmanifest` y su `sw.js` (copia de `ejemplos/unas/sw-clienta.js`).

**Se me atravesó algo.** La dueña cierra un tiempo y la agenda propone a cada clienta afectada la primera hora libre (sin
encimarlas) y se la aparta (estado `propuesta`). Le avisa por su app, por correo si lo dejó, o la dueña le manda el WhatsApp
con su enlace. La clienta contesta en `agenda.solidaaplicaciones.com/<negocio>/cita/<folio>?t=…`: me queda, otra hora o cancelar.

**Entrar y seguridad de la dueña.** Entra con su clave (los guiones se ponen solos) y la sesión dura **7 días**; vive en el
servidor (tabla `sesiones`, token `s.<id>.<secreto>`, sólo se guarda el hash). Después de entrar se le ofrece **Face ID / huella**
(WebAuthn, `src/webauthn.js`, sin librerías; tabla `llaves` con la llave pública, sólo en `agenda.solidaaplicaciones.com`).
Opcional: «Pedir Face ID al abrir» (candado al abrir y al volver tras 5 minutos; se guarda sólo en ese teléfono). En
«Seguridad y dispositivos» ve dónde está abierta su agenda y qué teléfonos tienen Face ID, y quita los que no quiera o
cierra todos los demás. Si ya no puede entrar en ninguno, Solida le da una clave nueva desde el panel: eso cierra todas las
sesiones y borra todos los Face ID. Las pruebas usan un autenticador simulado de Chromium en `http://localhost`
(`WEBAUTHN_PRUEBA=1`, sólo en `.dev.vars`).

**En la compu** (pantalla de 1024 px o más) la agenda cambia de acomodo, con los mismos datos: menú a la izquierda,
«Hoy» con una columna por persona (media hora = una fila), «Semana» con los 7 días en columnas, y cada hoja (una cita,
apartar, avisos…) se abre como panel a la derecha sin tapar la agenda. En el celular todo sigue igual.

**Apartar en el local.** Al apartar una cita en la agenda se abre su detalle con «Mándale su cita»: por WhatsApp (abre el
WhatsApp de la dueña con el mensaje listo, sin costo), por correo (Resend, sólo si la clienta da su correo) o con un QR en
pantalla para que lo escanee ahí. El enlace es la página del negocio con `?cita=<folio>&t=<token>`; `app-clienta.js` lo
manda a `POST /mis-citas/<folio>/guardar` y la cita queda en SU celular («Mis citas», avisos, instalar la app).

**La cartera de servicios** (`negocios.servicios`, JSON): servicios (nombre, grupo, duración, precio, «desde», quién lo
hace), diseños o variantes (van con un servicio y suman precio y tiempo), largos (suman en los grupos que se elijan) y anticipo.
- **Al apartar en la agenda** se elige el servicio de una lista; salen sus diseños y largos, el precio se suma solo, se pone
  quién lo hace si es una sola persona y se puede marcar «ya pagó su anticipo». Si ella escribe otro precio, se respeta.
  Las citas quedan con los mismos nombres que las de la página (servicio, diseño, largo).
- **La dueña la edita** en «Mis servicios» (`PUT /servicios`); lo que guarda vale desde ese momento. Las citas que ya
  estaban no cambian.
- **Su página toma los precios de ahí**: `plantilla.js` pide `/perfil`, guarda la cartera en el teléfono y la aplica antes de
  pintar (precio, duración, «desde», extras de diseños y largos, anticipo). Fotos y descripciones siguen en `datos.js`.
- **Para cargarla** (Solida): la plantilla `servicios/citas/plantillas/cartera-de-servicios.xlsx` se le manda al cliente y se lee
  con `python3 scripts/cartera.py leer archivo.xlsx <negocio>`; o desde su página con
  `node scripts/cartera-de-pagina.mjs <datos.js> <negocio>`. Los dos dejan un `.sql` para `wrangler d1 execute --remote --file`.
- Sin cartera guardada, la lista se arma sola con lo que ha llegado de su página.

**Tu código QR** (sección de la agenda): cartel para imprimir o guardar en PDF (carta, 2 por hoja o 8 tarjetitas; negro
y dorado o blanco y negro; con una línea propia abajo), en pantalla, o imagen de 1080×1350 para redes. Lleva a la página con
`?de=qr`; `plantilla.js` manda `via: 'qr'` al apartar y `GET /qr` cuenta las del mes, cuántas son nuevas y cuántas
clientas tienen avisos. El QR lo dibuja `agenda/_app/qr.js` (qrcode-generator, MIT, sin cambios).

**Página de prueba:** `/prueba-agenda/` está conectada a la agenda `prueba-solida` (no indexada). Se borra al terminar las pruebas.

