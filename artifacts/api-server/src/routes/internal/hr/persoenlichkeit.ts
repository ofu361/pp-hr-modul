// © 2026 P&P Group. Proprietary & Confidential.
// HR — Persönlichkeitsprofile: Erfassung je Mitarbeiter, Teamübersicht,
// KI-Entwurf aus den Beurteilungstexten (0429).
//
// ⚠ Lesen ist hier NICHT view_hr_reports. Ein Profil ist ein Urteil über einen
//   Menschen; wer Personalberichte sehen darf, darf noch nicht in Köpfe
//   schauen. Lesen und Schreiben laufen deshalb beide über manage_hr, und die
//   Antwort filtert zusätzlich nach `sichtbar_fuer`.
import { Router, type IRouter } from "express";
import { and, eq, desc, inArray } from "drizzle-orm";
import {
  db, hrMitarbeiter, hrPersoenlichkeitsprofile, hrBeurteilungen,
  PROFIL_METHODEN, PROFIL_QUELLEN, PROFIL_SICHTBAR, PROFIL_DIMENSIONEN,
} from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission, hasPermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { callClaude } from "../../../lib/ai-providers.js";
import { cid, uid } from "./shared.js";

const router: IRouter = Router();
const istDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Art.-9-Signalwörter — ein Freitext, der sie enthält, wird abgewiesen, nicht gespeichert. */
const ART9 = /\b(schwanger|krank(heit|geschrieben)|diagnose|depress|burnout|therapie|behinder|religion|muslim|christ|jüd|homosex|schwul|lesbisch|migrationshintergrund|herkunft|gewerkschaft)/i;
function pruefeArt9(texte: (string | null | undefined)[]) {
  for (const t of texte) if (t && ART9.test(t)) {
    throw badRequest("Der Text enthält Angaben nach Art. 9 DSGVO (Gesundheit, Religion, Herkunft u. a.). Solche Daten gehören nicht in ein Persönlichkeitsprofil.");
  }
}

function felderAusBody(b: Record<string, unknown>, teil: boolean) {
  const u: Record<string, unknown> = {};
  if (b.methode !== undefined) {
    if (!(PROFIL_METHODEN as readonly string[]).includes(String(b.methode))) throw badRequest("Ungültige Methode");
    u.methode = String(b.methode);
  }
  if (b.quelle !== undefined) {
    if (!(PROFIL_QUELLEN as readonly string[]).includes(String(b.quelle))) throw badRequest("Ungültige Quelle");
    u.quelle = String(b.quelle);
  }
  if (b.sichtbarFuer !== undefined) {
    if (!(PROFIL_SICHTBAR as readonly string[]).includes(String(b.sichtbarFuer))) throw badRequest("Ungültige Sichtbarkeit");
    u.sichtbarFuer = String(b.sichtbarFuer);
  }
  for (const k of ["erhobenAm", "einwilligungAm"] as const) {
    if (b[k] === undefined) continue;
    if (!istDatum(b[k])) throw badRequest(`${k}: Datum als YYYY-MM-DD`);
    u[k] = b[k];
  }
  if (!teil) {
    if (!u.quelle) throw badRequest("Quelle erforderlich");
    if (!u.erhobenAm) throw badRequest("Erhebungsdatum erforderlich");
    // Die eine Prüfung, die nicht verhandelbar ist.
    if (!u.einwilligungAm) throw badRequest("Ohne dokumentierte Einwilligung des Mitarbeiters kann kein Persönlichkeitsprofil angelegt werden.");
  }
  if (u.einwilligungAm && u.erhobenAm && String(u.einwilligungAm) > String(u.erhobenAm)) {
    throw badRequest("Die Einwilligung muss vor oder am Tag der Erhebung liegen.");
  }
  if (b.dimensionen !== undefined) {
    if (typeof b.dimensionen !== "object" || b.dimensionen === null || Array.isArray(b.dimensionen)) throw badRequest("dimensionen: Objekt");
    const methode = String(u.methode ?? b.methode ?? "frei");
    const erlaubt = PROFIL_DIMENSIONEN[methode] ?? [];
    const d: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.dimensionen as Record<string, unknown>)) {
      // Nur die Schlüssel der Methode — sonst mischen sich Verfahren still.
      if (erlaubt.length > 0 && !erlaubt.includes(k)) throw badRequest(`Dimension „${k}" gehört nicht zur Methode ${methode}`);
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw badRequest(`Dimension „${k}": 0 bis 100`);
      d[k] = Math.round(n);
    }
    u.dimensionen = d;
  }
  for (const k of ["staerken", "entwicklungsfelder"] as const) {
    if (b[k] === undefined) continue;
    if (!Array.isArray(b[k])) throw badRequest(`${k}: Liste`);
    u[k] = (b[k] as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  }
  if (b.arbeitsstil !== undefined) u.arbeitsstil = b.arbeitsstil ? String(b.arbeitsstil).slice(0, 2000) : null;
  if (b.teamrolle !== undefined) u.teamrolle = b.teamrolle ? String(b.teamrolle).slice(0, 200) : null;
  if (b.notiz !== undefined) u.notiz = String(b.notiz ?? "").slice(0, 4000);

  pruefeArt9([
    u.arbeitsstil as string, u.teamrolle as string, u.notiz as string,
    ...((u.staerken as string[]) ?? []), ...((u.entwicklungsfelder as string[]) ?? []),
  ]);
  return u;
}

