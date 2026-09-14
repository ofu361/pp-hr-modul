// © 2026 P&P Group. Proprietary & Confidential.
// HR — Personalauswertung je GESELLSCHAFT (Rechtsträger), inkl. Krankheitskosten.
//
// ⚠ WARUM eine eigene Datei und nicht `auswertungen.ts`: dort gruppiert alles
//   nach `company_id`. Das ist der MANDANT, nicht der Rechtsträger — eine
//   Auswertung danach liefert genau eine Zeile und sieht dabei plausibel aus.
//   Die Trennung ist der ganze Zweck dieser Fläche (0427).
import { Router, type IRouter } from "express";
import { and, eq, isNull, or, gte, lte } from "drizzle-orm";
import {
  db, hrMitarbeiter, hrUrlaub, hrKostenParameter, gesellschaften,
} from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest } from "../../../lib/http-errors.js";
import { cid } from "./shared.js";

const router: IRouter = Router();

/** Vollzeit-Wochenstunden, wenn am Satz nichts hinterlegt ist. */
const VZ_STUNDEN = 40;

type Parameter = { arbeitstageProJahr: number; agNebenkostenBp: number; hinterlegt: boolean };

async function ladeParameter(companyId: number, jahr: number): Promise<Parameter> {
  const [p] = await db.select().from(hrKostenParameter)
    .where(and(eq(hrKostenParameter.companyId, companyId), eq(hrKostenParameter.jahr, jahr)))
    .limit(1);
  // Kein Satz hinterlegt → Vorgabewerte, aber das Ergebnis sagt es dazu. Eine
  // gerechnete Zahl ohne Hinweis auf ihre Herkunft ist in dieser Domäne
  // gefährlicher als gar keine.
  if (!p) return { arbeitstageProJahr: 250, agNebenkostenBp: 2000, hinterlegt: false };
  return { arbeitstageProJahr: p.arbeitstageProJahr, agNebenkostenBp: p.agNebenkostenBp, hinterlegt: true };
}

function pruefeJahr(roh: unknown): number {
  const jahr = Number(roh ?? new Date().getFullYear());
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) throw badRequest("Ungültiges Jahr");
  return jahr;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KOSTENPARAMETER
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/kosten-parameter", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const jahr = pruefeJahr(req.query.jahr);
  res.json({ jahr, ...(await ladeParameter(cid(req), jahr)) });
});

