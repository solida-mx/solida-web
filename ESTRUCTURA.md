# Cómo está ordenado este repositorio

Se publica en **solidaaplicaciones.com** (Cloudflare Worker `solida-web`). Al unir un cambio a `main`, Cloudflare lo publica solo.

> **Solida Citas** (el servidor, la agenda de la dueña y la página de las clientas) vive en su propio repositorio,
> `solida-mx/solida-citas`; ahí está cómo funciona. Las páginas de muestra las arma ese servidor:
> `citas.solidaaplicaciones.com/ejemplo/` (uñas), `/ejemplo-barberia/` y `/ejemplo-estetica/`, y la agenda de muestra es
> `agenda.solidaaplicaciones.com/ejemplo/`. Aquí ya no hay copias de esas páginas.
>
> **Catálogo de hoy (1 nov 2026):** sólo Uñas y pestañas (con Agenda Total), y las apps Mi Plan y GDP. Los demás
> ejemplos, Invitaciones y SGN están guardados en `archivo/` (ver `archivo/LEEME.md`); sus direcciones llevan a la portada.

| Carpeta | Qué es | ¿Público? |
|---|---|---|
| `Solida-Web/index.html` | La portada | Sí |
| `Solida-Web/datos/paquetes.js` | **Paquetes y precios.** Lo lee la portada: un precio se cambia aquí y en ningún otro lado | Sí |
| `Solida-Web/soporte/` | Herramientas para clientes: pedir cambios, mandar su información | Sí |
| `Solida-Web/privacidad.html` | Aviso de privacidad de Solida | Sí |
| `worker.js` | Manda `www` a la dirección oficial y las direcciones viejas a su lugar nuevo | — |
| `archivo/` | Lo que ya no se ofrece, guardado por si algo sirve después | **No** |
| `legal/` | Borradores legales en revisión | **No** |
| `interno/` | QR para imprimir y notas de trabajo | **No** |

## Direcciones viejas

`worker.js` las manda solas, también desde `solida-web.j23salva.workers.dev` (la que está impresa en QR viejos).
**No borrar esas redirecciones** mientras haya QR impresos. Los QR nuevos se hacen siempre con `solidaaplicaciones.com`.

| Dirección vieja | A dónde lleva |
|---|---|
| `/ejemplos/unas/…` (los tres niveles) | `citas.solidaaplicaciones.com/ejemplo/` |
| `/barberia/…`, `/ejemplos/barberia/…` | `citas.solidaaplicaciones.com/ejemplo-barberia/` |
| `/restaurante/…` y los demás giros guardados, `/ejemplos/…`, `/prueba-agenda/`, `/soporte/pases` | la portada |
