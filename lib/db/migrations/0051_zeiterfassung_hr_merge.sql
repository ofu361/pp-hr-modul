-- © 2026 P&P Group. Proprietary & Confidential.
-- Slice: ZeitMind × HR Merge + ArbZG Compliance Foundation
-- Extends hr_mitarbeiter with ZeitMind fields, migrates zm_mitarbeiter,
-- re-points FKs, adds Feiertagskalender, ArbZG-Verstoß-Log, Stundenkonten.

-- ── 1. ZeitMind-Felder in hr_mitarbeiter hinzufügen ──────────────────────────
ALTER TABLE hr_mitarbeiter
  ADD COLUMN IF NOT EXISTS email                TEXT,
  ADD COLUMN IF NOT EXISTS stundensatz          NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS monatslohn           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS lohnart              TEXT NOT NULL DEFAULT 'stundenlohn',
  ADD COLUMN IF NOT EXISTS kalenderfarbe        TEXT NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS zm_rolle             TEXT NOT NULL DEFAULT 'sonstige',
  ADD COLUMN IF NOT EXISTS urlaubstage_pro_jahr INTEGER NOT NULL DEFAULT 30;

-- ── 2. Hilfsspalte für Migration (wird am Ende wieder entfernt) ───────────────
ALTER TABLE hr_mitarbeiter ADD COLUMN IF NOT EXISTS _zm_legacy_id INTEGER;

-- ── 3. Bestehende hr_mitarbeiter per user_id matchen und Daten übernehmen ─────
UPDATE hr_mitarbeiter hr
SET
  stundensatz   = zm.stundensatz,
  monatslohn    = zm.monatslohn,
  lohnart       = zm.lohnart,
  email         = COALESCE(hr.email, zm.email),
  kalenderfarbe = COALESCE(zm.farbe, '#6366f1'),
  zm_rolle      = COALESCE(zm.rolle, 'sonstige'),
  weekly_hours  = COALESCE(hr.weekly_hours, zm.wochenstunden::INTEGER),
  notes         = COALESCE(hr.notes, zm.notizen),
  _zm_legacy_id = zm.id
FROM zm_mitarbeiter zm
WHERE hr.company_id   = zm.company_id
  AND hr.user_id      = zm.user_id
  AND zm.user_id IS NOT NULL
  AND hr._zm_legacy_id IS NULL;

-- ── 4. Nicht gematchte zm_mitarbeiter als neue hr_mitarbeiter anlegen ─────────
INSERT INTO hr_mitarbeiter
  (company_id, user_id, name, email, job_title, employment_type, start_date, status,
   weekly_hours, notes, stundensatz, monatslohn, lohnart, kalenderfarbe, zm_rolle,
   created_at, updated_at, _zm_legacy_id)
SELECT
  zm.company_id,
  zm.user_id,
  TRIM(zm.vorname || ' ' || zm.nachname),
  zm.email,
  zm.rolle,
  'vollzeit',
  TO_CHAR(COALESCE(zm.created_at, NOW()), 'YYYY-MM-DD'),
  CASE WHEN zm.aktiv THEN 'aktiv' ELSE 'ausgeschieden' END,
  COALESCE(zm.wochenstunden::INTEGER, 40),
  zm.notizen,
  zm.stundensatz,
  zm.monatslohn,
  zm.lohnart,
  COALESCE(zm.farbe, '#6366f1'),
  COALESCE(zm.rolle, 'sonstige'),
  zm.created_at,
  zm.updated_at,
  zm.id
FROM zm_mitarbeiter zm
WHERE NOT EXISTS (
  SELECT 1 FROM hr_mitarbeiter hr
  WHERE hr.company_id = zm.company_id
    AND hr.user_id    = zm.user_id
    AND zm.user_id IS NOT NULL
);

-- ── 5. FK von zm_zeiteintraege auf hr_mitarbeiter umzeigen ────────────────────
ALTER TABLE zm_zeiteintraege
  DROP CONSTRAINT IF EXISTS zm_zeiteintraege_mitarbeiter_id_zm_mitarbeiter_id_fk;
ALTER TABLE zm_zeiteintraege
  DROP CONSTRAINT IF EXISTS zm_zeiteintraege_mitarbeiter_id_fkey;

