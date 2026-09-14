// © 2026 P&P Group. Proprietary & Confidential.
// Urlaubskonto — die vier BUrlG-Regeln, die man leicht falsch macht.
import { describe, it, expect } from "vitest";
import { rundeUrlaub, volleMonateImJahr, jahresanspruch, urlaubskonto, urlaubskontoMitHistorie, type MitarbeiterFuerKonto } from "./urlaubskonto.js";

const ma = (t: Partial<MitarbeiterFuerKonto> = {}): MitarbeiterFuerKonto =>
  ({ id: 1, startDate: "2020-01-01", endDate: null, urlaubstageProJahr: 30, arbeitstageProWoche: 5, ...t });

describe("Rundung § 5 Abs. 2", () => {
  it("rundet ab 0,5 auf, kleinere Bruchteile bleiben", () => {
    expect(rundeUrlaub(12.5)).toBe(13);
    expect(rundeUrlaub(12.49)).toBe(12.5);
    expect(rundeUrlaub(12.2)).toBe(12.2);
    expect(rundeUrlaub(18)).toBe(18);
  });
});

describe("Volle Monate", () => {
  it("zählt nur Monate, die vom Ersten bis zum Letzten beschäftigt waren", () => {
    expect(volleMonateImJahr("2026-05-15", null, 2026)).toBe(7);   // Jun–Dez
    expect(volleMonateImJahr("2026-05-01", null, 2026)).toBe(8);   // Mai–Dez
    expect(volleMonateImJahr("2020-01-01", "2026-03-31", 2026)).toBe(3);
    expect(volleMonateImJahr("2020-01-01", "2026-03-30", 2026)).toBe(2);
  });
});

describe("Jahresanspruch", () => {
  it("Vollzeit, ganzes Jahr → 30", () => {
    expect(jahresanspruch(ma(), 2026)).toMatchObject({ anspruch: 30, anspruchGrund: "voll" });
  });
  it("Teilzeit zählt in TAGEN: 3 Tage/Woche → 18, Halbtags an 5 Tagen → 30", () => {
    expect(jahresanspruch(ma({ arbeitstageProWoche: 3 }), 2026).anspruch).toBe(18);
    expect(jahresanspruch(ma({ arbeitstageProWoche: 5 }), 2026).anspruch).toBe(30);
  });
  it("Eintritt in der zweiten Jahreshälfte → Zwölftel je vollem Monat", () => {
    // Eintritt 15.08.: volle Monate Sep–Dez = 4 → 30 × 4/12 = 10
    expect(jahresanspruch(ma({ startDate: "2026-08-15" }), 2026)).toMatchObject({ anspruch: 10, anspruchGrund: "eintritt_zwoelftel", volleMonate: 4 });
    // Eintritt 01.09.: Sep–Dez = 4 Monate → 10; mit 3-Tage-Woche 18 × 4/12 = 6
    expect(jahresanspruch(ma({ startDate: "2026-09-01", arbeitstageProWoche: 3 }), 2026).anspruch).toBe(6);
  });
  it("Eintritt in der ersten Jahreshälfte → voller Anspruch", () => {
    expect(jahresanspruch(ma({ startDate: "2026-06-30" }), 2026)).toMatchObject({ anspruch: 30, anspruchGrund: "voll" });
  });
  it("Austritt in der ersten Hälfte → Zwölftel; in der zweiten → voll (§ 5 Abs. 1c)", () => {
    expect(jahresanspruch(ma({ endDate: "2026-03-31" }), 2026)).toMatchObject({ anspruch: 8, anspruchGrund: "austritt_zwoelftel", volleMonate: 3 }); // 7,5 → 8 (§ 5 Abs. 2)
    expect(jahresanspruch(ma({ endDate: "2026-07-01" }), 2026)).toMatchObject({ anspruch: 30, anspruchGrund: "voll" });
  });
  it("Bruchteil ≥ 0,5 wird aufgerundet: 2 volle Monate von 30 → 5; 5 Monate von 28 → 11,67 → 12", () => {
    expect(jahresanspruch(ma({ startDate: "2026-10-15" }), 2026).anspruch).toBe(5);
    expect(jahresanspruch(ma({ startDate: "2026-07-20", urlaubstageProJahr: 28 }), 2026).anspruch).toBe(12);
  });
  it("nicht beschäftigt im Jahr → 0", () => {
    expect(jahresanspruch(ma({ startDate: "2027-01-01" }), 2026).anspruchGrund).toBe("nicht_beschaeftigt");
    expect(jahresanspruch(ma({ endDate: "2025-12-31" }), 2026).anspruchGrund).toBe("nicht_beschaeftigt");
  });
});

