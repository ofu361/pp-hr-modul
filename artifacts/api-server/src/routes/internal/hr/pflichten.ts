// © 2026 P&P Group. Proprietary & Confidential.
// HR — Gesetzliche Pflichten (0436): § 34c-Weiterbildung und BEM.
import { Router, type IRouter } from "express";
import { and, eq, desc, gte } from "drizzle-orm";
import { db, hrMitarbeiter, hrWeiterbildung, hrUrlaub, hrPersonalakte } from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { weiterbildungsstand, bemPruefung, MABV_STUNDEN_SOLL, BEM_SCHWELLE_ARBEITSTAGE } from "../../../lib/hr/pflichten.js";
import { cid, uid } from "./shared.js";

const router: IRouter = Router();
const heute = () => new Date().toISOString().slice(0, 10);
const istDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ═══════════════════════════════════════════════════════════════════════════════
// § 34c — WEITERBILDUNG
// ═══════════════════════════════════════════════════════════════════════════════

/** Übersicht: alle Pflichtigen mit Stand, plus Nicht-Pflichtige mit Stunden (Vollständigkeit). */
router.get("/hr/weiterbildung", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const tag = heute();
  const [mitarbeiter, eintraege] = await Promise.all([
    db.select().from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)),
    db.select().from(hrWeiterbildung).where(eq(hrWeiterbildung.companyId, companyId)),
  ]);
  const aktive = mitarbeiter.filter((m) => !m.endDate || m.endDate >= tag);
  const fuerStand = eintraege.map((e) => ({ mitarbeiterId: e.mitarbeiterId, datum: e.datum, stunden: Number(e.stunden), mabvRelevant: e.mabvRelevant }));
  const staende = aktive.map((m) => ({
    ...weiterbildungsstand({ id: m.id, startDate: m.startDate, mabvPflichtig: m.mabvPflichtig }, fuerStand, tag),
    name: m.name, jobTitle: m.jobTitle, abteilung: m.abteilung,
    stundenGesamt: Math.round(fuerStand.filter((e) => e.mitarbeiterId === m.id).reduce((s, e) => s + e.stunden, 0) * 100) / 100,
  }));
  const rang: Record<string, number> = { im_rueckstand: 0, knapp: 1, auf_kurs: 2, erfuellt: 3, nicht_pflichtig: 4 };
  staende.sort((a, b) => (a.vorzeitraumVerfehlt ? -1 : 0) - (b.vorzeitraumVerfehlt ? -1 : 0) || rang[a.lage]! - rang[b.lage]! || a.rest - b.rest);
  res.json({
    stichtag: tag, soll: MABV_STUNDEN_SOLL,
    zusammenfassung: {
      pflichtig: staende.filter((s) => s.pflichtig).length,
      erfuellt: staende.filter((s) => s.lage === "erfuellt").length,
      imRueckstand: staende.filter((s) => s.lage === "im_rueckstand" || s.lage === "knapp").length,
      verstoesse: staende.filter((s) => s.vorzeitraumVerfehlt).length,
      // Wer Makler/Verwalter im Titel trägt, aber nicht als pflichtig markiert ist — die Lücke, die man übersieht.
      vermutlichPflichtig: aktive.filter((m) => !m.mabvPflichtig && /makler|verwalt|vermiet|weg/i.test(m.jobTitle)).map((m) => ({ id: m.id, name: m.name, jobTitle: m.jobTitle })),
    },
    staende,
  });
});

router.get("/hr/mitarbeiter/:id/weiterbildung", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const id = Number(req.params.id);
  const [m] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const eintraege = await db.select().from(hrWeiterbildung).where(and(eq(hrWeiterbildung.companyId, companyId), eq(hrWeiterbildung.mitarbeiterId, id))).orderBy(desc(hrWeiterbildung.datum));
  const stand = weiterbildungsstand({ id: m.id, startDate: m.startDate, mabvPflichtig: m.mabvPflichtig },
    eintraege.map((e) => ({ mitarbeiterId: e.mitarbeiterId, datum: e.datum, stunden: Number(e.stunden), mabvRelevant: e.mabvRelevant })), heute());
  res.json({ stand, eintraege });
});

