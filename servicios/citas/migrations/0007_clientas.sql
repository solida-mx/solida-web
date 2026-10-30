-- La app de la clienta: su teléfono (sin cuenta), sus avisos y las propuestas de hora nueva.
-- disp = huella (SHA-256) de un número al azar que sólo guarda el teléfono de la clienta: con él ve SUS citas, nada más.
-- La tabla de citas se vuelve a armar (SQLite no deja cambiar su regla de estados) para aceptar el estado «propuesta»
-- y las columnas nuevas. Se copian TODAS las citas tal cual: mismo id, mismo folio, mismos datos.
CREATE TABLE citas_nueva (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  folio       TEXT NOT NULL UNIQUE,
  fecha       TEXT NOT NULL,
  inicio_min  INTEGER NOT NULL,
  fin_min     INTEGER NOT NULL,
  persona     TEXT NOT NULL DEFAULT '',
  servicio    TEXT NOT NULL,
  diseno      TEXT NOT NULL DEFAULT '',
  detalle     TEXT NOT NULL DEFAULT '',
  precio      INTEGER NOT NULL DEFAULT 0,
  anticipo    INTEGER NOT NULL DEFAULT 0,
  nombre      TEXT NOT NULL,
  tel         TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'apartada' CHECK (estado IN ('apartada','confirmada','cancelada','propuesta')),
  origen      TEXT NOT NULL DEFAULT 'pagina' CHECK (origen IN ('pagina','negocio')),
  creada      INTEGER NOT NULL,
  recordada   INTEGER NOT NULL DEFAULT 0,
  disp        TEXT NOT NULL DEFAULT '',     -- huella del teléfono de la clienta
  correo      TEXT NOT NULL DEFAULT '',     -- opcional: para avisarle si cambia algo
  aviso_cli   INTEGER NOT NULL DEFAULT 0,   -- recordatorios ya mandados: 1 = el de horas antes, 2 = el del día anterior
  antes_fecha TEXT NOT NULL DEFAULT '',     -- cuando la dueña propone otra hora: la cita ya ocupa la nueva y aquí queda la de antes
  antes_ini   INTEGER NOT NULL DEFAULT 0,
  propuesta_hasta INTEGER NOT NULL DEFAULT 0,
  resp        TEXT NOT NULL DEFAULT ''      -- clave del enlace para contestar la propuesta
);
INSERT INTO citas_nueva (id, negocio_id, folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada, recordada)
  SELECT id, negocio_id, folio, fecha, inicio_min, fin_min, persona, servicio, diseno, detalle, precio, anticipo, nombre, tel, estado, origen, creada, recordada FROM citas;
DROP TABLE citas;
ALTER TABLE citas_nueva RENAME TO citas;
CREATE INDEX citas_dia ON citas(negocio_id, fecha);
CREATE INDEX citas_disp ON citas(negocio_id, disp);
ALTER TABLE suscripciones ADD COLUMN disp TEXT NOT NULL DEFAULT '';    -- '' = teléfono de la dueña
ALTER TABLE avisos ADD COLUMN disp TEXT NOT NULL DEFAULT '';
ALTER TABLE negocios ADD COLUMN recordar TEXT NOT NULL DEFAULT '60';  -- cuándo se le recuerda a la clienta: 60 | 120 | dia60
