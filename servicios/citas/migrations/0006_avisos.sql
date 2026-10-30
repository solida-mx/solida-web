-- Avisos a la dueña: los teléfonos que pidieron avisos y lo que se les avisó.
CREATE TABLE suscripciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  endpoint    TEXT NOT NULL UNIQUE,      -- la dirección del servicio de avisos de ese teléfono
  visto       INTEGER NOT NULL DEFAULT 0,  -- el último aviso que ya enseñó
  fallos      INTEGER NOT NULL DEFAULT 0,
  creado      INTEGER NOT NULL
);
CREATE INDEX suscripciones_neg ON suscripciones(negocio_id);
CREATE TABLE avisos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id  TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  cuerpo      TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  creado      INTEGER NOT NULL
);
CREATE INDEX avisos_neg ON avisos(negocio_id, id);
-- Por correo: a dónde y si lo quiere. resumen = el último día que se mandó el «mañana tienes N citas».
ALTER TABLE negocios ADD COLUMN correo TEXT NOT NULL DEFAULT '';
ALTER TABLE negocios ADD COLUMN aviso_correo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE negocios ADD COLUMN resumen TEXT NOT NULL DEFAULT '';
