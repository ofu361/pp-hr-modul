// © 2026 P&P Group. Proprietary & Confidential.
// HR — Qualifikationen (Katalog + Zuordnungen je Mitarbeiter)
import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, hrQualifikationen, hrMitarbeiterQualifikationen } from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest } from "../../../lib/http-errors.js";
import { APPROVE_ROLES, cid } from "./shared.js";

const router: IRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// QUALIFIKATIONEN
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/qualifikationen", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(hrQualifikationen)
    .where(eq(hrQualifikationen.companyId, cid(req)))
    .orderBy(hrQualifikationen.category, hrQualifikationen.name);
  res.json(rows);
});

router.post("/hr/qualifikationen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.name) throw badRequest("Name erforderlich");
  const [row] = await db.insert(hrQualifikationen).values({
    companyId: cid(req), name: String(b.name),
    category: String(b.category ?? "sonstige"),
    description: b.description ? String(b.description) : undefined,
    renewalRequired: Boolean(b.renewalRequired),
    renewalIntervalMonths: b.renewalIntervalMonths ? Number(b.renewalIntervalMonths) : undefined,
  }).returning();
  res.status(201).json(row);
});

router.delete("/hr/qualifikationen/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  await db.delete(hrQualifikationen)
    .where(and(eq(hrQualifikationen.id, Number(req.params.id)), eq(hrQualifikationen.companyId, cid(req))));
  res.status(204).end();
});

router.get("/hr/mitarbeiter/:id/qualifikationen", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({
    id: hrMitarbeiterQualifikationen.id, mitarbeiterId: hrMitarbeiterQualifikationen.mitarbeiterId,
    qualifikationId: hrMitarbeiterQualifikationen.qualifikationId,
    erworbrenAm: hrMitarbeiterQualifikationen.erworbrenAm,
    ablaufdatum: hrMitarbeiterQualifikationen.ablaufdatum,
    zertifikatNr: hrMitarbeiterQualifikationen.zertifikatNr,
    status: hrMitarbeiterQualifikationen.status, notes: hrMitarbeiterQualifikationen.notes,
    qualifikationName: hrQualifikationen.name, qualifikationCategory: hrQualifikationen.category,
    renewalRequired: hrQualifikationen.renewalRequired,
  }).from(hrMitarbeiterQualifikationen)
    .leftJoin(hrQualifikationen, eq(hrMitarbeiterQualifikationen.qualifikationId, hrQualifikationen.id))
    .where(and(eq(hrMitarbeiterQualifikationen.companyId, cid(req)), eq(hrMitarbeiterQualifikationen.mitarbeiterId, Number(req.params.id))))
    .orderBy(hrMitarbeiterQualifikationen.ablaufdatum);
  res.json(rows);
});

router.post("/hr/mitarbeiter/:id/qualifikationen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.qualifikationId || !b.erworbrenAm) throw badRequest("qualifikationId und erworbrenAm erforderlich");
  const [row] = await db.insert(hrMitarbeiterQualifikationen).values({
    companyId: cid(req), mitarbeiterId: Number(req.params.id),
    qualifikationId: Number(b.qualifikationId), erworbrenAm: String(b.erworbrenAm),
    ablaufdatum: b.ablaufdatum ? String(b.ablaufdatum) : undefined,
    zertifikatNr: b.zertifikatNr ? String(b.zertifikatNr) : undefined,
    status: String(b.status ?? "aktiv"),
    notes: b.notes ? String(b.notes) : undefined,
  }).onConflictDoUpdate({
    target: [hrMitarbeiterQualifikationen.mitarbeiterId, hrMitarbeiterQualifikationen.qualifikationId],
    set: { erworbrenAm: b.erworbrenAm, ablaufdatum: b.ablaufdatum ?? null, zertifikatNr: b.zertifikatNr ?? null, status: b.status ?? "aktiv", notes: b.notes ?? null },
  }).returning();
  res.status(201).json(row);
});

router.delete("/hr/mitarbeiter-qualifikationen/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  await db.delete(hrMitarbeiterQualifikationen)
    .where(and(eq(hrMitarbeiterQualifikationen.id, Number(req.params.id)), eq(hrMitarbeiterQualifikationen.companyId, cid(req))));
  res.status(204).end();
});

export default router;
