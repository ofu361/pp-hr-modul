-- © 2026 P&P Group. Proprietary & Confidential.
-- Migration 0065: HR-Erweiterung — Schichtplanung, Personalakte, Qualifikationen,
-- Beurteilungen, Ziele + Abwesenheits-Erweiterungen

-- ── 1) Schichten / Dienstplan ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_schichten (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL,
  mitarbeiter_id   INTEGER NOT NULL REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE,
  date             TEXT    NOT NULL,          -- YYYY-MM-DD
  start_time       TEXT    NOT NULL DEFAULT '08:00',
  end_time         TEXT    NOT NULL DEFAULT '17:00',
  shift_type       TEXT    NOT NULL DEFAULT 'normal',   -- normal|frueh|spaet|nacht|bereitschaft|homeoffice
  status           TEXT    NOT NULL DEFAULT 'geplant',  -- geplant|bestaetigt|abwesend
  notes            TEXT,
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_schichten_company_idx      ON hr_schichten(company_id);
CREATE INDEX IF NOT EXISTS hr_schichten_mitarbeiter_idx  ON hr_schichten(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS hr_schichten_date_idx         ON hr_schichten(date);

-- ── 2) Digitale Personalakte ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_personalakte (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL,
  mitarbeiter_id   INTEGER NOT NULL REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE,
  doc_type         TEXT    NOT NULL DEFAULT 'sonstiges',  -- arbeitsvertrag|zeugnis|bescheinigung|abmahnung|sonstiges
  title            TEXT    NOT NULL,
  file_url         TEXT,
  expires_at       TEXT,   -- YYYY-MM-DD; NULL = kein Ablauf
  notes            TEXT,
  uploaded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_personalakte_company_idx     ON hr_personalakte(company_id);
CREATE INDEX IF NOT EXISTS hr_personalakte_mitarbeiter_idx ON hr_personalakte(mitarbeiter_id);

-- ── 3) Qualifikations-Katalog ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_qualifikationen (
  id                       SERIAL PRIMARY KEY,
  company_id               INTEGER NOT NULL,
  name                     TEXT    NOT NULL,
  category                 TEXT    NOT NULL DEFAULT 'sonstige',  -- technisch|sicherheit|rechtlich|sonstige
  description              TEXT,
  renewal_required         BOOLEAN NOT NULL DEFAULT FALSE,
  renewal_interval_months  INTEGER,   -- NULL wenn keine Erneuerung nötig
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_qualifikationen_company_idx ON hr_qualifikationen(company_id);

-- ── 4) Qualifikationen je Mitarbeiter ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_mitarbeiter_qualifikationen (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL,
  mitarbeiter_id   INTEGER NOT NULL REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE,
  qualifikation_id INTEGER NOT NULL REFERENCES hr_qualifikationen(id) ON DELETE CASCADE,
  erworben_am      TEXT    NOT NULL,   -- YYYY-MM-DD
  ablaufdatum      TEXT,               -- YYYY-MM-DD; NULL = kein Ablauf
  zertifikat_nr    TEXT,
  status           TEXT    NOT NULL DEFAULT 'aktiv',  -- aktiv|abgelaufen|erneuert
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hr_ma_qual_uq UNIQUE (mitarbeiter_id, qualifikation_id)
);
CREATE INDEX IF NOT EXISTS hr_ma_qual_company_idx     ON hr_mitarbeiter_qualifikationen(company_id);
CREATE INDEX IF NOT EXISTS hr_ma_qual_mitarbeiter_idx ON hr_mitarbeiter_qualifikationen(mitarbeiter_id);

-- ── 5) Leistungsbeurteilungen ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_beurteilungen (
  id                      SERIAL PRIMARY KEY,
  company_id              INTEGER NOT NULL,
  mitarbeiter_id          INTEGER NOT NULL REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE,
  period                  TEXT    NOT NULL,  -- z.B. "2026-H1" oder "2026-Q2"
  rating                  INTEGER NOT NULL DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  staerken                TEXT,
  verbesserungen          TEXT,
  ziele_naechste_periode  TEXT,
  notes                   TEXT,
  created_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_beurteilungen_company_idx     ON hr_beurteilungen(company_id);
CREATE INDEX IF NOT EXISTS hr_beurteilungen_mitarbeiter_idx ON hr_beurteilungen(mitarbeiter_id);

-- ── 6) Ziele (OKR / Zielvereinbarungen) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_ziele (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER NOT NULL,
  mitarbeiter_id INTEGER NOT NULL REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE,
  title          TEXT    NOT NULL,
  description    TEXT,
  target_date    TEXT,   -- YYYY-MM-DD
  status         TEXT    NOT NULL DEFAULT 'offen',  -- offen|in-bearbeitung|erreicht|nicht-erreicht
  progress_pct   INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hr_ziele_company_idx     ON hr_ziele(company_id);
CREATE INDEX IF NOT EXISTS hr_ziele_mitarbeiter_idx ON hr_ziele(mitarbeiter_id);

-- ── 7) Abwesenheits-Erweiterungen ─────────────────────────────────────────────
ALTER TABLE hr_urlaub
  ADD COLUMN IF NOT EXISTS halfday             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS au_attest_erhalten  BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 8) Lohnabrechnung-Felder an hr_mitarbeiter ────────────────────────────────
ALTER TABLE hr_mitarbeiter
  ADD COLUMN IF NOT EXISTS steuerklasse         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kirchensteuer        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS freibetrag_cents     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kinderzahl           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kv_zusatzbeitrag_bp  INTEGER NOT NULL DEFAULT 85;
