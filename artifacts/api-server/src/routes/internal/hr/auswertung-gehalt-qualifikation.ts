// © 2026 P&P Group. Proprietary & Confidential.
// HR — Gehalt × Qualifikation: was verdienen Träger einer Qualifikation, wo
// steht jeder Mitarbeiter im Gehaltsband seiner Stellengruppe, und wer fällt
// aus dem Rahmen.
//
// ⚠ Drei Dinge, ohne die diese Auswertung systematisch falsch wäre:
//
//   1. VOLLZEIT-NORMIERUNG. Ein Teilzeitgehalt von 2.500 € bei 20 Stunden ist
//      kein „niedriges Gehalt", sondern 5.000 € auf Vollzeit gerechnet. Jeder
//      Vergleich hier läuft über `vollzeitCent`, nie über das Monatsbrutto.
//   2. MEDIAN, nicht Mittelwert. Ein Geschäftsführergehalt in einer Gruppe von
//      fünf zieht den Mittelwert so weit, dass alle anderen „unterbezahlt"
//      erscheinen. Der Median tut das nicht.
//   3. MINDESTGRÖSSE. Ein Gehaltsband aus zwei Personen ist keins. Unter drei
//      Mitgliedern gibt es keine Bandposition und keine Auffälligkeit — lieber
//      „—" als eine Zahl, die etwas behauptet.
//
// Und eine Grenze, die dazugesagt gehört: der „Aufschlag" einer Qualifikation
// ist eine KORRELATION. Träger des Sachkundenachweises verdienen mehr — das
// kann an der Qualifikation liegen oder daran, dass ihn nur die Dienstälteren
// haben. Die Auswertung zeigt den Zusammenhang; die Deutung bleibt beim Menschen.
import { Router, type IRouter } from "express";
import { and, eq, isNull, or, gte } from "drizzle-orm";
import {
  db, hrMitarbeiter, hrQualifikationen, hrMitarbeiterQualifikationen,
} from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { cid } from "./shared.js";
import { stellengruppe } from "../../../lib/hr/stellengruppe.js";

const router: IRouter = Router();

const VZ_STUNDEN = 40;
/** Unter dieser Gruppengröße gibt es kein Band — siehe Kopfkommentar, Punkt 3. */
const MINDESTGROESSE_BAND = 3;
/** Abweichung vom Gruppenmedian, ab der ein Mitarbeiter als auffällig gilt. */
const BAND_TOLERANZ = 0.10;

function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}


