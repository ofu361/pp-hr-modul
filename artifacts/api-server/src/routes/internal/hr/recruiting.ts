// © 2026 P&P Group. Proprietary & Confidential.
// HR — Recruiting: Stellenangebote + Bewerber
import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, hrStellungen, hrBewerber } from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { WRITE_ROLES, APPROVE_ROLES, cid } from "./shared.js";

const router: IRouter = Router();

// ── STELLENANGEBOTE ───────────────────────────────────────────────────────────

router.get("/hr/stellungen", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(hrStellungen)
    .where(eq(hrStellungen.companyId, cid(req)))
    .orderBy(desc(hrStellungen.createdAt));
  res.json(rows);
});

router.post("/hr/stellungen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.title) throw badRequest("Titel erforderlich");
  const [created] = await db.insert(hrStellungen).values({
    companyId:      cid(req),
    title:          String(b.title),
    department:     b.department ? String(b.department) : undefined,
    description:    b.description ? String(b.description) : undefined,
    requirements:   b.requirements ? String(b.requirements) : undefined,
    employmentType: b.employmentType ? String(b.employmentType) : undefined,
    salaryMin:      b.salaryMin ? Number(b.salaryMin) : undefined,
    salaryMax:      b.salaryMax ? Number(b.salaryMax) : undefined,
    location:       b.location ? String(b.location) : undefined,
    remote:         Boolean(b.remote),
    status:         "offen",
    publishDate:    b.publishDate ? String(b.publishDate) : new Date().toISOString().split("T")[0]!,
    closingDate:    b.closingDate ? String(b.closingDate) : undefined,
  }).returning();
  res.status(201).json(created);
});

router.patch("/hr/stellungen/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const b  = req.body as Record<string, any>;
  const u: Record<string, any> = { updatedAt: new Date() };
  ["title","department","description","requirements","employmentType","salaryMin","salaryMax","location","remote","status","closingDate"].forEach(f => { if (b[f] !== undefined) u[f] = b[f]; });
  const [updated] = await db.update(hrStellungen).set(u)
    .where(and(eq(hrStellungen.id, id), eq(hrStellungen.companyId, cid(req)))).returning();
  if (!updated) throw notFound("Nicht gefunden");
  res.json(updated);
});

router.delete("/hr/stellungen/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  await db.delete(hrStellungen).where(and(eq(hrStellungen.id, parseInt(String(req.params.id))), eq(hrStellungen.companyId, cid(req))));
  res.json({ success: true });
});

// ── BEWERBER ──────────────────────────────────────────────────────────────────

router.get("/hr/bewerber", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({
    id: hrBewerber.id, companyId: hrBewerber.companyId,
    stelleId: hrBewerber.stelleId, stelleTitle: hrStellungen.title,
    name: hrBewerber.name, email: hrBewerber.email, phone: hrBewerber.phone,
    status: hrBewerber.status, notes: hrBewerber.notes, cvNotes: hrBewerber.cvNotes,
    appliedAt: hrBewerber.appliedAt, interviewDate: hrBewerber.interviewDate,
    createdAt: hrBewerber.createdAt,
  })
    .from(hrBewerber)
    .leftJoin(hrStellungen, eq(hrBewerber.stelleId, hrStellungen.id))
    .where(eq(hrBewerber.companyId, cid(req)))
    .orderBy(desc(hrBewerber.createdAt));
  res.json(rows);
});

router.post("/hr/bewerber", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.name) throw badRequest("Name erforderlich");
  const [created] = await db.insert(hrBewerber).values({
    companyId: cid(req),
    stelleId:  b.stelleId ? Number(b.stelleId) : undefined,
    name:      String(b.name),
    email:     b.email ? String(b.email) : undefined,
    phone:     b.phone ? String(b.phone) : undefined,
    status:    "neu",
    notes:     b.notes ? String(b.notes) : undefined,
    appliedAt: String(b.appliedAt ?? new Date().toISOString().split("T")[0]!),
  }).returning();
  res.status(201).json(created);
});

router.patch("/hr/bewerber/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const b  = req.body as Record<string, any>;
  const u: Record<string, any> = {};
  ["status","notes","cvNotes","interviewDate","stelleId"].forEach(f => { if (b[f] !== undefined) u[f] = b[f]; });
  const [updated] = await db.update(hrBewerber).set(u)
    .where(and(eq(hrBewerber.id, id), eq(hrBewerber.companyId, cid(req)))).returning();
  if (!updated) throw notFound("Nicht gefunden");
  res.json(updated);
});

export default router;
