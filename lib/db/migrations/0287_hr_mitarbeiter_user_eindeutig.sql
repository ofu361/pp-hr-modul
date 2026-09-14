-- 0287_hr_mitarbeiter_user_eindeutig.sql
-- Ein Benutzerkonto darf höchstens einem Mitarbeiterdatensatz gehören.
--
-- WARUM: `hr_mitarbeiter.user_id` ist die einzige Verbindung zwischen Login und
-- Mitarbeiter. `/hr/self-service` löst darüber auf und nimmt `.limit(1)` —
-- stehen zwei Datensätze auf demselben Konto, ist nicht vorhersagbar, wessen
-- Gehalt, Urlaub und Beurteilung jemand zu sehen bekommt. Das ist keine
-- Anzeigefrage, sondern eine Offenlegung von Personaldaten an die falsche
-- Person.
--
-- Die Anwendung prüft es seit dem 14.08.2026 selbst (routes/internal/hr/
-- mitarbeiter.ts, `geprueftesKonto`) und liefert dort die verständliche
-- Meldung. Dieser Index ist das Netz darunter: die Prüfung dort ist ein
-- SELECT vor einem INSERT und damit gegen zwei gleichzeitige Anfragen nicht
-- dicht.
--
-- TEILINDEX, nicht UNIQUE-Constraint auf der Spalte: `user_id` ist nullable und
-- bei fast allen Zeilen leer. Ein gewöhnlicher UNIQUE-Constraint ließe zwar
-- beliebig viele NULL zu und täte hier dasselbe — der Teilindex sagt aber
-- ausdrücklich, dass nur gesetzte Verknüpfungen gemeint sind, und bleibt klein.
--
-- ⚠ NICHT company_id mit aufnehmen. Die Eindeutigkeit ist mandantenÜBERgreifend
--   gewollt: ein Konto gehört ohnehin genau einer Firma (users.company_id), und
--   ein Index auf (company_id, user_id) würde dieselbe user_id in zwei Firmen
--   erlauben — also genau den Fall, den `geprueftesKonto` als Erstes abweist.

-- ⚠ Der Index kann an BESTEHENDEN Daten scheitern. Kein unterstützter Pfad hat
--   `user_id` je geschrieben, Doppelungen sind also unwahrscheinlich — aber
--   0051 hat die Spalte zum Abgleich benutzt, sie kann aus einer früheren
--   Codefassung oder von Hand gefüllt sein. Auf der Test-DB ist die Tabelle
--   leer, der Fall ist hier also NICHT nachgewiesen, nur ausgeschlossen werden
--   kann er nicht.
--
--   Deshalb kein nacktes CREATE UNIQUE INDEX: das brächte den ganzen Deploy zum
--   Stehen. Stattdessen wird die Verletzung abgefangen und als WARNUNG mit den
--   betroffenen Konten ausgegeben. Die Anwendungsprüfung greift in jedem Fall;
--   was hier fehlt, ist nur das Netz — und dass es fehlt, steht dann im Log.
--
--   Wer die Warnung sieht, räumt so auf:
--     SELECT user_id, array_agg(id), array_agg(name) FROM hr_mitarbeiter
--      WHERE user_id IS NOT NULL GROUP BY user_id HAVING count(*) > 1;
--   und setzt bei allen bis auf den richtigen Datensatz `user_id = NULL`.
--   Danach diese Datei erneut fahren — sie ist idempotent.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS hr_mitarbeiter_user_id_uq
    ON hr_mitarbeiter (user_id)
    WHERE user_id IS NOT NULL;
EXCEPTION
  WHEN unique_violation THEN
    RAISE WARNING
      'hr_mitarbeiter_user_id_uq NICHT angelegt: mehrere Mitarbeiter teilen sich ein Benutzerkonto. Betroffen: %',
      (SELECT string_agg(user_id::text, ', ')
         FROM (SELECT user_id FROM hr_mitarbeiter
                WHERE user_id IS NOT NULL
                GROUP BY user_id HAVING count(*) > 1) d);
END $$;

-- Suchindex für den umgekehrten Weg: `/hr/self-service` fragt je Anfrage
-- `WHERE company_id = ? AND user_id = ?`. Der Teilindex oben deckt das nur
-- teilweise ab (führende Spalte user_id, aber ohne company_id), und der Zugriff
-- läuft bei jedem Seitenaufruf eines Mitarbeiters.
CREATE INDEX IF NOT EXISTS hr_mitarbeiter_company_user_idx
  ON hr_mitarbeiter (company_id, user_id)
  WHERE user_id IS NOT NULL;