router.get("/hr/auswertung/gehalt-qualifikation", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const heute = new Date().toISOString().slice(0, 10);

  const [mitarbeiter, katalog, zuordnungen] = await Promise.all([
    // Nur wer heute im Haus ist: ohne Austritt oder Austritt in der Zukunft.
    db.select().from(hrMitarbeiter).where(and(
      eq(hrMitarbeiter.companyId, companyId),
      or(isNull(hrMitarbeiter.endDate), gte(hrMitarbeiter.endDate, heute)),
    )),
    db.select({ id: hrQualifikationen.id, name: hrQualifikationen.name, category: hrQualifikationen.category })
      .from(hrQualifikationen).where(eq(hrQualifikationen.companyId, companyId)),
    db.select({
      mitarbeiterId: hrMitarbeiterQualifikationen.mitarbeiterId,
      qualifikationId: hrMitarbeiterQualifikationen.qualifikationId,
      ablaufdatum: hrMitarbeiterQualifikationen.ablaufdatum,
      status: hrMitarbeiterQualifikationen.status,
    }).from(hrMitarbeiterQualifikationen).where(eq(hrMitarbeiterQualifikationen.companyId, companyId)),
  ]);

  // ── Qualifikationen je Mitarbeiter, gültig und abgelaufen getrennt ─────────
  // Eine abgelaufene Sachkunde ist keine. Sie zählt nicht in den Vergleich,
  // wird aber am Mitarbeiter ausgewiesen — das ist eine Handlungsaufforderung,
  // kein Gehaltsargument.
  const gueltig    = new Map<number, Set<number>>();
  const abgelaufen = new Map<number, number>();
  for (const z of zuordnungen) {
    const istGueltig = z.status === "aktiv" && (z.ablaufdatum == null || z.ablaufdatum >= heute);
    if (istGueltig) {
      if (!gueltig.has(z.mitarbeiterId)) gueltig.set(z.mitarbeiterId, new Set());
      gueltig.get(z.mitarbeiterId)!.add(z.qualifikationId);
    } else {
      abgelaufen.set(z.mitarbeiterId, (abgelaufen.get(z.mitarbeiterId) ?? 0) + 1);
    }
  }

  // ── Mitarbeiter aufbereiten ─────────────────────────────────────────────────
  type Person = {
    id: number; name: string; jobTitle: string; gruppe: string; abteilung: string | null;
    gesellschaftId: number | null; employmentType: string; weeklyHours: number;
    monatCent: number | null; vollzeitCent: number | null;
    betriebsjahre: number;
    qualifikationen: number; abgelaufen: number; qualifikationIds: number[];
    bandPositionBp: number | null; abweichungBp: number | null;
    auffaellig: "unter_band_trotz_qualifikation" | "ueber_band_ohne_vorsprung" | null;
  };

  const heuteMs = Date.now();
  const personen: Person[] = mitarbeiter.map((m) => {
    // Zwei Gehaltsfelder — HR vor ZeitMind, siehe auswertung-gesellschaft.ts.
    const monatCent = m.salaryGross ?? (m.monatslohn != null ? Math.round(Number(m.monatslohn) * 100) : null);
    const stunden   = m.weeklyHours && m.weeklyHours > 0 ? m.weeklyHours : VZ_STUNDEN;
    const q = gueltig.get(m.id);
    return {
      id: m.id, name: m.name, jobTitle: m.jobTitle, gruppe: stellengruppe(m.jobTitle), abteilung: m.abteilung,
      gesellschaftId: m.gesellschaftId, employmentType: m.employmentType, weeklyHours: stunden,
      monatCent,
      vollzeitCent: monatCent != null ? Math.round(monatCent * VZ_STUNDEN / stunden) : null,
      betriebsjahre: Math.round(((heuteMs - new Date(m.startDate).getTime()) / (365.25 * 86_400_000)) * 10) / 10,
      qualifikationen: q?.size ?? 0, abgelaufen: abgelaufen.get(m.id) ?? 0,
      qualifikationIds: q ? [...q] : [],
      bandPositionBp: null, abweichungBp: null, auffaellig: null,
    };
  });

  // ── Stellengruppen: Band aus Median, Bandposition je Person ─────────────────
  const gruppen = new Map<string, Person[]>();
  for (const p of personen) {
    if (!gruppen.has(p.gruppe)) gruppen.set(p.gruppe, []);
    gruppen.get(p.gruppe)!.push(p);
  }

  const jeStellengruppe = [...gruppen.entries()].map(([g, mitglieder]) => {
    const mitGehalt = mitglieder.filter((p) => p.vollzeitCent != null);
    const gehaelter = mitGehalt.map((p) => p.vollzeitCent!);
    const med       = median(gehaelter);
    const medQuali  = median(mitglieder.map((p) => p.qualifikationen)) ?? 0;
    const bandGueltig = mitGehalt.length >= MINDESTGROESSE_BAND && med != null && med > 0;

    if (bandGueltig) {
      const min = Math.min(...gehaelter), max = Math.max(...gehaelter);
      for (const p of mitGehalt) {
        const v = p.vollzeitCent!;
        p.bandPositionBp = max > min ? Math.round(((v - min) / (max - min)) * 10000) : 5000;
        p.abweichungBp   = Math.round(((v - med!) / med!) * 10000);
        const unter = v < med! * (1 - BAND_TOLERANZ);
        const ueber = v > med! * (1 + BAND_TOLERANZ);
        // Die beiden Kombinationen, die HR sehen will: unterm Band trotz
        // überdurchschnittlicher Qualifikation (Abwanderungsrisiko), überm Band
        // ohne Qualifikationsvorsprung (Erklärungsbedarf). Alles andere ist
        // normale Streuung und bekommt kein Etikett.
        if (unter && p.qualifikationen >= medQuali && p.qualifikationen > 0) p.auffaellig = "unter_band_trotz_qualifikation";
        else if (ueber && p.qualifikationen < medQuali) p.auffaellig = "ueber_band_ohne_vorsprung";
      }
    }

    // Die Anzeige bekommt die häufigste Original-Schreibweise, nicht den Schlüssel.
    const anzeige = mitglieder.map((p) => p.jobTitle.trim()).filter(Boolean)
      .sort((a, b) => mitglieder.filter((p) => p.jobTitle.trim() === b).length - mitglieder.filter((p) => p.jobTitle.trim() === a).length)[0]
      ?? "Ohne Stellenbezeichnung";

    return {
      gruppe: g, anzeige,
      mitglieder: mitglieder.length, mitGehalt: mitGehalt.length,
      bandGueltig,
      medianVollzeitCent: med,
      minVollzeitCent: gehaelter.length ? Math.min(...gehaelter) : null,
      maxVollzeitCent: gehaelter.length ? Math.max(...gehaelter) : null,
      medianQualifikationen: medQuali,
      auffaellig: mitglieder.filter((p) => p.auffaellig != null).length,
    };
  }).sort((a, b) => b.mitglieder - a.mitglieder);

  // ── Je Qualifikation: Träger gegen Nicht-Träger ─────────────────────────────
  const alleMitGehalt = personen.filter((p) => p.vollzeitCent != null);
  const jeQualifikation = katalog.map((q) => {
    const traeger = alleMitGehalt.filter((p) => p.qualifikationIds.includes(q.id));
    const andere  = alleMitGehalt.filter((p) => !p.qualifikationIds.includes(q.id));
    const medT = median(traeger.map((p) => p.vollzeitCent!));
    const medA = median(andere.map((p) => p.vollzeitCent!));
    return {
      qualifikationId: q.id, name: q.name, category: q.category,
      traeger: personen.filter((p) => p.qualifikationIds.includes(q.id)).length,
      traegerMitGehalt: traeger.length,
      medianVollzeitCent: medT,
      minVollzeitCent: traeger.length ? Math.min(...traeger.map((p) => p.vollzeitCent!)) : null,
      maxVollzeitCent: traeger.length ? Math.max(...traeger.map((p) => p.vollzeitCent!)) : null,
      // Aufschlag gegenüber Nicht-Trägern — nur wenn beide Seiten besetzt sind,
      // sonst vergleicht man gegen niemanden.
      aufschlagBp: medT != null && medA != null && medA > 0 && andere.length >= 1
        ? Math.round(((medT - medA) / medA) * 10000) : null,
    };
  }).sort((a, b) => b.traeger - a.traeger);

  res.json({
    stichtag: heute,
    parameter: { vollzeitStunden: VZ_STUNDEN, mindestgroesseBand: MINDESTGROESSE_BAND, bandToleranzBp: Math.round(BAND_TOLERANZ * 10000) },
    // Was der Auswertung fehlt, gehört in die Antwort — nicht in eine Fußnote.
    luecken: {
      mitarbeiter: personen.length,
      ohneGehalt: personen.filter((p) => p.vollzeitCent == null).length,
      ohneQualifikation: personen.filter((p) => p.qualifikationen === 0).length,
      ohneStellenbezeichnung: personen.filter((p) => p.gruppe === "ohne stellenbezeichnung").length,
      mitAbgelaufenen: personen.filter((p) => p.abgelaufen > 0).length,
      gruppenOhneBand: jeStellengruppe.filter((g) => !g.bandGueltig).length,
    },
    jeQualifikation,
    jeStellengruppe,
    mitarbeiter: personen
      .map(({ qualifikationIds: _ids, ...rest }) => rest)
      .sort((a, b) => (a.auffaellig ? 0 : 1) - (b.auffaellig ? 0 : 1) || (b.vollzeitCent ?? 0) - (a.vollzeitCent ?? 0)),
  });
});

export default router;
