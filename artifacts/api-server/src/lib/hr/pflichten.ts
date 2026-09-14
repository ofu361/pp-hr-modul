// © 2026 P&P Group. Proprietary & Confidential.
// Zwei gesetzliche Pflichten, die aus vorhandenen HR-Daten folgen und die
// bisher niemand erkannte.
//
// 1. § 34c GewO / § 15b MaBV — WEITERBILDUNGSPFLICHT. Makler und
//    Wohnimmobilienverwalter (und ihre unmittelbar mitwirkenden Beschäftigten)
//    müssen 20 Stunden Weiterbildung in DREI KALENDERJAHREN nachweisen. Der
//    Zeitraum beginnt mit dem Kalenderjahr der Aufnahme der Tätigkeit; danach
//    folgt der nächste Dreijahreszeitraum nahtlos. Wer es versäumt, riskiert
//    Bußgeld und die Gewerbeuntersagung — für ein Verwaltungsunternehmen die
//    Existenz. Das hat kein allgemeines HR-System; es ist unsere Branche.
//
// 2. § 167 Abs. 2 SGB IX — BETRIEBLICHES EINGLIEDERUNGSMANAGEMENT. Ist ein
//    Beschäftigter innerhalb eines Jahres länger als SECHS WOCHEN
//    ununterbrochen oder wiederholt arbeitsunfähig, MUSS der Arbeitgeber ein
//    BEM anbieten. Die Daten liegen längst im Bradford-Faktor; die Pflicht
//    erkannte niemand. Sechs Wochen sind 30 Arbeitstage bei einer
//    Fünftagewoche — gezählt werden Arbeitstage, nicht Kalendertage.
//
// ⚠ Beides sind Pflichten des Arbeitgebers, nicht Vorwürfe an den Mitarbeiter.
//   Die BEM-Meldung ist ein Gesundheitsdatum und geht nur an HR (manage_hr).

export const MABV_STUNDEN_SOLL = 20;
export const MABV_ZEITRAUM_JAHRE = 3;
export const BEM_SCHWELLE_ARBEITSTAGE = 30;

export interface WeiterbildungFuerStand { mitarbeiterId: number; datum: string; stunden: number; mabvRelevant: boolean }

export interface Weiterbildungsstand {
  mitarbeiterId: number;
  pflichtig: boolean;
  /** Aktueller Dreijahreszeitraum. */
  zeitraumVon: number;
  zeitraumBis: number;
  stundenImZeitraum: number;
  soll: number;
  rest: number;
  /** Anteil des Zeitraums, der schon vergangen ist (0–1). */
  verstrichen: number;
  lage: "erfuellt" | "auf_kurs" | "im_rueckstand" | "knapp" | "nicht_pflichtig";
  /** Vorheriger Zeitraum nicht erfüllt — das ist ein bereits eingetretener Verstoß. */
  vorzeitraumVerfehlt: boolean;
  vorzeitraumStunden: number | null;
  hinweis: string;
}

/** Dreijahreszeitraum, der `jahr` enthält, ausgehend vom Eintrittsjahr. */
export function mabvZeitraum(eintrittsjahr: number, jahr: number): { von: number; bis: number } {
  if (jahr < eintrittsjahr) return { von: eintrittsjahr, bis: eintrittsjahr + MABV_ZEITRAUM_JAHRE - 1 };
  const index = Math.floor((jahr - eintrittsjahr) / MABV_ZEITRAUM_JAHRE);
  const von = eintrittsjahr + index * MABV_ZEITRAUM_JAHRE;
  return { von, bis: von + MABV_ZEITRAUM_JAHRE - 1 };
}

