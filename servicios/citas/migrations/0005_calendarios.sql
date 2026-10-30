-- Su calendario de Google (o iCloud u Outlook): la «dirección secreta» va cifrada y de él sólo se guarda
-- de qué hora a qué hora está ocupada. Nunca títulos, lugares ni invitados.
CREATE TABLE calendarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  persona     TEXT NOT NULL DEFAULT '',   -- de quién es ('' = todo el negocio)
  url_cifrada TEXT NOT NULL,              -- AES-GCM con una llave sacada de SECRETO
  host        TEXT NOT NULL,              -- para enseñarle de dónde es («calendar.google.com»)
  estado      TEXT NOT NULL DEFAULT 'nuevo',   -- ok | error
  error       TEXT NOT NULL DEFAULT '',
  revisado    INTEGER NOT NULL DEFAULT 0,
  bloques     INTEGER NOT NULL DEFAULT 0,
  creado      INTEGER NOT NULL
);
CREATE INDEX calendarios_neg ON calendarios(negocio_id);

CREATE TABLE cal_ocupado (
  calendario_id INTEGER NOT NULL REFERENCES calendarios(id),
  negocio_id    TEXT NOT NULL,
  persona       TEXT NOT NULL DEFAULT '',
  fecha         TEXT NOT NULL,
  inicio_min    INTEGER NOT NULL,
  fin_min       INTEGER NOT NULL
);
CREATE INDEX cal_ocupado_dia ON cal_ocupado(negocio_id, fecha);
CREATE INDEX cal_ocupado_cal ON cal_ocupado(calendario_id);
