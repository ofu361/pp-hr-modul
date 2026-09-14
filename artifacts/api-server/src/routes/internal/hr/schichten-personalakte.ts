// © 2026 P&P Group. Proprietary & Confidential.
// HR — Schichten/Dienstplan + Personalakte (Dokumente je Mitarbeiter)
import { Router, type IRouter } from "express";
import { and, eq, desc, gte, lte } from "drizzle-orm";
import { db, hrMitarbeiter, hrSchichten, hrPersonalakte } from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { WRITE_ROLES, APPROVE_ROLES, cid, uid } from "./shared.js";

const router: IRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// SCHICHTEN / DIENSTPLAN
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/schichten", requireAuth, async (req, res): Promise<void> => {
  const { von, bis, mitarbeiterId } = req.query as Record<string, string>;
  const conditions: any[] = [eq(hrSchichten.companyId, cid(req))];
  if (von)  conditions.push(gte(hrSchichten.date, von));
  if (bis)  conditions.push(lte(hrSchichten.date, bis));
  if (mitarbeiterId) conditions.push(eq(hrSchichten.mitarbeiterId, Number(mitarbeiterId)));
  const rows = await db.select({
    id: hrSchichten.id, companyId: hrSchichten.companyId,
    mitarbeiterId: hrSchichten.mitarbeiterId, date: hrSchichten.date,
    startTime: hrSchichten.startTime, endTime: hrSchichten.endTime,
    shiftType: hrSchichten.shiftType, status: hrSchichten.status,
    notes: hrSchichten.notes, createdAt: hrSchichten.createdAt,
    mitarbeiterName: hrMitarbeiter.name,
  }).from(hrSchichten)
    .leftJoin(hrMitarbeiter, eq(hrSchichten.mitarbeiterId, hrMitarbeiter.id))
    .where(and(...conditions))
    .orderBy(hrSchichten.date, hrSchichten.startTime);
  res.json(rows);
});

router.post("/hr/schichten", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.mitarbeiterId || !b.date) throw badRequest("mitarbeiterId und date erforderlich");
  const [row] = await db.insert(hrSchichten).values({
    companyId: cid(req), mitarbeiterId: Number(b.mitarbeiterId),
    date: String(b.date), startTime: String(b.startTime ?? "08:00"),
    endTime: String(b.endTime ?? "17:00"), shiftType: String(b.shiftType ?? "normal"),
    status: String(b.status ?? "geplant"), notes: b.notes ? String(b.notes) : undefined,
    createdBy: uid(req) || undefined,
  }).returning();
  res.status(201).json(row);
});

router.patch("/hr/schichten/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  const [row] = await db.update(hrSchichten)
    .set({ startTime: b.startTime, endTime: b.endTime, shiftType: b.shiftType, status: b.status, notes: b.notes, updatedAt: new Date() })
    .where(and(eq(hrSchichten.id, Number(req.params.id)), eq(hrSchichten.companyId, cid(req))))
    .returning();
  if (!row) throw notFound("Nicht gefunden");
  res.json(row);
});

router.delete("/hr/schichten/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [row] = await db.delete(hrSchichten)
    .where(and(eq(hrSchichten.id, Number(req.params.id)), eq(hrSchichten.companyId, cid(req))))
    .returning({ id: hrSchichten.id });
  if (!row) throw notFound("Nicht gefunden");
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERSONALAKTE (Dokumente je Mitarbeiter)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/personalakte/:mitarbeiterId", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(hrPersonalakte)
    .where(and(eq(hrPersonalakte.companyId, cid(req)), eq(hrPersonalakte.mitarbeiterId, Number(req.params.mitarbeiterId))))
    .orderBy(desc(hrPersonalakte.createdAt));
  res.json(rows);
});

router.post("/hr/personalakte/:mitarbeiterId", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.title) throw badRequest("Titel erforderlich");
  const [row] = await db.insert(hrPersonalakte).values({
    companyId: cid(req), mitarbeiterId: Number(req.params.mitarbeiterId),
    docType: String(b.docType ?? "sonstiges"), title: String(b.title),
    fileUrl: b.fileUrl ? String(b.fileUrl) : undefined,
    expiresAt: b.expiresAt ? String(b.expiresAt) : undefined,
    notes: b.notes ? String(b.notes) : undefined, uploadedBy: uid(req) || undefined,
  }).returning();
  res.status(201).json(row);
});

router.delete("/hr/personalakte/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [row] = await db.delete(hrPersonalakte)
    .where(and(eq(hrPersonalakte.id, Number(req.params.id)), eq(hrPersonalakte.companyId, cid(req))))
    .returning({ id: hrPersonalakte.id });
  if (!row) throw notFound("Nicht gefunden");
  res.status(204).end();
});

export default router;
