// © 2026 P&P Group. Proprietary & Confidential.
// Fristenrechnung — die Stellen, an denen ein Tag Unterschied ein Jahr Gehalt kostet.
import { describe, it, expect } from "vitest";
import {
  gesetzlicheFrist, fruehestesEnde, kuendigungRechnen, befristungskette,
  fristenFuerVertrag, plusMonate, monateZwischen, volleJahre,
  type VertragFuerFristen,
} from "./vertragsfristen.js";

const vertrag = (t: Partial<VertragFuerFristen>): VertragFuerFristen => ({
  id: 1, mitarbeiterId: 1, vertragsart: "unbefristet", beginn: "2020-01-01", ende: null,
  istVerlaengerung: false, probezeitBis: null, kuendigungsfristWert: null,
  kuendigungsfristEinheit: null, kuendigungstermin: null, status: "aktiv", ...t,
});

describe("Datumshilfen", () => {
  it("hält das Monatsende fest: 31.01. + 1 Monat ist der 28.02., nicht der 03.03.", () => {
    expect(plusMonate("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMonate("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("zählt Monate einschließlich: 01.01. bis 31.12. sind zwölf", () => {
    expect(monateZwischen("2026-01-01", "2026-12-31")).toBe(12);
    expect(monateZwischen("2024-03-01", "2026-02-28")).toBe(24);
  });
  it("zählt volle Jahre erst am Jahrestag", () => {
    expect(volleJahre("2020-06-15", "2026-06-14")).toBe(5);
    expect(volleJahre("2020-06-15", "2026-06-15")).toBe(6);
  });
});

describe("§ 622 BGB", () => {
  it("staffelt nach Betriebszugehörigkeit", () => {
    expect(gesetzlicheFrist(0)).toEqual({ wert: 4, einheit: "wochen", termin: "fuenfzehnter_oder_monatsende" });
    expect(gesetzlicheFrist(2).wert).toBe(1);
    expect(gesetzlicheFrist(5).wert).toBe(2);
    expect(gesetzlicheFrist(8).wert).toBe(3);
    expect(gesetzlicheFrist(10).wert).toBe(4);
    expect(gesetzlicheFrist(12).wert).toBe(5);
    expect(gesetzlicheFrist(15).wert).toBe(6);
    expect(gesetzlicheFrist(20).wert).toBe(7);
  });
  it("vier Wochen zum 15. oder Monatsende — beide Fälle", () => {
    // 10.03. + 28 Tage = 07.04. → zum 15.04.
    expect(fruehestesEnde("2026-03-10", gesetzlicheFrist(0))).toBe("2026-04-15");
    // 20.03. + 28 Tage = 17.04. → zum 30.04.
    expect(fruehestesEnde("2026-03-20", gesetzlicheFrist(0))).toBe("2026-04-30");
  });
  it("Quartalsende rundet auf das Quartal", () => {
    expect(fruehestesEnde("2026-01-10", { wert: 6, einheit: "wochen", termin: "quartalsende" })).toBe("2026-03-31");
    expect(fruehestesEnde("2026-03-10", { wert: 6, einheit: "wochen", termin: "quartalsende" })).toBe("2026-06-30");
  });
});

describe("Kündigungsrechner", () => {
  it("nimmt die längere Frist — die gesetzliche schlägt einen kürzeren Vertrag", () => {
    // 9 Jahre im Haus → gesetzlich 3 Monate zum Monatsende. Vertrag: 4 Wochen.
    const v = vertrag({ kuendigungsfristWert: 4, kuendigungsfristEinheit: "wochen", kuendigungstermin: "monatsende" });
    const r = kuendigungRechnen(v, "2026-03-10", "2017-01-01");
    expect(r.betriebsjahre).toBe(9);
    expect(r.massgeblich).toBe("gesetzlich");
    expect(r.massgeblichesEnde).toBe("2026-06-30");
  });
  it("nimmt den Vertrag, wenn er länger ist", () => {
    const v = vertrag({ kuendigungsfristWert: 6, kuendigungsfristEinheit: "monate", kuendigungstermin: "quartalsende" });
    const r = kuendigungRechnen(v, "2026-03-10", "2025-01-01");
    expect(r.massgeblich).toBe("vertraglich");
    expect(r.massgeblichesEnde).toBe("2026-09-30");
  });
  it("in der Probezeit gelten zwei Wochen ohne Termin", () => {
    const v = vertrag({ beginn: "2026-01-01", probezeitBis: "2026-06-30" });
    const r = kuendigungRechnen(v, "2026-03-10", "2026-01-01");
    expect(r.inProbezeit).toBe(true);
    expect(r.massgeblich).toBe("probezeit");
    expect(r.massgeblichesEnde).toBe("2026-03-24");
  });
  it("zählt die Betriebszugehörigkeit vom ersten Eintritt, nicht vom aktuellen Vertrag", () => {
    const v = vertrag({ beginn: "2025-01-01" });
    // Eintritt 2015 → 11 Jahre → 4 Monate, obwohl der Vertrag erst 2025 beginnt.
    expect(kuendigungRechnen(v, "2026-03-10", "2015-01-01").gesetzlich.wert).toBe(4);
  });
});

describe("§ 14 Abs. 2 TzBfG", () => {
  it("ist ohne sachgrundlose Befristung nicht anwendbar", () => {
    expect(befristungskette([vertrag({ vertragsart: "unbefristet" })]).lage).toBe("nicht_anwendbar");
    expect(befristungskette([vertrag({ vertragsart: "befristet_sachgrund", ende: "2027-01-01" })]).lage).toBe("nicht_anwendbar");
  });
  it("ein Jahr, keine Verlängerung → frei", () => {
    const k = befristungskette([vertrag({ vertragsart: "befristet_sachgrundlos", beginn: "2026-01-01", ende: "2026-12-31" })]);
    expect(k.gesamtMonate).toBe(12);
    expect(k.verlaengerungen).toBe(0);
    expect(k.lage).toBe("frei");
    expect(k.restMonate).toBe(12);
  });
  it("zwei Jahre voll → erreicht, keine weitere Verlängerung möglich", () => {
    const k = befristungskette([
      vertrag({ id: 1, vertragsart: "befristet_sachgrundlos", beginn: "2024-03-01", ende: "2025-02-28" }),
      vertrag({ id: 2, vertragsart: "befristet_sachgrundlos", beginn: "2025-03-01", ende: "2026-02-28", istVerlaengerung: true }),
    ]);
    expect(k.gesamtMonate).toBe(24);
    expect(k.restMonate).toBe(0);
    expect(k.lage).toBe("erreicht");
  });
  it("vierte Verlängerung → überschritten, auch wenn die Monate noch reichen", () => {
    const k = befristungskette([
      vertrag({ id: 1, vertragsart: "befristet_sachgrundlos", beginn: "2025-01-01", ende: "2025-03-31" }),
      vertrag({ id: 2, vertragsart: "befristet_sachgrundlos", beginn: "2025-04-01", ende: "2025-06-30", istVerlaengerung: true }),
      vertrag({ id: 3, vertragsart: "befristet_sachgrundlos", beginn: "2025-07-01", ende: "2025-09-30", istVerlaengerung: true }),
      vertrag({ id: 4, vertragsart: "befristet_sachgrundlos", beginn: "2025-10-01", ende: "2025-12-31", istVerlaengerung: true }),
      vertrag({ id: 5, vertragsart: "befristet_sachgrundlos", beginn: "2026-01-01", ende: "2026-03-31", istVerlaengerung: true }),
    ]);
    expect(k.gesamtMonate).toBe(15);
    expect(k.verlaengerungen).toBe(4);
    expect(k.lage).toBe("ueberschritten");
  });
  it("zählt Verlängerungen auch ohne Markierung — alle außer dem ersten", () => {
    const k = befristungskette([
      vertrag({ id: 1, vertragsart: "befristet_sachgrundlos", beginn: "2025-01-01", ende: "2025-06-30" }),
      vertrag({ id: 2, vertragsart: "befristet_sachgrundlos", beginn: "2025-07-01", ende: "2025-12-31" }),
    ]);
    expect(k.verlaengerungen).toBe(1);
  });
});

describe("Fristen je Vertrag", () => {
  it("Probezeit: entscheiden bis zwei Wochen vor Ende", () => {
    const f = fristenFuerVertrag(vertrag({ probezeitBis: "2026-06-30" }), "2026-06-01");
    expect(f).toHaveLength(1);
    expect(f[0]!.art).toBe("probezeit");
    expect(f[0]!.entscheidenBis).toBe("2026-06-16");
    expect(f[0]!.tageBisEntscheidung).toBe(15);
    expect(f[0]!.dringlichkeit).toBe("diesen_monat");
  });
  it("Probezeit-Frist verstrichen → überfällig mit klarem Hinweis", () => {
    const f = fristenFuerVertrag(vertrag({ probezeitBis: "2026-06-30" }), "2026-06-20");
    expect(f[0]!.dringlichkeit).toBe("ueberfaellig");
    expect(f[0]!.hinweis).toMatch(/reguläre Frist/);
  });
  it("Befristung: drei Monate Vorlauf, mit § 14-Hinweis wenn die Kette knapp ist", () => {
    const v = vertrag({ vertragsart: "befristet_sachgrundlos", beginn: "2024-09-01", ende: "2026-08-31" });
    const kette = befristungskette([v]);
    expect(kette.lage).toBe("erreicht");
    const f = fristenFuerVertrag(v, "2026-05-15", kette);
    expect(f).toHaveLength(1);
    expect(f[0]!.art).toBe("befristung");
    expect(f[0]!.entscheidenBis).toBe("2026-06-02");
    expect(f[0]!.hinweis).toMatch(/ausgeschöpft/);
  });
  it("beendete Verträge haben keine Fristen", () => {
    expect(fristenFuerVertrag(vertrag({ status: "abgeloest", probezeitBis: "2026-06-30" }), "2026-06-01")).toHaveLength(0);
  });
});