router.post("/hr/mitarbeiter/:id/weiterbildung", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const id = Number(req.params.id);
  const [m] = await db.select({ id: hrMitarbeiter.id }).from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const titel = String(b.titel ?? "").trim();
  if (!titel) throw badRequest("Titel erforderlich");
  if (!istDatum(b.datum)) throw badRequest("Datum als YYYY-MM-DD");
  const stunden = Number(String(b.stunden ?? "").replace(",", "."));
  if (!Number.isFinite(stunden) || stunden <= 0 || stunden > 80) throw badRequest("Stunden: 0,25 bis 80");
  let personalakteId: number | null = null;
  if (b.personalakteId != null && b.personalakteId !== "") {
    const [dok] = await db.select({ id: hrPersonalakte.id }).from(hrPersonalakte).where(and(eq(hrPersonalakte.id, Number(b.personalakteId)), eq(hrPersonalakte.companyId, companyId), eq(hrPersonalakte.mitarbeiterId, id)));
    if (!dok) throw badRequest("Der Nachweis gehört nicht zu diesem Mitarbeiter");
    personalakteId = dok.id;
  }
  const [row] = await db.insert(hrWeiterbildung).values({
    companyId, mitarbeiterId: id, titel, anbieter: b.anbieter ? String(b.anbieter) : null, datum: b.datum,
    stunden: String(Math.round(stunden * 100) / 100), mabvRelevant: b.mabvRelevant === undefined ? true : Boolean(b.mabvRelevant),
    personalakteId, notiz: String(b.notiz ?? ""), erstelltVon: uid(req) || null,
  }).returning();
  res.status(201).json(row);
});

router.delete("/hr/weiterbildung/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [row] = await db.delete(hrWeiterbildung).where(and(eq(hrWeiterbildung.id, Number(req.params.id)), eq(hrWeiterbildung.companyId, cid(req)))).returning({ id: hrWeiterbildung.id });
  if (!row) throw notFound("Nicht gefunden");
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════════════════
// BEM — § 167 Abs. 2 SGB IX
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠ Gesundheitsdatum: nur manage_hr, nicht view_hr_reports.

router.get("/hr/bem", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const tag = heute();
  const vor = new Date(); vor.setUTCDate(vor.getUTCDate() - 400);
  const [mitarbeiter, krank] = await Promise.all([
    db.select({ id: hrMitarbeiter.id, name: hrMitarbeiter.name, jobTitle: hrMitarbeiter.jobTitle, abteilung: hrMitarbeiter.abteilung, endDate: hrMitarbeiter.endDate })
      .from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)),
    db.select({ mitarbeiterId: hrUrlaub.mitarbeiterId, startDate: hrUrlaub.startDate, endDate: hrUrlaub.endDate, days: hrUrlaub.days, status: hrUrlaub.status, type: hrUrlaub.type })
      .from(hrUrlaub).where(and(eq(hrUrlaub.companyId, companyId), eq(hrUrlaub.type, "krank"), gte(hrUrlaub.endDate, vor.toISOString().slice(0, 10)))),
  ]);
  const pruefungen = mitarbeiter.filter((m) => !m.endDate || m.endDate >= tag)
    .map((m) => ({ ...bemPruefung(m.id, krank, tag), name: m.name, jobTitle: m.jobTitle, abteilung: m.abteilung }))
    .filter((p) => p.krankArbeitstage > 0)
    .sort((a, b) => b.krankArbeitstage - a.krankArbeitstage);
  res.json({
    stichtag: tag, schwelle: BEM_SCHWELLE_ARBEITSTAGE,
    pflicht: pruefungen.filter((p) => p.pflicht),
    // Wer nahe an der Schwelle ist — ab 20 Tagen lohnt das Gespräch, bevor es Pflicht wird.
    naheSchwelle: pruefungen.filter((p) => !p.pflicht && p.krankArbeitstage >= 20),
    uebrige: pruefungen.filter((p) => !p.pflicht && p.krankArbeitstage < 20).length,
    hinweis: "Die Pflicht trifft den Arbeitgeber: BEM ist ein Angebot an den Mitarbeiter, kein Verfahren gegen ihn. Ablehnung ist zulässig und zu dokumentieren.",
  });
});

export default router;
