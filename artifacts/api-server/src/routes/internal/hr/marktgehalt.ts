// © 2026 P&P Group. Proprietary & Confidential.
// HR — Marktgehälter erfassen und mit den eigenen Bändern vergleichen (0430).
//
// ⚠ Zwei Einheiten treffen hier aufeinander: der Markt in JAHRESBRUTTO, das
//   Haus in MONATSBRUTTO (salary_gross). Der Vergleich rechnet intern ×12 und
//   auf Vollzeit — beides steht in der Antwort, damit die Maske es dazusagt.
import { Router, type IRouter } from "express";
import { and, eq, isNull, or, gte, desc } from "drizzle-orm";
import { db, hrMitarbeiter, hrMarktgehaelter } from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { stellengruppe } from "../../../lib/hr/stellengruppe.js";
import { cid, uid } from "./shared.js";

const router: IRouter = Router();
const VZ_STUNDEN = 40;

function median(werte: number[]): number | null {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

function felder(b: Record<string, unknown>, teil: boolean) {
  const u: Record<string, unknown> = {};
  if (b.anzeige !== undefined || b.stellengruppe !== undefined) {
    const anzeige = String(b.anzeige ?? b.stellengruppe ?? "").trim();
    if (!anzeige) throw badRequest("Stellengruppe erforderlich");
    u.anzeige = anzeige; u.stellengruppe = stellengruppe(anzeige);
  }
  if (b.region !== undefined) u.region = String(b.region).trim() || "Deutschland";
  if (b.quelle !== undefined) { const q = String(b.quelle).trim(); if (!q) throw badRequest("Quelle erforderlich"); u.quelle = q; }
  if (b.jahr !== undefined) { const j = Number(b.jahr); if (!Number.isInteger(j) || j < 2000 || j > 2100) throw badRequest("Jahr ungültig"); u.jahr = j; }
  for (const k of ["jahresbruttoP25Cent", "jahresbruttoMedianCent", "jahresbruttoP75Cent"] as const) {
    if (b[k] === undefined) continue;
    if (b[k] === null || b[k] === "") { if (k !== "jahresbruttoMedianCent") u[k] = null; continue; }
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < 0) throw badRequest(`${k}: ganze Zahl in Cent`);
    u[k] = n;
  }
  if (u.jahresbruttoMedianCent != null) {
    const med = u.jahresbruttoMedianCent as number;
    // Der CHECK in der DB fängt das auch, aber mit einer Meldung, die niemand liest.
    if (med < 1_000_000) throw badRequest("Der Median liegt unter 10.000 € — Jahresbrutto in Cent erwartet (z. B. 4.800.000 für 48.000 €). Monatswert oder Euro statt Cent?");
    if (med > 100_000_000) throw badRequest("Der Median liegt über 1 Mio. € — vermutlich Cent doppelt gerechnet.");
    const p25 = u.jahresbruttoP25Cent as number | null | undefined, p75 = u.jahresbruttoP75Cent as number | null | undefined;
    if (p25 != null && p25 > med) throw badRequest("P25 darf nicht über dem Median liegen");
    if (p75 != null && p75 < med) throw badRequest("P75 darf nicht unter dem Median liegen");
  }
  if (b.erfasstAm !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.erfasstAm))) throw badRequest("erfasstAm: YYYY-MM-DD"); u.erfasstAm = b.erfasstAm; }
  if (b.notiz !== undefined) u.notiz = String(b.notiz ?? "").slice(0, 2000);
  if (!teil) {
    for (const k of ["stellengruppe", "quelle", "jahr", "jahresbruttoMedianCent"]) if (u[k] === undefined) throw badRequest(`${k} erforderlich`);
    if (u.erfasstAm === undefined) u.erfasstAm = new Date().toISOString().slice(0, 10);
  }
  return u;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERFASSUNG
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/marktgehaelter", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const rows = await db.select().from(hrMarktgehaelter).where(eq(hrMarktgehaelter.companyId, cid(req)))
    .orderBy(hrMarktgehaelter.stellengruppe, desc(hrMarktgehaelter.jahr));
  res.json(rows);
});

router.post("/hr/marktgehaelter", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const u = felder((req.body ?? {}) as Record<string, unknown>, false);
  const [row] = await db.insert(hrMarktgehaelter)
    .values({ ...(u as any), companyId: cid(req), erstelltVon: uid(req) || null })
    .onConflictDoUpdate({
      target: [hrMarktgehaelter.companyId, hrMarktgehaelter.stellengruppe, hrMarktgehaelter.region, hrMarktgehaelter.quelle, hrMarktgehaelter.jahr],
      set: { ...(u as any), updatedAt: new Date() },
    }).returning();
  res.status(201).json(row);
});

router.patch("/hr/marktgehaelter/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const u = felder((req.body ?? {}) as Record<string, unknown>, true);
  const [row] = await db.update(hrMarktgehaelter).set({ ...(u as any), updatedAt: new Date() })
    .where(and(eq(hrMarktgehaelter.id, Number(req.params.id)), eq(hrMarktgehaelter.companyId, cid(req)))).returning();
  if (!row) throw notFound("Nicht gefunden");
  res.json(row);
});

