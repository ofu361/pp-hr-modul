// © 2026 P&P Group. Proprietary & Confidential.
// Fristenrechnung für Arbeitsverträge — reine Funktionen, ohne Datenbank.
//
// Drei Rechnungen, die HR sonst im Kopf oder gar nicht macht:
//
//   1. § 622 BGB — die GESETZLICHE Kündigungsfrist des Arbeitgebers wächst mit
//      der Betriebszugehörigkeit. Steht im Vertrag eine kürzere, gilt trotzdem
//      die gesetzliche. Wer nur den Vertrag liest, kündigt zu spät.
//   2. § 14 Abs. 2 TzBfG — sachgrundlos höchstens ZWEI JAHRE und höchstens DREI
//      Verlängerungen. Die vierte Verlängerung oder der 25. Monat macht den
//      Vertrag unbefristet, ohne dass es jemand unterschreibt.
//   3. Probezeit — in der Probezeit gilt § 622 Abs. 3: zwei Wochen. Die
//      Entscheidung muss also zwei Wochen VOR dem Probezeitende gefallen sein,
//      nicht am letzten Tag.

export type Kuendigungstermin = "monatsende" | "quartalsende" | "fuenfzehnter_oder_monatsende" | "jederzeit";
export type Fristeinheit = "wochen" | "monate";

export interface Frist { wert: number; einheit: Fristeinheit; termin: Kuendigungstermin }

export interface VertragFuerFristen {
  id: number;
  mitarbeiterId: number;
  vertragsart: string;
  beginn: string;                 // YYYY-MM-DD
  ende: string | null;
  istVerlaengerung: boolean;
  probezeitBis: string | null;
  kuendigungsfristWert: number | null;
  kuendigungsfristEinheit: string | null;
  kuendigungstermin: string | null;
  status: string;
}

// ── Datumshilfen (UTC, damit die Zeitzone keinen Tag verschiebt) ─────────────

export function datum(s: string): Date { return new Date(`${s}T00:00:00Z`); }
export function iso(d: Date): string { return d.toISOString().slice(0, 10); }
export function tageBis(von: string, bis: string): number {
  return Math.round((datum(bis).getTime() - datum(von).getTime()) / 86_400_000);
}
export function plusTage(s: string, n: number): string {
  const d = datum(s); d.setUTCDate(d.getUTCDate() + n); return iso(d);
}
export function plusMonate(s: string, n: number): string {
  const d = datum(s);
  const tag = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  // Monatsende festhalten: 31.01. + 1 Monat = 28./29.02., nicht 03.03.
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return iso(d);
}
function monatsende(s: string): string {
  const d = datum(s);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
function quartalsende(s: string): string {
  const d = datum(s);
  const q = Math.floor(d.getUTCMonth() / 3);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)));
}
/** Volle Jahre zwischen zwei Daten. */
export function volleJahre(von: string, bis: string): number {
  const a = datum(von), b = datum(bis);
  let j = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) j--;
  return Math.max(0, j);
}
/** Monate zwischen zwei Daten, auf ganze Monate aufgerundet — so zählt § 14. */
export function monateZwischen(von: string, bis: string): number {
  const a = datum(von), b = datum(bis);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() >= a.getUTCDate() - 1) m += 1; // Ende einschließlich: 01.01.–31.12. sind 12 Monate
  return Math.max(0, m);
}

// ── 1. § 622 BGB ─────────────────────────────────────────────────────────────

/**
 * Gesetzliche Kündigungsfrist des ARBEITGEBERS nach Betriebszugehörigkeit.
 * Abs. 1: vier Wochen zum 15. oder Monatsende. Abs. 2: ab zwei Jahren ein
 * Monat zum Monatsende, dann gestaffelt bis sieben Monate ab zwanzig Jahren.
 */
export function gesetzlicheFrist(betriebsjahre: number): Frist {
  if (betriebsjahre >= 20) return { wert: 7, einheit: "monate", termin: "monatsende" };
  if (betriebsjahre >= 15) return { wert: 6, einheit: "monate", termin: "monatsende" };
  if (betriebsjahre >= 12) return { wert: 5, einheit: "monate", termin: "monatsende" };
  if (betriebsjahre >= 10) return { wert: 4, einheit: "monate", termin: "monatsende" };
  if (betriebsjahre >= 8)  return { wert: 3, einheit: "monate", termin: "monatsende" };
  if (betriebsjahre >= 5)  return { wert: 2, einheit: "monate", termin: "monatsende" };
  if (betriebsjahre >= 2)  return { wert: 1, einheit: "monate", termin: "monatsende" };
  return { wert: 4, einheit: "wochen", termin: "fuenfzehnter_oder_monatsende" };
}

