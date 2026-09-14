# Integrations-Diffs (main -> feat/hr-auswertung-gesellschaft)

Diese Dateien gehoeren NICHT zum HR-Modul, sondern zur restlichen App.
Sie wurden vom Zweig feat/hr-auswertung-gesellschaft mitgeaendert, damit
Runde 2 (Urlaubskonto/Weiterbildung/Offboarding/BEM) funktioniert.
Wer dieses Extrakt in eine lauffaehige App integrieren will, muss diese
Aenderungen dort manuell nachziehen.

---
## lib/nav/src/baum.ts
```diff
diff --git a/lib/nav/src/baum.ts b/lib/nav/src/baum.ts
index f4cd5cf0..97fb11a9 100644
--- a/lib/nav/src/baum.ts
+++ b/lib/nav/src/baum.ts
@@ -549,11 +549,14 @@ export const WERKZEUGE: readonly Werkzeug[] = [
   { key: "hr-dashboard",         gruppe: "h-personal"  , label: "HR-Dashboard",    beschreibung: "Kennzahlen des Personalbereichs",                             href: "/hr/dashboard", icon: "LayoutDashboard", wachter: "offen" },
 
   { key: "hr-mitarbeiter",       gruppe: "h-personal", label: "Mitarbeiter",       beschreibung: "Mitarbeiterstamm",                                            href: "/hr/mitarbeiter",     icon: "Users",         wachter: "nichtAssistent" },
+  { key: "hr-import",            gruppe: "h-personal", label: "Personalstamm importieren", beschreibung: "CSV aus Lohnabrechnung oder Excel — Vorschau, dann Übernahme",       href: "/hr/import",        icon: "Upload",        wachter: "adminManager" },
+  { key: "hr-offboarding",       gruppe: "h-personal", label: "Offboarding",             beschreibung: "Austritte: Konto sperren, Kalender trennen, Verteiler, Zeugnis",       href: "/hr/offboarding",   icon: "LogOut",        wachter: "adminManager" },
   { key: "hr-personalakte",      gruppe: "h-personal", label: "Personalakte",      beschreibung: "Digitale Personalakte",                                       href: "/hr/personalakte",    icon: "FolderOpen",    wachter: "adminManager" },
   { key: "hr-vertraege",         gruppe: "h-personal", label: "Arbeitsverträge & Fristen", beschreibung: "Probezeiten, Befristungen, § 14 TzBfG, Kündigungsrechner, KI-Auslesung", href: "/hr/vertraege", icon: "FileSignature", wachter: "adminManager" },
   { key: "zeiterfassung",        gruppe: "h-zeit", label: "Zeiterfassung",         beschreibung: "Arbeitszeitkonten, Stundennachweise und ArbZG",               href: "/zeit",               icon: "Clock",        wachter: "adminManager" },
   { key: "zeit-kalender",        gruppe: "h-zeit", label: "Zeitkalender",          beschreibung: "Arbeitszeiten im Kalender",                                   href: "/zeit/kalender",      icon: "Calendar",     wachter: "adminManager" },
   { key: "hr-urlaub",            gruppe: "h-zeit", label: "Urlaub",                beschreibung: "Urlaubsanträge und Kontingente",                              href: "/hr/urlaub",          icon: "Calendar",     wachter: "offen" },
+  { key: "hr-urlaubskonto",      gruppe: "h-zeit", label: "Urlaubskonten",             beschreibung: "Anspruch nach BUrlG, Übertrag mit Verfall, Rest je Mitarbeiter",         href: "/hr/urlaubskonto",  icon: "CalendarDays",  wachter: "adminManager" },
   { key: "hr-abwesenheiten",     gruppe: "h-zeit", label: "Abwesenheiten",         beschreibung: "Krankheit, Sonderurlaub und Freistellung",                    href: "/hr/abwesenheiten",   icon: "CalendarClock",wachter: "adminManager" },
   { key: "hr-schichtplanung",    gruppe: "h-zeit", label: "Schichtplanung",        beschreibung: "Dienst- und Schichtpläne",                                    href: "/hr/schichtplanung",  icon: "Calendar",     wachter: "nichtAssistent" },
 
@@ -565,6 +568,7 @@ export const WERKZEUGE: readonly Werkzeug[] = [
   { key: "hr-onboarding",        gruppe: "h-eintritt", label: "Onboarding",        beschreibung: "Eintritt begleiten und Checklisten abarbeiten",               href: "/hr/onboarding",      icon: "UserPlus",      wachter: "nichtAssistent" },
   { key: "hr-schulungen",        gruppe: "h-eintritt", label: "Schulungen",        beschreibung: "Pflichtschulungen und Nachweise",                             href: "/hr/schulungen",      icon: "ClipboardList", wachter: "offen" },
   { key: "hr-qualifikationen",   gruppe: "h-eintritt", label: "Qualifikationen",   beschreibung: "Nachweise, Zertifikate und Ablaufdaten",                      href: "/hr/qualifikationen", icon: "ClipboardCheck",wachter: "nichtAssistent" },
+  { key: "hr-weiterbildung",     gruppe: "h-eintritt", label: "Weiterbildung § 34c",   beschreibung: "20 Stunden in drei Jahren je Makler und Verwalter (MaBV § 15b)",       href: "/hr/weiterbildung", icon: "GraduationCap", wachter: "adminManager" },
   { key: "hr-beurteilungen",     gruppe: "h-eintritt", label: "Beurteilungen",     beschreibung: "Mitarbeitergespräche und Bewertungen",                        href: "/hr/beurteilungen",   icon: "ClipboardList", wachter: "adminManager" },
   { key: "hr-persoenlichkeit",   gruppe: "h-eintritt", label: "Persönlichkeit & Teamrollen", beschreibung: "Arbeitsstil, Stärken, Teamrollen — nur mit Einwilligung",   href: "/hr/persoenlichkeit", icon: "Brain", wachter: "adminManager" },
 
```

