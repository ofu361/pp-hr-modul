-- 0286_navigation_hr_einkauf.sql
-- Zieht Abteilungs-Zuweisungen nach, die der Umbau von HR und Einkauf am
-- 14.08.2026 sonst still entwerten würde.
--
-- Zwei verschiedene Fälle, deshalb zwei Teile:
--
--   A) DREI GRUPPENSCHLÜSSEL SIND WEG. `h-uebersicht` und `h-organisation` sind
--      in `h-personal` aufgegangen, `h-abrechnung` in `h-zeit`. Eine Zeile
--      ('gruppe','h-abrechnung') zeigt danach ins Leere, und die Abteilung
--      verliert Gehälter und DATEV-Export — ohne Fehler, weil
--      `aufgeloesteWerkzeuge()` (zuweisung.ts) unbekannte Werte absichtlich
--      übergeht. Gleiches Muster wie 0285.
--
--   B) `b-einkauf` BLEIBT, SCHRUMPFT ABER. Die Gruppe trug 15 Werkzeuge — mehr
--      als jede andere im Baum — und ist in drei Schritte des
--      Beschaffungsablaufs geteilt: `b-einkauf` (beschaffen, 6),
--      `b-freigaben` (freigeben, 4), `b-vertraege` (binden, 5). Der Schlüssel
--      überlebt, neun Werkzeuge wandern aus.
--
--      Das ist die heimtückischere Hälfte: eine Zeile ('gruppe','b-einkauf')
--      bleibt GÜLTIG und fällt deshalb auch `unbekannteZuweisungen()` nicht
--      auf. In der Pflegemaske sieht alles in Ordnung aus, und trotzdem fehlen
--      der Abteilung neun Flächen — darunter die Rechnungsfreigabe und die
--      Wartungsverträge. Ein Wegfall meldet sich; ein Schrumpfen nicht.
--
-- UMFANG BLEIBT GLEICH, nicht „ungefähr gleich": zugewiesen werden genau die
-- Werkzeuge, die die alte Gruppe enthielt, nicht die Nachfolgegruppe. `h-zeit`
-- trägt jetzt sieben Werkzeuge, das alte `h-abrechnung` trug zwei — ein
-- Umschreiben auf die Gruppe wäre eine stille Rechteausweitung um fünf Flächen.
-- Dieselbe Begründung wie in 0281 und 0285.
--
-- Auf einer Installation ohne solche Zeilen ist die Datei ein No-op.

-- ── RLS für den eigenen Umzug aufheben ──────────────────────────────────────
-- ⚠ OHNE DIESE ZEILE TUT DIE MIGRATION STILL NICHTS. Wortgleich zu 0281 und
--   0285: `department_navigation` steht unter FORCE ROW LEVEL SECURITY,
--   deploy.sh fährt Migrationen als App-Rolle über `psql "$DATABASE_URL"`, und
--   dort ist `app.company_id` nicht gesetzt. Die Policy greift fail-closed,
--   jedes SELECT sieht null Zeilen — und ein INSERT/DELETE über nichts ist kein
--   Fehler, sondern ein Erfolg über nichts.
SELECT set_config('app.bypass_rls', 'on', false);

-- ── Umzugsplan ──────────────────────────────────────────────────────────────
-- Eine Zeile je (alte Gruppe, Nachfolgegruppe, Werkzeug).
--
-- Die Werkzeuglisten sind der Stand VOR dem Umbau, nachgelesen mit
--   git show <commit>^:…/baum.ts | grep 'gruppe: "h-abrechnung"'
-- und nicht aus dem Gedächtnis. Sie dürfen sich nie wieder ändern — was hier
-- steht, ist Vergangenheit.
DROP TABLE IF EXISTS pg_temp.nav_umzug_0286;
CREATE TEMP TABLE nav_umzug_0286 (
  alt      text    NOT NULL,
  ziel     text    NOT NULL,
  werkzeug text    NOT NULL,
  -- true = die alte Gruppe gibt es nicht mehr (Fall A). false = sie besteht
  -- weiter und hat das Werkzeug nur abgegeben (Fall B) — dann darf ihre Zeile
  -- am Ende NICHT gelöscht werden.
  alt_weg  boolean NOT NULL
);

