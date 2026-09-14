// © 2026 P&P Group. Proprietary & Confidential.
// HR — Arbeitsverträge: Erfassung, Fristen-Arbeitsliste, Kündigungsrechner,
// KI-Auslesung (0428).
import { Router, type IRouter } from "express";
import { and, eq, desc, asc } from "drizzle-orm";
import {
  db, hrMitarbeiter, hrArbeitsvertraege, hrPersonalakte,
  VERTRAGSARTEN, KUENDIGUNGSTERMINE, VERTRAG_STATUSES,
} from "@workspace/db";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { openObject } from "../../../lib/storage-backend.js";
import { pdfText, istPdf } from "../../../lib/pdf-extrahieren.js";
import {
  befristungskette, fristenFuerVertrag, kuendigungRechnen,
  type VertragFuerFristen, type FristEintrag,
} from "../../../lib/hr/vertragsfristen.js";
import { vertragAuslesen } from "../../../lib/hr/vertrag-auslesen.js";
import { cid } from "./shared.js";

const router: IRouter = Router();

const heute = () => new Date().toISOString().slice(0, 10);
const istDatum = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function eigenerMitarbeiter(companyId: number, id: number) {
  const [m] = await db.select().from(hrMitarbeiter)
    .where(and(eq(hrMitarbeiter.id, id), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw notFound("Mitarbeiter nicht gefunden");
  return m;
}

/** Body → Spalten, mit den Prüfungen, die der CHECK in der DB nicht lesbar meldet. */
function felderAusBody(b: Record<string, unknown>, teil: boolean) {
  const u: Record<string, unknown> = {};
  const setze = (k: string, v: unknown) => { if (v !== undefined) u[k] = v; };

  if (b.vertragsart !== undefined) {
    if (!(VERTRAGSARTEN as readonly string[]).includes(String(b.vertragsart))) throw badRequest("Ungültige Vertragsart");
    u.vertragsart = String(b.vertragsart);
  }
  for (const k of ["beginn", "ende", "probezeitBis"] as const) {
    if (b[k] === undefined) continue;
    if (b[k] === null || b[k] === "") { if (k !== "beginn") u[k] = null; continue; }
    if (!istDatum(b[k])) throw badRequest(`${k}: Datum als YYYY-MM-DD`);
    u[k] = b[k];
  }
  if (!teil && !u.beginn) throw badRequest("Beginn erforderlich");

  if (b.kuendigungsfristWert !== undefined) {
    const w = b.kuendigungsfristWert === null || b.kuendigungsfristWert === "" ? null : Number(b.kuendigungsfristWert);
    if (w != null && (!Number.isInteger(w) || w < 0 || w > 24)) throw badRequest("Kündigungsfrist: 0 bis 24");
    u.kuendigungsfristWert = w;
  }
  if (b.kuendigungsfristEinheit !== undefined) {
    const e = b.kuendigungsfristEinheit;
    if (e != null && e !== "" && e !== "wochen" && e !== "monate") throw badRequest("Einheit: wochen oder monate");
    u.kuendigungsfristEinheit = e === "" ? null : e;
  }
  if (b.kuendigungstermin !== undefined) {
    const t = b.kuendigungstermin;
    if (t != null && t !== "" && !(KUENDIGUNGSTERMINE as readonly string[]).includes(String(t))) throw badRequest("Ungültiger Kündigungstermin");
    u.kuendigungstermin = t === "" ? null : t;
  }
  if (b.wochenstunden !== undefined) {
    const w = b.wochenstunden === null || b.wochenstunden === "" ? null : Number(String(b.wochenstunden).replace(",", "."));
    if (w != null && (!Number.isFinite(w) || w <= 0 || w > 60)) throw badRequest("Wochenstunden: 0 bis 60");
    u.wochenstunden = w == null ? null : String(w);
  }
  if (b.gehaltMonatCent !== undefined) {
    const g = b.gehaltMonatCent === null || b.gehaltMonatCent === "" ? null : Number(b.gehaltMonatCent);
    // Obergrenze 10 Mio. Cent = 100.000 €/Monat. Wer Euro statt Cent schickt,
    // landet darunter und merkt es an der Anzeige; wer Cent×100 schickt, hier.
    if (g != null && (!Number.isInteger(g) || g < 0 || g > 10_000_000)) throw badRequest("Gehalt in Cent, 0 bis 10.000.000");
    u.gehaltMonatCent = g;
  }
  if (b.urlaubstage !== undefined) {
    const t = b.urlaubstage === null || b.urlaubstage === "" ? null : Number(b.urlaubstage);
    if (t != null && (!Number.isInteger(t) || t < 0 || t > 60)) throw badRequest("Urlaubstage: 0 bis 60");
    u.urlaubstage = t;
  }
  setze("istVerlaengerung", b.istVerlaengerung === undefined ? undefined : Boolean(b.istVerlaengerung));
  setze("wettbewerbsverbot", b.wettbewerbsverbot === undefined ? undefined : Boolean(b.wettbewerbsverbot));
  if (b.nebentaetigkeitErlaubt !== undefined) u.nebentaetigkeitErlaubt = b.nebentaetigkeitErlaubt === null ? null : Boolean(b.nebentaetigkeitErlaubt);
  if (b.sachgrund !== undefined) u.sachgrund = b.sachgrund ? String(b.sachgrund) : null;
  if (b.notiz !== undefined) u.notiz = String(b.notiz ?? "");
  if (b.status !== undefined) {
    if (!(VERTRAG_STATUSES as readonly string[]).includes(String(b.status))) throw badRequest("Ungültiger Status");
    u.status = String(b.status);
  }
  if (b.personalakteId !== undefined) u.personalakteId = b.personalakteId === null || b.personalakteId === "" ? null : Number(b.personalakteId);

  // Der CHECK in der DB würde hier mit einem 500 antworten; besser vorher sagen, was fehlt.
  const art = (u.vertragsart ?? b.vertragsart) as string | undefined;
  if (art?.startsWith("befristet") && u.ende === null) throw badRequest("Ein befristeter Vertrag braucht ein Ende");
  if (!teil && art?.startsWith("befristet") && !u.ende) throw badRequest("Ein befristeter Vertrag braucht ein Ende");
  return u;
}

const alsFristVertrag = (v: typeof hrArbeitsvertraege.$inferSelect): VertragFuerFristen => ({
  id: v.id, mitarbeiterId: v.mitarbeiterId, vertragsart: v.vertragsart, beginn: v.beginn, ende: v.ende,
  istVerlaengerung: v.istVerlaengerung, probezeitBis: v.probezeitBis,
  kuendigungsfristWert: v.kuendigungsfristWert, kuendigungsfristEinheit: v.kuendigungsfristEinheit,
  kuendigungstermin: v.kuendigungstermin, status: v.status,
});

// ═══════════════════════════════════════════════════════════════════════════════
// JE MITARBEITER
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/mitarbeiter/:id/vertraege", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const ma = await eigenerMitarbeiter(companyId, Number(req.params.id));
  const rows = await db.select().from(hrArbeitsvertraege)
    .where(and(eq(hrArbeitsvertraege.companyId, companyId), eq(hrArbeitsvertraege.mitarbeiterId, ma.id)))
    .orderBy(desc(hrArbeitsvertraege.beginn));
  const alsFrist = rows.map(alsFristVertrag);
  const kette = befristungskette(alsFrist);
  const fristen = alsFrist.flatMap((v) => fristenFuerVertrag(v, heute(), kette));
  res.json({ vertraege: rows, kette, fristen });
});

