-- El ícono de la app de la dueña con la marca de su negocio (PNG de 180, 192 y 512 px en base64, en JSON).
-- Vacío: el ícono genérico de Tu agenda. Lo genera scripts/icono-duena.mjs.
ALTER TABLE negocios ADD COLUMN icono TEXT NOT NULL DEFAULT '';
