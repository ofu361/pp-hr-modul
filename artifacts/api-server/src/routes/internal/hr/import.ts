// © 2026 P&P Group. Proprietary & Confidential.
// HR — Personalstamm-Import (0436): Vorschau ohne Schreiben, dann Übernahme.
import { Router, type IRouter } from "express";
import { requireAuth } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { badRequest } from "../../../lib/http-errors.js";
import { importVorschau, importUebernehmen, type ImportVorschau } from "../../../lib/hr/import.js";
import { cid } from "./shared.js";

const router: IRouter = Router();
const MAX_ZEICHEN = 2_000_000;

function textAusBody(b: Record<string, unknown>): string {
  const text = typeof b.csv === "string" ? b.csv : "";
  if (!text.trim()) throw badRequest("Kein CSV-Text übergeben (Feld csv)");
  if (text.length > MAX_ZEICHEN) throw badRequest("Datei zu groß — höchstens 2 MB Text");
  return text;
}

/** Vorschau: nichts wird geschrieben. */
router.post("/hr/import/vorschau", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const vorschau = await importVorschau(cid(req), textAusBody((req.body ?? {}) as Record<string, unknown>));
  if (Object.keys(vorschau.spaltenErkannt).length === 0) throw badRequest("Keine bekannte Spalte erkannt — die erste Zeile muss Überschriften tragen (z. B. Name; Eintritt; Monatsbrutto).");
  if (!vorschau.spaltenErkannt.name && !vorschau.spaltenErkannt.nachname) throw badRequest("Keine Namensspalte erkannt (Name oder Vorname/Nachname).");
  res.json(vorschau);
});

/**
 * Übernahme: der Client schickt den CSV-Text ERNEUT, nicht die Vorschau —
 * die Vorschau wird serverseitig neu gerechnet. Sonst könnte ein manipulierter
 * Client Felder übernehmen lassen, die die Prüfung nie gesehen hat.
 */
router.post("/hr/import/uebernehmen", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const vorschau: ImportVorschau = await importVorschau(companyId, textAusBody((req.body ?? {}) as Record<string, unknown>));
  const ergebnis = await importUebernehmen(companyId, vorschau);
  res.json({ ...ergebnis, fehlerzeilen: vorschau.zeilen.filter((z) => z.urteil === "fehler").map((z) => ({ nr: z.nr, name: z.name, probleme: z.probleme })) });
});

export default router;