async function eigenerMitarbeiter(companyId: number, id: number) {
  const [m] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════
// JE MITARBEITER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lesen mit Sichtbarkeitsstufe (0436): HR (manage_hr) sieht alles; die
 * Führungskraft (view_hr_reports ohne manage_hr) nur Profile mit
 * sichtbar_fuer ∈ {fuehrungskraft, selbst}; der Mitarbeiter selbst nur
 * `selbst`. Die Stufe wurde seit 0429 gespeichert, aber nie geprüft — ein
 * Feld, das nichts tut, ist eine Zusage, die nicht gehalten wird.
 */
router.get("/hr/mitarbeiter/:id/persoenlichkeit", requireAuth, async (req, res): Promise<void> => {
  const companyId = cid(req);
  const ma = await eigenerMitarbeiter(companyId, Number(req.params.id));
  // Über die Rechte-Matrix, nicht über Rollennamen — dort steht, wer HR ist.
  const istHr = await hasPermission(req, "manage_hr");
  const istFuehrung = !istHr && await hasPermission(req, "view_hr_reports");
  const istSelbst = ma.userId != null && ma.userId === uid(req);
  if (!istHr && !istFuehrung && !istSelbst) throw notFound("Mitarbeiter nicht gefunden");
  const rows = await db.select().from(hrPersoenlichkeitsprofile)
    .where(and(eq(hrPersoenlichkeitsprofile.companyId, companyId), eq(hrPersoenlichkeitsprofile.mitarbeiterId, ma.id)))
    .orderBy(desc(hrPersoenlichkeitsprofile.erhobenAm));
  const sichtbar = rows.filter((p) => istHr || (istFuehrung && (p.sichtbarFuer === "fuehrungskraft" || p.sichtbarFuer === "selbst")) || (istSelbst && p.sichtbarFuer === "selbst"));
  res.json({ profile: sichtbar, dimensionen: PROFIL_DIMENSIONEN, verborgen: rows.length - sichtbar.length });
});

router.post("/hr/mitarbeiter/:id/persoenlichkeit", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const ma = await eigenerMitarbeiter(companyId, Number(req.params.id));
  const u = felderAusBody((req.body ?? {}) as Record<string, unknown>, false);
  const [row] = await db.insert(hrPersoenlichkeitsprofile)
    .values({ ...(u as any), companyId, mitarbeiterId: ma.id, erstelltVon: uid(req) || null }).returning();
  res.status(201).json(row);
});

router.patch("/hr/persoenlichkeit/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const u = felderAusBody((req.body ?? {}) as Record<string, unknown>, true);
  const [row] = await db.update(hrPersoenlichkeitsprofile).set({ ...(u as any), updatedAt: new Date() })
    .where(and(eq(hrPersoenlichkeitsprofile.id, Number(req.params.id)), eq(hrPersoenlichkeitsprofile.companyId, cid(req)))).returning();
  if (!row) throw notFound("Profil nicht gefunden");
  res.json(row);
});

