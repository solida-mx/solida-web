-- Sesiones de la dueña guardadas en el servidor (para ver en qué teléfonos tiene sesión y poder quitar cualquiera)
-- y sus llaves de Face ID / huella (WebAuthn). De la llave sólo se guarda la parte pública.
CREATE TABLE sesiones (
  id          TEXT PRIMARY KEY,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  hash        TEXT NOT NULL,              -- SHA-256 del secreto del token (el secreto sólo lo tiene el teléfono)
  nombre      TEXT NOT NULL DEFAULT '',   -- «iPhone · Safari»
  metodo      TEXT NOT NULL DEFAULT 'clave',   -- clave | llave
  creado      INTEGER NOT NULL,
  ultimo      INTEGER NOT NULL,
  expira      INTEGER NOT NULL,
  revocada    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sesiones_neg ON sesiones(negocio_id);
CREATE TABLE llaves (
  id          TEXT PRIMARY KEY,           -- id de la credencial (lo da el teléfono)
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  nombre      TEXT NOT NULL DEFAULT '',
  jwk         TEXT NOT NULL,              -- llave PÚBLICA
  alg         INTEGER NOT NULL,
  contador    INTEGER NOT NULL DEFAULT 0,
  creado      INTEGER NOT NULL,
  ultimo      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX llaves_neg ON llaves(negocio_id);
CREATE TABLE retos (
  id          TEXT PRIMARY KEY,           -- el reto que firma el teléfono (de un solo uso, 5 minutos)
  negocio_id  TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  creado      INTEGER NOT NULL
);
