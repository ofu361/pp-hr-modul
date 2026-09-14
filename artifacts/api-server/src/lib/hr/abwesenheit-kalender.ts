// © 2026 P&P Group. Proprietary & Confidential.
// Genehmigte Abwesenheiten in den Kalender — eigener Kalender des Mitarbeiters
// und Team-Abwesenheitskalender der Firma (0431).
//
// ⚠ Diese Funktion WIRFT NICHT. Der Kalender ist der Genehmigung nachgelagert:
//   ein abgelaufenes Token darf keinen Urlaubsantrag scheitern lassen. Fehler
//   stehen an der Abwesenheit (`kalender_fehler`), und `nachholen()` schreibt
//   sie später nach.
import { and, eq, or, isNotNull, sql } from "drizzle-orm";
import { db, hrUrlaub, hrMitarbeiter, kalenderTokens, type KalenderEintrag } from "@workspace/db";
import { zugriff } from "../kalender-sync/abgleich.js";
import { vonTagesdatum, type Gemeinsam } from "../kalender-sync/abbildung.js";
import { logger } from "../logger.js";

const ART_LABEL: Record<string, string> = {
  urlaub: "Urlaub", krank: "Krank", sonderurlaub: "Sonderurlaub", "überstunden": "Überstundenabbau", homeoffice: "Homeoffice",
};

type Urlaub = typeof hrUrlaub.$inferSelect;
type Verbindung = typeof kalenderTokens.$inferSelect;

/** Termin für ein Ziel. Im eigenen Kalender steht die Art; im Teamkalender der Name. */
export function terminFuer(u: Urlaub, name: string, ziel: KalenderEintrag["ziel"]): Gemeinsam {
  const art = ART_LABEL[u.type] ?? u.type;
  // ⚠ Krankheit im Teamkalender: nur „Abwesend", nicht „Krank". Der Grund einer
  //   Abwesenheit ist im eigenen Kalender die Sache des Mitarbeiters; im
  //   Kalender, den die ganze Abteilung abonniert, ist er ein Gesundheitsdatum.
  const teamTitel = u.type === "krank" ? `Abwesend: ${name}` : `Abwesend: ${name} (${art})`;
  return {
    titel: ziel === "eigen" ? art : teamTitel,
    startAt: vonTagesdatum(u.startDate),
    endAt: vonTagesdatum(u.endDate),   // inklusiv; hinausschreiben rechnet den Folgetag selbst
    ganztaegig: true,
    beschreibung: ziel === "eigen" ? (u.reason ?? null) : null,
    ort: null,
  };
}

/** Die Zielverbindungen: eigener Kalender (wenn der Mitarbeiter ein Konto mit Verbindung hat) und Teamkalender. */
export async function ziele(companyId: number, userId: number | null): Promise<Array<{ verbindung: Verbindung; ziel: KalenderEintrag["ziel"] }>> {
  const aus: Array<{ verbindung: Verbindung; ziel: KalenderEintrag["ziel"] }> = [];
  if (userId) {
    const eigene = await db.select().from(kalenderTokens).where(and(
      eq(kalenderTokens.companyId, companyId), eq(kalenderTokens.userId, userId), eq(kalenderTokens.aktiv, true),
      // Wer nur liest (`rein`), bekommt nichts geschrieben.
      sql`${kalenderTokens.richtung} <> 'rein'`,
    ));
    for (const v of eigene) if (!v.abwesenheitskalender) aus.push({ verbindung: v, ziel: "eigen" });
  }
  const [team] = await db.select().from(kalenderTokens).where(and(
    eq(kalenderTokens.companyId, companyId), eq(kalenderTokens.abwesenheitskalender, true), eq(kalenderTokens.aktiv, true),
  )).limit(1);
  if (team) aus.push({ verbindung: team, ziel: "team" });
  return aus;
}

export interface SyncErgebnis { eintraege: KalenderEintrag[]; fehler: string | null; geschrieben: number; geloescht: number }

/**
 * Bringt den Kalender auf den Stand der Abwesenheit: genehmigt → anlegen oder
 * aktualisieren; alles andere → löschen. Idempotent.
 */
