-- Mis tiempos: el horario de cada persona y los planes que se repiten.
-- horario: {"<persona>": {"1": [ini_min, fin_min] | null, …, "7": …}}  (1 = lunes … 7 = domingo; "" = todo el negocio)
-- Sin horario guardado no se restringe nada: la página usa el que trae escrito, como antes.
ALTER TABLE negocios ADD COLUMN horario TEXT NOT NULL DEFAULT '{}';

-- «Recoger a Santi, lunes, miércoles y viernes de 1 a 2». El motivo sólo lo ve la dueña.
CREATE TABLE repetidos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  negocio_id  TEXT NOT NULL REFERENCES negocios(id),
  persona     TEXT NOT NULL DEFAULT '',   -- '' = todo el negocio
  dias        TEXT NOT NULL,              -- días de la semana, "135" = lunes, miércoles y viernes
  inicio_min  INTEGER NOT NULL,
  fin_min     INTEGER NOT NULL,
  desde       TEXT NOT NULL,              -- AAAA-MM-DD desde cuándo
  hasta       TEXT NOT NULL DEFAULT '',   -- '' = sin fecha de fin
  motivo      TEXT NOT NULL DEFAULT '',
  creado      INTEGER NOT NULL
);
CREATE INDEX repetidos_neg ON repetidos(negocio_id);