UPDATE zm_zeiteintraege ze
SET mitarbeiter_id = hr.id
FROM hr_mitarbeiter hr
WHERE hr._zm_legacy_id = ze.mitarbeiter_id;

ALTER TABLE zm_zeiteintraege
  ADD CONSTRAINT zm_zeiteintraege_mitarbeiter_id_fkey
  FOREIGN KEY (mitarbeiter_id) REFERENCES hr_mitarbeiter(id) ON DELETE RESTRICT;

-- ── 6. FK von zm_monatsberichte auf hr_mitarbeiter umzeigen ──────────────────
ALTER TABLE zm_monatsberichte
  DROP CONSTRAINT IF EXISTS zm_monatsberichte_mitarbeiter_id_zm_mitarbeiter_id_fk;
ALTER TABLE zm_monatsberichte
  DROP CONSTRAINT IF EXISTS zm_monatsberichte_mitarbeiter_id_fkey;

UPDATE zm_monatsberichte mb
SET mitarbeiter_id = hr.id
FROM hr_mitarbeiter hr
WHERE hr._zm_legacy_id = mb.mitarbeiter_id;

ALTER TABLE zm_monatsberichte
  ADD CONSTRAINT zm_monatsberichte_mitarbeiter_id_fkey
  FOREIGN KEY (mitarbeiter_id) REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE;

-- ── 7. FKs von am_tickets + am_wiederkehrend umzeigen (falls Aufgaben-Mind existiert) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'am_tickets') THEN
    ALTER TABLE am_tickets DROP CONSTRAINT IF EXISTS am_tickets_zugewiesen_an_zm_mitarbeiter_id_fk;
    ALTER TABLE am_tickets DROP CONSTRAINT IF EXISTS am_tickets_zugewiesen_an_fkey;
    ALTER TABLE am_tickets
      ADD CONSTRAINT am_tickets_zugewiesen_an_fkey
      FOREIGN KEY (zugewiesen_an) REFERENCES hr_mitarbeiter(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'am_wiederkehrend') THEN
    ALTER TABLE am_wiederkehrend DROP CONSTRAINT IF EXISTS am_wiederkehrend_zugewiesen_an_zm_mitarbeiter_id_fk;
    ALTER TABLE am_wiederkehrend DROP CONSTRAINT IF EXISTS am_wiederkehrend_zugewiesen_an_fkey;
    ALTER TABLE am_wiederkehrend
      ADD CONSTRAINT am_wiederkehrend_zugewiesen_an_fkey
      FOREIGN KEY (zugewiesen_an) REFERENCES hr_mitarbeiter(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 8. zm_mitarbeiter droppen ─────────────────────────────────────────────────
DROP TABLE IF EXISTS zm_mitarbeiter;

-- ── 9. Hilfsspalte entfernen ──────────────────────────────────────────────────
ALTER TABLE hr_mitarbeiter DROP COLUMN IF EXISTS _zm_legacy_id;

-- ── 10. Feiertagskalender ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zm_feiertage (
  id          SERIAL PRIMARY KEY,
  bundesland  TEXT,           -- NULL = bundesweit (alle BL)
  datum       TEXT NOT NULL,  -- 'YYYY-MM-DD'
  bezeichnung TEXT NOT NULL,
  UNIQUE (bundesland, datum)
);

-- ── 11. ArbZG-Verstoß-Log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zm_arbzg_verstoss (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL,
  mitarbeiter_id  INTEGER NOT NULL REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE,
  datum           TEXT NOT NULL,
  typ             TEXT NOT NULL,                     -- 'tageslimit' | 'pause' | 'ruhezeit'
  beschreibung    TEXT NOT NULL,
  schwere         TEXT NOT NULL DEFAULT 'warnung',   -- 'warnung' | 'kritisch'
  eintrag_id      INTEGER REFERENCES zm_zeiteintraege(id) ON DELETE SET NULL,
  erstellt_am     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mitarbeiter_id, datum, typ)
);
CREATE INDEX IF NOT EXISTS zm_arbzg_verstoss_company_idx ON zm_arbzg_verstoss (company_id, datum);

