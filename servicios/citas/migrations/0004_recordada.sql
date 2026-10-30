-- Cuándo se le mandó el recordatorio a la clienta (0 = todavía no). Así la dueña ve «Enviado ✓» desde cualquier teléfono.
ALTER TABLE citas ADD COLUMN recordada INTEGER NOT NULL DEFAULT 0;
