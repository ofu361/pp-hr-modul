// © 2026 P&P Group. Proprietary & Confidential.
// HR — Abwesenheits-Statistik (Bradford), DATEV-Lohn-Export, Self-Service
import { Router, type IRouter } from "express";
import { and, eq, desc, gte } from "drizzle-orm";
import {
  db, hrMitarbeiter, hrUrlaub, hrSchichten,
  hrQualifikationen, hrMitarbeiterQualifikationen, hrZiele,
} from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { notFound } from "../../../lib/http-errors.js";
import { APPROVE_ROLES, cid, uid } from "./shared.js";

const router: IRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// ABWESENHEITS-STATISTIK (Bradford-Faktor + Übersicht)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/abwesenheits-statistik", requireAuth, requirePermission("view_hr_reports"), async (req, res): Promise<void> => {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const allUrlaube = await db.select({
    mitarbeiterId: hrUrlaub.mitarbeiterId, type: hrUrlaub.type,
    days: hrUrlaub.days, status: hrUrlaub.status, startDate: hrUrlaub.startDate,
    name: hrMitarbeiter.name,
  }).from(hrUrlaub)
    .leftJoin(hrMitarbeiter, eq(hrUrlaub.mitarbeiterId, hrMitarbeiter.id))
    .where(and(eq(hrUrlaub.companyId, cid(req)), eq(hrUrlaub.status, "genehmigt"), gte(hrUrlaub.startDate, yearStart)));

  // Bradford-Faktor: B = S² × D (S = Anzahl Fehlzeitepisoden, D = Gesamttage)
  const byMa: Record<number, { name: string; episodes: number; days: number; byType: Record<string, number> }> = {};
  for (const u of allUrlaube) {
    if (!byMa[u.mitarbeiterId]) byMa[u.mitarbeiterId] = { name: u.name ?? String(u.mitarbeiterId), episodes: 0, days: 0, byType: {} };
    const entry = byMa[u.mitarbeiterId]!;
    if (u.type === "krank") { entry.episodes++; entry.days += u.days; }
    entry.byType[u.type] = (entry.byType[u.type] ?? 0) + u.days;
  }
  const result = Object.entries(byMa).map(([id, d]) => ({
    mitarbeiterId: Number(id), name: d.name,
    bradfordScore: d.episodes * d.episodes * d.days,
    krankEpisoden: d.episodes, krankTage: d.days, byType: d.byType,
  })).sort((a, b) => b.bradfordScore - a.bradfordScore);
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATEV LOHN-EXPORT (CSV)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/datev-export", requireAuth, requireRole(["admin"]), async (req, res): Promise<void> => {
  const mitarbeiter = await db.select().from(hrMitarbeiter)
    .where(and(eq(hrMitarbeiter.companyId, cid(req)), eq(hrMitarbeiter.status, "aktiv")));

  const header = [
    "Personalnummer", "Nachname", "Vorname", "Geburtsdatum", "Eintrittsdatum",
    "Beschaeftigungsart", "Wochenstunden", "Bruttolohn_Cent", "Kostenstelle",
    "IBAN", "Steuerklasse",
  ].join(";");

  const rows = mitarbeiter.map((m, i) => {
    const [nachname = "", ...rest] = m.name.split(" ");
    const vorname = rest.join(" ") || "";
    return [
      String(i + 1).padStart(6, "0"),
      nachname, vorname,
      m.birthDate ?? "",
      m.startDate,
      m.employmentType,
      m.weeklyHours ?? "",
      m.salaryGross ?? "",
      m.abteilung ?? "",
      "", // IBAN — nicht in DB gespeichert (datenschutzkonform leer)
      "", // Steuerklasse — nicht in DB gespeichert
    ].join(";");
  });

  const csv = [header, ...rows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="DATEV-Lohn-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + csv); // BOM für Excel-Kompatibilität
});

// ═══════════════════════════════════════════════════════════════════════════════
// SELF-SERVICE — Mitarbeiter sieht eigene Daten
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hr/self-service", requireAuth, async (req, res): Promise<void> => {
  const userId = uid(req);
  const [ma] = await db.select().from(hrMitarbeiter)
    .where(and(eq(hrMitarbeiter.companyId, cid(req)), eq(hrMitarbeiter.userId, userId)))
    .limit(1);
  if (!ma) throw notFound("Kein Mitarbeiterprofil gefunden");

  const [urlaube, schichten, qualifikationen, ziele] = await Promise.all([
    db.select().from(hrUrlaub)
      .where(and(eq(hrUrlaub.companyId, cid(req)), eq(hrUrlaub.mitarbeiterId, ma.id)))
      .orderBy(desc(hrUrlaub.createdAt)).limit(20),
    db.select().from(hrSchichten)
      .where(and(eq(hrSchichten.companyId, cid(req)), eq(hrSchichten.mitarbeiterId, ma.id), gte(hrSchichten.date, new Date().toISOString().slice(0, 10))))
      .orderBy(hrSchichten.date).limit(14),
    db.select({
      id: hrMitarbeiterQualifikationen.id, qualifikationName: hrQualifikationen.name,
      ablaufdatum: hrMitarbeiterQualifikationen.ablaufdatum, status: hrMitarbeiterQualifikationen.status,
    }).from(hrMitarbeiterQualifikationen)
      .leftJoin(hrQualifikationen, eq(hrMitarbeiterQualifikationen.qualifikationId, hrQualifikationen.id))
      .where(eq(hrMitarbeiterQualifikationen.mitarbeiterId, ma.id)),
    db.select().from(hrZiele)
      .where(and(eq(hrZiele.companyId, cid(req)), eq(hrZiele.mitarbeiterId, ma.id)))
      .orderBy(hrZiele.targetDate).limit(10),
  ]);

  const urlaubsgenommen = urlaube.filter(u => u.status === "genehmigt" && u.type === "urlaub").reduce((s, u) => s + u.days, 0);
  res.json({ mitarbeiter: ma, urlaube, schichten, qualifikationen, ziele, urlaubsgenommen });
});

export default router;