router.put("/hr/kosten-parameter", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body ?? {};
  const jahr = pruefeJahr(b.jahr);
  const arbeitstage = Number(b.arbeitstageProJahr);
  const agBp        = Number(b.agNebenkostenBp);
  if (!Number.isInteger(arbeitstage) || arbeitstage < 1 || arbeitstage > 366) throw badRequest("Arbeitstage müssen zwischen 1 und 366 liegen");
  // Obergrenze 100 % — wer 20 statt 2000 einträgt, soll das an der Zahl merken
  // und nicht an einer Auswertung, die zufällig plausibel aussieht.
  if (!Number.isInteger(agBp) || agBp < 0 || agBp > 10000) throw badRequest("AG-Nebenkosten in Basispunkten, 0 bis 10000 (= 0 bis 100 %)");

  const [zeile] = await db.insert(hrKostenParameter)
    .values({ companyId: cid(req), jahr, arbeitstageProJahr: arbeitstage, agNebenkostenBp: agBp, notiz: String(b.notiz ?? "") })
    .onConflictDoUpdate({
      target: [hrKostenParameter.companyId, hrKostenParameter.jahr],
      set: { arbeitstageProJahr: arbeitstage, agNebenkostenBp: agBp, notiz: String(b.notiz ?? ""), updatedAt: new Date() },
    })
    .returning();
  res.json(zeile);
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUSWERTUNG JE GESELLSCHAFT
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/auswertung/gesellschaft", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const jahr = pruefeJahr(req.query.jahr);
  const von  = `${jahr}-01-01`;
  const bis  = `${jahr}-12-31`;

  const parameter = await ladeParameter(companyId, jahr);
  const agFaktor  = 1 + parameter.agNebenkostenBp / 10000;

  const [stamm, mitarbeiter, abwesenheiten] = await Promise.all([
    db.select({ id: gesellschaften.id, nummer: gesellschaften.nummer, name: gesellschaften.name })
      .from(gesellschaften).where(eq(gesellschaften.companyId, companyId)),
    // Im Jahr beschäftigt: Eintritt vor Jahresende UND (kein Austritt oder
    // Austritt nach Jahresbeginn). Wer im Mai gegangen ist, gehört in die
    // Auswertung des Jahres — ihn wegzulassen macht die Kosten kleiner, als
    // sie waren.
    db.select().from(hrMitarbeiter).where(and(
      eq(hrMitarbeiter.companyId, companyId),
      lte(hrMitarbeiter.startDate, bis),
      or(isNull(hrMitarbeiter.endDate), gte(hrMitarbeiter.endDate, von)),
    )),
    db.select({
      mitarbeiterId: hrUrlaub.mitarbeiterId, type: hrUrlaub.type, days: hrUrlaub.days,
    }).from(hrUrlaub).where(and(
      eq(hrUrlaub.companyId, companyId),
      eq(hrUrlaub.status, "genehmigt"),
      gte(hrUrlaub.startDate, von),
      lte(hrUrlaub.startDate, bis),
    )),
  ]);

  // ⚠ Die Abwesenheit zählt am STARTDATUM. Ein Urlaub über den Jahreswechsel
  //   fällt damit ganz ins Startjahr. Bewusst so, weil `hr_urlaub` nur eine
  //   Tagessumme führt und keine Tagesliste; eine anteilige Aufteilung wäre
  //   geraten, nicht gerechnet.
  const jeMitarbeiter = new Map<number, { krankTage: number; krankEpisoden: number; nachArt: Record<string, number> }>();
  for (const a of abwesenheiten) {
    let e = jeMitarbeiter.get(a.mitarbeiterId);
    if (!e) { e = { krankTage: 0, krankEpisoden: 0, nachArt: {} }; jeMitarbeiter.set(a.mitarbeiterId, e); }
    if (a.type === "krank") { e.krankTage += a.days; e.krankEpisoden += 1; }
    e.nachArt[a.type] = (e.nachArt[a.type] ?? 0) + a.days;
  }

  type Zeile = {
    gesellschaftId: number | null; nummer: string | null; name: string;
    mitarbeiter: number; vzae: number;
    ohneGehalt: number;
    jahresbruttoCent: number; vollkostenCent: number; schnittJahresbruttoCent: number | null;
    krankTage: number; krankEpisoden: number; krankKostenCent: number; krankquoteBp: number;
    urlaubTage: number; urlaubsanspruchTage: number;
    abwesenheitNachArt: Record<string, number>;
  };

  const zeilen = new Map<number | null, Zeile>();
  const namen  = new Map<number, { nummer: string; name: string }>();
  for (const g of stamm) namen.set(g.id, { nummer: g.nummer, name: g.name });

  const leer = (id: number | null): Zeile => {
    const g = id != null ? namen.get(id) : undefined;
    return {
      gesellschaftId: id, nummer: g?.nummer ?? null,
      // Die unzugeordneten Sätze bekommen eine eigene, benannte Zeile statt
      // stillschweigend auf die Gesellschaften verteilt zu werden.
      name: g?.name ?? "Ohne Gesellschaft",
      mitarbeiter: 0, vzae: 0, ohneGehalt: 0,
      jahresbruttoCent: 0, vollkostenCent: 0, schnittJahresbruttoCent: null,
      krankTage: 0, krankEpisoden: 0, krankKostenCent: 0, krankquoteBp: 0,
      urlaubTage: 0, urlaubsanspruchTage: 0, abwesenheitNachArt: {},
    };
  };

  for (const m of mitarbeiter) {
    const key = m.gesellschaftId ?? null;
    let z = zeilen.get(key);
    if (!z) { z = leer(key); zeilen.set(key, z); }

    z.mitarbeiter += 1;
    z.vzae += (m.weeklyHours ?? VZ_STUNDEN) / VZ_STUNDEN;
    z.urlaubsanspruchTage += m.urlaubstageProJahr;

    // ⚠ ZWEI Gehaltsfelder. `salary_gross` ist die HR-Linie (Monatsbrutto in
    //   CENT), `monatslohn` die ZeitMind-Linie (Euro, numeric) für die
    //   Lohnbuchung. Sie können auseinanderlaufen; HR hat Vorrang, ZeitMind ist
    //   der Rückfall. Wer nur eines liest, meldet je nach Wahl ein anderes
    //   Ergebnis für dieselbe Firma.
    const monatCent = m.salaryGross ?? (m.monatslohn != null ? Math.round(Number(m.monatslohn) * 100) : null);
    if (monatCent == null) z.ohneGehalt += 1;

    const jahresbrutto = monatCent != null ? monatCent * 12 : 0;
    const vollkosten   = Math.round(jahresbrutto * agFaktor);
    z.jahresbruttoCent += jahresbrutto;
    z.vollkostenCent   += vollkosten;

    const abw = jeMitarbeiter.get(m.id);
    if (abw) {
      z.krankTage     += abw.krankTage;
      z.krankEpisoden += abw.krankEpisoden;
      z.urlaubTage    += abw.nachArt["urlaub"] ?? 0;
      for (const [art, tage] of Object.entries(abw.nachArt)) {
        z.abwesenheitNachArt[art] = (z.abwesenheitNachArt[art] ?? 0) + tage;
      }
      // Die Krankheitskosten hängen am Tagessatz DIESES Mitarbeiters, nicht am
      // Durchschnitt der Gesellschaft — sonst kostet der Krankheitstag eines
      // Werkstudenten so viel wie der eines Geschäftsführers.
      const tagessatz = vollkosten / parameter.arbeitstageProJahr;
      z.krankKostenCent += Math.round(tagessatz * abw.krankTage);
    }
  }

  for (const z of zeilen.values()) {
    const mitGehalt = z.mitarbeiter - z.ohneGehalt;
    z.schnittJahresbruttoCent = mitGehalt > 0 ? Math.round(z.jahresbruttoCent / mitGehalt) : null;
    const sollTage = z.vzae * parameter.arbeitstageProJahr;
    z.krankquoteBp = sollTage > 0 ? Math.round((z.krankTage / sollTage) * 10000) : 0;
    z.vzae = Math.round(z.vzae * 100) / 100;
  }

  // Zugeordnete zuerst nach Vollkosten, die unzugeordnete Zeile immer zuletzt.
  const sortiert = [...zeilen.values()].sort((a, b) => {
    if (a.gesellschaftId == null) return 1;
    if (b.gesellschaftId == null) return -1;
    return b.vollkostenCent - a.vollkostenCent;
  });

  const summe = sortiert.reduce((s, z) => ({
    mitarbeiter: s.mitarbeiter + z.mitarbeiter,
    ohneGehalt:  s.ohneGehalt + z.ohneGehalt,
    vzae:        Math.round((s.vzae + z.vzae) * 100) / 100,
    jahresbruttoCent: s.jahresbruttoCent + z.jahresbruttoCent,
    vollkostenCent:   s.vollkostenCent + z.vollkostenCent,
    krankTage:        s.krankTage + z.krankTage,
    krankKostenCent:  s.krankKostenCent + z.krankKostenCent,
    urlaubTage:       s.urlaubTage + z.urlaubTage,
  }), { mitarbeiter: 0, ohneGehalt: 0, vzae: 0, jahresbruttoCent: 0, vollkostenCent: 0, krankTage: 0, krankKostenCent: 0, urlaubTage: 0 });

  res.json({
    jahr,
    parameter,
    // Ohne diese Zahl liest niemand ab, wie belastbar die Aufteilung ist: 40
    // unzugeordnete von 45 Mitarbeitern machen jede Gesellschaftszeile
    // bedeutungslos, ohne dass man es der Tabelle ansieht.
    zuordnung: {
      gesamt: summe.mitarbeiter,
      ohneGesellschaft: zeilen.get(null)?.mitarbeiter ?? 0,
      ohneGehalt: summe.ohneGehalt,
    },
    zeilen: sortiert,
    summe,
  });
});

export default router;
