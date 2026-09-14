// © 2026 P&P Group. Proprietary & Confidential.
// HR — Dokumentgenerator (0436): Vertrag/Nachtrag als PDF, Zeugnis-Entwurf + PDF, Bewerbung aus Mailtext.
import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, hrMitarbeiter, hrArbeitsvertraege, hrBeurteilungen, hrStellungen, companies, gesellschaften } from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { arbeitsvertragPdf, zeugnisEntwurf, zeugnisPdf, bewerbungAusText, type Arbeitgeber } from "../../../lib/hr/dokumente.js";
import { cid } from "./shared.js";

const router: IRouter = Router();

async function arbeitgeberFuer(companyId: number, gesellschaftId: number | null): Promise<Arbeitgeber & { ort: string }> {
  // Der Rechtsträger ist der Arbeitgeber — nicht der Mandant. Ohne Gesellschaft fällt es auf die Firma zurück.
  if (gesellschaftId) {
    const [g] = await db.select().from(gesellschaften).where(and(eq(gesellschaften.id, gesellschaftId), eq(gesellschaften.companyId, companyId)));
    if (g) return { name: g.rechtsform && !g.name.includes(g.rechtsform) ? `${g.name} ${g.rechtsform}` : g.name, strasse: null, ort: g.sitz ?? "" };
  }
  const [c] = await db.select({ name: companies.name, street: companies.street, city: companies.city, zip: companies.zip }).from(companies).where(eq(companies.id, companyId));
  return { name: c?.name ?? "", strasse: c?.street ?? null, ort: [c?.zip, c?.city].filter(Boolean).join(" ") };
}

function pdfSenden(res: import("express").Response, bytes: Uint8Array, dateiname: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${dateiname.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
  res.send(Buffer.from(bytes));
}

// ── Vertrag / Nachtrag ──────────────────────────────────────────────────────
router.get("/hr/vertraege/:id/pdf", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const [v] = await db.select().from(hrArbeitsvertraege).where(and(eq(hrArbeitsvertraege.id, Number(req.params.id)), eq(hrArbeitsvertraege.companyId, companyId)));
  if (!v) throw notFound("Vertrag nicht gefunden");
  const [m] = await db.select().from(hrMitarbeiter).where(eq(hrMitarbeiter.id, v.mitarbeiterId));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const art = req.query.art === "nachtrag" ? "nachtrag" : "vertrag";
  const ag = await arbeitgeberFuer(companyId, m.gesellschaftId);
  const bytes = await arbeitsvertragPdf(ag, m, v, art, ag.ort || "");
  pdfSenden(res, bytes, `${art === "vertrag" ? "Arbeitsvertrag" : "Nachtrag"}_${m.name}_${v.beginn}_ENTWURF.pdf`);
});

// ── Zeugnis ─────────────────────────────────────────────────────────────────
router.post("/hr/mitarbeiter/:id/zeugnis/entwurf", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const [m] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, Number(req.params.id)), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const beurteilungen = await db.select({ period: hrBeurteilungen.period, rating: hrBeurteilungen.rating, staerken: hrBeurteilungen.staerken, verbesserungen: hrBeurteilungen.verbesserungen })
    .from(hrBeurteilungen).where(and(eq(hrBeurteilungen.companyId, companyId), eq(hrBeurteilungen.mitarbeiterId, m.id))).orderBy(desc(hrBeurteilungen.createdAt)).limit(6);
  const b = (req.body ?? {}) as Record<string, unknown>;
  res.json(await zeugnisEntwurf(m, beurteilungen, m.endDate, typeof b.grund === "string" ? b.grund : m.austrittsgrund));
});

router.post("/hr/mitarbeiter/:id/zeugnis/pdf", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const [m] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, Number(req.params.id)), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < 200) throw badRequest("Der Zeugnistext ist zu kurz — ein Zeugnis ohne Leistungsbeurteilung ist keins.");
  const ag = await arbeitgeberFuer(companyId, m.gesellschaftId);
  const datum = typeof b.datum === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.datum) ? b.datum : (m.endDate ?? new Date().toISOString().slice(0, 10));
  pdfSenden(res, await zeugnisPdf(ag, m, text, ag.ort || "", datum), `Arbeitszeugnis_${m.name}_ENTWURF.pdf`);
});

// ── Bewerbung aus Mailtext ──────────────────────────────────────────────────
router.post("/hr/bewerber/aus-text", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < 50) throw badRequest("Zu wenig Text");
  const stellen = await db.select({ id: hrStellungen.id, title: hrStellungen.title }).from(hrStellungen).where(and(eq(hrStellungen.companyId, companyId), eq(hrStellungen.status, "offen")));
  // Vorschlag, kein Insert — angelegt wird über POST /hr/bewerber, nach Sichtung.
  res.json(await bewerbungAusText(text, stellen));
});

export default router;
