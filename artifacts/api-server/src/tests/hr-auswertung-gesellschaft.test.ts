// © 2026 P&P Group. Proprietary & Confidential.
// Personalauswertung je Gesellschaft (0427).
//
// Der eigentliche Grund für diese Datei ist die Verwechslung, an der die Fläche
// vorher scheiterte: `company_id` ist der MANDANT, `gesellschaft_id` der
// RECHTSTRÄGER. Eine Auswertung nach `company_id` liefert genau EINE Zeile und
// sieht dabei völlig plausibel aus — ein Fehler, den keine Typprüfung findet
// und den man einer Tabelle nicht ansieht. Deshalb prüft der erste Test nicht,
// dass irgendetwas zurückkommt, sondern dass zwei Gesellschaften DESSELBEN
// Mandanten getrennt bleiben.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const { default: app } = await import("../app.js");
const { db, companies, users, gesellschaften, hrMitarbeiter, hrUrlaub } = await import("@workspace/db");

const DOMAIN = "hr-gesellschaft.test";
const CODE   = "HRGES001";
const FREMD  = "HRGES002";
const PW     = "hr-ges-pw-123!";
const JAHR   = 2026;

let admin: ReturnType<typeof request.agent>;
let gsAlpha: number;
let gsBeta: number;
let gsFremd: number;
let maAlpha: number;

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  await db.delete(companies).where(eq(companies.code, FREMD));
  const hash = await bcrypt.hash(PW, 10);

  const [c] = await db.insert(companies).values({ name: "HR Gesellschaft GmbH", code: CODE, domain: DOMAIN }).returning();
  const companyId = c!.id;
  await db.insert(users).values({
    companyId, username: "hrges-admin", email: `admin@${DOMAIN}`, name: "Admin",
    passwordHash: hash, role: "admin", isActive: true,
  });

  // Zwei Rechtsträger unter EINEM Mandanten — das ist der ganze Punkt.
  const [a] = await db.insert(gesellschaften).values({ companyId, nummer: "GS-9001", name: "Alpha Immobilien GmbH" }).returning();
  const [b] = await db.insert(gesellschaften).values({ companyId, nummer: "GS-9002", name: "Beta Verwaltung GmbH" }).returning();
  gsAlpha = a!.id;
  gsBeta  = b!.id;

  // Alpha: 5.000 €/Monat, 10 Krankheitstage in zwei Episoden.
  const [m1] = await db.insert(hrMitarbeiter).values({
    companyId, gesellschaftId: gsAlpha, name: "Anna Alpha", jobTitle: "Verwalterin",
    startDate: `${JAHR}-01-01`, salaryGross: 500_000, weeklyHours: 40, urlaubstageProJahr: 30,
  }).returning();
  maAlpha = m1!.id;

  // Beta: 2.500 €/Monat, halbe Stelle, keine Krankheit.
  await db.insert(hrMitarbeiter).values({
    companyId, gesellschaftId: gsBeta, name: "Bert Beta", jobTitle: "Buchhalter",
    startDate: `${JAHR}-01-01`, salaryGross: 250_000, weeklyHours: 20, urlaubstageProJahr: 30,
  });

  // Ohne Gesellschaft — muss als eigene Zeile erscheinen, nicht verteilt werden.
  await db.insert(hrMitarbeiter).values({
    companyId, name: "Ohne Zuordnung", jobTitle: "Assistenz",
    startDate: `${JAHR}-01-01`, salaryGross: 300_000, weeklyHours: 40, urlaubstageProJahr: 30,
  });

  await db.insert(hrUrlaub).values([
    { companyId, mitarbeiterId: maAlpha, type: "krank",  startDate: `${JAHR}-02-03`, endDate: `${JAHR}-02-09`, days: 6, status: "genehmigt" },
    { companyId, mitarbeiterId: maAlpha, type: "krank",  startDate: `${JAHR}-05-04`, endDate: `${JAHR}-05-07`, days: 4, status: "genehmigt" },
    { companyId, mitarbeiterId: maAlpha, type: "urlaub", startDate: `${JAHR}-07-01`, endDate: `${JAHR}-07-14`, days: 10, status: "genehmigt" },
    // Nicht genehmigt — darf in keiner Summe auftauchen.
    { companyId, mitarbeiterId: maAlpha, type: "krank",  startDate: `${JAHR}-09-01`, endDate: `${JAHR}-09-05`, days: 5, status: "ausstehend" },
  ]);

  // Eigener Mandant mit eigener Gesellschaft, damit die Schranke etwas zu prüfen hat.
  const [f] = await db.insert(companies).values({ name: "Fremd GmbH", code: FREMD, domain: "fremd-ges.test" }).returning();
  const [fg] = await db.insert(gesellschaften).values({ companyId: f!.id, nummer: "GS-9999", name: "Fremde GmbH" }).returning();
  gsFremd = fg!.id;

  admin = await loginAs(app, `admin@${DOMAIN}`);
});

afterAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  await db.delete(companies).where(eq(companies.code, FREMD));
});

const auswertung = () => admin.get(`/api/hr/auswertung/gesellschaft?jahr=${JAHR}`);