---
## lib/db/src/schema/benachrichtigung-ereignisse.ts
```diff
diff --git a/lib/db/src/schema/benachrichtigung-ereignisse.ts b/lib/db/src/schema/benachrichtigung-ereignisse.ts
index 2b86bd3c..5ce5de57 100644
--- a/lib/db/src/schema/benachrichtigung-ereignisse.ts
+++ b/lib/db/src/schema/benachrichtigung-ereignisse.ts
@@ -15,12 +15,13 @@
 import { NOTIFICATION_TYPES, type NotificationType } from "./notifications";
 
 /** Die drei Abschnitte der Maske — Reihenfolge ist Anzeigereihenfolge. */
-export const BENACHRICHTIGUNG_GRUPPEN = ["vertraege", "aufgaben", "system"] as const;
+export const BENACHRICHTIGUNG_GRUPPEN = ["vertraege", "aufgaben", "personal", "system"] as const;
 export type BenachrichtigungGruppe = (typeof BENACHRICHTIGUNG_GRUPPEN)[number];
 
 export const BENACHRICHTIGUNG_GRUPPEN_LABELS: Record<BenachrichtigungGruppe, string> = {
   vertraege: "Verträge",
   aufgaben:  "Aufgaben",
+  personal:  "Personal",
   system:    "Allgemein und System",
 };
 
@@ -83,6 +84,10 @@ export const BENACHRICHTIGUNG_EREIGNISSE: readonly BenachrichtigungEreignis[] =
   { schluessel: "aufgaben_aktualisiert",       gruppe: "aufgaben",  label: "Mehrere Aufgaben wurden aktualisiert",              email: false, standard: NUR_APP },
 
   // ── Allgemein und System ──────────────────────────────────────────────────
+  { schluessel: "hr_frist",                    gruppe: "personal",  label: "Personalfrist steht an (Probezeit, Befristung, Sachkunde)", email: true,  standard: AN },
+  { schluessel: "hr_offboarding",              gruppe: "personal",  label: "Austritt vorbereiten (Offboarding-Schritte offen)",       email: true,  standard: AN },
+  { schluessel: "hr_bem",                      gruppe: "personal",  label: "BEM-Pflicht erreicht (§ 167 SGB IX)",                     email: false, standard: NUR_APP },
+
   { schluessel: "team_beitritt",               gruppe: "system",    label: "Ein Nutzer ist Ihrem Team beigetreten",             email: true,  standard: AN },
   { schluessel: "webhook_fehlgeschlagen",      gruppe: "system",    label: "Erneuter Versuch des Webhooks fehlgeschlagen",      email: true,  standard: AN },
   { schluessel: "statusreport_monatlich",      gruppe: "system",    label: "Monatlicher Statusreport",                          email: true,  standard: AN },
```

