// © 2026 P&P Group. Proprietary & Confidential.
// HR — Stats, Mitarbeiter-Stammdaten, Urlaub
import { Router, type IRouter } from "express";
import { and, eq, desc, ne, isNotNull } from "drizzle-orm";
import { db, hrMitarbeiter, hrUrlaub, hrStellungen, users, gesellschaften } from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { WRITE_ROLES, APPROVE_ROLES, cid, uid } from "./shared.js";
import { abwesenheitAbgleichenSpaeter } from "../../../lib/hr/abwesenheit-kalender.js";

const router: IRouter = Router();

// ── Verknüpfung Login ↔ Mitarbeiter ───────────────────────────────────────────
//
// `hr_mitarbeiter.user_id` ist die EINZIGE Verbindung zwischen einem Konto und
// einem Mitarbeiterdatensatz — und wurde bis 14.08.2026 von keinem unterstützten
// Pfad geschrieben: POST setzte sie nicht, in der Feld-Whitelist von PATCH fehlte
// sie, und keine Maske sendete sie. Folge: `/hr/self-service` löst darüber auf
// und lieferte deshalb jedem `notFound`. Jede „eigene Daten"-Funktion im
// Personalbereich war tot, bevor sie geschrieben war, und aus der Oberfläche gab
// es keinen Weg, das zu reparieren.
//
// Zwei Schranken, beide nötig:
//
//   1. MANDANT. Ohne die Prüfung ließe sich ein Mitarbeiter dieser Firma mit
//      einem Konto einer FREMDEN Firma verknüpfen. `users.companyId` ist
//      nullable (Superadmins) — der Vergleich weist `null` korrekt ab.
//   2. EINDEUTIGKEIT. `/hr/self-service` nimmt `.limit(1)`; zwei Datensätze auf
//      demselben Konto hießen, dass sich nicht vorhersagen lässt, wessen Gehalt
//      und Urlaub jemand zu sehen bekommt. Die Datenbank sichert das zusätzlich
//      ab (0287), aber hier kommt die verständliche Meldung her.

/**
 * Prüft das zu verknüpfende Konto und liefert die ID zurück.
 * `null` (oder leer) löst die Verknüpfung — das ist erlaubt und beabsichtigt.
 *
 * @param eigeneId Beim Bearbeiten die eigene Mitarbeiter-ID, damit ein Speichern
 *                 ohne Änderung nicht an der eigenen Zeile scheitert.
 */
/**
 * Prüft, dass die Gesellschaft zu DIESER Firma gehört, und gibt sie zurück.
 *
 * ⚠ Ohne diese Prüfung könnte ein Mandant den Fremdschlüssel auf die
 *   Gesellschaft eines anderen setzen. Die Auswertung filtert den Stamm zwar
 *   nach `company_id` und zeigte die Zeile dann als „Ohne Gesellschaft" —
 *   der Verweis über die Mandantengrenze bliebe aber in der Datenbank stehen
 *   und ginge in jede spätere Auswertung ein, die ihn nicht filtert (0427).
 */
async function gepruefteGesellschaft(
  req: Parameters<typeof cid>[0],
  roh: unknown,
): Promise<number | null> {
  if (roh === null || roh === "") return null;
  const gid = Number(roh);
  if (!Number.isInteger(gid) || gid <= 0) throw badRequest("Ungültige Gesellschaft");
  const [g] = await db.select({ id: gesellschaften.id, companyId: gesellschaften.companyId })
    .from(gesellschaften).where(eq(gesellschaften.id, gid));
  if (!g || g.companyId !== cid(req)) throw badRequest("Diese Gesellschaft gehört nicht zu dieser Firma");
  return gid;
}

async function geprueftesKonto(
  req: Parameters<typeof cid>[0],
  roh: unknown,
  eigeneId?: number,
): Promise<number | null> {
  if (roh === null || roh === "") return null;

  const userId = Number(roh);
  if (!Number.isInteger(userId) || userId <= 0) throw badRequest("Ungültiges Benutzerkonto");

  const companyId = cid(req);
  const [konto] = await db.select({ id: users.id, companyId: users.companyId })
    .from(users).where(eq(users.id, userId));
  if (!konto || konto.companyId !== companyId) {
    throw badRequest("Dieses Benutzerkonto gehört nicht zu dieser Firma");
  }

  const belegt = await db.select({ id: hrMitarbeiter.id, name: hrMitarbeiter.name })
    .from(hrMitarbeiter)
    .where(and(eq(hrMitarbeiter.companyId, companyId), eq(hrMitarbeiter.userId, userId)));
  const fremd = belegt.find(m => m.id !== eigeneId);
  if (fremd) {
    throw badRequest(`Dieses Konto ist bereits mit „${fremd.name}" verknüpft`);
  }

  return userId;
}

