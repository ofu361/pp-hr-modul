// © 2026 P&P Group. Proprietary & Confidential.
// HR — Leistungsbeurteilungen + Ziele
import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, hrMitarbeiter, hrBeurteilungen, hrZiele } from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { WRITE_ROLES, APPROVE_ROLES, cid, uid } from "./shared.js";

const router: IRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// LEISTUNGSBEURTEILUNGEN + ZIELE
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/beurteilungen", requireAuth, async (req, res): Promise<void> => {
  const { mitarbeiterId } = req.query as Record<string, string>;
  const conditions: any[] = [eq(hrBeurteilungen.companyId, cid(req))];
  if (mitarbeiterId) conditions.push(eq(hrBeurteilungen.mitarbeiterId, Number(mitarbeiterId)));
  const rows = await db.select({
    id: hrBeurteilungen.id, mitarbeiterId: hrBeurteilungen.mitarbeiterId,
    period: hrBeurteilungen.period, rating: hrBeurteilungen.rating,
    staerken: hrBeurteilungen.staerken, verbesserungen: hrBeurteilungen.verbesserungen,
    zieleNaechstePeriode: hrBeurteilungen.zieleNaechstePeriode,
    notes: hrBeurteilungen.notes, createdAt: hrBeurteilungen.createdAt,
    mitarbeiterName: hrMitarbeiter.name,
  }).from(hrBeurteilungen)
    .leftJoin(hrMitarbeiter, eq(hrBeurteilungen.mitarbeiterId, hrMitarbeiter.id))
    .where(and(...conditions))
    .orderBy(desc(hrBeurteilungen.createdAt));
  res.json(rows);
});

router.post("/hr/beurteilungen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.mitarbeiterId || !b.period) throw badRequest("mitarbeiterId und period erforderlich");
  const [row] = await db.insert(hrBeurteilungen).values({
    companyId: cid(req), mitarbeiterId: Number(b.mitarbeiterId),
    period: String(b.period), rating: Number(b.rating ?? 3),
    staerken: b.staerken ? String(b.staerken) : undefined,
    verbesserungen: b.verbesserungen ? String(b.verbesserungen) : undefined,
    zieleNaechstePeriode: b.zieleNaechstePeriode ? String(b.zieleNaechstePeriode) : undefined,
    notes: b.notes ? String(b.notes) : undefined, createdBy: uid(req) || undefined,
  }).returning();
  res.status(201).json(row);
});

router.patch("/hr/beurteilungen/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  const [row] = await db.update(hrBeurteilungen)
    .set({ rating: b.rating, staerken: b.staerken, verbesserungen: b.verbesserungen, zieleNaechstePeriode: b.zieleNaechstePeriode, notes: b.notes, updatedAt: new Date() })
    .where(and(eq(hrBeurteilungen.id, Number(req.params.id)), eq(hrBeurteilungen.companyId, cid(req))))
    .returning();
  if (!row) throw notFound("Nicht gefunden");
  res.json(row);
});

router.get("/hr/ziele", requireAuth, async (req, res): Promise<void> => {
  const { mitarbeiterId } = req.query as Record<string, string>;
  const conditions: any[] = [eq(hrZiele.companyId, cid(req))];
  if (mitarbeiterId) conditions.push(eq(hrZiele.mitarbeiterId, Number(mitarbeiterId)));
  const rows = await db.select({
    id: hrZiele.id, mitarbeiterId: hrZiele.mitarbeiterId,
    title: hrZiele.title, description: hrZiele.description,
    targetDate: hrZiele.targetDate, status: hrZiele.status,
    progressPct: hrZiele.progressPct, createdAt: hrZiele.createdAt,
    mitarbeiterName: hrMitarbeiter.name,
  }).from(hrZiele)
    .leftJoin(hrMitarbeiter, eq(hrZiele.mitarbeiterId, hrMitarbeiter.id))
    .where(and(...conditions))
    .orderBy(hrZiele.targetDate);
  res.json(rows);
});

router.post("/hr/ziele", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.mitarbeiterId || !b.title) throw badRequest("mitarbeiterId und title erforderlich");
  const [row] = await db.insert(hrZiele).values({
    companyId: cid(req), mitarbeiterId: Number(b.mitarbeiterId),
    title: String(b.title), description: b.description ? String(b.description) : undefined,
    targetDate: b.targetDate ? String(b.targetDate) : undefined,
    status: String(b.status ?? "offen"), progressPct: Number(b.progressPct ?? 0),
  }).returning();
  res.status(201).json(row);
});

router.patch("/hr/ziele/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  const [row] = await db.update(hrZiele)
    .set({ title: b.title, description: b.description, targetDate: b.targetDate, status: b.status, progressPct: b.progressPct, updatedAt: new Date() })
    .where(and(eq(hrZiele.id, Number(req.params.id)), eq(hrZiele.companyId, cid(req))))
    .returning();
  if (!row) throw notFound("Nicht gefunden");
  res.json(row);
});

router.delete("/hr/ziele/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  await db.delete(hrZiele)
    .where(and(eq(hrZiele.id, Number(req.params.id)), eq(hrZiele.companyId, cid(req))));
  res.status(204).end();
});

export default router;
