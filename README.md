# P&P Group Suite — HR-Modul (Personalmodul), Extrakt

Dies ist ein **Snapshot ohne Git-Historie** aus dem Repo `pp-software`
(Fork von PropMind für die P&P Group), zusammengestellt am 2026-09-14.

Quelle:
- `main` @ `2a62d63f`
- überlagert mit dem **unmerged** Zweig `feat/hr-auswertung-gesellschaft`
  @ `3e158fdd` (origin), Runde 1+2: Urlaubskonto, Weiterbildung/§34c-Pflichten,
  Offboarding, BEM (betriebliches Eingliederungsmanagement), Import,
  Mitarbeiterdokumente, Tageslauf-Cron.

Bewusst **ohne** Git-Historie exportiert, weil die Historie des Ursprungs-Repos
zeitweise einen FTP-Zugang enthielt (inzwischen aus allen Zweigen entfernt,
der zugehörige Kennwortwechsel steht aber noch aus) — dieses Extrakt soll
diese Altlast nicht mitschleppen.

## ⚠ Dieses Extrakt ist NICHT eigenständig lauffähig

Das HR-Modul ist Teil eines Monorepos und hängt an gemeinsamer Infrastruktur,
die hier bewusst NICHT mitkopiert wurde:

- Auth-Middleware, Tenant-Isolation (`companies`, `users`), Plan-Gating
- `gesellschaften`-Tabelle (Rechtsträger, in `lib/db/src/schema/dms-wurzeln.ts`)
- generisches DMS (Dokumentenablage), auf das die Personalakte aufsetzt
- generisches Task-System (`aufgaben-mind`), Postfach-Infrastruktur,
  Navigationsbaum (`lib/nav/src/baum.ts`), Benachrichtigungs-Framework
- automatisch generierte API-Clients (`lib/api-zod`, `lib/api-client-react`)

Die Datei `lib/db/src/schema/domains/hr.ts` im Original-Repo bündelt unter dem
Namen „HR-Domäne" mehr als das Personalmodul (u.a. `zeit-mind`, `aufgaben-mind`,
`morgen-mind`, `department-handoffs`) — diese Zusatzmodule sind hier **nicht**
enthalten, da sie auch von anderen Bereichen der App genutzt werden.

Siehe [`integration/geteilte-dateien-diff.md`](integration/geteilte-dateien-diff.md)
für die Änderungen, die Runde 2 an gemeinsam genutzten Dateien vorgenommen hat
(Navigationseinträge, Benachrichtigungstypen, Icon-Registry, Cron-Verdrahtung
in `index.ts`, Liquiditätsprognose) — diese müssten bei einer Reintegration
manuell nachgezogen werden.

## Struktur

```
artifacts/api-server/src/lib/hr/            Fachlogik (Urlaubskonto, Import, Pflichten §34c, Offboarding, Tageslauf-Cron …)
artifacts/api-server/src/routes/internal/hr/ HTTP-Routen
artifacts/api-server/src/routes/domains/hr.ts Domain-Router (mountet u.a. auch NICHT-HR-Router — siehe Hinweis oben)
artifacts/api-server/src/tests/hr-*.test.ts  Tests
artifacts/pp-ai-assistant/src/modules/internal/hr/  Frontend-Seiten
lib/db/src/schema/hr.ts                     Drizzle-Schema (Runde-2-Stand)
lib/db/src/schema/domains/hr.ts             Barrel-Export (bündelt mehr als HR, s.o.)
lib/db/migrations/                          11 HR-Migrationen (0051…0436)
docs/                                       HR-Kapitel aus der Gesamtdokumentation
integration/geteilte-dateien-diff.md        Diffs an gemeinsam genutzten Dateien
```

## Bekannte Platzhalter / Datenschutz-Hinweise

- `auswertungen.ts` (DATEV-Export) lässt IBAN absichtlich leer
  (Kommentar im Code: „nicht in DB gespeichert, datenschutzkonform leer").
- Keine echten Mitarbeiterdaten, keine Zugangsdaten in diesem Extrakt gefunden.
- Das Demo-Seed-Skript (`seed-test-ag.ts`, Platzhalter-Passwort für ein
  passwortloses Demo-Login) wurde **bewusst nicht** mitkopiert.

## Migrationsnummern

Die Nummern (0051…0436) sind Positionsangaben im **Ursprungsrepo** und dort
zentral vergeben (`docs/ops/TODO-PROZESSREGISTER.md`). Bei Wiedereinspielung
in eine andere Codebasis sind sie neu zu vergeben, nicht wörtlich zu
übernehmen.
