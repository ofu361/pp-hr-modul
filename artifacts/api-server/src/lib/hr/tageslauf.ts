// © 2026 P&P Group. Proprietary & Confidential.
// HR-Tageslauf (0436) — vier Dinge, die bisher jemand im Kopf haben musste.
//
// 1. FRISTEN WERDEN AUFGABEN. Probezeit, Befristung, § 14 TzBfG, ablaufende
//    Sachkunde: bisher eine Liste, die jemand öffnen musste. Jetzt landet jede
//    Frist, deren Entscheidungstag in ≤ 30 Tagen liegt, als Benachrichtigung
//    bei HR — genau einmal je Frist und Stichtag (hr_erinnerungen).
//
// 2. ABWESENHEIT STEUERT DEN VERTEILER. Eine genehmigte HR-Abwesenheit setzt
//    `anfrage_verteiler.abwesend_bis` für den verknüpften Benutzer — ab heute,
//    nicht im Voraus: der Verteiler kennt kein `abwesend_ab`, ein Eintrag würde
//    SOFORT wirken (Befund 11.09.). Deshalb schreibt der Lauf nur Abwesenheiten,
//    die HEUTE laufen, und nur, wenn der Verteiler-Eintrag nicht schon weiter
//    reicht (Handeinträge bleiben unangetastet). Krankheit zählt mit —
//    Urlaub, Krank, Sonderurlaub; Homeoffice nicht.
//
// 3. OFFBOARDING. Mitarbeiter mit Austritt in ≤ 60 Tagen bekommen die
//    Schrittliste angelegt und HR eine Meldung; am Austrittstag noch offene
//    Sicherheitsschritte (Konto, Kalender, Verteiler) werden gemeldet, nicht
//    ausgeführt.
//
// 4. BEM. Wer die Sechs-Wochen-Schwelle überschreitet, wird HR gemeldet —
//    einmal je Mitarbeiter und Quartal, nur in-App (Gesundheitsdatum).
//
// Der Lauf ist mandantenübergreifend (runWithBypass beim Aufruf) und
// idempotent: ein zweiter Lauf am selben Tag ändert nichts.
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import {
  db, companies, users, hrMitarbeiter, hrArbeitsvertraege, hrMitarbeiterQualifikationen, hrQualifikationen,
  hrUrlaub, hrErinnerungen, hrOffboarding, anfrageVerteiler,
} from "@workspace/db";
import { zustellenAnViele } from "../notify.js";
import { befristungskette, fristenFuerVertrag, plusTage, tageBis, type VertragFuerFristen } from "./vertragsfristen.js";
import { bemPruefung } from "./pflichten.js";
import { offboardingAnlegen, OFFBOARDING_SCHRITTE } from "./offboarding.js";
import { logger } from "../logger.js";

const FRIST_VORLAUF_TAGE = 30;
const OFFBOARDING_VORLAUF_TAGE = 60;
const SACHKUNDE_VORLAUF_TAGE = 60;

export interface TageslaufErgebnis {
  firmen: number; fristenGemeldet: number; verteilerGesetzt: number; verteilerFreigegeben: number;
  offboardingAngelegt: number; offboardingGemeldet: number; bemGemeldet: number;
}

const heute = () => new Date().toISOString().slice(0, 10);

/** Empfänger: alle, die manage_hr haben — hier über die Rolle, wie in der Rechte-Matrix hinterlegt (admin, manager). */
async function hrEmpfaenger(companyId: number): Promise<number[]> {
  const rows = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.companyId, companyId), eq(users.isActive, true), inArray(users.role, ["admin", "manager"])));
  return rows.map((r) => r.id);
}

/** Meldet einmal je Schlüssel. Liefert true, wenn gemeldet wurde. */
async function einmal(companyId: number, schluessel: string, melden: () => Promise<void>): Promise<boolean> {
  const [da] = await db.select({ id: hrErinnerungen.id }).from(hrErinnerungen)
    .where(and(eq(hrErinnerungen.companyId, companyId), eq(hrErinnerungen.schluessel, schluessel))).limit(1);
  if (da) return false;
  await melden();
  await db.insert(hrErinnerungen).values({ companyId, schluessel }).onConflictDoNothing();
  return true;
}