/**
 * Auswahlliste für das Feld „verknüpftes Benutzerkonto" in der Mitarbeitermaske.
 *
 * Eigener Endpunkt statt `/api/admin/users`: der steht hinter `requireAdmin`,
 * Mitarbeiter bearbeiten darf aber jede Rolle aus WRITE_ROLES. Ein Auswahlfeld,
 * das für die halbe Zielgruppe leer bleibt, wäre schlimmer als keines.
 *
 * `belegtVon` sagt der Maske, welche Konten schon vergeben sind — sie kann sie
 * ausgrauen, statt den Nutzer in die Fehlermeldung oben laufen zu lassen.
 */
router.get("/hr/benutzer-auswahl", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);

  const [konten, verknuepft] = await Promise.all([
    db.select({
      id: users.id, name: users.name, username: users.username,
      email: users.email, role: users.role, isActive: users.isActive,
    }).from(users).where(eq(users.companyId, companyId)).orderBy(users.name),
    db.select({ mitarbeiterId: hrMitarbeiter.id, name: hrMitarbeiter.name, userId: hrMitarbeiter.userId })
      .from(hrMitarbeiter)
      .where(and(eq(hrMitarbeiter.companyId, companyId), isNotNull(hrMitarbeiter.userId))),
  ]);

  const belegt = new Map(verknuepft.map(v => [v.userId, v.name]));
  res.json(konten.map(k => ({ ...k, belegtVon: belegt.get(k.id) ?? null })));
});

// ── STATS ─────────────────────────────────────────────────────────────────────

router.get("/hr/stats", requireAuth, async (req, res): Promise<void> => {
  const companyId = cid(req);

  const [mitarbeiter, urlaubPending, offeneStellen] = await Promise.all([
    db.select().from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)),
    db.select().from(hrUrlaub).where(and(eq(hrUrlaub.companyId, companyId), eq(hrUrlaub.status, "ausstehend"))),
    db.select().from(hrStellungen).where(and(eq(hrStellungen.companyId, companyId), eq(hrStellungen.status, "offen"))),
  ]);

  const aktiv    = mitarbeiter.filter(m => m.status === "aktiv").length;
  const elternzeit = mitarbeiter.filter(m => m.status === "elternzeit").length;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
  const neuEinstellungen = mitarbeiter.filter(m => m.startDate >= ninetyDaysAgo).length;

  res.json({
    totalMitarbeiter: mitarbeiter.length,
    aktiv,
    elternzeit,
    neuEinstellungen,
    offeneUrlaube: urlaubPending.length,
    offeneStellen: offeneStellen.length,
  });
});

// ── MITARBEITER ───────────────────────────────────────────────────────────────

router.get("/hr/mitarbeiter", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(hrMitarbeiter)
    .where(eq(hrMitarbeiter.companyId, cid(req)))
    .orderBy(desc(hrMitarbeiter.createdAt));
  res.json(rows);
});

router.post("/hr/mitarbeiter", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.name || !b.startDate) throw badRequest("Name und Startdatum erforderlich");
  // Vor dem Insert prüfen, nicht danach: ein angelegter Mitarbeiter ohne
  // Verknüpfung wäre stiller Halbzustand, den niemand nacharbeitet.
  const userId = b.userId !== undefined ? await geprueftesKonto(req, b.userId) : null;
  const [created] = await db.insert(hrMitarbeiter).values({
    companyId:      cid(req),
    userId:         userId ?? undefined,
    name:           String(b.name),
    jobTitle:       String(b.jobTitle ?? ""),
    abteilung:      b.abteilung ? String(b.abteilung) : undefined,
    employmentType: String(b.employmentType ?? "vollzeit"),
    startDate:      String(b.startDate),
    endDate:        b.endDate ? String(b.endDate) : undefined,
    status:         String(b.status ?? "aktiv"),
    weeklyHours:    b.weeklyHours ? Number(b.weeklyHours) : undefined,
    salaryGross:    b.salaryGross ? Number(b.salaryGross) : undefined,
    gesellschaftId: b.gesellschaftId !== undefined ? (await gepruefteGesellschaft(req, b.gesellschaftId)) ?? undefined : undefined,
    phone:          b.phone ? String(b.phone) : undefined,
    address:        b.address ? String(b.address) : undefined,
    city:           b.city ? String(b.city) : undefined,
    notes:          b.notes ? String(b.notes) : undefined,
  }).returning();
  res.status(201).json(created);
});

router.get("/hr/mitarbeiter/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const [row] = await db.select().from(hrMitarbeiter)
    .where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, cid(req))));
  if (!row) throw notFound("Nicht gefunden");
  res.json(row);
});

