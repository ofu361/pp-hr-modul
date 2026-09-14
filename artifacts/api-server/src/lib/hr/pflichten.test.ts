// © 2026 P&P Group. Proprietary & Confidential.
import { describe, it, expect } from "vitest";
import { mabvZeitraum, weiterbildungsstand, bemPruefung } from "./pflichten.js";

describe("§ 34c Dreijahreszeitraum", () => {
  it("beginnt mit dem Eintrittsjahr und läuft nahtlos weiter", () => {
    expect(mabvZeitraum(2019, 2019)).toEqual({ von: 2019, bis: 2021 });
    expect(mabvZeitraum(2019, 2021)).toEqual({ von: 2019, bis: 2021 });
    expect(mabvZeitraum(2019, 2022)).toEqual({ von: 2022, bis: 2024 });
    expect(mabvZeitraum(2019, 2026)).toEqual({ von: 2025, bis: 2027 });
  });
});

describe("Weiterbildungsstand", () => {
  const m = { id: 1, startDate: "2019-03-01", mabvPflichtig: true };
  const e = (datum: string, stunden: number, rel = true) => ({ mitarbeiterId: 1, datum, stunden, mabvRelevant: rel });

  it("zählt nur MaBV-relevante Stunden im aktuellen Zeitraum", () => {
    const s = weiterbildungsstand(m, [e("2025-04-01", 8), e("2026-02-01", 6), e("2026-03-01", 4, false), e("2024-11-01", 20)], "2026-09-12");
    expect(s.zeitraumVon).toBe(2025); expect(s.zeitraumBis).toBe(2027);
    expect(s.stundenImZeitraum).toBe(14);
    expect(s.rest).toBe(6);
    expect(s.lage).toBe("auf_kurs");
    expect(s.vorzeitraumVerfehlt).toBe(false);
    expect(s.vorzeitraumStunden).toBe(20);
  });
  it("erkennt den Rückstand, wenn die Zeit schneller läuft als die Stunden", () => {
    const s = weiterbildungsstand(m, [e("2025-04-01", 2)], "2026-12-01");
    expect(s.lage).toBe("im_rueckstand");
  });
  it("im letzten Jahr des Zeitraums heisst Rest knapp", () => {
    const s = weiterbildungsstand(m, [e("2025-04-01", 12)], "2027-02-01");
    expect(s.lage).toBe("knapp");
    expect(s.hinweis).toMatch(/31\.12\.2027/);
  });
  it("erfüllt bei 20 Stunden", () => {
    expect(weiterbildungsstand(m, [e("2025-04-01", 12), e("2026-01-10", 8)], "2026-09-12").lage).toBe("erfuellt");
  });
  it("meldet einen verfehlten Vorzeitraum als Verstoß", () => {
    const s = weiterbildungsstand(m, [e("2023-04-01", 5), e("2026-01-10", 10)], "2026-09-12");
    expect(s.vorzeitraumVerfehlt).toBe(true);
    expect(s.vorzeitraumStunden).toBe(5);
    expect(s.hinweis).toMatch(/NICHT erfüllt/);
  });
  it("ohne Pflicht keine Lage", () => {
    expect(weiterbildungsstand({ ...m, mabvPflichtig: false }, [], "2026-09-12").lage).toBe("nicht_pflichtig");
  });
});

describe("BEM § 167 SGB IX", () => {
  const k = (s: string, e: string, days: number, status = "genehmigt", type = "krank") => ({ mitarbeiterId: 1, startDate: s, endDate: e, days, status, type });
  it("zählt Arbeitstage der letzten zwölf Monate; über 30 → Pflicht", () => {
    const p = bemPruefung(1, [k("2026-01-12", "2026-01-30", 15), k("2026-05-04", "2026-05-29", 20)], "2026-09-12");
    expect(p.krankArbeitstage).toBe(35);
    expect(p.episoden).toBe(2);
    expect(p.pflicht).toBe(true);
    expect(p.restBisSchwelle).toBe(-5);
  });
  it("genau 30 Tage ist noch keine Pflicht — es heißt LÄNGER als sechs Wochen", () => {
    expect(bemPruefung(1, [k("2026-03-02", "2026-04-10", 30)], "2026-09-12").pflicht).toBe(false);
  });
  it("Krankheit außerhalb des Fensters, Urlaub und ausstehende Anträge zählen nicht", () => {
    const p = bemPruefung(1, [
      k("2025-06-01", "2025-07-15", 32),                 // vor dem Fenster
      k("2026-02-02", "2026-02-06", 5, "ausstehend"),
      k("2026-03-02", "2026-03-13", 10, "genehmigt", "urlaub"),
      k("2026-04-01", "2026-04-03", 3),
    ], "2026-09-12");
    expect(p.krankArbeitstage).toBe(3);
  });
  it("eine Episode, die ins Fenster hineinragt, zählt anteilig", () => {
    // 20 Kalendertage, davon 11 im Fenster (ab 12.09.2025) → 14 × 11/20 = 7,7
    const p = bemPruefung(1, [k("2025-09-03", "2025-09-22", 14)], "2026-09-12");
    expect(p.krankArbeitstage).toBe(7.7);
  });
});