export async function abwesenheitAbgleichen(urlaubId: number): Promise<SyncErgebnis> {
  const [u] = await db.select().from(hrUrlaub).where(eq(hrUrlaub.id, urlaubId));
  if (!u) return { eintraege: [], fehler: "Abwesenheit nicht gefunden", geschrieben: 0, geloescht: 0 };
  const [ma] = await db.select({ name: hrMitarbeiter.name, userId: hrMitarbeiter.userId }).from(hrMitarbeiter).where(eq(hrMitarbeiter.id, u.mitarbeiterId));
  if (!ma) return { eintraege: [], fehler: "Mitarbeiter nicht gefunden", geschrieben: 0, geloescht: 0 };

  const vorhanden = (u.kalenderEintraege ?? []) as KalenderEintrag[];
  const neu: KalenderEintrag[] = [];
  const fehler: string[] = [];
  let geschrieben = 0, geloescht = 0;

  const soll = u.status === "genehmigt" ? await ziele(u.companyId, ma.userId) : [];
  const sollIds = new Set(soll.map((z) => z.verbindung.id));

  // 1. Löschen, was nicht mehr hingehört (abgelehnt, storniert, Verbindung weg).
  for (const e of vorhanden) {
    if (sollIds.has(e.verbindungId)) continue;
    const [v] = await db.select().from(kalenderTokens).where(eq(kalenderTokens.id, e.verbindungId));
    if (!v) continue; // Verbindung gelöscht — der Termin ist nicht mehr erreichbar, Eintrag fällt weg.
    try { await (await zugriff(v)).loeschen(e.externalId); geloescht++; }
    catch (err) { fehler.push(`Löschen (${e.ziel}): ${String((err as Error).message ?? err)}`); neu.push(e); }
  }

  // 2. Anlegen oder aktualisieren, was hingehört.
  for (const { verbindung, ziel } of soll) {
    const alt = vorhanden.find((e) => e.verbindungId === verbindung.id);
    const t = terminFuer(u, ma.name, ziel);
    try {
      const zug = await zugriff(verbindung);
      if (alt) {
        try { await zug.aktualisieren(alt.externalId, t); neu.push(alt); }
        catch (err) {
          // 404: der Termin wurde im Kalender von Hand gelöscht — neu anlegen statt aufgeben.
          if (/404|nicht gefunden|not found/i.test(String((err as Error).message))) { const r = await zug.anlegen(t); neu.push({ verbindungId: verbindung.id, externalId: r.externalId, ziel }); }
          else throw err;
        }
      } else {
        const r = await zug.anlegen(t);
        neu.push({ verbindungId: verbindung.id, externalId: r.externalId, ziel });
      }
      geschrieben++;
    } catch (err) {
      fehler.push(`${ziel}: ${String((err as Error).message ?? err)}`);
      if (alt) neu.push(alt);
    }
  }

  const fehlerText = fehler.length ? fehler.join(" | ").slice(0, 1000) : null;
  await db.update(hrUrlaub).set({ kalenderEintraege: neu, kalenderFehler: fehlerText, kalenderAt: new Date() }).where(eq(hrUrlaub.id, u.id));
  if (fehlerText) logger.warn({ urlaubId, fehler: fehlerText }, "Abwesenheit: Kalender nicht vollständig geschrieben");
  return { eintraege: neu, fehler: fehlerText, geschrieben, geloescht };
}

/** Schreibt im Hintergrund — der Aufrufer wartet nicht und scheitert nicht. */
export function abwesenheitAbgleichenSpaeter(urlaubId: number): void {
  void abwesenheitAbgleichen(urlaubId).catch((err) => logger.error({ urlaubId, err }, "Abwesenheit: Kalenderabgleich abgebrochen"));
}

/** Nachholen: genehmigte ohne Eintrag oder mit Fehler, sowie nicht-genehmigte mit Eintrag. */
export async function nachholen(companyId: number, max = 50): Promise<{ geprueft: number; fehler: number }> {
  const offen = await db.select({ id: hrUrlaub.id }).from(hrUrlaub).where(and(
    eq(hrUrlaub.companyId, companyId),
    or(
      isNotNull(hrUrlaub.kalenderFehler),
      and(eq(hrUrlaub.status, "genehmigt"), sql`${hrUrlaub.kalenderEintraege} = '[]'::jsonb`, sql`${hrUrlaub.endDate} >= CURRENT_DATE::text`),
      and(sql`${hrUrlaub.status} <> 'genehmigt'`, sql`${hrUrlaub.kalenderEintraege} <> '[]'::jsonb`),
    ),
  )).limit(max);
  let fehler = 0;
  for (const o of offen) { const r = await abwesenheitAbgleichen(o.id); if (r.fehler) fehler++; }
  return { geprueft: offen.length, fehler };
}
