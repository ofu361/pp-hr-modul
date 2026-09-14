// © 2026 P&P Group. Proprietary & Confidential.
// HR — Urlaubskonten (0436): je Mitarbeiter und als Übersicht, Korrekturen.
import { Router, type IRouter } from "express";
import { and, eq, gte } from "drizzle-orm";
import { db, hrMitarbeiter, hrUrlaub, hrUrlaubKorrekturen, URLAUB_KORREKTUR_ARTEN } from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission, hasPermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { urlaubskontoMitHistorie, type KorrekturFuerKonto } from "../../../lib/hr/urlaubskonto.js";
import { cid, uid } from "./shared.js";

const router: IRouter = Router();
const heute = () => new Date().toISOString().slice(0, 10);

function jahrAus(q: unknown): number {
  const j = Number(q ?? new Date().getFullYear());
  if (!Number.isInteger(j) || j < 2000 || j > 2100) throw badRequest("Ungültiges Jahr");
  return j;
}

async function ladeGrundlagen(companyId: number, jahr: number, mitarbeiterId?: number) {
  const [mitarbeiter, urlaube, korrekturen] = await Promise.all([
    db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId),
      ...(mitarbeiterId ? [eq(hrMitarbeiter.id, mitarbeiterId)] : []))),
    // Fünf Jahre zurück reichen für die Übertragskette.
    db.select({ mitarbeiterId: hrUrlaub.mitarbeiterId, type: hrUrlaub.type, startDate: hrUrlaub.startDate, endDate: hrUrlaub.endDate, days: hrUrlaub.days, status: hrUrlaub.status })
      .from(hrUrlaub).where(and(eq(hrUrlaub.companyId, companyId), gte(hrUrlaub.startDate, `${jahr - 5}-01-01`))),
    db.select().from(hrUrlaubKorrekturen).where(eq(hrUrlaubKorrekturen.companyId, companyId)),
  ]);
  const korr: KorrekturFuerKonto[] = korrekturen.map((k) => ({ mitarbeiterId: k.mitarbeiterId, jahr: k.jahr, art: k.art as KorrekturFuerKonto["art"], tage: Number(k.tage) }));
  return { mitarbeiter, urlaube, korr, korrekturenRoh: korrekturen };
}

/** Übersicht aller aktiven Mitarbeiter. */
router.get("/hr/urlaubskonten", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const jahr = jahrAus(req.query.jahr);
  const tag = heute();
  const { mitarbeiter, urlaube, korr } = await ladeGrundlagen(companyId, jahr);
  const konten = mitarbeiter
    .filter((m) => m.startDate <= `${jahr}-12-31` && (!m.endDate || m.endDate >= `${jahr}-01-01`))
    .map((m) => {
      const k = urlaubskontoMitHistorie(
        { id: m.id, startDate: m.startDate, endDate: m.endDate, urlaubstageProJahr: m.urlaubstageProJahr, arbeitstageProWoche: m.arbeitstageProWoche },
        jahr, tag, urlaube, korr,
      );
      return { ...k, name: m.name, jobTitle: m.jobTitle, abteilung: m.abteilung, arbeitstageProWoche: m.arbeitstageProWoche, urlaubstageProJahr: m.urlaubstageProJahr, gesellschaftId: m.gesellschaftId };
    })
    .sort((a, b) => a.rest - b.rest);
  const summe = konten.reduce((s, k) => ({ anspruch: s.anspruch + k.anspruch, genommen: s.genommen + k.genommen, verplant: s.verplant + k.verplant, rest: s.rest + k.rest, verfallen: s.verfallen + k.uebertragVerfallen }),
    { anspruch: 0, genommen: 0, verplant: 0, rest: 0, verfallen: 0 });
  res.json({
    jahr, stichtag: tag, konten, summe,
    hinweise: {
      ueberzogen: konten.filter((k) => k.rest < 0).length,
      // Viel Rest im Herbst heißt: das verfällt oder wird zum Jahresende geballt genommen.
      hoherRest: konten.filter((k) => k.rest >= 15 && tag >= `${jahr}-09-01`).length,
      uebertragOffen: konten.filter((k) => tag <= `${jahr}-03-31` && k.uebertrag - k.uebertragGenommen > 0).length,
    },
  });
});

router.get("/hr/mitarbeiter/:id/urlaubskonto", requireAuth, async (req, res): Promise<void> => {
  const companyId = cid(req);
  const id = Number(req.params.id);
  const jahr = jahrAus(req.query.jahr);
  const [m] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  // Das eigene Konto darf jeder sehen, fremde nur HR.
  const eigenes = m.userId != null && m.userId === uid(req);
  if (!eigenes && !(await hasPermission(req, "view_hr_reports"))) throw notFound("Mitarbeiter nicht gefunden");

  const { urlaube, korr, korrekturenRoh } = await ladeGrundlagen(companyId, jahr, id);
  const konto = urlaubskontoMitHistorie(
    { id: m.id, startDate: m.startDate, endDate: m.endDate, urlaubstageProJahr: m.urlaubstageProJahr, arbeitstageProWoche: m.arbeitstageProWoche },
    jahr, heute(), urlaube, korr,
  );
  res.json({ ...konto, name: m.name, korrekturen: korrekturenRoh.filter((k) => k.mitarbeiterId === id && k.jahr === jahr),
    urlaube: urlaube.filter((u) => u.mitarbeiterId === id && u.type === "urlaub" && u.startDate.startsWith(String(jahr))) });
});

router.post("/hr/mitarbeiter/:id/urlaubskonto/korrektur", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const id = Number(req.params.id);
  const [m] = await db.select({ id: hrMitarbeiter.id }).from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const jahr = jahrAus(b.jahr);
  const art = String(b.art ?? "");
  if (!(URLAUB_KORREKTUR_ARTEN as readonly string[]).includes(art)) throw badRequest("Art: uebertrag, korrektur, auszahlung oder verfall");
  const tage = Number(String(b.tage ?? "").replace(",", "."));
  if (!Number.isFinite(tage) || Math.abs(tage) > 99) throw badRequest("Tage: Zahl bis ±99");
  // Auszahlung und Verfall mindern immer — wer +5 eingibt, meint −5.
  const wert = art === "auszahlung" || art === "verfall" ? -Math.abs(tage) : tage;
  const grund = String(b.grund ?? "").trim();
  if (!grund) throw badRequest("Ein Grund ist Pflicht — eine Korrektur ohne Begründung ist eine Zahl, die niemand später erklären kann.");

  if (art === "uebertrag") {
    // Ein gesetzter Übertrag je Jahr: ersetzen statt anhäufen.
    await db.delete(hrUrlaubKorrekturen).where(and(eq(hrUrlaubKorrekturen.companyId, companyId), eq(hrUrlaubKorrekturen.mitarbeiterId, id), eq(hrUrlaubKorrekturen.jahr, jahr), eq(hrUrlaubKorrekturen.art, "uebertrag")));
  }
  const [row] = await db.insert(hrUrlaubKorrekturen).values({ companyId, mitarbeiterId: id, jahr, art, tage: String(wert), grund, erstelltVon: uid(req) || null }).returning();
  res.status(201).json(row);
});

router.delete("/hr/urlaubskonto/korrektur/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [row] = await db.delete(hrUrlaubKorrekturen).where(and(eq(hrUrlaubKorrekturen.id, Number(req.params.id)), eq(hrUrlaubKorrekturen.companyId, cid(req)))).returning({ id: hrUrlaubKorrekturen.id });
  if (!row) throw notFound("Nicht gefunden");
  res.status(204).end();
});

export default router;
