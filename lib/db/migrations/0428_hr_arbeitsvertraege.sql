BEGIN;
-- HR — Arbeitsverträge als eigene Tabelle, mit Fristen und Befristungskette.
--
-- WARUM eine eigene Tabelle und nicht Spalten an hr_mitarbeiter. Ein
-- Mitarbeiter hat über die Jahre MEHRERE Verträge: befristet, verlängert,
-- nochmals verlängert, entfristet. Genau diese Kette ist der Grund für die
-- Fläche — § 14 Abs. 2 TzBfG erlaubt die sachgrundlose Befristung höchstens
-- zwei Jahre und höchstens drei Verlängerungen. Wer darüber hinaus verlängert,
-- hat einen unbefristeten Vertrag, ob er will oder nicht. Mit einer Spalte am
-- Mitarbeiter ließe sich weder zählen noch summieren.
--
-- ⚠ hr_personalakte bleibt, was sie ist: die DOKUMENTE. Der Arbeitsvertrag
--   als PDF liegt dort (doc_type 'arbeitsvertrag'); die hier erfassten Felder
--   sind das, was DARIN steht. `personalakte_id` verbindet beides.

CREATE TABLE IF NOT EXISTS hr_arbeitsvertraege (
  id                       serial PRIMARY KEY,
  company_id               integer NOT NULL,
  mitarbeiter_id           integer NOT NULL,
  -- unbefristet | befristet_sachgrund | befristet_sachgrundlos | ausbildung | sonstiges
  vertragsart              text    NOT NULL DEFAULT 'unbefristet',
  beginn                   date    NOT NULL,
  -- NULL bei unbefristeten Verträgen. Bei befristeten das vereinbarte Ende.
  ende                     date,
  -- TRUE, wenn dieser Vertrag die Verlängerung eines vorherigen befristeten
  -- ist. Zählt in die § 14-Kette; ein NEUER befristeter Vertrag nach einer
  -- Unterbrechung ist etwas anderes (und ohne Sachgrund meist unzulässig).
  ist_verlaengerung        boolean NOT NULL DEFAULT false,
  sachgrund                text,
  probezeit_bis            date,
  -- Vertragliche Kündigungsfrist. Die GESETZLICHE (§ 622 BGB) rechnet die
  -- Anwendung aus der Betriebszugehörigkeit; die längere gilt für die
  -- Kündigung durch den Arbeitgeber.
  kuendigungsfrist_wert    integer,
  kuendigungsfrist_einheit text,                 -- wochen | monate
  kuendigungstermin        text,                 -- monatsende | quartalsende | fuenfzehnter_oder_monatsende | jederzeit
  wochenstunden            numeric(5,2),
  -- Vertragsgehalt bei Abschluss, Monatsbrutto in CENT (wie hr_mitarbeiter.salary_gross).
  -- Nicht der aktuelle Stand — der steht am Mitarbeiter. Hier: was unterschrieben wurde.
  gehalt_monat_cent        integer,
  urlaubstage              integer,
  wettbewerbsverbot        boolean NOT NULL DEFAULT false,
  nebentaetigkeit_erlaubt  boolean,
  personalakte_id          integer,
  -- Letzter KI-Vorschlag mit Fundstellen. Bleibt stehen, auch wenn die Felder
  -- übernommen wurden — man will nachlesen können, WOHER ein Wert kam.
  ki_auslesung             jsonb,
  -- aktiv | beendet | abgeloest (durch Folgevertrag)
  status                   text    NOT NULL DEFAULT 'aktiv',
  notiz                    text    NOT NULL DEFAULT '',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_arbeitsvertraege_company_id_companies_id_fk') THEN
    ALTER TABLE hr_arbeitsvertraege ADD CONSTRAINT hr_arbeitsvertraege_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_arbeitsvertraege_mitarbeiter_id_hr_mitarbeiter_id_fk') THEN
    ALTER TABLE hr_arbeitsvertraege ADD CONSTRAINT hr_arbeitsvertraege_mitarbeiter_id_hr_mitarbeiter_id_fk
      FOREIGN KEY (mitarbeiter_id) REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE;
  END IF;
  -- SET NULL, nicht CASCADE: ein gelöschtes Dokument nimmt nicht die
  -- erfassten Vertragsdaten mit.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_arbeitsvertraege_personalakte_id_hr_personalakte_id_fk') THEN
    ALTER TABLE hr_arbeitsvertraege ADD CONSTRAINT hr_arbeitsvertraege_personalakte_id_hr_personalakte_id_fk
      FOREIGN KEY (personalakte_id) REFERENCES hr_personalakte(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_arbeitsvertraege_vertragsart_check') THEN
    ALTER TABLE hr_arbeitsvertraege ADD CONSTRAINT hr_arbeitsvertraege_vertragsart_check
      CHECK (vertragsart IN ('unbefristet','befristet_sachgrund','befristet_sachgrundlos','ausbildung','sonstiges'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_arbeitsvertraege_status_check') THEN
    ALTER TABLE hr_arbeitsvertraege ADD CONSTRAINT hr_arbeitsvertraege_status_check
      CHECK (status IN ('aktiv','beendet','abgeloest'));
  END IF;
  -- Befristet heißt: es gibt ein Ende. Unbefristet heißt: es gibt keins. Ein
  -- befristeter Vertrag ohne Ende wäre in der Fristenliste unsichtbar.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_arbeitsvertraege_befristung_ende_check') THEN
    ALTER TABLE hr_arbeitsvertraege ADD CONSTRAINT hr_arbeitsvertraege_befristung_ende_check
      CHECK (vertragsart NOT LIKE 'befristet%' OR ende IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hr_arbeitsvertraege_company_ma_idx ON hr_arbeitsvertraege (company_id, mitarbeiter_id);
CREATE INDEX IF NOT EXISTS hr_arbeitsvertraege_company_ende_idx ON hr_arbeitsvertraege (company_id, ende) WHERE status = 'aktiv';
CREATE INDEX IF NOT EXISTS hr_arbeitsvertraege_company_probezeit_idx ON hr_arbeitsvertraege (company_id, probezeit_bis) WHERE status = 'aktiv';

-- ── Mandantentrennung ───────────────────────────────────────────────────────
ALTER TABLE hr_arbeitsvertraege ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_arbeitsvertraege FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_arbeitsvertraege' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON hr_arbeitsvertraege
      USING (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on')
      WITH CHECK (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on');
  END IF;
END $$;

COMMIT;
