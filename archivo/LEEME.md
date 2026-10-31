# Archivo (guardado, no se publica)

Aquí está lo que **no** se vende por ahora. Se guardó completo el 31 de octubre de 2026 para enfocarnos en los
productos terminados (Uñas y pestañas con su Agenda Total, Mi Plan y GDP). Nada de esta carpeta se publica:
el sitio sólo sube `Solida-Web/`.

| Qué | Dónde estaba | Dónde está |
|---|---|---|
| Ejemplos de restaurante, profesional, taller, nutriólogo, invitación, uniformes y barbería | `Solida-Web/ejemplos/<giro>/` | `archivo/Solida-Web/ejemplos/<giro>/` |
| Generador de pases de invitaciones | `Solida-Web/soporte/pases/` | `archivo/Solida-Web/soporte/pases/` |
| Ícono de SGN | `Solida-Web/iconos/apps/sgn.png` | `archivo/Solida-Web/iconos/apps/` |
| Paquetes y precios de todos los giros | `Solida-Web/datos/paquetes.js` | `archivo/Solida-Web/datos/paquetes-completo.js` |
| Formulario «Quiero empezar» con todos los giros | `Solida-Web/soporte/levantamiento/` | `archivo/Solida-Web/soporte/levantamiento-completo.html` |
| Portada con todos los giros, Invitaciones y SGN | `Solida-Web/index.html` | `archivo/Solida-Web/index-completo.html` |
| Portada del centro de soporte con «Pases» | `Solida-Web/soporte/index.html` | `archivo/Solida-Web/soporte/index-completo.html` |
| Los QR impresos de esos ejemplos | `interno/qr-imprimir/` | `archivo/interno/qr-imprimir/` |

Las direcciones de esos ejemplos (y sus QR ya impresos) llevan a la portada: lo hace `worker.js`.

**Para regresar uno** (por ejemplo, barbería): se mueve su carpeta de vuelta a `Solida-Web/ejemplos/`, se copia su
bloque de `paquetes-completo.js` a `Solida-Web/datos/paquetes.js` y su bloque de `levantamiento-completo.html` al
formulario, y se quita de la lista de guardados en `worker.js`.