router.delete("/hr/persoenlichkeit/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [row] = await db.delete(hrPersoenlichkeitsprofile)
    .where(and(eq(hrPersoenlichkeitsprofile.id, Number(req.params.id)), eq(hrPersoenlichkeitsprofile.companyId, cid(req))))
    .returning({ id: hrPersoenlichkeitsprofile.id });
  if (!row) throw notFound("Profil nicht gefunden");
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEAMÜBERSICHT — Verteilung der Profile je Abteilung
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/persoenlichkeit/team", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const heute = new Date().toISOString().slice(0, 10);
  const [mitarbeiter, profile] = await Promise.all([
    db.select({ id: hrMitarbeiter.id, name: hrMitarbeiter.name, abteilung: hrMitarbeiter.abteilung, jobTitle: hrMitarbeiter.jobTitle, endDate: hrMitarbeiter.endDate })
      .from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)),
    db.select().from(hrPersoenlichkeitsprofile).where(eq(hrPersoenlichkeitsprofile.companyId, companyId))
      .orderBy(desc(hrPersoenlichkeitsprofile.erhobenAm)),
  ]);
  const aktive = mitarbeiter.filter((m) => !m.endDate || m.endDate >= heute);
  // Das jüngste Profil je Mitarbeiter zählt.
  const juengstes = new Map<number, typeof profile[number]>();
  for (const p of profile) if (!juengstes.has(p.mitarbeiterId)) juengstes.set(p.mitarbeiterId, p);

  const abteilungen = new Map<string, { abteilung: string; mitarbeiter: number; mitProfil: number; teamrollen: Record<string, number>; staerken: Record<string, number>; dimensionenSchnitt: Record<string, { summe: number; n: number }> }>();
  for (const m of aktive) {
    const key = m.abteilung?.trim() || "Ohne Abteilung";
    if (!abteilungen.has(key)) abteilungen.set(key, { abteilung: key, mitarbeiter: 0, mitProfil: 0, teamrollen: {}, staerken: {}, dimensionenSchnitt: {} });
    const a = abteilungen.get(key)!;
    a.mitarbeiter += 1;
    const p = juengstes.get(m.id);
    if (!p) continue;
    a.mitProfil += 1;
    if (p.teamrolle) a.teamrollen[p.teamrolle] = (a.teamrollen[p.teamrolle] ?? 0) + 1;
    for (const s of p.staerken) a.staerken[s] = (a.staerken[s] ?? 0) + 1;
    // Dimensionen nur innerhalb derselben Methode mitteln — DISG und Big Five
    // in einer Zahl wären Unsinn. Schlüssel: methode.dimension.
    for (const [k, v] of Object.entries(p.dimensionen ?? {})) {
      const sk = `${p.methode}.${k}`;
      if (!a.dimensionenSchnitt[sk]) a.dimensionenSchnitt[sk] = { summe: 0, n: 0 };
      a.dimensionenSchnitt[sk]!.summe += v; a.dimensionenSchnitt[sk]!.n += 1;
    }
  }

  res.json({
    stichtag: heute,
    abdeckung: { aktive: aktive.length, mitProfil: aktive.filter((m) => juengstes.has(m.id)).length },
    abteilungen: [...abteilungen.values()].map((a) => ({
      ...a,
      dimensionenSchnitt: Object.fromEntries(Object.entries(a.dimensionenSchnitt).map(([k, v]) => [k, Math.round(v.summe / v.n)])),
      // Stärken, die im Team mehrfach vorkommen, und Rollen — das, worüber ein
      // Teamgespräch tatsächlich geht.
      haeufigeStaerken: Object.entries(a.staerken).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([s, n]) => ({ staerke: s, anzahl: n })),
    })).sort((x, y) => y.mitarbeiter - x.mitarbeiter),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// KI-ENTWURF aus Beurteilungen — Vorschlag, wird NICHT gespeichert
// ═══════════════════════════════════════════════════════════════════════════════

const ENTWURF_SYSTEM = `Du bist HR-Fachkraft und fasst Beurteilungstexte zu einem Persönlichkeits-ENTWURF zusammen. Antworte AUSSCHLIESSLICH mit JSON:
{
  "staerken": ["<max. 6 kurze Stichworte, je 1–3 Wörter>"],
  "entwicklungsfelder": ["<max. 4 kurze Stichworte>"],
  "arbeitsstil": "<2–3 Sätze, beschreibend, ohne Wertung>",
  "teamrolle": "<eine der Rollen: Umsetzer | Koordinator | Ideengeber | Analytiker | Vermittler | Spezialist | Antreiber | Perfektionierer>",
  "belege": ["<je ein wörtliches Zitat aus den Beurteilungen, das eine Stärke oder ein Feld stützt, max. 5>"],
  "hinweise": ["<was in den Texten fehlt oder widersprüchlich ist>"]
}
Regeln: Nichts erfinden. Keine Aussagen zu Gesundheit, Religion, Herkunft, Familie, Sexualität — auch dann nicht, wenn die Texte sie enthalten. Wenn die Texte für ein Bild nicht reichen, sag das in den Hinweisen und lass Felder leer.`;

router.post("/hr/mitarbeiter/:id/persoenlichkeit/entwurf", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const ma = await eigenerMitarbeiter(companyId, Number(req.params.id));
  const beurteilungen = await db.select({
    period: hrBeurteilungen.period, rating: hrBeurteilungen.rating,
    staerken: hrBeurteilungen.staerken, verbesserungen: hrBeurteilungen.verbesserungen, notes: hrBeurteilungen.notes,
  }).from(hrBeurteilungen)
    .where(and(eq(hrBeurteilungen.companyId, companyId), eq(hrBeurteilungen.mitarbeiterId, ma.id)))
    .orderBy(desc(hrBeurteilungen.createdAt)).limit(8);

  const text = beurteilungen.map((b) =>
    `Zeitraum ${b.period}, Bewertung ${b.rating}/5\nStärken: ${b.staerken ?? "—"}\nVerbesserungen: ${b.verbesserungen ?? "—"}\nNotizen: ${b.notes ?? "—"}`,
  ).join("\n\n");
  if (text.replace(/[—\s]/g, "").length < 80) {
    throw badRequest("Zu wenig Beurteilungstext für einen Entwurf — mindestens eine Beurteilung mit Stärken und Verbesserungen.");
  }

  const antwort = await callClaude({
    model: process.env.HR_AUSLESE_MODELL ?? "claude-sonnet-4-6", max_tokens: 1500, system: ENTWURF_SYSTEM,
    messages: [{ role: "user", content: `BEURTEILUNGEN (${beurteilungen.length}):\n\n${text}` }],
  });
  const roh = antwort.text.trim();
  const a = roh.indexOf("{"), z = roh.lastIndexOf("}");
  if (a < 0 || z < 0) throw new Error("KI-Antwort enthielt kein JSON");
  let e: Record<string, unknown>;
  try { e = JSON.parse(roh.slice(a, z + 1)); } catch { throw new Error("KI-Antwort war kein gültiges JSON"); }

  const liste = (k: string, max: number) => (Array.isArray(e[k]) ? e[k] as unknown[] : []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, max);
  const quelltext = text.toLowerCase().replace(/\s+/g, " ");
  const belege = liste("belege", 5).map((zitat) => ({ zitat, belegt: quelltext.includes(zitat.toLowerCase().replace(/\s+/g, " ")) }));

  // Art.-9-Filter auch auf dem KI-Ergebnis — das Modell soll es nicht tun,
  // aber „soll" ist keine Prüfung.
  const entwurf = {
    staerken: liste("staerken", 6).filter((s) => !ART9.test(s)),
    entwicklungsfelder: liste("entwicklungsfelder", 4).filter((s) => !ART9.test(s)),
    arbeitsstil: typeof e.arbeitsstil === "string" && !ART9.test(e.arbeitsstil) ? e.arbeitsstil.slice(0, 1000) : "",
    teamrolle: typeof e.teamrolle === "string" ? e.teamrolle.slice(0, 60) : "",
    belege,
    hinweise: liste("hinweise", 6),
    grundlage: { beurteilungen: beurteilungen.length, zeitraeume: beurteilungen.map((b) => b.period) },
    modell: process.env.HR_AUSLESE_MODELL ?? "claude-sonnet-4-6",
    am: new Date().toISOString(),
  };
  if (belege.some((b) => !b.belegt)) entwurf.hinweise.unshift(`${belege.filter((b) => !b.belegt).length} Beleg(e) stehen so nicht in den Beurteilungen — vor Übernahme prüfen.`);
  // Bewusst KEIN Insert: der Entwurf wird erst mit Einwilligungsdatum und
  // Quelle „ki_entwurf" vom Menschen angelegt. Er kommt als Vorschlag zurück.
  res.json(entwurf);
});

export default router;