router.post("/hr/mitarbeiter/:id/vertraege", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const ma = await eigenerMitarbeiter(companyId, Number(req.params.id));
  const u = felderAusBody((req.body ?? {}) as Record<string, unknown>, false);

  if (u.personalakteId != null) {
    const [dok] = await db.select({ id: hrPersonalakte.id }).from(hrPersonalakte)
      .where(and(eq(hrPersonalakte.id, Number(u.personalakteId)), eq(hrPersonalakte.companyId, companyId), eq(hrPersonalakte.mitarbeiterId, ma.id)));
    if (!dok) throw badRequest("Das Dokument gehört nicht zu diesem Mitarbeiter");
  }

  const [row] = await db.transaction(async (tx) => {
    // Ein neuer aktiver Vertrag löst den bisherigen ab — sonst zählt die
    // Fristenliste beide, und die Befristungskette hat zwei „letzte" Enden.
    if ((u.status ?? "aktiv") === "aktiv") {
      await tx.update(hrArbeitsvertraege).set({ status: "abgeloest", updatedAt: new Date() })
        .where(and(eq(hrArbeitsvertraege.companyId, companyId), eq(hrArbeitsvertraege.mitarbeiterId, ma.id), eq(hrArbeitsvertraege.status, "aktiv")));
    }
    return tx.insert(hrArbeitsvertraege).values({ ...(u as any), companyId, mitarbeiterId: ma.id }).returning();
  });
  res.status(201).json(row);
});

