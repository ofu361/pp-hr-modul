// © 2026 P&P Group. Proprietary & Confidential.
// Gehalt × Qualifikation.
//
// Geprüft werden die drei Stellen, an denen die Auswertung sonst systematisch
// falsch wäre und trotzdem plausibel aussähe: die Vollzeit-Normierung (ein
// Teilzeitgehalt ist kein niedriges Gehalt), die Mindestgröße des Bandes (zwei
// Personen sind kein Band) und die abgelaufene Qualifikation (zählt nicht).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const { default: app } = await import("../app.js");
const { db, companies, users, hrMitarbeiter, hrQualifikationen, hrMitarbeiterQualifikationen } = await import("@workspace/db");

const DOMAIN = "hr-quali.test";
const CODE   = "HRQUAL01";
const PW     = "hr-quali-pw-123!";

let admin: ReturnType<typeof request.agent>;
let ids: Record<string, number> = {};
let qualiX: number, qualiY: number, qualiZ: number;

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  const hash = await bcrypt.hash(PW, 10);
  const [c] = await db.insert(companies).values({ name: "HR Quali GmbH", code: CODE, domain: DOMAIN }).returning();
  const companyId = c!.id;
  await db.insert(users).values({
    companyId, username: "hrq-admin", email: `admin@${DOMAIN}`, name: "Admin",
    passwordHash: hash, role: "admin", isActive: true,
  });

  const [x] = await db.insert(hrQualifikationen).values({ companyId, name: "Sachkunde §34c", category: "rechtlich" }).returning();
  const [y] = await db.insert(hrQualifikationen).values({ companyId, name: "Immobilienfachwirt", category: "sonstige" }).returning();
  const [z] = await db.insert(hrQualifikationen).values({ companyId, name: "Ersthelfer", category: "sicherheit", renewalRequired: true }).returning();
  qualiX = x!.id; qualiY = y!.id; qualiZ = z!.id;

  // Stellengruppe „Verwalter" — vier Personen, davon eine halbe Stelle.
  // Vollzeit-Gehälter: A 6.000, B 4.000, C 4.000 (2.000 bei 20h!), D 3.000.
  // Median 4.000; Toleranz 10 % → Band 3.600 bis 4.400.
  const anlegen = async (name: string, jobTitle: string, monatCent: number, stunden: number) => {
    const [m] = await db.insert(hrMitarbeiter).values({
      companyId, name, jobTitle, startDate: "2020-01-01", salaryGross: monatCent, weeklyHours: stunden,
    }).returning();
    ids[name] = m!.id;
    return m!.id;
  };
  const a = await anlegen("A", "Verwalter", 600_000, 40);
  await anlegen("B", "verwalter ", 400_000, 40);      // Schreibweise darf nicht trennen
  const c2 = await anlegen("C", "Verwalter", 200_000, 20); // Teilzeit
  const d = await anlegen("D", "Verwalter", 300_000, 40);
  await anlegen("E", "Geschäftsführer", 1_000_000, 40);   // allein → kein Band

  await db.insert(hrMitarbeiterQualifikationen).values([
    { companyId, mitarbeiterId: a,  qualifikationId: qualiX, erworbrenAm: "2021-01-01" },
    { companyId, mitarbeiterId: a,  qualifikationId: qualiY, erworbrenAm: "2021-01-01" },
    { companyId, mitarbeiterId: c2, qualifikationId: qualiX, erworbrenAm: "2021-01-01" },
    { companyId, mitarbeiterId: d,  qualifikationId: qualiX, erworbrenAm: "2021-01-01" },
    { companyId, mitarbeiterId: d,  qualifikationId: qualiY, erworbrenAm: "2021-01-01" },
    // Abgelaufen — darf in keinen Vergleich eingehen.
    { companyId, mitarbeiterId: d,  qualifikationId: qualiZ, erworbrenAm: "2018-01-01", ablaufdatum: "2020-01-01" },
  ]);

  admin = await loginAs(app, `admin@${DOMAIN}`);
});

afterAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
});

const laden = () => admin.get("/api/hr/auswertung/gehalt-qualifikation");
const person = (body: any, name: string) => body.mitarbeiter.find((p: any) => p.id === ids[name]);

describe("Gehalt × Qualifikation", () => {
  it("rechnet Teilzeit auf Vollzeit hoch, bevor es vergleicht", async () => {
    const res = await laden();
    expect(res.status).toBe(200);
    const c = person(res.body, "C");
    expect(c.monatCent).toBe(200_000);
    expect(c.vollzeitCent).toBe(400_000);
    // Und sie liegt damit IM Band, nicht darunter.
    expect(c.auffaellig).toBeNull();
  });

  it("bildet die Stellengruppe unabhängig von Schreibweise und findet den Median", async () => {
    const res = await laden();
    const verwalter = res.body.jeStellengruppe.find((g: any) => g.gruppe === "verwalter");
    expect(verwalter.mitglieder).toBe(4);
    expect(verwalter.bandGueltig).toBe(true);
    expect(verwalter.medianVollzeitCent).toBe(400_000);
    expect(verwalter.minVollzeitCent).toBe(300_000);
    expect(verwalter.maxVollzeitCent).toBe(600_000);
  });

  it("markiert, wer trotz Qualifikation unter dem Band liegt — und nur den", async () => {
    const res = await laden();
    expect(person(res.body, "D").auffaellig).toBe("unter_band_trotz_qualifikation");
    // A liegt über dem Band, hat aber den Qualifikationsvorsprung → kein Etikett.
    expect(person(res.body, "A").auffaellig).toBeNull();
    expect(person(res.body, "B").auffaellig).toBeNull();
    // Auffällige stehen vorn.
    expect(res.body.mitarbeiter[0].id).toBe(ids["D"]);
  });

  it("gibt einer Gruppe aus einer Person kein Band und keine Position", async () => {
    const res = await laden();
    const gf = res.body.jeStellengruppe.find((g: any) => g.gruppe === "geschäftsführer");
    expect(gf.bandGueltig).toBe(false);
    const e = person(res.body, "E");
    expect(e.bandPositionBp).toBeNull();
    expect(e.auffaellig).toBeNull();
    expect(res.body.luecken.gruppenOhneBand).toBe(1);
  });

  it("zählt abgelaufene Qualifikationen nicht mit, weist sie aber aus", async () => {
    const res = await laden();
    const d = person(res.body, "D");
    expect(d.qualifikationen).toBe(2);
    expect(d.abgelaufen).toBe(1);
    const ersthelfer = res.body.jeQualifikation.find((q: any) => q.qualifikationId === qualiZ);
    expect(ersthelfer.traeger).toBe(0);
    expect(ersthelfer.aufschlagBp).toBeNull();
    expect(res.body.luecken.mitAbgelaufenen).toBe(1);
  });

  it("stellt den Aufschlag einer Qualifikation als Median gegen Median", async () => {
    const res = await laden();
    const fachwirt = res.body.jeQualifikation.find((q: any) => q.qualifikationId === qualiY);
    // Träger A 6.000 und D 3.000 → Median 4.500. Andere B 4.000, C 4.000, E 10.000 → Median 4.000.
    expect(fachwirt.traeger).toBe(2);
    expect(fachwirt.medianVollzeitCent).toBe(450_000);
    expect(fachwirt.aufschlagBp).toBe(1250);
  });
});
