-- Citas de los clientes de Solida con Agenda Total. Un solo servicio para todos los negocios.

CREATE TABLE negocios (
  id         TEXT PRIMARY KEY,           -- slug: "atelier-mia"
  nombre     TEXT NOT NULL,
  clave_hash TEXT NOT NULL,              -- SHA-256 de la clave con la que entra la dueña
  zona       TEXT NOT NULL DEFAULT 'America/Monterrey',
  activo     INTEGER NOT NULL DEFAULT 1,
  creado     INTEGER NOT NULL
);

CREATE TABLE citas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  folio       TEXT NOT NULL UNIQUE,
  fecha       TEXT NOT NULL,             -- AAAA-MM-DD, hora local del negocio
  inicio_min  INTEGER NOT NULL,          -- minutos desde las 00:00
  fin_min     INTEGER NOT NULL,
  persona     TEXT NOT NULL DEFAULT '',  -- id de quien atiende ('' = el negocio no tiene equipo)
  servicio    TEXT NOT NULL,
  diseno      TEXT NOT NULL DEFAULT '',
  detalle     TEXT NOT NULL DEFAULT '',  -- largo u otra opción
  precio      INTEGER NOT NULL DEFAULT 0,
  anticipo    INTEGER NOT NULL DEFAULT 0,
  nombre      TEXT NOT NULL,
  tel         TEXT NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'apartada' CHECK (estado IN ('apartada','confirmada','cancelada')),
  origen      TEXT NOT NULL DEFAULT 'pagina' CHECK (origen IN ('pagina','negocio')),
  creada      INTEGER NOT NULL
);
CREATE INDEX citas_dia ON citas(negocio_id, fecha);

-- Horas o días que el negocio cierra (comida, vacaciones, un curso…)
CREATE TABLE bloqueos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  fecha       TEXT NOT NULL,
  inicio_min  INTEGER NOT NULL,          -- 0 y 1440 = el día entero
  fin_min     INTEGER NOT NULL,
  persona     TEXT NOT NULL DEFAULT '',  -- '' = todo el negocio
  motivo      TEXT NOT NULL DEFAULT '',
  creado      INTEGER NOT NULL
);
CREATE INDEX bloqueos_dia ON bloqueos(negocio_id, fecha);

-- Límite de intentos (apartar citas, entrar con la clave)
CREATE TABLE intentos (
  clave   TEXT NOT NULL,
  ventana INTEGER NOT NULL,
  n       INTEGER NOT NULL,
  PRIMARY KEY (clave, ventana)
);