---
## lib/db/src/schema/notifications.ts
```diff
diff --git a/lib/db/src/schema/notifications.ts b/lib/db/src/schema/notifications.ts
index d17a2289..32052279 100644
--- a/lib/db/src/schema/notifications.ts
+++ b/lib/db/src/schema/notifications.ts
@@ -120,6 +120,10 @@ export const NOTIFICATION_TYPES = [
   "team_beitritt",
   "webhook_fehlgeschlagen",
   "statusreport_monatlich",
+  // HR (0436): Fristen (Probezeit, Befristung, § 14, Sachkunde), Offboarding, BEM-Pflicht.
+  "hr_frist",
+  "hr_offboarding",
+  "hr_bem",
 ] as const;
 export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
 
@@ -168,6 +172,9 @@ export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
   team_beitritt:               "Neue Person im Team",
   webhook_fehlgeschlagen:      "Webhook fehlgeschlagen",
   statusreport_monatlich:      "Monatlicher Statusreport",
+  hr_frist:                    "Personal: Frist steht an",
+  hr_offboarding:              "Personal: Austritt vorbereiten",
+  hr_bem:                      "Personal: BEM-Pflicht erreicht",
   nachtrag_faellig:            "Nachtrag zum Mietvertrag fällig",
 };
 
```

---
## artifacts/api-server/src/index.ts
```diff
diff --git a/artifacts/api-server/src/index.ts b/artifacts/api-server/src/index.ts
index 55be03f1..4647767f 100644
--- a/artifacts/api-server/src/index.ts
+++ b/artifacts/api-server/src/index.ts
@@ -44,6 +44,7 @@ import { sendeFaelligeTerminerinnerungen } from "./lib/termin-erinnerungen.js";
 import { abgleichAlle } from "./lib/kalender-sync/abgleich.js";
 import { verarbeiteAnfrageLaeufe } from "./lib/anfrage-laeufe.js";
 import { anfragenTagesberichtLauf } from "./lib/anfragen-tagesbericht.js";
+import { hrTageslauf } from "./lib/hr/tageslauf.js";
 import { anfragenOhneObjektbezugAlarmLauf } from "./lib/anfragen-ohne-objektbezug-alarm.js";
 import { anfragenKennzeichnenLauf } from "./lib/anfragen-kennzeichnen.js";
 import { statistikAboLauf } from "./lib/statistik/abos.js";
@@ -266,6 +267,18 @@ const server = app.listen(port, host, async (err?: Error) => {
     );
   }, 24 * 60 * 60 * 1000);
 
+  // HR-Tageslauf (0436): Fristen → Benachrichtigungen, Abwesenheit → Verteiler,
+  // Offboarding anlegen, BEM-Pflicht melden. Beim Start und täglich; idempotent
+  // über hr_erinnerungen, deshalb ist der Start-Lauf unschädlich.
+  runExclusive("hr-tageslauf", DAILY_JOB_TTL_MS, () => bg(() => hrTageslauf())).catch(err =>
+    logger.warn({ err }, "HR-Tageslauf: Fehler beim Start"),
+  );
+  setInterval(() => {
+    runExclusive("hr-tageslauf", DAILY_JOB_TTL_MS, () => bg(() => hrTageslauf())).catch(err =>
+      logger.warn({ err }, "HR-Tageslauf: Fehler beim täglichen Lauf"),
+    );
+  }, 24 * 60 * 60 * 1000);
+
   // ReportMind: Monats-KPI-Snapshots beim Start und täglich aktualisieren
   // (idempotenter Upsert auf den laufenden Monat — der letzte Lauf des Monats gewinnt).
   runExclusive("reportmind-kpi", DAILY_JOB_TTL_MS, () => bg(() => aktualisiereAlleKPISnapshots())).then(n => {
```

