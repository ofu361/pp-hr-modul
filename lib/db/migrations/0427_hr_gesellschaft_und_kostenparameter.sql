BEGIN;
-- HR — Gesellschaftsbezug am Mitarbeiter und Parameter für die Kostenrechnung.
--
-- WARUM. Die Personalauswertung soll je GESELLSCHAFT ausweisen, was ein
-- Rechtsträger an Gehalt, Abwesenheit und Krankheit kostet. Das ging bisher
-- nicht, und zwar aus einem Grund, der leicht übersehen wird:
--
--   `hr_mitarbeiter.company_id` ist NICHT die Gesellschaft. `companies` ist der
--   MANDANT — die Firma, die die Suite benutzt. Die Rechtsträger darunter
--   liegen seit 0305 in `gesellschaften` (GS-####). Eine Auswertung, die nach
--   `company_id` gruppiert, liefert deshalb genau eine Zeile und sieht dabei
--   völlig plausibel aus.
--
-- ⚠ Die Spalte bleibt NULLABLE, und das ist Absicht. Kein Bestandssatz trägt
--   heute eine Gesellschaft; ein NOT NULL mit geratenem Default würde 100 %
--   Zuordnungsquote vortäuschen. Die Auswertung weist unzugeordnete Mitarbeiter
--   stattdessen als eigene Zeile aus — sichtbar statt stillschweigend verteilt.

ALTER TABLE hr_mitarbeiter ADD COLUMN IF NOT EXISTS gesellschaft_id integer;

DO $$
BEGIN
  -- Name nach Drizzle-Konvention (<tabelle>_<spalte>_<ziel>_<zielspalte>_fk),
  -- damit ein späteres `push` keinen zweiten Schlüssel daneben anlegt.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_mitarbeiter_gesellschaft_id_gesellschaften_id_fk'
  ) THEN
    ALTER TABLE hr_mitarbeiter
      ADD CONSTRAINT hr_mitarbeiter_gesellschaft_id_gesellschaften_id_fk
      FOREIGN KEY (gesellschaft_id) REFERENCES gesellschaften(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hr_mitarbeiter_gesellschaft_idx
  ON hr_mitarbeiter (company_id, gesellschaft_id);

-- ── Kostenparameter ─────────────────────────────────────────────────────────
--
-- WARUM eine eigene Tabelle statt fester Zahlen im Code. Was ein Krankheitstag
-- kostet, ist keine Naturkonstante: sie hängt an den Arbeitstagen des Jahres
-- und am Arbeitgeberanteil zur Sozialversicherung. Beide ändern sich jährlich.
-- Stünden sie im Code, wäre jede historische Auswertung rückwirkend falsch,
-- sobald jemand den Satz anpasst.
--
-- ⚠ ag_nebenkosten_bp ist in BASISPUNKTEN (2000 = 20,00 %). Ganzzahlig, weil
--   in dieser Domäne der Faktor 100 die häufigste stille Fehlerquelle ist.
CREATE TABLE IF NOT EXISTS hr_kosten_parameter (
  id                    serial PRIMARY KEY,
  company_id            integer NOT NULL,
  jahr                  integer NOT NULL,
  arbeitstage_pro_jahr  integer NOT NULL DEFAULT 250,
  ag_nebenkosten_bp     integer NOT NULL DEFAULT 2000,
  notiz                 text    NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hr_kosten_parameter_company_id_companies_id_fk'
  ) THEN
    ALTER TABLE hr_kosten_parameter
      ADD CONSTRAINT hr_kosten_parameter_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ein Satz je Firma und Jahr — der Upsert der Maske hängt daran.
CREATE UNIQUE INDEX IF NOT EXISTS hr_kosten_parameter_company_jahr_uq
  ON hr_kosten_parameter (company_id, jahr);

-- ── Mandantentrennung ───────────────────────────────────────────────────────
-- 0126 hat den Bestand geregelt; neue Tabellen müssen es selbst mitbringen.
-- FORCE ist der Teil, der leicht fehlt: die Rolle `ppgroup` ist Eigentümerin
-- und wäre ohne FORCE von der eigenen Policy ausgenommen.
ALTER TABLE hr_kosten_parameter ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_kosten_parameter FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'hr_kosten_parameter' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON hr_kosten_parameter
      USING (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on')
      WITH CHECK (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on');
  END IF;
END $$;

COMMIT;
