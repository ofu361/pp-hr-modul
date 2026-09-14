BEGIN;
-- HR — genehmigte Abwesenheiten in den Outlook-/Google-Kalender schreiben.
--
-- Der Kalender-Sync (0334) kann Termine anlegen, ändern und löschen — je
-- Verbindung, für Google und Microsoft. Was fehlte, war die Brücke von
-- hr_urlaub dorthin. Zwei Ziele:
--
--   1. Der EIGENE Kalender des Mitarbeiters (über hr_mitarbeiter.user_id →
--      kalender_tokens.user_id): dort steht „Urlaub", und Kollegen sehen ihn
--      über Frei/Gebucht.
--   2. Ein TEAM-Abwesenheitskalender der Firma: eine Verbindung im Modus
--      `firma`, die hier als Abwesenheitskalender markiert ist. Dort steht
--      „Abwesend: Name (Urlaub)" — das ist der Kalender, den die Abteilung
--      abonniert, um zu sehen, wer da ist.
--
-- ⚠ Der Kalender ist NACHGELAGERT. Scheitert das Schreiben (Token abgelaufen,
--   Graph nicht erreichbar), bleibt die Genehmigung gültig; der Fehler steht
--   an der Abwesenheit, und eine Nachholroutine schreibt später nach. Eine
--   Genehmigung, die an Outlook scheitert, wäre die falsche Kopplung.

ALTER TABLE kalender_tokens ADD COLUMN IF NOT EXISTS abwesenheitskalender boolean NOT NULL DEFAULT false;

-- Welche Einträge wo liegen: [{ "verbindungId": 3, "externalId": "AAMk…", "ziel": "eigen" | "team" }]
ALTER TABLE hr_urlaub ADD COLUMN IF NOT EXISTS kalender_eintraege jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE hr_urlaub ADD COLUMN IF NOT EXISTS kalender_fehler    text;
ALTER TABLE hr_urlaub ADD COLUMN IF NOT EXISTS kalender_at        timestamptz;

-- Höchstens EIN Abwesenheitskalender je Firma — zwei hießen doppelte Einträge.
CREATE UNIQUE INDEX IF NOT EXISTS kalender_tokens_abwesenheitskalender_uq
  ON kalender_tokens (company_id) WHERE abwesenheitskalender;

-- Die Nachholroutine sucht genehmigte Abwesenheiten ohne Eintrag oder mit Fehler.
CREATE INDEX IF NOT EXISTS hr_urlaub_kalender_nachholen_idx
  ON hr_urlaub (company_id, status) WHERE kalender_fehler IS NOT NULL OR kalender_eintraege = '[]'::jsonb;

COMMIT;