---
## artifacts/api-server/src/services/liquiditaet-prognose.ts
```diff
diff --git a/artifacts/api-server/src/services/liquiditaet-prognose.ts b/artifacts/api-server/src/services/liquiditaet-prognose.ts
index dec63355..e323b4f1 100644
--- a/artifacts/api-server/src/services/liquiditaet-prognose.ts
+++ b/artifacts/api-server/src/services/liquiditaet-prognose.ts
@@ -40,6 +40,8 @@ import {
   mietvertraege,
   liquiditaetSzenarien,
   liquiditaetPositionen,
+  hrMitarbeiter,
+  hrKostenParameter,
 } from "@workspace/db";
 import { OFFENE_POSTEN_STATUS } from "./kreditoren-status.js";
 import { ladeLiquiditaetUebersicht } from "./liquiditaet-uebersicht.js";
@@ -48,7 +50,7 @@ import { ladeTilgungsraten } from "./darlehen-tilgungsplan.js";
 const OFFENE_FORDERUNG_STATUS = ["offen", "teilbezahlt"] as const;
 
 /** Woher ein Betrag in der Woche kommt — gehört an jede Zahl. */
-export type Quelle = "forderung" | "verbindlichkeit" | "miete" | "geplant" | "darlehen";
+export type Quelle = "forderung" | "verbindlichkeit" | "miete" | "geplant" | "darlehen" | "personal";
 
 export interface WochenPosten {
   quelle: Quelle;
@@ -90,6 +92,9 @@ export interface WochenPrognose {
     vertraegeOhneObjekt: number;
     monateBereitsGestellt: number;
     kontenOhneStichtag: number;
+    /** Mitarbeiter im ersten Monat und wie viele davon ohne hinterlegtes Gehalt — die fehlen in der Summe. */
+    personalMitarbeiter: number;
+    personalOhneGehalt: number;
   };
 }
 
@@ -183,7 +188,7 @@ export async function ladeWochenPrognose(
   const eimer: Array<{ ein: number; aus: number; posten: WochenPosten[]; jeQuelle: Record<Quelle, number> }> =
     wochenStart.map(() => ({
       ein: 0, aus: 0, posten: [],
-      jeQuelle: { forderung: 0, verbindlichkeit: 0, miete: 0, geplant: 0, darlehen: 0 },
+      jeQuelle: { forderung: 0, verbindlichkeit: 0, miete: 0, geplant: 0, darlehen: 0, personal: 0 },
     }));
 
   function buche(datum: string, betragCents: number, quelle: Quelle, bezeichnung: string): boolean {
@@ -355,6 +360,49 @@ export async function ladeWochenPrognose(
     buche(r.termin, r.betragCents, "darlehen", `Rate ${r.nr} · ${r.bezeichnung}`);
   }
 
+  // ── 6. Personalkosten (HR, 0427/0436) ─────────────────────────────────────
+  // Die Gehälter sind der größte PLANBARE Abfluss und fehlten trotzdem — weil
+  // sie in HR liegen und nicht in der Buchhaltung. Je Monat im Zeitraum eine
+  // Buchung am Zahltag: Summe der Monatsbrutti aller dann beschäftigten
+  // Mitarbeiter × (1 + AG-Anteil). Beides aus hr_kosten_parameter des Jahres;
+  // ohne Satz gelten 20 % und der 28.
+  //
+  // ⚠ salary_gross ist MONATSbrutto in Cent; monatslohn (ZeitMind) der Rückfall.
+  //   Mitarbeiter ohne beides fehlen in der Summe — die Datenlage zählt sie.
+  let personalOhneGehalt = 0;
+  let personalMitarbeiter = 0;
+  {
+    const alle = await db.select({
+      startDate: hrMitarbeiter.startDate, endDate: hrMitarbeiter.endDate,
+      salaryGross: hrMitarbeiter.salaryGross, monatslohn: hrMitarbeiter.monatslohn,
+    }).from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId));
+    const parameter = await db.select().from(hrKostenParameter).where(eq(hrKostenParameter.companyId, companyId));
+    const paramFuer = (jahr: number) => parameter.find((p) => p.jahr === jahr) ?? { agNebenkostenBp: 2000, zahltag: 28 };
+
+    const s0 = ausYmd(start);
+    for (let k = 0; k < Math.ceil(wochenAnzahl / 4) + 2; k++) {
+      const d = new Date(Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth() + k, 1));
+      const jahr = d.getUTCFullYear();
+      const prm = paramFuer(jahr);
+      const zahltag = ymd(new Date(Date.UTC(jahr, d.getUTCMonth(), Math.min(prm.zahltag, 28))));
+      if (zahltag < start || zahltag > ende) continue;
+      const monatsEnde = ymd(new Date(Date.UTC(jahr, d.getUTCMonth() + 1, 0)));
+      let summe = 0, n = 0, ohne = 0;
+      for (const m of alle) {
+        if (m.startDate > monatsEnde || (m.endDate && m.endDate < zahltag)) continue;
+        n++;
+        const monat = m.salaryGross ?? (m.monatslohn != null ? Math.round(Number(m.monatslohn) * 100) : null);
+        if (monat == null) { ohne++; continue; }
+        summe += monat;
+      }
+      if (k === 0) { personalMitarbeiter = n; personalOhneGehalt = ohne; }
+      if (summe > 0) {
+        const brutto = Math.round(summe * (1 + prm.agNebenkostenBp / 10000));
+        buche(zahltag, -brutto, "personal", `Gehälter ${String(d.getUTCMonth() + 1).padStart(2, "0")}/${jahr} (${n - ohne} MA, inkl. ${(prm.agNebenkostenBp / 100).toFixed(1).replace(".", ",")} % AG-Anteil)`);
+      }
+    }
+  }
+
   // ── Zusammensetzen ────────────────────────────────────────────────────────
   let kumuliert = startCents;
   let tiefstand = startCents;
@@ -398,6 +446,8 @@ export async function ladeWochenPrognose(
       vertraegeOhneObjekt,
       monateBereitsGestellt,
       kontenOhneStichtag: uebersicht.datenlage.ohneStichtag,
+      personalMitarbeiter,
+      personalOhneGehalt,
     },
   };
 }
```