export async function hrTageslauf(): Promise<TageslaufErgebnis> {
  const tag = heute();
  const erg: TageslaufErgebnis = { firmen: 0, fristenGemeldet: 0, verteilerGesetzt: 0, verteilerFreigegeben: 0, offboardingAngelegt: 0, offboardingGemeldet: 0, bemGemeldet: 0 };
  const firmen = await db.select({ id: companies.id }).from(companies);

  for (const { id: companyId } of firmen) {
    const mitarbeiter = await db.select().from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId));
    if (mitarbeiter.length === 0) continue;
    erg.firmen++;
    const aktive = mitarbeiter.filter((m) => !m.endDate || m.endDate >= tag);
    const namen = new Map(mitarbeiter.map((m) => [m.id, m.name]));
    const empfaenger = await hrEmpfaenger(companyId);

    // ── 1. Fristen ─────────────────────────────────────────────────────────
    try {
      const vertraege = await db.select().from(hrArbeitsvertraege).where(and(eq(hrArbeitsvertraege.companyId, companyId), eq(hrArbeitsvertraege.status, "aktiv")));
      const jeMa = new Map<number, VertragFuerFristen[]>();
      for (const v of vertraege) {
        if (!jeMa.has(v.mitarbeiterId)) jeMa.set(v.mitarbeiterId, []);
        jeMa.get(v.mitarbeiterId)!.push({ id: v.id, mitarbeiterId: v.mitarbeiterId, vertragsart: v.vertragsart, beginn: v.beginn, ende: v.ende, istVerlaengerung: v.istVerlaengerung, probezeitBis: v.probezeitBis, kuendigungsfristWert: v.kuendigungsfristWert, kuendigungsfristEinheit: v.kuendigungsfristEinheit, kuendigungstermin: v.kuendigungstermin, status: v.status });
      }
      for (const [maId, vs] of jeMa) {
        if (!aktive.some((m) => m.id === maId)) continue;
        const kette = befristungskette(vs);
        for (const v of vs) for (const f of fristenFuerVertrag(v, tag, kette)) {
          if (f.tageBisEntscheidung > FRIST_VORLAUF_TAGE) continue;
          const art = f.art === "probezeit" ? "Probezeit" : "Befristung";
          const ok = await einmal(companyId, `frist:${f.art}:${f.vertragId}:${f.entscheidenBis}`, () => zustellenAnViele({
            companyId, userIds: empfaenger, type: "hr_frist",
            title: `${art} ${namen.get(maId) ?? ""}: entscheiden bis ${f.entscheidenBis}`,
            body: `${f.hinweis} Stichtag ${f.stichtag}.`,
            entityType: "hr_mitarbeiter", entityId: maId,
          }));
          if (ok) erg.fristenGemeldet++;
        }
      }
      // Ablaufende Sachkunde/Qualifikationen
      const quali = await db.select({ mitarbeiterId: hrMitarbeiterQualifikationen.mitarbeiterId, ablauf: hrMitarbeiterQualifikationen.ablaufdatum, name: hrQualifikationen.name, id: hrMitarbeiterQualifikationen.id })
        .from(hrMitarbeiterQualifikationen).innerJoin(hrQualifikationen, eq(hrMitarbeiterQualifikationen.qualifikationId, hrQualifikationen.id))
        .where(and(eq(hrMitarbeiterQualifikationen.companyId, companyId), eq(hrMitarbeiterQualifikationen.status, "aktiv")));
      for (const q of quali) {
        if (!q.ablauf || !aktive.some((m) => m.id === q.mitarbeiterId)) continue;
        const t = tageBis(tag, q.ablauf);
        if (t > SACHKUNDE_VORLAUF_TAGE || t < -30) continue;
        const ok = await einmal(companyId, `quali:${q.id}:${q.ablauf}`, () => zustellenAnViele({
          companyId, userIds: empfaenger, type: "hr_frist",
          title: `${q.name} von ${namen.get(q.mitarbeiterId) ?? ""} ${t < 0 ? "ist abgelaufen" : `läuft am ${q.ablauf} ab`}`,
          body: t < 0 ? "Der Nachweis ist abgelaufen — bis zur Erneuerung zählt er nicht als Qualifikation." : "Erneuerung rechtzeitig anstoßen.",
          entityType: "hr_mitarbeiter", entityId: q.mitarbeiterId,
        }));
        if (ok) erg.fristenGemeldet++;
      }
    } catch (err) { logger.warn({ companyId, err }, "HR-Tageslauf: Fristen"); }

    // ── 2. Abwesenheit → Verteiler ─────────────────────────────────────────
    try {
      const heuteAbwesend = await db.select({ mitarbeiterId: hrUrlaub.mitarbeiterId, endDate: hrUrlaub.endDate }).from(hrUrlaub).where(and(
        eq(hrUrlaub.companyId, companyId), eq(hrUrlaub.status, "genehmigt"),
        inArray(hrUrlaub.type, ["urlaub", "krank", "sonderurlaub"]),
        lte(hrUrlaub.startDate, tag), gte(hrUrlaub.endDate, tag),
      ));
      const bisJeUser = new Map<number, string>();
      for (const a of heuteAbwesend) {
        const m = mitarbeiter.find((x) => x.id === a.mitarbeiterId);
        if (!m?.userId) continue;
        const bisher = bisJeUser.get(m.userId);
        if (!bisher || a.endDate > bisher) bisJeUser.set(m.userId, a.endDate);
      }
      const verteiler = await db.select().from(anfrageVerteiler).where(eq(anfrageVerteiler.companyId, companyId));
      for (const v of verteiler) {
        const soll = bisJeUser.get(v.userId);
        if (soll) {
          // Nur verlängern, nie kürzen — ein Handeintrag, der weiter reicht, bleibt.
          if (!v.abwesendBis || v.abwesendBis < soll) {
            await db.update(anfrageVerteiler).set({ abwesendBis: soll, updatedAt: new Date() }).where(eq(anfrageVerteiler.id, v.id));
            erg.verteilerGesetzt++;
          }
        } else if (v.abwesendBis && v.abwesendBis < tag) {
          // Abgelaufene Abwesenheit aufräumen — der Verteiler tut das nicht selbst.
          await db.update(anfrageVerteiler).set({ abwesendBis: null, updatedAt: new Date() }).where(eq(anfrageVerteiler.id, v.id));
          erg.verteilerFreigegeben++;
        }
      }
    } catch (err) { logger.warn({ companyId, err }, "HR-Tageslauf: Verteiler"); }

    // ── 3. Offboarding ─────────────────────────────────────────────────────
    try {
      const grenze = plusTage(tag, OFFBOARDING_VORLAUF_TAGE);
      const austritte = mitarbeiter.filter((m) => m.endDate && m.endDate <= grenze && m.endDate >= plusTage(tag, -30));
      for (const m of austritte) {
        const n = await offboardingAnlegen(companyId, m.id);
        if (n > 0) {
          erg.offboardingAngelegt++;
          await einmal(companyId, `offboarding:angelegt:${m.id}:${m.endDate}`, () => zustellenAnViele({
            companyId, userIds: empfaenger, type: "hr_offboarding",
            title: `Austritt ${m.name} am ${m.endDate}: Offboarding-Liste angelegt`,
            body: `${OFFBOARDING_SCHRITTE.length} Schritte, davon ${OFFBOARDING_SCHRITTE.filter((s) => s.automatisch).length} per Klick ausführbar.`,
            entityType: "hr_mitarbeiter", entityId: m.id,
          }));
        }
        // Austrittstag erreicht, Sicherheitsschritte offen → melden.
        if (m.endDate! <= tag) {
          const offen = await db.select({ schritt: hrOffboarding.schritt }).from(hrOffboarding).where(and(
            eq(hrOffboarding.companyId, companyId), eq(hrOffboarding.mitarbeiterId, m.id), eq(hrOffboarding.status, "offen"), eq(hrOffboarding.automatisch, true)));
          if (offen.length) {
            const ok = await einmal(companyId, `offboarding:offen:${m.id}:${tag}`, () => zustellenAnViele({
              companyId, userIds: empfaenger, type: "hr_offboarding",
              title: `${m.name} ist ausgeschieden — ${offen.length} Sicherheitsschritt(e) offen`,
              body: offen.map((o) => OFFBOARDING_SCHRITTE.find((s) => s.schluessel === o.schritt)?.titel ?? o.schritt).join(", "),
              entityType: "hr_mitarbeiter", entityId: m.id,
            }));
            if (ok) erg.offboardingGemeldet++;
          }
        }
      }
    } catch (err) { logger.warn({ companyId, err }, "HR-Tageslauf: Offboarding"); }

    // ── 4. BEM ─────────────────────────────────────────────────────────────
    try {
      const vor = plusTage(tag, -400);
      const krank = await db.select({ mitarbeiterId: hrUrlaub.mitarbeiterId, startDate: hrUrlaub.startDate, endDate: hrUrlaub.endDate, days: hrUrlaub.days, status: hrUrlaub.status, type: hrUrlaub.type })
        .from(hrUrlaub).where(and(eq(hrUrlaub.companyId, companyId), eq(hrUrlaub.type, "krank"), gte(hrUrlaub.endDate, vor)));
      const quartal = `${tag.slice(0, 4)}-Q${Math.floor((Number(tag.slice(5, 7)) - 1) / 3) + 1}`;
      for (const m of aktive) {
        const p = bemPruefung(m.id, krank, tag);
        if (!p.pflicht) continue;
        const ok = await einmal(companyId, `bem:${m.id}:${quartal}`, () => zustellenAnViele({
          companyId, userIds: empfaenger, type: "hr_bem",
          title: `BEM-Pflicht: ${m.name} (${p.krankArbeitstage} Krankheitstage in 12 Monaten)`,
          body: "Mehr als sechs Wochen arbeitsunfähig — § 167 Abs. 2 SGB IX verpflichtet zum Angebot eines Eingliederungsmanagements. Angebot dokumentieren, auch eine Ablehnung.",
          entityType: "hr_mitarbeiter", entityId: m.id,
        }));
        if (ok) erg.bemGemeldet++;
      }
    } catch (err) { logger.warn({ companyId, err }, "HR-Tageslauf: BEM"); }
  }

  logger.info(erg, "HR-Tageslauf abgeschlossen");
  return erg;
}
