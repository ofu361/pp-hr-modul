-- Migration 0064: Konfigurierbare Lohnabrechnungs-Sätze + hr_mitarbeiter Steuerfelder
-- Beitragssätze in Basispunkten (100 bp = 1,00 %), Beträge in Cent.

-- 1) Neue Spalten in hr_mitarbeiter
ALTER TABLE hr_mitarbeiter
  ADD COLUMN IF NOT EXISTS steuerklasse        INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kirchensteuer       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freibetrag_cents    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kinderzahl          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kv_zusatzbeitrag_bp INTEGER NOT NULL DEFAULT 85;

-- 2) Neue Tabelle lohn_beitragssaetze (global, pro Kalenderjahr)
CREATE TABLE IF NOT EXISTS lohn_beitragssaetze (
  id      SERIAL PRIMARY KEY,
  jahr    INTEGER NOT NULL,

  -- Krankenkasse (Basisbeitragssatz, ohne kassenindividuellen Zusatzbeitrag)
  kv_ag_bp     INTEGER NOT NULL DEFAULT 730,
  kv_an_bp     INTEGER NOT NULL DEFAULT 730,
  kv_bbg_monat INTEGER NOT NULL DEFAULT 551250,   -- 5.512,50 €

  -- Rentenversicherung
  rv_ag_bp     INTEGER NOT NULL DEFAULT 930,
  rv_an_bp     INTEGER NOT NULL DEFAULT 930,
  rv_bbg_monat INTEGER NOT NULL DEFAULT 805000,   -- 8.050,00 € (West 2025)

  -- Arbeitslosenversicherung (BBG = RV)
  av_ag_bp     INTEGER NOT NULL DEFAULT 130,
  av_an_bp     INTEGER NOT NULL DEFAULT 130,

  -- Pflegeversicherung
  pv_ag_bp        INTEGER NOT NULL DEFAULT 170,
  pv_an_bp        INTEGER NOT NULL DEFAULT 170,
  pv_kinderlos_bp INTEGER NOT NULL DEFAULT 60,    -- 0,60 % Zuschlag AN (kinderlos ≥ 23)
  pv_bbg_monat    INTEGER NOT NULL DEFAULT 551250,

  -- Solidaritätszuschlag
  soli_satz_bp             INTEGER NOT NULL DEFAULT 550,      -- 5,50 %
  soli_freigrenze_lst_cents INTEGER NOT NULL DEFAULT 1813000, -- 18.130 € LSt/Jahr (2025)

  -- EStG §32a Zonengrenzen (Cent)
  grundfreibetrag_cents INTEGER NOT NULL DEFAULT 1208400, -- 12.084 €
  zone1_ende_cents      INTEGER NOT NULL DEFAULT 1700500, -- 17.005 €
  zone2_ende_cents      INTEGER NOT NULL DEFAULT 6843000, -- 68.430 €
  zone3_ende_cents      INTEGER NOT NULL DEFAULT 27782600,-- 277.826 €

  -- Kirchensteuer
  kist_satz_bp INTEGER NOT NULL DEFAULT 900,      -- 9,00 %

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lohn_beitragssaetze_jahr_uq UNIQUE (jahr)
);

-- 3) Datensätze für 2025 und 2026 (identische Werte — 2026 offiziell bestätigen und per UPDATE setzen)
INSERT INTO lohn_beitragssaetze (jahr) VALUES (2025) ON CONFLICT (jahr) DO NOTHING;
INSERT INTO lohn_beitragssaetze (jahr) VALUES (2026) ON CONFLICT (jahr) DO NOTHING;
INSERT INTO lohn_beitragssaetze (jahr) VALUES (2027) ON CONFLICT (jahr) DO NOTHING;
