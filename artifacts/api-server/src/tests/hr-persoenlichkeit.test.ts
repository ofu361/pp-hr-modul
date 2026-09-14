// © 2026 P&P Group. Proprietary & Confidential.
// Persönlichkeitsprofile (0429) — die Schranken sind der Test, nicht das Speichern.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const { default: app } = await import("../app.js");
const { db, companies, users, hrMitarbeiter } = await import("@workspace/db");

const DOMAIN = "hr-profil.test";
const CODE   = "HRPROF01";
const PW     = "hr-profil-pw-123!";

let admin: ReturnType<typeof request.agent>;
let manager: ReturnType<typeof request.agent>;
let maId: number;

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  const hash = await bcrypt.hash(PW, 10);
  const [c] = await db.insert(companies).values({ name: "HR Profil GmbH", code: CODE, domain: DOMAIN }).returning();
  const companyId = c!.id;
  await db.insert(users).values([
    { companyId, username: "hrp-admin", email: `admin@${DOMAIN}`, name: "Admin", passwordHash: hash, role: "admin", isActive: true },
    { companyId, username: "hrp-ma", email: `ma@${DOMAIN}`, name: "Nur Mitarbeiter", passwordHash: hash, role: "mitarbeiter", isActive: true },
  ]);
  const [m] = await db.insert(hrMitarbeiter).values({ companyId, name: "Paula Profil", jobTitle: "Verwalterin", abteilung: "Vermietung", startDate: "2022-01-01" }).returning();
  maId = m!.id;
  admin   = await loginAs(app, `admin@${DOMAIN}`);
  manager = await loginAs(app, `ma@${DOMAIN}`);
});

afterAll(async () => { await db.delete(companies).where(eq(companies.code, CODE)); });

const gueltig = {
  methode: "disg", quelle: "selbsteinschaetzung", erhobenAm: "2026-09-01", einwilligungAm: "2026-08-20",
  dimensionen: { dominant: 70, initiativ: 55, stetig: 40, gewissenhaft: 80 },
  staerken: ["Struktur", "Verlässlichkeit"], entwicklungsfelder: ["Delegieren"],
  arbeitsstil: "Arbeitet planvoll und dokumentiert gründlich.", teamrolle: "Umsetzer",
};

describe("Persönlichkeitsprofile", () => {
  it("ohne Einwilligung kein Profil", async () => {
    const { einwilligungAm: _e, ...ohne } = gueltig;
    const res = await admin.post(`/api/hr/mitarbeiter/${maId}/persoenlichkeit`).send(ohne);
    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error ?? JSON.stringify(res.body)).toMatch(/Einwilligung/);
  });

  it("eine Einwilligung nach der Erhebung ist keine", async () => {
    const res = await admin.post(`/api/hr/mitarbeiter/${maId}/persoenlichkeit`).send({ ...gueltig, einwilligungAm: "2026-09-02" });
    expect(res.status).toBe(400);
  });

  it("Art.-9-Angaben werden abgewiesen, nicht gespeichert", async () => {
    const res = await admin.post(`/api/hr/mitarbeiter/${maId}/persoenlichkeit`).send({ ...gueltig, notiz: "War länger krankgeschrieben." });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Art\. 9/);
  });

  it("Dimensionen fremder Methoden mischen sich nicht", async () => {
    const res = await admin.post(`/api/hr/mitarbeiter/${maId}/persoenlichkeit`).send({ ...gueltig, dimensionen: { ...gueltig.dimensionen, extraversion: 50 } });
    expect(res.status).toBe(400);
  });

  it("legt ein gültiges Profil an — Standard-Sichtbarkeit nur HR", async () => {
    const res = await admin.post(`/api/hr/mitarbeiter/${maId}/persoenlichkeit`).send(gueltig);
    expect(res.status).toBe(201);
    expect(res.body.sichtbarFuer).toBe("hr");
    expect(res.body.dimensionen.gewissenhaft).toBe(80);
    expect(res.body.staerken).toEqual(["Struktur", "Verlässlichkeit"]);
  });

  it("ein fremder Mitarbeiter ohne HR-Recht sieht das Profil nicht — auch nicht, dass es eins gibt", async () => {
    const res = await manager.get(`/api/hr/mitarbeiter/${maId}/persoenlichkeit`);
    expect([401, 403, 404]).toContain(res.status);
  });

  it("die Teamübersicht zählt Abdeckung und mittelt nur innerhalb der Methode", async () => {
    const res = await admin.get("/api/hr/persoenlichkeit/team");
    expect(res.status).toBe(200);
    expect(res.body.abdeckung).toEqual({ aktive: 1, mitProfil: 1 });
    const verm = res.body.abteilungen.find((a: any) => a.abteilung === "Vermietung");
    expect(verm.mitProfil).toBe(1);
    expect(verm.dimensionenSchnitt["disg.gewissenhaft"]).toBe(80);
    expect(verm.teamrollen).toEqual({ Umsetzer: 1 });
  });

  it("der KI-Entwurf verlangt Beurteilungstext und speichert nichts", async () => {
    const res = await admin.post(`/api/hr/mitarbeiter/${maId}/persoenlichkeit/entwurf`).send({});
    expect(res.status).toBe(400);
    const liste = await admin.get(`/api/hr/mitarbeiter/${maId}/persoenlichkeit`);
    expect(liste.body.profile).toHaveLength(1);
  });
});
