// © 2026 P&P Group. Proprietary & Confidential.
// Urlaubskonto — die Frage, die jeder Mitarbeiter stellt und die das System
// bisher nicht beantworten konnte: „Wie viele Tage habe ich noch?"
//
// Bisher stand am Mitarbeiter nur `urlaubstage_pro_jahr = 30`. Kein Konto:
// kein anteiliger Anspruch bei Eintritt im Mai, keine Teilzeit-Umrechnung,
// kein Resturlaub mit Verfall zum 31.03., kein Übertrag. Die Regeln hier sind
// die des BUrlG — und wo der Vertrag großzügiger ist, ist das Konto es auch,
// weil es mit den Vertragstagen rechnet, nicht mit den gesetzlichen 20.
//
// VIER REGELN, die man leicht falsch macht:
//
//   1. TEILZEIT ZÄHLT IN TAGEN, NICHT IN STUNDEN. Wer drei Tage die Woche
//      arbeitet, hat 3/5 der Urlaubstage — nicht 3/5 der Stunden. Eine
//      Halbtagskraft an fünf Tagen hat VOLLE 30 Tage (jeder ein halber
//      Arbeitstag). Deshalb `arbeitstage_pro_woche`, nicht `weekly_hours`.
//   2. EINTRITT: § 5 BUrlG. In der zweiten Jahreshälfte eingetreten →
//      ein Zwölftel je VOLLEM Monat. In der ersten Hälfte → voller Anspruch
//      (die Wartezeit von sechs Monaten ist bis Jahresende erfüllt).
//   3. AUSTRITT: § 5 Abs. 1c. In der ersten Jahreshälfte → ein Zwölftel je
//      vollem Monat. In der zweiten Hälfte → VOLLER Anspruch, auch wenn man
//      am 1. Juli geht. Das überrascht jeden, der es zum ersten Mal hört.
//   4. BRUCHTEILE ≥ 0,5 werden AUFGERUNDET (§ 5 Abs. 2), kleinere bleiben
//      als Bruchteil stehen. Nicht kaufmännisch runden.
//
// ÜBERTRAG: der Rest des Vorjahres wandert mit und verfällt am 31.03., wenn
// er bis dahin nicht genommen ist (§ 7 Abs. 3). Genommene Tage im ersten
// Quartal zehren ZUERST den Übertrag auf — sonst verfiele er, obwohl der
// Mitarbeiter im Januar Urlaub hatte. Wer das anders geregelt hat (längere
// Übertragsfrist, Auszahlung), trägt eine Korrektur ein; die schlägt die
// Rechnung.

export interface MitarbeiterFuerKonto {
  id: number;
  startDate: string;              // YYYY-MM-DD
  endDate: string | null;
  urlaubstageProJahr: number;     // bezogen auf eine 5-Tage-Woche
  arbeitstageProWoche: number;    // 1–6
}