export function weiterbildungsstand(
  m: { id: number; startDate: string; mabvPflichtig: boolean },
  eintraege: WeiterbildungFuerStand[], heute: string,
): Weiterbildungsstand {
  const jahr = Number(heute.slice(0, 4));
  const eintrittsjahr = Number(m.startDate.slice(0, 4));
  const { von, bis } = mabvZeitraum(eintrittsjahr, jahr);
  const eigene = eintraege.filter((e) => e.mitarbeiterId === m.id && e.mabvRelevant);
  const summe = (a: number, b: number) => eigene.filter((e) => { const j = Number(e.datum.slice(0, 4)); return j >= a && j <= b; })
    .reduce((s, e) => s + Number(e.stunden), 0);
  const stunden = Math.round(summe(von, bis) * 100) / 100;
  const rest = Math.max(0, Math.round((MABV_STUNDEN_SOLL - stunden) * 100) / 100);

  // Verstrichener Anteil: Tage seit 01.01.<von> geteilt durch Länge des Zeitraums.
  const start = Date.UTC(von, 0, 1), ende = Date.UTC(bis, 11, 31), jetzt = new Date(`${heute}T00:00:00Z`).getTime();
  const verstrichen = Math.min(1, Math.max(0, (jetzt - start) / (ende - start)));

  let vorzeitraumVerfehlt = false, vorzeitraumStunden: number | null = null;
  if (von - MABV_ZEITRAUM_JAHRE >= eintrittsjahr) {
    vorzeitraumStunden = Math.round(summe(von - MABV_ZEITRAUM_JAHRE, von - 1) * 100) / 100;
    vorzeitraumVerfehlt = vorzeitraumStunden < MABV_STUNDEN_SOLL;
  }

  if (!m.mabvPflichtig) {
    return { mitarbeiterId: m.id, pflichtig: false, zeitraumVon: von, zeitraumBis: bis, stundenImZeitraum: stunden, soll: MABV_STUNDEN_SOLL,
      rest, verstrichen, lage: "nicht_pflichtig", vorzeitraumVerfehlt: false, vorzeitraumStunden: null, hinweis: "Keine Weiterbildungspflicht nach § 34c hinterlegt." };
  }

  let lage: Weiterbildungsstand["lage"];
  let hinweis: string;
  if (rest === 0) { lage = "erfuellt"; hinweis = `${stunden} h im Zeitraum ${von}–${bis} — Pflicht erfüllt.`; }
  else if (jahr === bis) { lage = "knapp"; hinweis = `Letztes Jahr des Zeitraums ${von}–${bis}: noch ${rest} h bis 31.12.${bis}.`; }
  else if (stunden / MABV_STUNDEN_SOLL >= verstrichen - 0.1) { lage = "auf_kurs"; hinweis = `${stunden} von ${MABV_STUNDEN_SOLL} h, ${Math.round(verstrichen * 100)} % des Zeitraums verstrichen — auf Kurs.`; }
  else { lage = "im_rueckstand"; hinweis = `${stunden} von ${MABV_STUNDEN_SOLL} h bei ${Math.round(verstrichen * 100)} % des Zeitraums — im Rückstand, noch ${rest} h bis 31.12.${bis}.`; }
  if (vorzeitraumVerfehlt) hinweis = `⚠ Zeitraum ${von - 3}–${von - 1} mit ${vorzeitraumStunden} h NICHT erfüllt (Verstoß). ` + hinweis;

  return { mitarbeiterId: m.id, pflichtig: true, zeitraumVon: von, zeitraumBis: bis, stundenImZeitraum: stunden, soll: MABV_STUNDEN_SOLL,
    rest, verstrichen, lage, vorzeitraumVerfehlt, vorzeitraumStunden, hinweis };
}

// ── BEM ──────────────────────────────────────────────────────────────────────

export interface KrankFuerBem { mitarbeiterId: number; startDate: string; endDate: string; days: number; status: string; type: string }

export interface BemPruefung {
  mitarbeiterId: number;
  /** Arbeitstage krank in den letzten 365 Tagen. */
  krankArbeitstage: number;
  episoden: number;
  laengsteEpisodeTage: number;
  pflicht: boolean;
  /** Wie weit bis zur Schwelle (negativ = überschritten). */
  restBisSchwelle: number;
  zeitraumVon: string;
  zeitraumBis: string;
}

/**
 * Rollierende zwölf Monate ab `heute`. Gezählt werden die `days` der
 * genehmigten Krankmeldungen — das sind bereits Arbeitstage, so wie HR sie
 * erfasst. Eine Episode, die in das Fenster hineinragt, zählt anteilig nach
 * Kalendertagen; die Genauigkeit reicht für eine Pflicht-ERKENNUNG, die
 * Prüfung im Einzelfall macht danach ein Mensch.
 */
export function bemPruefung(mitarbeiterId: number, krank: KrankFuerBem[], heute: string): BemPruefung {
  const bis = new Date(`${heute}T00:00:00Z`);
  const von = new Date(bis); von.setUTCDate(von.getUTCDate() - 365);
  const vonS = von.toISOString().slice(0, 10);
  let tage = 0, episoden = 0, laengste = 0;
  for (const k of krank) {
    if (k.mitarbeiterId !== mitarbeiterId || k.type !== "krank" || k.status !== "genehmigt") continue;
    if (k.endDate < vonS || k.startDate > heute) continue;
    const s = new Date(`${k.startDate}T00:00:00Z`), e = new Date(`${k.endDate}T00:00:00Z`);
    const gesamtKal = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
    const imFensterKal = Math.max(0, Math.round((Math.min(e.getTime(), bis.getTime()) - Math.max(s.getTime(), von.getTime())) / 86_400_000) + 1);
    const anteil = Math.min(1, imFensterKal / gesamtKal);
    const t = k.days * anteil;
    tage += t; episoden += 1; if (t > laengste) laengste = t;
  }
  tage = Math.round(tage * 10) / 10;
  return {
    mitarbeiterId, krankArbeitstage: tage, episoden, laengsteEpisodeTage: Math.round(laengste * 10) / 10,
    pflicht: tage > BEM_SCHWELLE_ARBEITSTAGE,
    restBisSchwelle: Math.round((BEM_SCHWELLE_ARBEITSTAGE - tage) * 10) / 10,
    zeitraumVon: vonS, zeitraumBis: heute,
  };
}