/** Frühestes Vertragsende bei Kündigung am `kuendigungAm` mit dieser Frist. */
export function fruehestesEnde(kuendigungAm: string, frist: Frist): string {
  const roh = frist.einheit === "wochen" ? plusTage(kuendigungAm, frist.wert * 7) : plusMonate(kuendigungAm, frist.wert);
  switch (frist.termin) {
    case "jederzeit":    return roh;
    case "monatsende":   return monatsende(roh);
    case "quartalsende": return quartalsende(roh);
    case "fuenfzehnter_oder_monatsende": {
      const d = datum(roh);
      if (d.getUTCDate() <= 15) return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15)));
      return monatsende(roh);
    }
  }
}

export interface Kuendigungsrechnung {
  kuendigungAm: string;
  betriebsjahre: number;
  gesetzlich: Frist & { ende: string };
  vertraglich: (Frist & { ende: string }) | null;
  /** Das für den Arbeitgeber maßgebliche Ende — das SPÄTERE von beiden. */
  massgeblichesEnde: string;
  massgeblich: "gesetzlich" | "vertraglich" | "probezeit";
  /** In der Probezeit gilt § 622 Abs. 3: zwei Wochen, ohne festen Termin. */
  inProbezeit: boolean;
}

export function kuendigungRechnen(v: VertragFuerFristen, kuendigungAm: string, eintrittGesamt: string): Kuendigungsrechnung {
  const betriebsjahre = volleJahre(eintrittGesamt, kuendigungAm);
  const inProbezeit = v.probezeitBis != null && kuendigungAm <= v.probezeitBis;

  const g = gesetzlicheFrist(betriebsjahre);
  const gesetzlich = { ...g, ende: fruehestesEnde(kuendigungAm, g) };

  let vertraglich: Kuendigungsrechnung["vertraglich"] = null;
  if (v.kuendigungsfristWert && v.kuendigungsfristEinheit && v.kuendigungstermin) {
    const f: Frist = { wert: v.kuendigungsfristWert, einheit: v.kuendigungsfristEinheit as Fristeinheit, termin: v.kuendigungstermin as Kuendigungstermin };
    vertraglich = { ...f, ende: fruehestesEnde(kuendigungAm, f) };
  }

  if (inProbezeit) {
    const ende = plusTage(kuendigungAm, 14);
    return { kuendigungAm, betriebsjahre, gesetzlich, vertraglich, massgeblichesEnde: ende, massgeblich: "probezeit", inProbezeit };
  }
  // Die längere Frist gilt (§ 622 Abs. 5 S. 3 sinngemäß: vertraglich darf für
  // den Arbeitgeber nicht kürzer sein als gesetzlich).
  if (vertraglich && vertraglich.ende > gesetzlich.ende) {
    return { kuendigungAm, betriebsjahre, gesetzlich, vertraglich, massgeblichesEnde: vertraglich.ende, massgeblich: "vertraglich", inProbezeit };
  }
  return { kuendigungAm, betriebsjahre, gesetzlich, vertraglich, massgeblichesEnde: gesetzlich.ende, massgeblich: "gesetzlich", inProbezeit };
}

// ── 2. § 14 Abs. 2 TzBfG ─────────────────────────────────────────────────────

export const TZBFG_MAX_MONATE = 24;
export const TZBFG_MAX_VERLAENGERUNGEN = 3;

export interface Befristungskette {
  vertraege: number;
  verlaengerungen: number;
  gesamtMonate: number;
  ersterBeginn: string | null;
  letztesEnde: string | null;
  /** Noch möglich, ohne die Grenze zu reißen. */
  restMonate: number;
  restVerlaengerungen: number;
  /** ueberschritten: der Vertrag gilt bereits als unbefristet. */
  lage: "frei" | "knapp" | "erreicht" | "ueberschritten" | "nicht_anwendbar";
}

/**
 * Zählt die sachgrundlose Befristungskette eines Mitarbeiters. Nur Verträge
 * der Art `befristet_sachgrundlos` — mit Sachgrund gelten andere Regeln, und
 * die lassen sich nicht mechanisch prüfen.
 */
export function befristungskette(vertraege: VertragFuerFristen[]): Befristungskette {
  const kette = vertraege
    .filter((v) => v.vertragsart === "befristet_sachgrundlos" && v.ende)
    .sort((a, b) => a.beginn.localeCompare(b.beginn));
  if (kette.length === 0) {
    return { vertraege: 0, verlaengerungen: 0, gesamtMonate: 0, ersterBeginn: null, letztesEnde: null,
      restMonate: TZBFG_MAX_MONATE, restVerlaengerungen: TZBFG_MAX_VERLAENGERUNGEN, lage: "nicht_anwendbar" };
  }
  const ersterBeginn = kette[0]!.beginn;
  const letztesEnde  = kette.reduce((m, v) => (v.ende! > m ? v.ende! : m), kette[0]!.ende!);
  const gesamtMonate = monateZwischen(ersterBeginn, letztesEnde);
  // Verlängerungen: ausdrücklich markierte, mindestens aber „alle außer dem ersten".
  const verlaengerungen = Math.max(kette.filter((v) => v.istVerlaengerung).length, kette.length - 1);

  const restMonate = TZBFG_MAX_MONATE - gesamtMonate;
  const restVerlaengerungen = TZBFG_MAX_VERLAENGERUNGEN - verlaengerungen;
  let lage: Befristungskette["lage"] = "frei";
  if (restMonate < 0 || restVerlaengerungen < 0) lage = "ueberschritten";
  else if (restMonate === 0 || restVerlaengerungen === 0) lage = "erreicht";
  else if (restMonate <= 6 || restVerlaengerungen === 1) lage = "knapp";

  return { vertraege: kette.length, verlaengerungen, gesamtMonate, ersterBeginn, letztesEnde,
    restMonate: Math.max(0, restMonate), restVerlaengerungen: Math.max(0, restVerlaengerungen), lage };
}

