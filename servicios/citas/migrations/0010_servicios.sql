-- La lista de servicios del negocio (nombre, duración, precio y grupo), en JSON. Con ella la dueña aparta
-- eligiendo de una lista en vez de escribir. Vacía = se arma sola con los servicios que ya llegaron de su página.
ALTER TABLE negocios ADD COLUMN servicios TEXT NOT NULL DEFAULT '';