-- ── 12. Stundenkonto (Soll/Ist-Vergleich pro Mitarbeiter/Monat) ──────────────
CREATE TABLE IF NOT EXISTS zm_stundenkonten (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL,
  mitarbeiter_id      INTEGER NOT NULL REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE,
  jahr                INTEGER NOT NULL,
  monat               INTEGER NOT NULL,               -- 1–12
  soll_stunden        NUMERIC(8,2) NOT NULL DEFAULT 0,
  ist_stunden         NUMERIC(8,2) NOT NULL DEFAULT 0,
  ueberstunden_delta  NUMERIC(8,2) NOT NULL DEFAULT 0, -- ist - soll
  ueberstunden_konto  NUMERIC(8,2) NOT NULL DEFAULT 0, -- kumulatives Saldo
  urlaubstage_soll    NUMERIC(5,2) NOT NULL DEFAULT 0,
  urlaubstage_ist     NUMERIC(5,2) NOT NULL DEFAULT 0,
  krankheitstage      NUMERIC(5,2) NOT NULL DEFAULT 0,
  feiertage           INTEGER NOT NULL DEFAULT 0,
  berechnet_am        TIMESTAMPTZ,
  UNIQUE (company_id, mitarbeiter_id, jahr, monat)
);
CREATE INDEX IF NOT EXISTS zm_stundenkonten_company_idx ON zm_stundenkonten (company_id, mitarbeiter_id, jahr);

-- ── 13. Bundesweite Feiertage 2025–2026 vorab befüllen ───────────────────────
INSERT INTO zm_feiertage (bundesland, datum, bezeichnung) VALUES
  (NULL, '2025-01-01', 'Neujahr'),
  (NULL, '2025-04-18', 'Karfreitag'),
  (NULL, '2025-04-21', 'Ostermontag'),
  (NULL, '2025-05-01', 'Tag der Arbeit'),
  (NULL, '2025-05-29', 'Christi Himmelfahrt'),
  (NULL, '2025-06-09', 'Pfingstmontag'),
  (NULL, '2025-10-03', 'Tag der Deutschen Einheit'),
  (NULL, '2025-12-25', '1. Weihnachtstag'),
  (NULL, '2025-12-26', '2. Weihnachtstag'),
  (NULL, '2026-01-01', 'Neujahr'),
  (NULL, '2026-04-03', 'Karfreitag'),
  (NULL, '2026-04-06', 'Ostermontag'),
  (NULL, '2026-05-01', 'Tag der Arbeit'),
  (NULL, '2026-05-14', 'Christi Himmelfahrt'),
  (NULL, '2026-05-25', 'Pfingstmontag'),
  (NULL, '2026-10-03', 'Tag der Deutschen Einheit'),
  (NULL, '2026-12-25', '1. Weihnachtstag'),
  (NULL, '2026-12-26', '2. Weihnachtstag'),
  -- Baden-Württemberg Sonderfeiertage
  ('BW', '2025-01-06', 'Heilige Drei Könige'),
  ('BW', '2025-06-19', 'Fronleichnam'),
  ('BW', '2025-11-01', 'Allerheiligen'),
  ('BW', '2026-01-06', 'Heilige Drei Könige'),
  ('BW', '2026-06-04', 'Fronleichnam'),
  ('BW', '2026-11-01', 'Allerheiligen'),
  -- Bayern
  ('BY', '2025-01-06', 'Heilige Drei Könige'),
  ('BY', '2025-06-19', 'Fronleichnam'),
  ('BY', '2025-08-15', 'Mariä Himmelfahrt'),
  ('BY', '2025-11-01', 'Allerheiligen'),
  ('BY', '2026-01-06', 'Heilige Drei Könige'),
  ('BY', '2026-06-04', 'Fronleichnam'),
  ('BY', '2026-08-15', 'Mariä Himmelfahrt'),
  ('BY', '2026-11-01', 'Allerheiligen'),
  -- Nordrhein-Westfalen
  ('NW', '2025-06-19', 'Fronleichnam'),
  ('NW', '2025-11-01', 'Allerheiligen'),
  ('NW', '2026-06-04', 'Fronleichnam'),
  ('NW', '2026-11-01', 'Allerheiligen'),
  -- Sachsen
  ('SN', '2025-11-19', 'Buß- und Bettag'),
  ('SN', '2026-11-18', 'Buß- und Bettag')
ON CONFLICT (bundesland, datum) DO NOTHING;
