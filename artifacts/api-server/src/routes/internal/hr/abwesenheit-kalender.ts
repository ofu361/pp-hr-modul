// © 2026 P&P Group. Proprietary & Confidential.
// HR — Abwesenheiten im Kalender: Stand, Nachholen, Teamkalender festlegen (0431).
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, hrUrlaub, hrMitarbeiter, kalenderTokens } from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { abwesenheitAbgleichen, nachholen, ziele } from "../../../lib/hr/abwesenheit-kalender.js";
import { cid } from "./shared.js";

const router: IRouter = Router();

/** Stand: Teamkalender, Mitarbeiter mit/ohne eigene Verbindung, offene Fehler. */
router.get("/hr/abwesenheiten/kalender", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const heute = new Date().toISOString().slice(0, 10);
  const [firmenVerbindungen, mitarbeiter, offen] = await Promise.all([
    db.select({ id: kalenderTokens.id, provider: kalenderTokens.provider, konto: kalenderTokens.konto, kalenderName: kalenderTokens.kalenderName, modus: kalenderTokens.modus, aktiv: kalenderTokens.aktiv, abwesenheitskalender: kalenderTokens.abwesenheitskalender, userId: kalenderTokens.userId })
      .from(kalenderTokens).where(eq(kalenderTokens.companyId, companyId)),
    db.select({ id: hrMitarbeiter.id, name: hrMitarbeiter.name, userId: hrMitarbeiter.userId, endDate: hrMitarbeiter.endDate })
      .from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)),
    db.select({ id: hrUrlaub.id, mitarbeiterId: hrUrlaub.mitarbeiterId, type: hrUrlaub.type, startDate: hrUrlaub.startDate, endDate: hrUrlaub.endDate, status: hrUrlaub.status, kalenderFehler: hrUrlaub.kalenderFehler, kalenderEintraege: hrUrlaub.kalenderEintraege, kalenderAt: hrUrlaub.kalenderAt })
      .from(hrUrlaub).where(and(eq(hrUrlaub.companyId, companyId), sql`${hrUrlaub.endDate} >= ${heute}`)),
  ]);
  const aktive = mitarbeiter.filter((m) => !m.endDate || m.endDate >= heute);
  const mitVerbindung = new Set(firmenVerbindungen.filter((v) => v.aktiv && v.modus === "nutzer").map((v) => v.userId));
  const namen = new Map(mitarbeiter.map((m) => [m.id, m.name]));
  const team = firmenVerbindungen.find((v) => v.abwesenheitskalender) ?? null;

  res.json({
    teamkalender: team,
    // Firmenverbindungen, die als Teamkalender in Frage kommen.
    kandidaten: firmenVerbindungen.filter((v) => v.modus === "firma" && v.aktiv),
    mitarbeiter: {
      aktive: aktive.length,
      ohneKonto: aktive.filter((m) => !m.userId).length,
      mitEigenemKalender: aktive.filter((m) => m.userId && mitVerbindung.has(m.userId)).length,
    },
    abwesenheiten: {
      genehmigt: offen.filter((a) => a.status === "genehmigt").length,
      imKalender: offen.filter((a) => a.status === "genehmigt" && (a.kalenderEintraege as unknown[]).length > 0).length,
      mitFehler: offen.filter((a) => a.kalenderFehler).map((a) => ({ id: a.id, name: namen.get(a.mitarbeiterId) ?? "?", type: a.type, startDate: a.startDate, endDate: a.endDate, fehler: a.kalenderFehler })),
      // Genehmigt, aber nirgends eingetragen — und WARUM nicht.
      ohneEintrag: offen.filter((a) => a.status === "genehmigt" && (a.kalenderEintraege as unknown[]).length === 0 && !a.kalenderFehler)
        .map((a) => ({ id: a.id, name: namen.get(a.mitarbeiterId) ?? "?", type: a.type, startDate: a.startDate, endDate: a.endDate })),
    },
  });
});

/** Teamkalender festlegen (oder mit null aufheben). */
router.put("/hr/abwesenheiten/kalender/team", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const roh = (req.body ?? {}).verbindungId;
  await db.transaction(async (tx) => {
    await tx.update(kalenderTokens).set({ abwesenheitskalender: false, updatedAt: new Date() })
      .where(and(eq(kalenderTokens.companyId, companyId), eq(kalenderTokens.abwesenheitskalender, true)));
    if (roh == null || roh === "") return;
    const id = Number(roh);
    const [v] = await tx.select().from(kalenderTokens).where(and(eq(kalenderTokens.id, id), eq(kalenderTokens.companyId, companyId)));
    if (!v) throw notFound("Verbindung nicht gefunden");
    // Nur eine Firmenverbindung: der private Kalender eines Mitarbeiters kann
    // nicht der Teamkalender aller sein.
    if (v.modus !== "firma") throw badRequest("Der Teamkalender muss eine Firmenverbindung sein (Modus firma), kein persönliches Konto.");
    if (!v.aktiv) throw badRequest("Die Verbindung ist stillgelegt.");
    await tx.update(kalenderTokens).set({ abwesenheitskalender: true, updatedAt: new Date() }).where(eq(kalenderTokens.id, id));
  });
  res.json({ ok: true });
});

/** Einen Eintrag jetzt abgleichen — synchron, mit Ergebnis. */
router.post("/hr/abwesenheiten/:id/kalender", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [u] = await db.select({ id: hrUrlaub.id }).from(hrUrlaub).where(and(eq(hrUrlaub.id, Number(req.params.id)), eq(hrUrlaub.companyId, cid(req))));
  if (!u) throw notFound("Abwesenheit nicht gefunden");
  res.json(await abwesenheitAbgleichen(u.id));
});

/** Alles Offene nachholen. */
router.post("/hr/abwesenheiten/kalender/nachholen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  res.json(await nachholen(cid(req)));
});

/** Welche Ziele ein Mitarbeiter hätte — zur Erklärung in der Maske. */
router.get("/hr/mitarbeiter/:id/kalender-ziele", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const [m] = await db.select({ userId: hrMitarbeiter.userId }).from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, Number(req.params.id)), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const z = await ziele(companyId, m.userId);
  res.json(z.map((x) => ({ ziel: x.ziel, provider: x.verbindung.provider, konto: x.verbindung.konto, kalenderName: x.verbindung.kalenderName })));
});

export default router;
