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

Pendientes de convertir: profesional, taller, nutriólogo, invitación, uniformes y barbería.

## Direcciones viejas

`/restaurante/basico` (y las demás) mandan solas a `https://solidaaplicaciones.com/ejemplos/restaurante/basico`, también desde
`solida-web.j23salva.workers.dev`, que es la que está impresa en los QR viejos. **No borrar esa redirección** mientras haya QR impresos.
Los QR nuevos se hacen siempre con `solidaaplicaciones.com`.
