// © 2026 P&P Group. Proprietary & Confidential.
// HR — Onboarding-Aufgaben + Schulungen
import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, hrMitarbeiter, hrOnboarding, hrSchulungen } from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { WRITE_ROLES, cid } from "./shared.js";

const router: IRouter = Router();

// ── ONBOARDING ────────────────────────────────────────────────────────────────

router.get("/hr/onboarding", requireAuth, async (req, res): Promise<void> => {
  const mid = req.query.mitarbeiterId ? parseInt(String(req.query.mitarbeiterId)) : undefined;
  const rows = await db.select({
    id: hrOnboarding.id, companyId: hrOnboarding.companyId,
    mitarbeiterId: hrOnboarding.mitarbeiterId,
    mitarbeiterName: hrMitarbeiter.name,
    category: hrOnboarding.category, task: hrOnboarding.task,
    status: hrOnboarding.status, dueDate: hrOnboarding.dueDate,
    completedAt: hrOnboarding.completedAt, notes: hrOnboarding.notes,
    createdAt: hrOnboarding.createdAt,
  })
    .from(hrOnboarding)
    .leftJoin(hrMitarbeiter, eq(hrOnboarding.mitarbeiterId, hrMitarbeiter.id))
    .where(and(
      eq(hrOnboarding.companyId, cid(req)),
      ...(mid ? [eq(hrOnboarding.mitarbeiterId, mid)] : []),
    ))
    .orderBy(hrOnboarding.category, hrOnboarding.createdAt);
  res.json(rows);
});

router.post("/hr/onboarding", requireAuth, async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  // Support bulk create: body can be { tasks: [...] } or single task
  if (Array.isArray(b.tasks)) {
    const values = b.tasks.map((t: any) => ({
      companyId:     cid(req),
      mitarbeiterId: Number(b.mitarbeiterId ?? t.mitarbeiterId),
      category:      String(t.category ?? "sonstiges"),
      task:          String(t.task),
      status:        "offen" as const,
      dueDate:       t.dueDate ? String(t.dueDate) : undefined,
    }));
    const created = await db.insert(hrOnboarding).values(values).returning();
    res.status(201).json(created);
  } else {
    if (!b.mitarbeiterId || !b.task) throw badRequest("mitarbeiterId und task erforderlich");
    const [created] = await db.insert(hrOnboarding).values({
      companyId:     cid(req),
      mitarbeiterId: Number(b.mitarbeiterId),
      category:      String(b.category ?? "sonstiges"),
      task:          String(b.task),
      status:        "offen",
      dueDate:       b.dueDate ? String(b.dueDate) : undefined,
    }).returning();
    res.status(201).json(created);
  }
});

router.patch("/hr/onboarding/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const b  = req.body as Record<string, any>;
  const u: Record<string, any> = {};
  if (b.status !== undefined) {
    u.status = b.status;
    u.completedAt = b.status === "erledigt" ? new Date() : null;
  }
  if (b.notes !== undefined) u.notes = b.notes;
  const [updated] = await db.update(hrOnboarding).set(u)
    .where(and(eq(hrOnboarding.id, id), eq(hrOnboarding.companyId, cid(req)))).returning();
  if (!updated) throw notFound("Nicht gefunden");
  res.json(updated);
});

// ── SCHULUNGEN ────────────────────────────────────────────────────────────────

router.get("/hr/schulungen", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(hrSchulungen)
    .where(eq(hrSchulungen.companyId, cid(req)))
    .orderBy(desc(hrSchulungen.createdAt));
  res.json(rows);
});

router.post("/hr/schulungen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.title) throw badRequest("Titel erforderlich");
  const [created] = await db.insert(hrSchulungen).values({
    companyId:          cid(req),
    title:              String(b.title),
    description:        b.description ? String(b.description) : undefined,
    trainer:            b.trainer ? String(b.trainer) : undefined,
    type:               String(b.type ?? "freiwillig"),
    date:               b.date ? String(b.date) : undefined,
    durationHours:      b.durationHours ? Number(b.durationHours) : undefined,
    location:           b.location ? String(b.location) : undefined,
    status:             "geplant",
    maxParticipants:    b.maxParticipants ? Number(b.maxParticipants) : undefined,
    certificateRequired: Boolean(b.certificateRequired),
  }).returning();
  res.status(201).json(created);
});

router.patch("/hr/schulungen/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const b  = req.body as Record<string, any>;
  const u: Record<string, any> = { updatedAt: new Date() };
  ["title","description","trainer","type","date","durationHours","location","status","maxParticipants","participants","certificateRequired"].forEach(f => { if (b[f] !== undefined) u[f] = b[f]; });
  const [updated] = await db.update(hrSchulungen).set(u)
    .where(and(eq(hrSchulungen.id, id), eq(hrSchulungen.companyId, cid(req)))).returning();
  if (!updated) throw notFound("Nicht gefunden");
  res.json(updated);
});

export default router;