describe("Konto", () => {
  const urlaube = [
    { mitarbeiterId: 1, type: "urlaub", startDate: "2026-02-02", endDate: "2026-02-06", days: 5, status: "genehmigt" },
    { mitarbeiterId: 1, type: "urlaub", startDate: "2026-07-20", endDate: "2026-07-31", days: 10, status: "genehmigt" },
    { mitarbeiterId: 1, type: "urlaub", startDate: "2026-12-21", endDate: "2026-12-23", days: 3, status: "genehmigt" },
    { mitarbeiterId: 1, type: "urlaub", startDate: "2026-10-05", endDate: "2026-10-09", days: 5, status: "ausstehend" },
    { mitarbeiterId: 1, type: "krank",  startDate: "2026-03-02", endDate: "2026-03-06", days: 5, status: "genehmigt" },
    { mitarbeiterId: 2, type: "urlaub", startDate: "2026-02-02", endDate: "2026-02-06", days: 5, status: "genehmigt" },
  ];

  it("trennt genommen, verplant, beantragt — Krankheit zählt nicht", () => {
    const k = urlaubskonto(ma(), 2026, "2026-09-12", urlaube, [], 0);
    expect(k.genommen).toBe(15);
    expect(k.verplant).toBe(3);
    expect(k.beantragt).toBe(5);
    expect(k.rest).toBe(12);
    expect(k.restNachAntraegen).toBe(7);
  });

  it("Übertrag wird bis 31.03. zuerst aufgezehrt; der Rest verfällt", () => {
    // 8 Tage Übertrag, 5 Tage im Februar genommen → 3 verfallen am 31.03.
    const k = urlaubskonto(ma(), 2026, "2026-09-12", urlaube, [], 8);
    expect(k.uebertrag).toBe(8);
    expect(k.uebertragGenommen).toBe(5);
    expect(k.uebertragVerfallen).toBe(3);
    // 30 + 8 − 3 − 15 − 3 = 17
    expect(k.rest).toBe(17);
    expect(k.hinweise.join(" ")).toMatch(/3 Tage Übertrag sind am 31\.03\. verfallen/);
  });

  it("vor dem 31.03. ist nichts verfallen, aber gewarnt", () => {
    const k = urlaubskonto(ma(), 2026, "2026-02-15", urlaube, [], 8);
    expect(k.uebertragVerfallen).toBe(0);
    expect(k.hinweise.join(" ")).toMatch(/verfallen am 31\.03\./);
  });

  it("ein gesetzter Übertrag schlägt den gerechneten; Korrekturen addieren", () => {
    const k = urlaubskonto(ma(), 2026, "2026-09-12", urlaube, [
      { mitarbeiterId: 1, jahr: 2026, art: "uebertrag", tage: 2 },
      { mitarbeiterId: 1, jahr: 2026, art: "auszahlung", tage: -4 },
    ], 8);
    expect(k.uebertrag).toBe(2);
    expect(k.uebertragGesetzt).toBe(true);
    expect(k.uebertragVerfallen).toBe(0);   // 2 ≤ 5 im Februar genommen
    // 30 + 2 − 0 − 4 − 15 − 3 = 10
    expect(k.rest).toBe(10);
  });

  it("Historie: Rest 2025 wandert als Übertrag nach 2026", () => {
    const alt = [
      { mitarbeiterId: 1, type: "urlaub", startDate: "2025-08-04", endDate: "2025-08-29", days: 20, status: "genehmigt" },
      ...urlaube,
    ];
    const k = urlaubskontoMitHistorie(ma({ startDate: "2025-01-01" }), 2026, "2026-09-12", alt, []);
    // 2025: 30 − 20 = 10 Rest → Übertrag 2026 = 10; Feb 5 genommen → 5 verfallen
    expect(k.uebertrag).toBe(10);
    expect(k.uebertragVerfallen).toBe(5);
    expect(k.rest).toBe(30 + 10 - 5 - 15 - 3);
  });

  it("meldet ein überzogenes Konto", () => {
    const k = urlaubskonto(ma({ urlaubstageProJahr: 10 }), 2026, "2026-09-12", urlaube, [], 0);
    expect(k.rest).toBeLessThan(0);
    expect(k.hinweise.join(" ")).toMatch(/überzogen/);
  });
});
