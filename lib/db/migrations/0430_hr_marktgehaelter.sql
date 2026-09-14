BEGIN;
-- HR — Marktgehälter je Stellengruppe, für den Vergleich mit den eigenen Bändern.
--
-- WARUM erfasst und nicht generiert. Ein Sprachmodell kennt keine aktuellen
-- regionalen Gehaltsdaten; was es liefert, sind plausibel klingende Zahlen
-- ohne Quelle. Für eine Gehaltsentscheidung ist das schlimmer als gar keine
-- Zahl. Deshalb trägt jede Zeile eine QUELLE (Entgeltatlas der BA,
-- Gehaltsreport, Tarifvertrag, Stellenanzeigen-Auswertung) und ein Jahr.
--
-- ⚠ EINHEIT: JAHRESBRUTTO VOLLZEIT IN CENT. Gehaltsreports nennen Jahreswerte;
--   hr_mitarbeiter.salary_gross ist ein MONATSwert. Der Vergleich rechnet den
--   internen Median ×12 — nicht umgekehrt den Markt /12. Wer hier Monatswerte
--   einträgt, sieht die eigenen Gehälter um Faktor 12 über dem Markt.

CREATE TABLE IF NOT EXISTS hr_marktgehaelter (
  id                     serial PRIMARY KEY,
  company_id             integer NOT NULL,
  -- Normalisierte Stellengruppe (klein, ein Leerzeichen) — derselbe Schlüssel
  -- wie in der Auswertung Gehalt × Qualifikation, sonst findet der Vergleich
  -- die Gruppe nicht.
  stellengruppe          text    NOT NULL,
  anzeige                text    NOT NULL,
  region                 text    NOT NULL DEFAULT 'Deutschland',
  quelle                 text    NOT NULL,
  jahr                   integer NOT NULL,
  jahresbrutto_p25_cent  bigint,
  jahresbrutto_median_cent bigint NOT NULL,
  jahresbrutto_p75_cent  bigint,
  erfasst_am             date    NOT NULL DEFAULT CURRENT_DATE,
  notiz                  text    NOT NULL DEFAULT '',
  erstellt_von           integer,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_marktgehaelter_company_id_companies_id_fk') THEN
    ALTER TABLE hr_marktgehaelter ADD CONSTRAINT hr_marktgehaelter_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_marktgehaelter_erstellt_von_users_id_fk') THEN
    ALTER TABLE hr_marktgehaelter ADD CONSTRAINT hr_marktgehaelter_erstellt_von_users_id_fk
      FOREIGN KEY (erstellt_von) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  -- P25 ≤ Median ≤ P75, sonst ist die Zeile vertauscht eingetragen.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_marktgehaelter_quartile_check') THEN
    ALTER TABLE hr_marktgehaelter ADD CONSTRAINT hr_marktgehaelter_quartile_check
      CHECK ((jahresbrutto_p25_cent IS NULL OR jahresbrutto_p25_cent <= jahresbrutto_median_cent)
         AND (jahresbrutto_p75_cent IS NULL OR jahresbrutto_p75_cent >= jahresbrutto_median_cent));
  END IF;
  -- Plausibilität: unter 10.000 € ist kein Jahresbrutto, sondern ein Monatswert
  -- oder Euro statt Cent. Der CHECK fängt den Faktor-12- und den Faktor-100-Fehler.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_marktgehaelter_jahreswert_check') THEN
    ALTER TABLE hr_marktgehaelter ADD CONSTRAINT hr_marktgehaelter_jahreswert_check
      CHECK (jahresbrutto_median_cent >= 1000000 AND jahresbrutto_median_cent <= 100000000);
  END IF;
END $$;

-- Eine Zeile je Gruppe, Region, Quelle und Jahr — dieselbe Quelle zweimal
-- fürs selbe Jahr wäre ein Tippfehler, keine zweite Meinung.
CREATE UNIQUE INDEX IF NOT EXISTS hr_marktgehaelter_gruppe_quelle_uq
  ON hr_marktgehaelter (company_id, stellengruppe, region, quelle, jahr);
CREATE INDEX IF NOT EXISTS hr_marktgehaelter_company_gruppe_idx ON hr_marktgehaelter (company_id, stellengruppe);

ALTER TABLE hr_marktgehaelter ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_marktgehaelter FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_marktgehaelter' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON hr_marktgehaelter
      USING (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on')
      WITH CHECK (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on');
  END IF;
END $$;

COMMIT;