export interface UrlaubFuerKonto {
  mitarbeiterId: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

export interface KorrekturFuerKonto {
  mitarbeiterId: number;
  jahr: number;
  /** uebertrag ERSETZT den gerechneten Übertrag; korrektur/auszahlung/verfall werden addiert (Vorzeichen frei). */
  art: "uebertrag" | "korrektur" | "auszahlung" | "verfall";
  tage: number;
}

export interface Urlaubskonto {
  mitarbeiterId: number;
  jahr: number;
  /** Anspruch des Jahres nach BUrlG-Regeln, Teilzeit umgerechnet, Bruchteile ≥ 0,5 aufgerundet. */
  anspruch: number;
  anspruchGrund: "voll" | "eintritt_zwoelftel" | "austritt_zwoelftel" | "nicht_beschaeftigt";
  volleMonate: number;
  /** Übertrag aus dem Vorjahr (gerechnet oder per Korrektur gesetzt). */
  uebertrag: number;
  uebertragGesetzt: boolean;
  /** Vom Übertrag bis 31.03. genommen. */
  uebertragGenommen: number;
  /** Nach dem 31.03. verfallener Übertrag. */
  uebertragVerfallen: number;
  korrekturen: number;
  genommen: number;          // genehmigt, Ende ≤ heute
  verplant: number;          // genehmigt, in der Zukunft
  beantragt: number;         // ausstehend
  rest: number;              // anspruch + uebertrag − verfallen + korrekturen − genommen − verplant
  restNachAntraegen: number; // rest − beantragt
  hinweise: string[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Bruchteile ≥ 0,5 aufrunden, kleinere auf eine Nachkommastelle lassen (§ 5 Abs. 2 BUrlG). */
export function rundeUrlaub(tage: number): number {
  const ganz = Math.floor(tage);
  const rest = tage - ganz;
  if (rest >= 0.5) return ganz + 1;
  return Math.round(tage * 10) / 10;
}

/** Volle Beschäftigungsmonate innerhalb des Jahres. */
export function volleMonateImJahr(startDate: string, endDate: string | null, jahr: number): number {
  const jahresAnfang = new Date(Date.UTC(jahr, 0, 1));
  const jahresEnde   = new Date(Date.UTC(jahr, 11, 31));
  const von = new Date(`${startDate}T00:00:00Z`) > jahresAnfang ? new Date(`${startDate}T00:00:00Z`) : jahresAnfang;
  const bis = endDate && new Date(`${endDate}T00:00:00Z`) < jahresEnde ? new Date(`${endDate}T00:00:00Z`) : jahresEnde;
  if (bis < von) return 0;
  let monate = 0;
  // Ein Monat ist voll, wenn er vom Ersten bis zum Letzten beschäftigt war.
  for (let m = 0; m < 12; m++) {
    const mAnfang = new Date(Date.UTC(jahr, m, 1));
    const mEnde   = new Date(Date.UTC(jahr, m + 1, 0));
    if (von <= mAnfang && bis >= mEnde) monate++;
  }
  return monate;
}

export function jahresanspruch(m: MitarbeiterFuerKonto, jahr: number): Pick<Urlaubskonto, "anspruch" | "anspruchGrund" | "volleMonate"> {
  const jahresAnfang = `${jahr}-01-01`, jahresEnde = `${jahr}-12-31`, jahresMitte = `${jahr}-06-30`;
  if (m.startDate > jahresEnde || (m.endDate && m.endDate < jahresAnfang)) {
    return { anspruch: 0, anspruchGrund: "nicht_beschaeftigt", volleMonate: 0 };
  }
  const voll = m.urlaubstageProJahr * Math.min(Math.max(m.arbeitstageProWoche, 1), 6) / 5;
  const volleMonate = volleMonateImJahr(m.startDate, m.endDate, jahr);

  // Eintritt in der zweiten Jahreshälfte → Zwölftelung.
  if (m.startDate > jahresMitte && m.startDate >= jahresAnfang) {
    return { anspruch: rundeUrlaub(voll * volleMonate / 12), anspruchGrund: "eintritt_zwoelftel", volleMonate };
  }
  // Austritt in der ersten Jahreshälfte → Zwölftelung. In der zweiten: voll.
  if (m.endDate && m.endDate <= jahresMitte && m.endDate >= jahresAnfang) {
    return { anspruch: rundeUrlaub(voll * volleMonate / 12), anspruchGrund: "austritt_zwoelftel", volleMonate };
  }
  return { anspruch: rundeUrlaub(voll), anspruchGrund: "voll", volleMonate };
}

/**
 * Das Konto eines Jahres. `vorjahrRest` ist der Rest des Vorjahres (rekursiv
 * gerechnet oder null, wenn das Vorjahr vor dem Eintritt liegt).
 */
export function urlaubskonto(
  m: MitarbeiterFuerKonto, jahr: number, heute: string,
  urlaube: UrlaubFuerKonto[], korrekturen: KorrekturFuerKonto[], vorjahrRest: number | null,
): Urlaubskonto {
  const hinweise: string[] = [];
  const a = jahresanspruch(m, jahr);
  const eigene = urlaube.filter((u) => u.mitarbeiterId === m.id && u.type === "urlaub" && u.startDate.startsWith(String(jahr)));
  const eigeneKorr = korrekturen.filter((k) => k.mitarbeiterId === m.id && k.jahr === jahr);

  const genommen  = eigene.filter((u) => u.status === "genehmigt" && u.endDate <= heute).reduce((s, u) => s + u.days, 0);
  const verplant  = eigene.filter((u) => u.status === "genehmigt" && u.endDate > heute).reduce((s, u) => s + u.days, 0);
  const beantragt = eigene.filter((u) => u.status === "ausstehend").reduce((s, u) => s + u.days, 0);

  // Übertrag: gesetzt schlägt gerechnet.
  const gesetzt = eigeneKorr.find((k) => k.art === "uebertrag");
  const uebertrag = gesetzt ? gesetzt.tage : Math.max(0, vorjahrRest ?? 0);
  const stichtag = `${jahr}-03-31`;
  const bisStichtag = eigene.filter((u) => u.status === "genehmigt" && u.endDate <= stichtag).reduce((s, u) => s + u.days, 0);
  const uebertragGenommen = Math.min(uebertrag, bisStichtag);
  // Verfallen ist nur, was am 31.03. übrig war UND der Stichtag schon vorbei ist.
  const uebertragVerfallen = heute > stichtag ? Math.max(0, uebertrag - uebertragGenommen) : 0;
  if (uebertragVerfallen > 0) hinweise.push(`${uebertragVerfallen} Tage Übertrag sind am 31.03. verfallen.`);
  if (heute <= stichtag && uebertrag - uebertragGenommen > 0) hinweise.push(`${uebertrag - uebertragGenommen} Tage Übertrag verfallen am 31.03., wenn sie bis dahin nicht genommen sind.`);

  const korr = eigeneKorr.filter((k) => k.art !== "uebertrag").reduce((s, k) => s + k.tage, 0);
  const rest = Math.round((a.anspruch + uebertrag - uebertragVerfallen + korr - genommen - verplant) * 10) / 10;
  if (rest < 0) hinweise.push(`Das Konto ist um ${-rest} Tage überzogen.`);
  if (a.anspruchGrund === "eintritt_zwoelftel") hinweise.push(`Eintritt in der zweiten Jahreshälfte: ${a.volleMonate}/12 des Jahresanspruchs (§ 5 BUrlG).`);
  if (a.anspruchGrund === "austritt_zwoelftel") hinweise.push(`Austritt in der ersten Jahreshälfte: ${a.volleMonate}/12 des Jahresanspruchs (§ 5 BUrlG).`);

  return {
    mitarbeiterId: m.id, jahr, ...a,
    uebertrag, uebertragGesetzt: Boolean(gesetzt), uebertragGenommen, uebertragVerfallen,
    korrekturen: korr, genommen, verplant, beantragt, rest,
    restNachAntraegen: Math.round((rest - beantragt) * 10) / 10,
    hinweise,
  };
}

/**
 * Konto eines Jahres samt rekursiv gerechnetem Übertrag — zurück bis zum
 * Eintrittsjahr, höchstens aber `maxJahre` (sonst rechnet ein 20-jähriger
 * Mitarbeiter 20 Konten für eine Anzeige).
 */
export function urlaubskontoMitHistorie(
  m: MitarbeiterFuerKonto, jahr: number, heute: string,
  urlaube: UrlaubFuerKonto[], korrekturen: KorrekturFuerKonto[], maxJahre = 5,
): Urlaubskonto {
  const eintrittsjahr = Number(m.startDate.slice(0, 4));
  const startJahr = Math.max(eintrittsjahr, jahr - maxJahre);
  let vorjahrRest: number | null = null;
  let konto: Urlaubskonto | null = null;
  for (let j = startJahr; j <= jahr; j++) {
    // Für vergangene Jahre zählt alles Genehmigte als genommen (heute = Jahresende).
    const stand = j < jahr ? `${j}-12-31` : heute;
    konto = urlaubskonto(m, j, stand, urlaube, korrekturen, vorjahrRest);
    vorjahrRest = konto.rest;
  }
  return konto!;
}

export { ymd as _ymd };