router.patch("/hr/vertraege/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const u = felderAusBody((req.body ?? {}) as Record<string, unknown>, true);
  const [row] = await db.update(hrArbeitsvertraege).set({ ...(u as any), updatedAt: new Date() })
    .where(and(eq(hrArbeitsvertraege.id, Number(req.params.id)), eq(hrArbeitsvertraege.companyId, companyId))).returning();
  if (!row) throw notFound("Vertrag nicht gefunden");
  res.json(row);
});

router.delete("/hr/vertraege/:id", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const [row] = await db.delete(hrArbeitsvertraege)
    .where(and(eq(hrArbeitsvertraege.id, Number(req.params.id)), eq(hrArbeitsvertraege.companyId, cid(req))))
    .returning({ id: hrArbeitsvertraege.id });
  if (!row) throw notFound("Vertrag nicht gefunden");
  res.status(204).end();
});

// ═══════════════════════════════════════════════════════════════════════════════
// FRISTEN-ARBEITSLISTE (alle Mitarbeiter)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/vertraege/fristen", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const tag = heute();
  const [vertraege, mitarbeiter] = await Promise.all([
    db.select().from(hrArbeitsvertraege).where(eq(hrArbeitsvertraege.companyId, companyId)).orderBy(asc(hrArbeitsvertraege.beginn)),
    db.select({ id: hrMitarbeiter.id, name: hrMitarbeiter.name, jobTitle: hrMitarbeiter.jobTitle, gesellschaftId: hrMitarbeiter.gesellschaftId, endDate: hrMitarbeiter.endDate })
      .from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)),
  ]);
  const namen = new Map(mitarbeiter.map((m) => [m.id, m]));

  const jeMa = new Map<number, VertragFuerFristen[]>();
  for (const v of vertraege) {
    if (!jeMa.has(v.mitarbeiterId)) jeMa.set(v.mitarbeiterId, []);
    jeMa.get(v.mitarbeiterId)!.push(alsFristVertrag(v));
  }

  const fristen: (FristEintrag & { name: string; jobTitle: string; gesellschaftId: number | null })[] = [];
  const ketten: { mitarbeiterId: number; name: string; kette: ReturnType<typeof befristungskette> }[] = [];
  for (const [maId, vs] of jeMa) {
    const m = namen.get(maId);
    // Ausgeschiedene haben keine Fristen mehr — auch wenn ihr Vertrag noch „aktiv" steht.
    if (!m || (m.endDate && m.endDate < tag)) continue;
    const kette = befristungskette(vs);
    if (kette.lage !== "nicht_anwendbar" && kette.lage !== "frei") ketten.push({ mitarbeiterId: maId, name: m.name, kette });
    for (const v of vs) {
      for (const f of fristenFuerVertrag(v, tag, kette)) {
        fristen.push({ ...f, name: m.name, jobTitle: m.jobTitle, gesellschaftId: m.gesellschaftId });
      }
    }
  }
  fristen.sort((a, b) => a.tageBisEntscheidung - b.tageBisEntscheidung);

  // Wer KEINEN Vertrag erfasst hat, fehlt in jeder Fristenliste — das ist die
  // Lücke, die man der Liste nicht ansieht.
  const aktiveOhneVertrag = mitarbeiter.filter((m) => (!m.endDate || m.endDate >= tag) && !jeMa.has(m.id));

  res.json({
    stichtag: tag,
    fristen,
    tzbfg: ketten.sort((a, b) => ["ueberschritten", "erreicht", "knapp"].indexOf(a.kette.lage) - ["ueberschritten", "erreicht", "knapp"].indexOf(b.kette.lage)),
    luecken: {
      aktiveMitarbeiter: mitarbeiter.filter((m) => !m.endDate || m.endDate >= tag).length,
      ohneVertrag: aktiveOhneVertrag.length,
      ohneVertragNamen: aktiveOhneVertrag.slice(0, 20).map((m) => ({ id: m.id, name: m.name })),
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// KÜNDIGUNGSRECHNER
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/vertraege/:id/kuendigung", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const [v] = await db.select().from(hrArbeitsvertraege)
    .where(and(eq(hrArbeitsvertraege.id, Number(req.params.id)), eq(hrArbeitsvertraege.companyId, companyId)));
  if (!v) throw notFound("Vertrag nicht gefunden");
  const am = req.query.am;
  const kuendigungAm = istDatum(am) ? am : heute();
  const ma = await eigenerMitarbeiter(companyId, v.mitarbeiterId);
  // Betriebszugehörigkeit zählt vom ERSTEN Eintritt, nicht vom aktuellen
  // Vertrag — sonst fängt sie mit jeder Verlängerung wieder bei null an.
  res.json(kuendigungRechnen(alsFristVertrag(v), kuendigungAm, ma.startDate));
});

// ═══════════════════════════════════════════════════════════════════════════════
// KI-AUSLESUNG — Vorschlag, keine Übernahme
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/hr/vertraege/:id/auslesen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const [v] = await db.select().from(hrArbeitsvertraege)
    .where(and(eq(hrArbeitsvertraege.id, Number(req.params.id)), eq(hrArbeitsvertraege.companyId, companyId)));
  if (!v) throw notFound("Vertrag nicht gefunden");

  const b = (req.body ?? {}) as Record<string, unknown>;
  let text: string | null = typeof b.text === "string" && b.text.trim() ? b.text : null;

  if (!text) {
    // Aus dem verknüpften Dokument der Personalakte — nur dem EIGENEN.
    const dokId = b.personalakteId != null ? Number(b.personalakteId) : v.personalakteId;
    if (!dokId) throw badRequest("Weder Text noch Dokument angegeben");
    const [dok] = await db.select().from(hrPersonalakte)
      .where(and(eq(hrPersonalakte.id, dokId), eq(hrPersonalakte.companyId, companyId), eq(hrPersonalakte.mitarbeiterId, v.mitarbeiterId)));
    if (!dok?.fileUrl) throw badRequest("Das Dokument hat keine Datei");
    const antwort = await openObject(dok.fileUrl);
    if (!antwort.ok) throw badRequest("Datei nicht lesbar");
    const puffer = Buffer.from(await antwort.arrayBuffer());
    if (istPdf(puffer)) {
      const erg = await pdfText(puffer);
      text = erg.text;
    } else {
      text = puffer.toString("utf8");
    }
    if (!text || text.trim().length < 50) {
      throw badRequest("Aus dem Dokument ließ sich kein Text lesen — vermutlich ein Scan ohne Texterkennung.");
    }
  }

  const ergebnis = await vertragAuslesen(text);
  // Der Vorschlag wird am Vertrag gespeichert — nicht die Felder. Man will
  // später nachlesen können, was die KI gesehen hat und was der Mensch daraus
  // übernommen hat.
  await db.update(hrArbeitsvertraege)
    .set({ kiAuslesung: { ...ergebnis, am: new Date().toISOString() } as any, updatedAt: new Date() })
    .where(eq(hrArbeitsvertraege.id, v.id));
  res.json(ergebnis);
});

export default router;
