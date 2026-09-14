BEGIN;
-- HR — Persönlichkeitsprofile (Arbeitsstil, Stärken, Teamrolle).
--
-- ⚠ DAS SIND DIE SENSIBELSTEN DATEN IM HR-MODUL. Ein Gehalt ist eine Zahl;
--   ein Persönlichkeitsprofil ist ein Urteil über einen Menschen. Drei Regeln,
--   die deshalb in der Tabelle stehen und nicht nur in einer Richtlinie:
--
--   1. EINWILLIGUNG IST PFLICHT. `einwilligung_am` ist NOT NULL. Ein Profil
--      ohne dokumentierte Zustimmung des Mitarbeiters lässt sich nicht anlegen
--      — nicht, weil die Software es verbietet, sondern weil Art. 6 DSGVO es
--      verlangt und § 94 BetrVG bei Fragebögen den Betriebsrat beteiligt.
--   2. QUELLE IST PFLICHT. Selbsteinschätzung, Fremdeinschätzung, Test oder
--      KI-Entwurf — ein Profil ohne Herkunft liest sich wie eine Tatsache.
--   3. KEIN SCORE OHNE METHODE. Die Dimensionen liegen als JSON je Methode
--      (DISG, Big Five, frei), damit sich Zahlen verschiedener Verfahren nicht
--      still in einer Spalte mischen.
--
-- Was hier NICHT liegt: Gesundheitsdaten, Religion, Herkunft, sexuelle
-- Orientierung — Art. 9 DSGVO. Die Maske fragt nichts davon ab, und ein
-- Freitext, der es enthält, gehört gelöscht, nicht gespeichert.

CREATE TABLE IF NOT EXISTS hr_persoenlichkeitsprofile (
  id                  serial PRIMARY KEY,
  company_id          integer NOT NULL,
  mitarbeiter_id      integer NOT NULL,
  -- disg | big_five | staerken | frei
  methode             text    NOT NULL DEFAULT 'frei',
  -- Skalenwerte 0–100 je Dimension, Schlüssel je Methode
  -- (disg: dominant/initiativ/stetig/gewissenhaft; big_five: offenheit/
  -- gewissenhaftigkeit/extraversion/vertraeglichkeit/neurotizismus).
  dimensionen         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  staerken            text[]  NOT NULL DEFAULT '{}',
  entwicklungsfelder  text[]  NOT NULL DEFAULT '{}',
  arbeitsstil         text,
  teamrolle           text,
  -- selbsteinschaetzung | fremdeinschaetzung | test | ki_entwurf
  quelle              text    NOT NULL,
  erhoben_am          date    NOT NULL,
  einwilligung_am     date    NOT NULL,
  -- hr | fuehrungskraft | selbst — wer das Profil sehen darf. Standard: nur HR.
  sichtbar_fuer       text    NOT NULL DEFAULT 'hr',
  -- KI-Entwurf aus Beurteilungstexten: bleibt als Herkunft stehen, auch wenn
  -- der Mensch daraus etwas anderes gemacht hat.
  ki_entwurf          jsonb,
  notiz               text    NOT NULL DEFAULT '',
  erstellt_von        integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_persoenlichkeitsprofile_company_id_companies_id_fk') THEN
    ALTER TABLE hr_persoenlichkeitsprofile ADD CONSTRAINT hr_persoenlichkeitsprofile_company_id_companies_id_fk
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_persoenlichkeitsprofile_mitarbeiter_id_hr_mitarbeiter_id_fk') THEN
    ALTER TABLE hr_persoenlichkeitsprofile ADD CONSTRAINT hr_persoenlichkeitsprofile_mitarbeiter_id_hr_mitarbeiter_id_fk
      FOREIGN KEY (mitarbeiter_id) REFERENCES hr_mitarbeiter(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_persoenlichkeitsprofile_erstellt_von_users_id_fk') THEN
    ALTER TABLE hr_persoenlichkeitsprofile ADD CONSTRAINT hr_persoenlichkeitsprofile_erstellt_von_users_id_fk
      FOREIGN KEY (erstellt_von) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_persoenlichkeitsprofile_methode_check') THEN
    ALTER TABLE hr_persoenlichkeitsprofile ADD CONSTRAINT hr_persoenlichkeitsprofile_methode_check
      CHECK (methode IN ('disg','big_five','staerken','frei'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_persoenlichkeitsprofile_quelle_check') THEN
    ALTER TABLE hr_persoenlichkeitsprofile ADD CONSTRAINT hr_persoenlichkeitsprofile_quelle_check
      CHECK (quelle IN ('selbsteinschaetzung','fremdeinschaetzung','test','ki_entwurf'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_persoenlichkeitsprofile_sichtbar_check') THEN
    ALTER TABLE hr_persoenlichkeitsprofile ADD CONSTRAINT hr_persoenlichkeitsprofile_sichtbar_check
      CHECK (sichtbar_fuer IN ('hr','fuehrungskraft','selbst'));
  END IF;
  -- Eine Einwilligung, die nach der Erhebung datiert, ist keine Einwilligung.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_persoenlichkeitsprofile_einwilligung_vor_erhebung_check') THEN
    ALTER TABLE hr_persoenlichkeitsprofile ADD CONSTRAINT hr_persoenlichkeitsprofile_einwilligung_vor_erhebung_check
      CHECK (einwilligung_am <= erhoben_am);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS hr_persoenlichkeitsprofile_company_ma_idx ON hr_persoenlichkeitsprofile (company_id, mitarbeiter_id);

ALTER TABLE hr_persoenlichkeitsprofile ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_persoenlichkeitsprofile FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hr_persoenlichkeitsprofile' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON hr_persoenlichkeitsprofile
      USING (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on')
      WITH CHECK (company_id = current_setting('app.company_id', true)::int
             OR current_setting('app.bypass_rls', true) = 'on');
  END IF;
END $$;

COMMIT;