INSERT INTO nav_umzug_0286 (alt, ziel, werkzeug, alt_weg) VALUES
  -- A) HR: sieben Gruppen auf vier
  ('h-uebersicht',   'h-personal', 'hr',                      true),
  ('h-uebersicht',   'h-personal', 'hr-dashboard',            true),
  ('h-organisation', 'h-personal', 'hr-organigramm',          true),
  ('h-organisation', 'h-personal', 'orgchart',                true),
  ('h-abrechnung',   'h-zeit',     'hr-gehaelter',            true),
  ('h-abrechnung',   'h-zeit',     'hr-datev-export',         true),
  -- Zwei Werkzeuge wechseln innerhalb von HR die Gruppe, ohne dass eine Gruppe
  -- verschwindet: `h-personal` bleibt, gibt aber Qualifikationen und
  -- Beurteilungen an `h-eintritt` ab. Derselbe Schrumpf-Fall wie b-einkauf.
  ('h-personal',     'h-eintritt', 'hr-qualifikationen',      false),
  ('h-personal',     'h-eintritt', 'hr-beurteilungen',        false),
  -- B) Einkauf: 15 Werkzeuge auf drei Gruppen
  ('b-einkauf',      'b-freigaben','freigaben',               false),
  ('b-einkauf',      'b-freigaben','wareneingang',            false),
  ('b-einkauf',      'b-freigaben','einkauf-delegationen',    false),
  ('b-einkauf',      'b-freigaben','einkauf-budget',          false),
  ('b-einkauf',      'b-vertraege','einkauf-rahmenvertraege', false),
  ('b-einkauf',      'b-vertraege','vertraege',               false),
  ('b-einkauf',      'b-vertraege','einkauf-wartung',         false),
  ('b-einkauf',      'b-vertraege','einkauf-maengel',         false),
  ('b-einkauf',      'b-vertraege','einkauf-garantien',       false);

-- ── 1) Ausgewanderte Werkzeuge einzeln zuweisen ─────────────────────────────
-- Gilt für BEIDE Fälle: wer die alte Gruppe hatte, behält ihren Umfang. Nur,
-- wo die Nachfolgegruppe nicht ohnehin schon zugewiesen ist — sonst stünden
-- überflüssige Häkchen in der Pflegemaske.
INSERT INTO department_navigation (company_id, department_id, umfang, wert)
SELECT DISTINCT dn.company_id, dn.department_id, 'werkzeug', u.werkzeug
FROM department_navigation dn
JOIN nav_umzug_0286 u ON u.alt = dn.wert
WHERE dn.umfang = 'gruppe'
  AND NOT EXISTS (
    SELECT 1 FROM department_navigation z
    WHERE z.department_id = dn.department_id
      AND z.umfang = 'gruppe'
      AND z.wert   = u.ziel
  )
ON CONFLICT ON CONSTRAINT department_navigation_unique DO NOTHING;

-- ── 2) Nur die WEGGEFALLENEN Gruppenzeilen entfernen ────────────────────────
-- `alt_weg` trennt die beiden Fälle: `h-abrechnung` gibt es nicht mehr und die
-- Zeile ist Müll; `b-einkauf` und `h-personal` gibt es weiter und ihre Zeilen
-- tragen die verbliebenen Werkzeuge. Ein DELETE darauf nähme der Abteilung die
-- halbe Beschaffung weg.
--
-- Gelöscht wird zudem erst, wenn JEDES Werkzeug der alten Gruppe anderweitig
-- gedeckt ist. Die Bedingung ist absichtlich doppelt zu Schritt 1: liefe der
-- INSERT aus irgendeinem Grund nicht, nimmt der DELETE nichts weg. Eine
-- stehengebliebene Altzeile ist harmlos und in der Maske sichtbar; eine
-- gelöschte Fläche ist es nicht.
DELETE FROM department_navigation dn
WHERE dn.umfang = 'gruppe'
  AND dn.wert IN (SELECT alt FROM nav_umzug_0286 WHERE alt_weg)
  AND NOT EXISTS (
    SELECT 1 FROM nav_umzug_0286 u
    WHERE u.alt = dn.wert
      AND u.alt_weg
      AND NOT EXISTS (
        SELECT 1 FROM department_navigation z
        WHERE z.department_id = dn.department_id
          AND (   (z.umfang = 'gruppe'   AND z.wert = u.ziel)
               OR (z.umfang = 'werkzeug' AND z.wert = u.werkzeug))
      )
  );

DROP TABLE IF EXISTS pg_temp.nav_umzug_0286;

-- Kontext zurücknehmen, damit die Sitzung nicht mit aufgehobener RLS endet.
-- Bei deploy.sh ist jede Migration eine eigene psql-Sitzung, hier also nur
-- Sorgfalt; wer die Datei von Hand in einer offenen Sitzung fährt, ist froh
-- darum.
SELECT set_config('app.bypass_rls', 'off', false);