---
## artifacts/pp-ai-assistant/src/App.tsx
```diff
diff --git a/artifacts/pp-ai-assistant/src/App.tsx b/artifacts/pp-ai-assistant/src/App.tsx
index 3718cc53..9ad5f53d 100644
--- a/artifacts/pp-ai-assistant/src/App.tsx
+++ b/artifacts/pp-ai-assistant/src/App.tsx
@@ -339,6 +339,10 @@ const HrGehaltQualifikation = lazy(() => import("@/modules/internal/hr/gehalt-qu
 const HrVertraege = lazy(() => import("@/modules/internal/hr/vertraege"));
 const HrPersoenlichkeit = lazy(() => import("@/modules/internal/hr/persoenlichkeit"));
 const HrMarktgehalt = lazy(() => import("@/modules/internal/hr/marktgehalt"));
+const HrUrlaubskonto = lazy(() => import("@/modules/internal/hr/urlaubskonto"));
+const HrWeiterbildung = lazy(() => import("@/modules/internal/hr/weiterbildung"));
+const HrOffboarding = lazy(() => import("@/modules/internal/hr/offboarding"));
+const HrImport = lazy(() => import("@/modules/internal/hr/import"));
 const HrKiAssistent = lazy(() => import("@/modules/internal/hr/ki-assistent"));
 const HrPostfach = lazy(() => import("@/modules/internal/hr/postfach"));
 const HrSchichtplanung = lazy(() => import("@/modules/internal/hr/schichtplanung"));
@@ -1184,6 +1188,10 @@ function Router() {
         <Route path="/hr/vertraege">{() => <RoleRoute component={() => <HrLayout><HrVertraege /></HrLayout>} allowed={isAdminOrManager} />}</Route>
         <Route path="/hr/persoenlichkeit">{() => <RoleRoute component={() => <HrLayout><HrPersoenlichkeit /></HrLayout>} allowed={isAdminOrManager} />}</Route>
         <Route path="/hr/marktgehalt">{() => <RoleRoute component={() => <HrLayout><HrMarktgehalt /></HrLayout>} allowed={isAdminOrManager} />}</Route>
+        <Route path="/hr/urlaubskonto">{() => <RoleRoute component={() => <HrLayout><HrUrlaubskonto /></HrLayout>} allowed={isAdminOrManager} />}</Route>
+        <Route path="/hr/weiterbildung">{() => <RoleRoute component={() => <HrLayout><HrWeiterbildung /></HrLayout>} allowed={isAdminOrManager} />}</Route>
+        <Route path="/hr/offboarding">{() => <RoleRoute component={() => <HrLayout><HrOffboarding /></HrLayout>} allowed={isAdminOrManager} />}</Route>
+        <Route path="/hr/import">{() => <RoleRoute component={() => <HrLayout><HrImport /></HrLayout>} allowed={isAdminOrManager} />}</Route>
         <Route path="/hr/ki-assistent">{() => <HrLayout><HrKiAssistent /></HrLayout>}</Route>
         <Route path="/hr/postfach">{() => <HrLayout><HrPostfach /></HrLayout>}</Route>
         <Route path="/hr/schichtplanung">{() => <RoleRoute component={() => <HrLayout><HrSchichtplanung /></HrLayout>} allowed={isNotAssistent} />}</Route>
```

