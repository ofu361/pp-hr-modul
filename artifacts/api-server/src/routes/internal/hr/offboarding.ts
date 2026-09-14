// © 2026 P&P Group. Proprietary & Confidential.
// HR — Offboarding (0436): Liste je Austritt, Schritte abhaken oder ausführen; Tageslauf von Hand.
import { Router, type IRouter } from "express";
import { and, eq, isNotNull, gte } from "drizzle-orm";
import { db, hrMitarbeiter, hrOffboarding } from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { OFFBOARDING_SCHRITTE, offboardingAnlegen, offboardingBefund, schrittAusfuehren } from "../../../lib/hr/offboarding.js";
import { hrTageslauf } from "../../../lib/hr/tageslauf.js";
import { plusTage } from "../../../lib/hr/vertragsfristen.js";
import { cid, uid } from "./shared.js";

const router: IRouter = Router();
const heute = () => new Date().toISOString().slice(0, 10);

/** Übersicht: alle Austritte der letzten 90 und nächsten 180 Tage mit Fortschritt. */
router.get("/hr/offboarding", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const tag = heute();
  const austritte = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), isNotNull(hrMitarbeiter.endDate), gte(hrMitarbeiter.endDate, plusTage(tag, -90))));
  const schritte = await db.select().from(hrOffboarding).where(eq(hrOffboarding.companyId, companyId));
  const liste = austritte.filter((m) => m.endDate! <= plusTage(tag, 180)).map((m) => {
    const eigene = schritte.filter((s) => s.mitarbeiterId === m.id);
    const offenAuto = eigene.filter((s) => s.status === "offen" && s.automatisch).length;
    return {
      mitarbeiterId: m.id, name: m.name, jobTitle: m.jobTitle, endDate: m.endDate, austrittsgrund: m.austrittsgrund,
      angelegt: eigene.length > 0, gesamt: eigene.length,
      erledigt: eigene.filter((s) => s.status !== "offen").length,
      offeneSicherheitsschritte: offenAuto,
      ausgeschieden: m.endDate! < tag,
      // Ausgeschieden mit offenen Sicherheitsschritten = das Loch, um das es geht.
      kritisch: m.endDate! < tag && offenAuto > 0,
    };
  }).sort((a, b) => (b.kritisch ? 1 : 0) - (a.kritisch ? 1 : 0) || a.endDate!.localeCompare(b.endDate!));
  res.json({ stichtag: tag, schritte: OFFBOARDING_SCHRITTE, liste });
});

router.get("/hr/mitarbeiter/:id/offboarding", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const id = Number(req.params.id);
  const [m] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const [zeilen, befund] = await Promise.all([
    db.select().from(hrOffboarding).where(and(eq(hrOffboarding.companyId, companyId), eq(hrOffboarding.mitarbeiterId, id))),
    offboardingBefund(companyId, id),
  ]);
  const schritte = OFFBOARDING_SCHRITTE.map((d) => ({ ...d, ...(zeilen.find((z) => z.schritt === d.schluessel) ?? { status: "nicht_angelegt", ergebnis: null, erledigtAm: null }) }));
  res.json({ mitarbeiter: { id: m.id, name: m.name, endDate: m.endDate, austrittsgrund: m.austrittsgrund, userId: m.userId }, angelegt: zeilen.length > 0, schritte, befund });
});

router.post("/hr/mitarbeiter/:id/offboarding", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const id = Number(req.params.id);
  const [m] = await db.select({ id: hrMitarbeiter.id, endDate: hrMitarbeiter.endDate }).from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  if (!m.endDate) throw badRequest("Erst das Austrittsdatum am Mitarbeiter eintragen — ohne Austritt kein Offboarding.");
  const n = await offboardingAnlegen(companyId, id);
  res.status(201).json({ angelegt: n });
});

/** Schritt abhaken, als entfallen markieren, wieder öffnen — oder (automatisch) ausführen. */
router.patch("/hr/mitarbeiter/:id/offboarding/:schritt", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const id = Number(req.params.id);
  const schritt = String(req.params.schritt);
  const def = OFFBOARDING_SCHRITTE.find((s) => s.schluessel === schritt);
  if (!def) throw badRequest("Unbekannter Schritt");
  const [zeile] = await db.select().from(hrOffboarding).where(and(eq(hrOffboarding.companyId, companyId), eq(hrOffboarding.mitarbeiterId, id), eq(hrOffboarding.schritt, schritt)));
  if (!zeile) throw notFound("Offboarding nicht angelegt");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const aktion = String(b.aktion ?? "");

  if (aktion === "ausfuehren") {
    if (!def.automatisch) throw badRequest("Dieser Schritt ist nicht automatisch");
    const ergebnis = await schrittAusfuehren(companyId, id, schritt);
    const [neu] = await db.update(hrOffboarding).set({ status: "erledigt", ergebnis, erledigtAm: new Date(), erledigtVon: uid(req) || null }).where(eq(hrOffboarding.id, zeile.id)).returning();
    res.json(neu); return;
  }
  const status = aktion === "erledigt" ? "erledigt" : aktion === "entfaellt" ? "entfaellt" : aktion === "oeffnen" ? "offen" : null;
  if (!status) throw badRequest("Aktion: ausfuehren, erledigt, entfaellt oder oeffnen");
  const [neu] = await db.update(hrOffboarding).set({
    status, ergebnis: b.notiz ? String(b.notiz).slice(0, 1000) : zeile.ergebnis,
    erledigtAm: status === "offen" ? null : new Date(), erledigtVon: status === "offen" ? null : uid(req) || null,
  }).where(eq(hrOffboarding.id, zeile.id)).returning();
  res.json(neu);
});

/** Tageslauf von Hand — für die Firma des Aufrufers ist das Ergebnis dasselbe wie nachts. */
router.post("/hr/tageslauf", requireAuth, requirePermission("manage_hr"), async (_req, res): Promise<void> => {
  res.json(await hrTageslauf());
});

export default router;