router.delete("/hr/marktgehaelter/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [row] = await db.delete(hrMarktgehaelter)
    .where(and(eq(hrMarktgehaelter.id, Number(req.params.id)), eq(hrMarktgehaelter.companyId, cid(req)))).returning({ id: hrMarktgehaelter.id });
  if (!row) throw notFound("Nicht gefunden");
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERGLEICH — Haus gegen Markt, je Stellengruppe
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/auswertung/marktvergleich", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const heute = new Date().toISOString().slice(0, 10);
  const [mitarbeiter, markt] = await Promise.all([
    db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), or(isNull(hrMitarbeiter.endDate), gte(hrMitarbeiter.endDate, heute)))),
    db.select().from(hrMarktgehaelter).where(eq(hrMarktgehaelter.companyId, companyId)).orderBy(desc(hrMarktgehaelter.jahr)),
  ]);

  // Haus: Jahresbrutto Vollzeit je Stellengruppe (Median).
  const haus = new Map<string, { anzeige: string; werte: number[]; mitglieder: number }>();
  for (const m of mitarbeiter) {
    const g = stellengruppe(m.jobTitle);
    if (!haus.has(g)) haus.set(g, { anzeige: m.jobTitle.trim() || "Ohne Stellenbezeichnung", werte: [], mitglieder: 0 });
    const h = haus.get(g)!; h.mitglieder += 1;
    const monat = m.salaryGross ?? (m.monatslohn != null ? Math.round(Number(m.monatslohn) * 100) : null);
    if (monat == null) continue;
    const stunden = m.weeklyHours && m.weeklyHours > 0 ? m.weeklyHours : VZ_STUNDEN;
    // ×12 und auf Vollzeit — hier, nirgends sonst.
    h.werte.push(Math.round(monat * 12 * VZ_STUNDEN / stunden));
  }

  // Markt: je Gruppe die jüngste Zeile je Quelle; Median über die Quellen.
  const marktJeGruppe = new Map<string, typeof markt>();
  for (const z of markt) {
    if (!marktJeGruppe.has(z.stellengruppe)) marktJeGruppe.set(z.stellengruppe, []);
    const l = marktJeGruppe.get(z.stellengruppe)!;
    if (!l.some((x) => x.quelle === z.quelle && x.region === z.region)) l.push(z); // nach Jahr desc sortiert → erste = jüngste
  }

  const zeilen = [...haus.entries()].map(([g, h]) => {
    const hausMedian = median(h.werte);
    const quellen = marktJeGruppe.get(g) ?? [];
    const marktMedian = median(quellen.map((q) => q.jahresbruttoMedianCent));
    const p25 = median(quellen.map((q) => q.jahresbruttoP25Cent).filter((x): x is number => x != null));
    const p75 = median(quellen.map((q) => q.jahresbruttoP75Cent).filter((x): x is number => x != null));
    let lage: "unter_p25" | "unter_median" | "im_band" | "ueber_median" | "ueber_p75" | null = null;
    let abweichungBp: number | null = null;
    if (hausMedian != null && marktMedian != null && marktMedian > 0) {
      abweichungBp = Math.round(((hausMedian - marktMedian) / marktMedian) * 10000);
      if (p25 != null && hausMedian < p25) lage = "unter_p25";
      else if (p75 != null && hausMedian > p75) lage = "ueber_p75";
      else if (abweichungBp < -500) lage = "unter_median";
      else if (abweichungBp > 500) lage = "ueber_median";
      else lage = "im_band";
    }
    return {
      stellengruppe: g, anzeige: h.anzeige, mitglieder: h.mitglieder, mitGehalt: h.werte.length,
      hausJahresbruttoMedianCent: hausMedian,
      // Unter drei Gehältern ist der Hausmedian ein Einzelwert — die Maske sagt es dazu.
      hausBelastbar: h.werte.length >= 3,
      markt: quellen.length ? { medianCent: marktMedian, p25Cent: p25, p75Cent: p75, quellen: quellen.map((q) => ({ quelle: q.quelle, region: q.region, jahr: q.jahr, medianCent: q.jahresbruttoMedianCent })) } : null,
      abweichungBp, lage,
    };
  }).sort((a, b) => (a.lage === "unter_p25" ? 0 : a.lage === "unter_median" ? 1 : a.lage == null ? 3 : 2) - (b.lage === "unter_p25" ? 0 : b.lage === "unter_median" ? 1 : b.lage == null ? 3 : 2) || b.mitglieder - a.mitglieder);

  res.json({
    stichtag: heute,
    einheit: "Jahresbrutto Vollzeit in Cent — Haus = Monatsbrutto × 12, auf 40 h gerechnet",
    luecken: {
      gruppen: zeilen.length,
      ohneMarktwert: zeilen.filter((z) => !z.markt).length,
      ohneGehalt: zeilen.filter((z) => z.mitGehalt === 0).length,
      // Marktwerte, die keiner Gruppe im Haus entsprechen — Tippfehler in der Stellengruppe.
      marktOhneHaus: [...marktJeGruppe.keys()].filter((g) => !haus.has(g)),
      aelterAls2Jahre: markt.filter((z) => z.jahr < new Date().getFullYear() - 2).length,
    },
    zeilen,
  });
});

export default router;