router.patch("/hr/mitarbeiter/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const b  = req.body as Record<string, any>;
  const u: Record<string, any> = { updatedAt: new Date() };
  const fields = ["name","jobTitle","abteilung","employmentType","startDate","endDate","status","weeklyHours","salaryGross","urlaubstageProJahr","arbeitstageProWoche","mabvPflichtig","austrittsgrund","phone","address","city","notes","emergencyContact","emergencyPhone"];
  fields.forEach(f => { if (b[f] !== undefined) u[f] = b[f]; });
  if (u.arbeitstageProWoche !== undefined) { const t = Number(u.arbeitstageProWoche); if (!Number.isInteger(t) || t < 1 || t > 6) throw badRequest("Arbeitstage pro Woche: 1 bis 6"); u.arbeitstageProWoche = t; }
  if (u.urlaubstageProJahr !== undefined) { const t = Number(u.urlaubstageProJahr); if (!Number.isInteger(t) || t < 0 || t > 60) throw badRequest("Urlaubstage: 0 bis 60"); u.urlaubstageProJahr = t; }
  if (u.mabvPflichtig !== undefined) u.mabvPflichtig = Boolean(u.mabvPflichtig);
  // `userId` steht bewusst NICHT in `fields`: die Liste reicht Werte ungeprüft
  // durch, und dieses Feld braucht Mandanten- und Eindeutigkeitsprüfung. Ein
  // ausdrückliches `null` löst die Verknüpfung — deshalb `!== undefined` und
  // nicht `if (b.userId)`.
  if (b.userId !== undefined) u["userId"] = await geprueftesKonto(req, b.userId, id);
  // Gleiche Begründung wie bei userId: geprüft statt durchgereicht.
  if (b.gesellschaftId !== undefined) u["gesellschaftId"] = await gepruefteGesellschaft(req, b.gesellschaftId);
  const [updated] = await db.update(hrMitarbeiter).set(u)
    .where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, cid(req)))).returning();
  if (!updated) throw notFound("Nicht gefunden");
  res.json(updated);
});

router.delete("/hr/mitarbeiter/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(hrMitarbeiter)
    .where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, cid(req))));
  res.json({ success: true });
});

// ── URLAUB ────────────────────────────────────────────────────────────────────

router.get("/hr/urlaub", requireAuth, async (req, res): Promise<void> => {
  // Join with hrMitarbeiter to get name
  const rows = await db.select({
    id: hrUrlaub.id, companyId: hrUrlaub.companyId,
    mitarbeiterId: hrUrlaub.mitarbeiterId,
    mitarbeiterName: hrMitarbeiter.name,
    type: hrUrlaub.type, startDate: hrUrlaub.startDate, endDate: hrUrlaub.endDate,
    days: hrUrlaub.days, status: hrUrlaub.status, approvedBy: hrUrlaub.approvedBy,
    approvedAt: hrUrlaub.approvedAt, reason: hrUrlaub.reason, notes: hrUrlaub.notes,
    createdAt: hrUrlaub.createdAt,
  })
    .from(hrUrlaub)
    .leftJoin(hrMitarbeiter, eq(hrUrlaub.mitarbeiterId, hrMitarbeiter.id))
    .where(eq(hrUrlaub.companyId, cid(req)))
    .orderBy(desc(hrUrlaub.createdAt));
  res.json(rows);
});

router.post("/hr/urlaub", requireAuth, async (req, res): Promise<void> => {
  const b = req.body as Record<string, any>;
  if (!b.mitarbeiterId || !b.startDate || !b.endDate) throw badRequest("Pflichtfelder fehlen");
  const [created] = await db.insert(hrUrlaub).values({
    companyId:    cid(req),
    mitarbeiterId: Number(b.mitarbeiterId),
    type:         String(b.type ?? "urlaub"),
    startDate:    String(b.startDate),
    endDate:      String(b.endDate),
    days:         Number(b.days ?? 1),
    status:       "ausstehend",
    reason:       b.reason ? String(b.reason) : undefined,
    notes:        b.notes  ? String(b.notes)  : undefined,
  }).returning();
  res.status(201).json(created);
});

router.patch("/hr/urlaub/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const b  = req.body as Record<string, any>;
  const u: Record<string, any> = {};
  if (b.status !== undefined) {
    u.status = b.status;
    if (b.status === "genehmigt" || b.status === "abgelehnt") {
      u.approvedBy = uid(req);
      u.approvedAt = new Date();
    }
  }
  if (b.notes !== undefined) u.notes = b.notes;
  const [updated] = await db.update(hrUrlaub).set(u)
    .where(and(eq(hrUrlaub.id, id), eq(hrUrlaub.companyId, cid(req)))).returning();
  if (!updated) throw notFound("Nicht gefunden");
  // Kalender NACHGELAGERT (0431): genehmigt → Eintrag, alles andere → Eintrag
  // weg. Läuft im Hintergrund; ein abgelaufenes Token darf die Genehmigung
  // nicht scheitern lassen. Fehler stehen an der Abwesenheit.
  if (b.status !== undefined) abwesenheitAbgleichenSpaeter(updated.id);
  res.json(updated);
});

export default router;