// ── 3. Fristen je Vertrag ────────────────────────────────────────────────────

export type Fristart = "probezeit" | "befristung" | "tzbfg";
export type Dringlichkeit = "ueberfaellig" | "diese_woche" | "diesen_monat" | "quartal" | "spaeter";

export interface FristEintrag {
  vertragId: number;
  mitarbeiterId: number;
  art: Fristart;
  /** Der Tag, an dem etwas passiert (Probezeitende, Vertragsende). */
  stichtag: string;
  /** Der Tag, bis zu dem ENTSCHIEDEN sein muss — bei der Probezeit zwei Wochen früher. */
  entscheidenBis: string;
  tageBisEntscheidung: number;
  dringlichkeit: Dringlichkeit;
  hinweis: string;
}

/** Vorlauf für die Befristungsentscheidung: drei Monate, damit Stellenausschreibung oder Verlängerung noch Zeit haben. */
const VORLAUF_BEFRISTUNG_TAGE = 90;
/** Vorlauf in der Probezeit: § 622 Abs. 3 — zwei Wochen. */
const VORLAUF_PROBEZEIT_TAGE = 14;

function dringlichkeit(tage: number): Dringlichkeit {
  if (tage < 0) return "ueberfaellig";
  if (tage <= 7) return "diese_woche";
  if (tage <= 31) return "diesen_monat";
  if (tage <= 92) return "quartal";
  return "spaeter";
}

export function fristenFuerVertrag(v: VertragFuerFristen, heute: string, kette?: Befristungskette): FristEintrag[] {
  if (v.status !== "aktiv") return [];
  const aus: FristEintrag[] = [];

  if (v.probezeitBis && v.probezeitBis >= plusTage(heute, -VORLAUF_PROBEZEIT_TAGE)) {
    const entscheidenBis = plusTage(v.probezeitBis, -VORLAUF_PROBEZEIT_TAGE);
    const t = tageBis(heute, entscheidenBis);
    aus.push({
      vertragId: v.id, mitarbeiterId: v.mitarbeiterId, art: "probezeit",
      stichtag: v.probezeitBis, entscheidenBis, tageBisEntscheidung: t, dringlichkeit: dringlichkeit(t),
      hinweis: t < 0
        ? "Probezeit-Kündigungsfrist (2 Wochen) läuft bereits — jetzt ist nur noch die reguläre Frist möglich."
        : "Übernahme oder Kündigung in der Probezeit entscheiden; danach gilt die reguläre Kündigungsfrist.",
    });
  }

  if (v.ende && v.vertragsart.startsWith("befristet")) {
    const entscheidenBis = plusTage(v.ende, -VORLAUF_BEFRISTUNG_TAGE);
    const t = tageBis(heute, entscheidenBis);
    if (tageBis(heute, v.ende) >= -30) {
      let hinweis = "Verlängern, entfristen oder auslaufen lassen — und bei Auslaufen die Stelle rechtzeitig ausschreiben.";
      if (v.vertragsart === "befristet_sachgrundlos" && kette) {
        if (kette.lage === "ueberschritten") hinweis = "§ 14 TzBfG überschritten: dieser Vertrag gilt bereits als unbefristet. Befristungsende ist rechtlich wirkungslos.";
        else if (kette.lage === "erreicht")  hinweis = "§ 14 TzBfG ausgeschöpft: eine weitere sachgrundlose Verlängerung ist nicht möglich — nur Entfristung oder Ende.";
        else if (kette.lage === "knapp")     hinweis = `§ 14 TzBfG: noch ${kette.restMonate} Monate und ${kette.restVerlaengerungen} Verlängerung(en) möglich.`;
      }
      aus.push({
        vertragId: v.id, mitarbeiterId: v.mitarbeiterId, art: "befristung",
        stichtag: v.ende, entscheidenBis, tageBisEntscheidung: t, dringlichkeit: dringlichkeit(t), hinweis,
      });
    }
  }

  return aus;
}