describe("Personalauswertung je Gesellschaft", () => {
  it("trennt zwei Gesellschaften desselben Mandanten", async () => {
    const res = await auswertung();
    expect(res.status).toBe(200);

    const namen = res.body.zeilen.map((z: any) => z.name);
    expect(namen).toContain("Alpha Immobilien GmbH");
    expect(namen).toContain("Beta Verwaltung GmbH");

    const alpha = res.body.zeilen.find((z: any) => z.gesellschaftId === gsAlpha);
    const beta  = res.body.zeilen.find((z: any) => z.gesellschaftId === gsBeta);
    expect(alpha.mitarbeiter).toBe(1);
    expect(beta.mitarbeiter).toBe(1);
    // 40h = 1,0 VZÄ / 20h = 0,5 VZÄ — die Kopfzahl allein verdeckt den Unterschied.
    expect(alpha.vzae).toBe(1);
    expect(beta.vzae).toBe(0.5);
  });

  it("weist Mitarbeiter ohne Gesellschaft als eigene Zeile aus statt sie zu verteilen", async () => {
    const res = await auswertung();
    const ohne = res.body.zeilen.find((z: any) => z.gesellschaftId === null);
    expect(ohne).toBeDefined();
    expect(ohne.name).toBe("Ohne Gesellschaft");
    expect(ohne.mitarbeiter).toBe(1);
    // Und die Kennzahl, an der man die Belastbarkeit der Aufteilung abliest.
    expect(res.body.zuordnung.gesamt).toBe(3);
    expect(res.body.zuordnung.ohneGesellschaft).toBe(1);
    // Die unzugeordnete Zeile steht immer zuletzt.
    expect(res.body.zeilen[res.body.zeilen.length - 1].gesellschaftId).toBeNull();
  });

  it("rechnet Gehalt, Vollkosten und Krankheitskosten nachvollziehbar", async () => {
    const res = await auswertung();
    const alpha = res.body.zeilen.find((z: any) => z.gesellschaftId === gsAlpha);

    // 5.000 €/Monat × 12 = 60.000 € Jahresbrutto.
    expect(alpha.jahresbruttoCent).toBe(6_000_000);
    // Vorgabe 20 % AG-Anteil → 72.000 € Vollkosten.
    expect(alpha.vollkostenCent).toBe(7_200_000);
    expect(res.body.parameter.hinterlegt).toBe(false);

    // 10 Krankheitstage in zwei Episoden; der ausstehende Antrag zählt nicht.
    expect(alpha.krankTage).toBe(10);
    expect(alpha.krankEpisoden).toBe(2);
    // Tagessatz 72.000 € / 250 Arbeitstage = 288 € → 10 Tage = 2.880 €.
    expect(alpha.krankKostenCent).toBe(288_000);
    // Krankenquote 10 / (1,0 VZÄ × 250) = 4,00 % = 400 Basispunkte.
    expect(alpha.krankquoteBp).toBe(400);
    expect(alpha.urlaubTage).toBe(10);
  });

  it("folgt dem hinterlegten Kostenparameter statt der Vorgabe", async () => {
    const gesetzt = await admin.put("/api/hr/kosten-parameter")
      .send({ jahr: JAHR, arbeitstageProJahr: 200, agNebenkostenBp: 3000 });
    expect(gesetzt.status).toBe(200);

    const res = await auswertung();
    expect(res.body.parameter.hinterlegt).toBe(true);
    const alpha = res.body.zeilen.find((z: any) => z.gesellschaftId === gsAlpha);
    // 60.000 € × 1,30 = 78.000 €.
    expect(alpha.vollkostenCent).toBe(7_800_000);
    // 78.000 € / 200 Tage = 390 € × 10 Tage = 3.900 €.
    expect(alpha.krankKostenCent).toBe(390_000);
  });

  it("weist Basispunkte über 100 % ab — 20 statt 2000 wäre sonst unbemerkt plausibel", async () => {
    const res = await admin.put("/api/hr/kosten-parameter")
      .send({ jahr: JAHR, arbeitstageProJahr: 250, agNebenkostenBp: 20_000 });
    expect(res.status).toBe(400);
  });

  it("lässt die Gesellschaft eines fremden Mandanten nicht setzen", async () => {
    const res = await admin.patch(`/api/hr/mitarbeiter/${maAlpha}`).send({ gesellschaftId: gsFremd });
    expect(res.status).toBe(400);

    // Und der Bestand bleibt unverändert — kein halb durchgeführter Schreibvorgang.
    const [row] = await db.select().from(hrMitarbeiter).where(eq(hrMitarbeiter.id, maAlpha));
    expect(row!.gesellschaftId).toBe(gsAlpha);
  });

  it("löst die Zuordnung bei ausdrücklichem null", async () => {
    const res = await admin.patch(`/api/hr/mitarbeiter/${maAlpha}`).send({ gesellschaftId: null });
    expect(res.status).toBe(200);
    expect(res.body.gesellschaftId).toBeNull();

    // Zurücksetzen, damit die Reihenfolge der Tests nichts vererbt.
    await admin.patch(`/api/hr/mitarbeiter/${maAlpha}`).send({ gesellschaftId: gsAlpha });
  });
});
