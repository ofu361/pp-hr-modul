BEGIN;
-- HR Runde 2 — vom Anzeige- zum Steuerinstrument.
--
-- Fünf Dinge in einer Migration, weil sie zusammen ausgeliefert werden und
-- jede für sich zu klein wäre, um eine eigene Nummer zu rechtfertigen:
--
--   1. Urlaubskonto: Korrekturen (Übertrag setzen, Auszahlung, Verfall) und
--      die Arbeitstage je Woche — Teilzeit zählt in TAGEN, nicht in Stunden.
--   2. § 34c-Weiterbildungspflicht (MaBV § 15b): 20 Stunden in drei Jahren
--      je Person; die Stunden brauchen eine Tabelle, die Pflicht ein Kennzeichen.
--   3. Erinnerungen: welche Frist wem schon gemeldet wurde — ohne das steht
--      jeden Tag dieselbe Meldung in der Glocke.
--   4. Offboarding: die Schritte je Austritt, mit Erledigt-Stempel.
--   5. Zahltag am Kostenparameter — die Liquiditätsprognose braucht den Tag,
--      an dem die Gehälter abgehen.

-- ── 1. Urlaubskonto ─────────────────────────────────────────────────────────
ALTER TABLE hr_mitarbeiter ADD COLUMN IF NOT EXISTS arbeitstage_pro_woche integer NOT NULL DEFAULT 5;
ALTER TABLE hr_mitarbeiter ADD COLUMN IF NOT EXISTS mabv_pflichtig boolean NOT NULL DEFAULT false;
ALTER TABLE hr_mitarbeiter ADD COLUMN IF NOT EXISTS austrittsgrund text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_mitarbeiter_arbeitstage_check') THEN
    ALTER TABLE hr_mitarbeiter ADD CONSTRAINT hr_mitarbeiter_arbeitstage_check CHECK (arbeitstage_pro_woche BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr_urlaub_korrekturen (
  id             serial PRIMARY KEY,
  company_id     integer NOT NULL,
  mitarbeiter_id integer NOT NULL,
  jahr           integer NOT NULL,
  -- uebertrag ERSETZT den gerechneten Übertrag des Jahres; die anderen werden addiert (Vorzeichen frei).
  art            text    NOT NULL,
  tage           numeric(5,1) NOT NULL,
  grund          text    NOT NULL DEFAULT '',
  erstellt_von   integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_urlaub_korrekturen_company_id_companies_id_fk') THEN
    ALTER TABLE hr_urlaub_korrekturen ADD CONSTRAINT hr_urlaub_korrekturen_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_urlaub_korrekturen_mitarbeiter_id_hr_mitarbeiter_id_fk') THEN
    ALTER TABLE hr_urlaub_korrekturen ADD CONSTRAINT hr_urlaub_korrekturen_mitarbeiter_id_hr_mitarbeiter_id_fk FOREIGN KEY (mitarbeiter_id) REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_urlaub_korrekturen_art_check') THEN
    ALTER TABLE hr_urlaub_korrekturen ADD CONSTRAINT hr_urlaub_korrekturen_art_check CHECK (art IN ('uebertrag','korrektur','auszahlung','verfall'));
  END IF;
END $$;
-- Höchstens EIN gesetzter Übertrag je Jahr — zwei hießen: welcher gilt?
CREATE UNIQUE INDEX IF NOT EXISTS hr_urlaub_korrekturen_uebertrag_uq ON hr_urlaub_korrekturen (mitarbeiter_id, jahr) WHERE art = 'uebertrag';
CREATE INDEX IF NOT EXISTS hr_urlaub_korrekturen_company_ma_idx ON hr_urlaub_korrekturen (company_id, mitarbeiter_id, jahr);

-- ── 2. Weiterbildung (§ 34c GewO / § 15b MaBV) ──────────────────────────────
CREATE TABLE IF NOT EXISTS hr_weiterbildung (
  id              serial PRIMARY KEY,
  company_id      integer NOT NULL,
  mitarbeiter_id  integer NOT NULL,
  titel           text    NOT NULL,
  anbieter        text,
  datum           date    NOT NULL,
  stunden         numeric(5,2) NOT NULL,
  -- Zählt für die 20 Stunden nach MaBV (Anlage 1: Immobilienrecht, Vermietung, Verwaltung …).
  mabv_relevant   boolean NOT NULL DEFAULT true,
  personalakte_id integer,
  notiz           text    NOT NULL DEFAULT '',
  erstellt_von    integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_weiterbildung_company_id_companies_id_fk') THEN
    ALTER TABLE hr_weiterbildung ADD CONSTRAINT hr_weiterbildung_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_weiterbildung_mitarbeiter_id_hr_mitarbeiter_id_fk') THEN
    ALTER TABLE hr_weiterbildung ADD CONSTRAINT hr_weiterbildung_mitarbeiter_id_hr_mitarbeiter_id_fk FOREIGN KEY (mitarbeiter_id) REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_weiterbildung_personalakte_id_hr_personalakte_id_fk') THEN
    ALTER TABLE hr_weiterbildung ADD CONSTRAINT hr_weiterbildung_personalakte_id_hr_personalakte_id_fk FOREIGN KEY (personalakte_id) REFERENCES hr_personalakte(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_weiterbildung_stunden_check') THEN
    ALTER TABLE hr_weiterbildung ADD CONSTRAINT hr_weiterbildung_stunden_check CHECK (stunden > 0 AND stunden <= 80);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS hr_weiterbildung_company_ma_datum_idx ON hr_weiterbildung (company_id, mitarbeiter_id, datum);

-- ── 3. Erinnerungen (Idempotenz des Fristenlaufs) ───────────────────────────
CREATE TABLE IF NOT EXISTS hr_erinnerungen (
  id          serial PRIMARY KEY,
  company_id  integer NOT NULL,
  -- z. B. "frist:probezeit:<vertragId>:<entscheidenBis>" — enthält den Stichtag,
  -- damit eine verschobene Frist erneut erinnert wird.
  schluessel  text    NOT NULL,
  gesendet_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_erinnerungen_company_id_companies_id_fk') THEN
    ALTER TABLE hr_erinnerungen ADD CONSTRAINT hr_erinnerungen_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS hr_erinnerungen_schluessel_uq ON hr_erinnerungen (company_id, schluessel);

-- ── 4. Offboarding ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_offboarding (
  id             serial PRIMARY KEY,
  company_id     integer NOT NULL,
  mitarbeiter_id integer NOT NULL,
  schritt        text    NOT NULL,
  -- offen | erledigt | entfaellt
  status         text    NOT NULL DEFAULT 'offen',
  -- Der Schritt lässt sich per Klick ausführen (Konto sperren, Verteiler, Kalender …).
  automatisch    boolean NOT NULL DEFAULT false,
  ergebnis       text,
  erledigt_am    timestamptz,
  erledigt_von   integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_offboarding_company_id_companies_id_fk') THEN
    ALTER TABLE hr_offboarding ADD CONSTRAINT hr_offboarding_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_offboarding_mitarbeiter_id_hr_mitarbeiter_id_fk') THEN
    ALTER TABLE hr_offboarding ADD CONSTRAINT hr_offboarding_mitarbeiter_id_hr_mitarbeiter_id_fk FOREIGN KEY (mitarbeiter_id) REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_offboarding_status_check') THEN
    ALTER TABLE hr_offboarding ADD CONSTRAINT hr_offboarding_status_check CHECK (status IN ('offen','erledigt','entfaellt'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS hr_offboarding_ma_schritt_uq ON hr_offboarding (mitarbeiter_id, schritt);

-- ── 5. Zahltag ──────────────────────────────────────────────────────────────
-- 28 = „Monatsende": ein fester Tag, den jeder Monat hat.
ALTER TABLE hr_kosten_parameter ADD COLUMN IF NOT EXISTS zahltag integer NOT NULL DEFAULT 28;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_kosten_parameter_zahltag_check') THEN
    ALTER TABLE hr_kosten_parameter ADD CONSTRAINT hr_kosten_parameter_zahltag_check CHECK (zahltag BETWEEN 1 AND 28);
  END IF;
END $$;

-- ── Mandantentrennung für die vier neuen Tabellen ───────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr_urlaub_korrekturen','hr_weiterbildung','hr_erinnerungen','hr_offboarding'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation') THEN
      EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
        USING (company_id = current_setting('app.company_id', true)::int OR current_setting('app.bypass_rls', true) = 'on')
        WITH CHECK (company_id = current_setting('app.company_id', true)::int OR current_setting('app.bypass_rls', true) = 'on')$p$, t);
    END IF;
  END LOOP;
END $$;

COMMIT;
