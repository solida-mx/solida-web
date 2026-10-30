-- Lo que la agenda de la dueña necesita saber del negocio, ahora que vive aparte de su página:
-- quién atiende (para poner nombres en las citas) y la dirección de su página (para el botón «Ver mi página»).
ALTER TABLE negocios ADD COLUMN equipo TEXT NOT NULL DEFAULT '[]';   -- [{"id":"mia","nombre":"Mía"}, …]
ALTER TABLE negocios ADD COLUMN pagina TEXT NOT NULL DEFAULT '';
