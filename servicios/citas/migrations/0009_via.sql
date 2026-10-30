-- Por dónde llegó una cita de la página: '' (como siempre) o 'qr' (escanearon el código QR del local).
-- Sirve para que la dueña vea cuántas clientas le trae su cartel.
ALTER TABLE citas ADD COLUMN via TEXT NOT NULL DEFAULT '';
