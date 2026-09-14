// © 2026 P&P Group. Proprietary & Confidential.
// Marktgehälter (0430): die Einheiten-Fallen (×12, ×100) und der Vergleich.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const { default: app } = await import("../app.js");
const { db, companies, users, hrMitarbeiter } = await import("@workspace/db");

const DOMAIN = "hr-markt.test";
const CODE   = "HRMARK01";
const PW     = "hr-markt-pw-123!";
let admin: ReturnType<typeof request.agent>;

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  const hash = await bcrypt.hash(PW, 10);
  const [c] = await db.insert(companies).values({ name: "HR Markt GmbH", code: CODE, domain: DOMAIN }).returning();
  const companyId = c!.id;
  await db.insert(users).values({ companyId, username: "hrm-admin", email: `admin@${DOMAIN}`, name: "Admin", passwordHash: hash, role: "admin", isActive: true });
  // Drei Verwalter: 4.000 / 4.000 / 2.000 bei 20 h (= 4.000 Vollzeit) → Hausmedian 48.000 € p. a.
  await db.insert(hrMitarbeiter).values([
    { companyId, name: "V1", jobTitle: "Verwalter",  startDate: "2020-01-01", salaryGross: 400_000, weeklyHours: 40 },
    { companyId, name: "V2", jobTitle: "verwalter ", startDate: "2020-01-01", salaryGross: 400_000, weeklyHours: 40 },
    { companyId, name: "V3", jobTitle: "Verwalter",  startDate: "2020-01-01", salaryGross: 200_000, weeklyHours: 20 },
    { companyId, name: "B1", jobTitle: "Buchhalter", startDate: "2020-01-01", salaryGross: 350_000, weeklyHours: 40 },
  ]);
  admin = await loginAs(app, `admin@${DOMAIN}`);
});
afterAll(async () => { await db.delete(companies).where(eq(companies.code, CODE)); });

describe("Marktgehälter", () => {
  it("weist einen Monatswert als Jahreswert ab — die Faktor-12-Falle", async () => {
    const res = await admin.post("/api/hr/marktgehaelter").send({ stellengruppe: "Verwalter", quelle: "Test", jahr: 2026, jahresbruttoMedianCent: 450_000 });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/10\.000/);
  });

  it("weist vertauschte Quartile ab", async () => {
    const res = await admin.post("/api/hr/marktgehaelter").send({ stellengruppe: "Verwalter", quelle: "Test", jahr: 2026, jahresbruttoMedianCent: 5_000_000, jahresbruttoP25Cent: 6_000_000 });
    expect(res.status).toBe(400);
  });

  it("erfasst einen Marktwert und normalisiert die Stellengruppe", async () => {
    const res = await admin.post("/api/hr/marktgehaelter").send({
      stellengruppe: "Verwalter", region: "Bayern", quelle: "Entgeltatlas BA", jahr: 2025,
      jahresbruttoP25Cent: 4_200_000, jahresbruttoMedianCent: 5_000_000, jahresbruttoP75Cent: 5_800_000,
    });
    expect(res.status).toBe(201);
    expect(res.body.stellengruppe).toBe("verwalter");
    expect(res.body.anzeige).toBe("Verwalter");
  });

  it("dieselbe Quelle im selben Jahr überschreibt statt zu verdoppeln", async () => {
    const res = await admin.post("/api/hr/marktgehaelter").send({
      stellengruppe: "Verwalter", region: "Bayern", quelle: "Entgeltatlas BA", jahr: 2025, jahresbruttoMedianCent: 5_100_000,
    });
    expect(res.status).toBe(201);
    const liste = await admin.get("/api/hr/marktgehaelter");
    expect(liste.body.filter((z: any) => z.stellengruppe === "verwalter")).toHaveLength(1);
    expect(liste.body[0].jahresbruttoMedianCent).toBe(5_100_000);
  });

  it("vergleicht Haus (×12, Vollzeit) gegen Markt und benennt die Lage", async () => {
    const res = await admin.get("/api/hr/auswertung/marktvergleich");
    expect(res.status).toBe(200);
    const v = res.body.zeilen.find((z: any) => z.stellengruppe === "verwalter");
    expect(v.mitglieder).toBe(3);
    // 4.000 × 12 = 48.000 € — auch für die Halbtagskraft.
    expect(v.hausJahresbruttoMedianCent).toBe(4_800_000);
    expect(v.hausBelastbar).toBe(true);
    expect(v.markt.medianCent).toBe(5_100_000);
    // (48.000 − 51.000) / 51.000 = −5,88 %
    expect(v.abweichungBp).toBe(-588);
    expect(v.lage).toBe("unter_median");

    const b = res.body.zeilen.find((z: any) => z.stellengruppe === "buchhalter");
    expect(b.markt).toBeNull();
    expect(b.lage).toBeNull();
    expect(b.hausBelastbar).toBe(false);
    expect(res.body.luecken.ohneMarktwert).toBe(1);
  });

  it("meldet Marktwerte, die keiner Hausgruppe entsprechen", async () => {
    await admin.post("/api/hr/marktgehaelter").send({ stellengruppe: "Hausmeister", quelle: "Test", jahr: 2026, jahresbruttoMedianCent: 3_600_000 });
    const res = await admin.get("/api/hr/auswertung/marktvergleich");
    expect(res.body.luecken.marktOhneHaus).toContain("hausmeister");
  });
});