---
## artifacts/pp-ai-assistant/src/shared/nav/ikonen.ts
```diff
diff --git a/artifacts/pp-ai-assistant/src/shared/nav/ikonen.ts b/artifacts/pp-ai-assistant/src/shared/nav/ikonen.ts
index 46b8bd2e..38faf567 100644
--- a/artifacts/pp-ai-assistant/src/shared/nav/ikonen.ts
+++ b/artifacts/pp-ai-assistant/src/shared/nav/ikonen.ts
@@ -41,11 +41,11 @@ import {
   // Nachgetragen 03.09.2026: Symbol des Bereichs „Für alle" (baum.ts).
   LayoutGrid,
   // Nachgetragen 11.09.2026: Gehalt × Qualifikation (HR).
-  Award, Brain,
+  Award, Brain, LogOut, GraduationCap,
 } from "lucide-react";
 
 export const IKONEN: Record<string, React.ElementType> = {
-  Award, Brain,
+  Award, Brain, LogOut, GraduationCap,
   Activity, AlertTriangle, ArrowLeftRight, BarChart2, BarChart3, Bot, Briefcase,
   Building2, Calculator, Calendar, CalendarClock, CalendarRange, CheckSquare, ClipboardCheck,
   ClipboardList, Clock, Contact, Euro, FileSearch, FileSignature, FileText,
```

---
## artifacts/pp-ai-assistant/src/modules/internal/buchhaltung/liquiditaet-wochen.tsx
```diff
diff --git a/artifacts/pp-ai-assistant/src/modules/internal/buchhaltung/liquiditaet-wochen.tsx b/artifacts/pp-ai-assistant/src/modules/internal/buchhaltung/liquiditaet-wochen.tsx
index 3589591e..d06da380 100644
--- a/artifacts/pp-ai-assistant/src/modules/internal/buchhaltung/liquiditaet-wochen.tsx
+++ b/artifacts/pp-ai-assistant/src/modules/internal/buchhaltung/liquiditaet-wochen.tsx
@@ -23,7 +23,7 @@ import { toast } from "sonner";
 import { apiFetch } from "@/shared/lib/api";
 import { formatEur, inputToCents } from "@/shared/utils/finance-utils";
 
-type Quelle = "forderung" | "verbindlichkeit" | "miete" | "geplant" | "darlehen";
+type Quelle = "forderung" | "verbindlichkeit" | "miete" | "geplant" | "darlehen" | "personal";
 
 interface Woche {
   von: string; bis: string; kw: number;
@@ -56,6 +56,7 @@ const QUELLE_LABEL: Record<Quelle, string> = {
   miete: "Miete (projiziert)",
   geplant: "Geplant",
   darlehen: "Kapitaldienst",
+  personal: "Gehälter",
 };
 
 function tagKurz(iso: string): string {
```

