// © 2026 P&P Group. Proprietary & Confidential.
// Abwesenheit → Kalender (0431). Geprüft wird vor allem die ENTKOPPLUNG: eine
// Genehmigung darf nie an Outlook scheitern, und ein Fehler landet an der
// Abwesenheit statt im Antragsteller.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { terminFuer } from "../lib/hr/abwesenheit-kalender.js";

const { default: app } = await import("../app.js");
const { db, companies, users, hrMitarbeiter, hrUrlaub, kalenderTokens } = await import("@workspace/db");

const DOMAIN = "hr-kal.test";
const CODE   = "HRKAL001";
const PW     = "hr-kal-pw-123!";
let admin: ReturnType<typeof request.agent>;
let companyId: number, adminUserId: number, maId: number, urlaubId: number;

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  const hash = await bcrypt.hash(PW, 10);
  const [c] = await db.insert(companies).values({ name: "HR Kal GmbH", code: CODE, domain: DOMAIN }).returning();
  companyId = c!.id;
  const [a] = await db.insert(users).values({ companyId, username: "hrk-admin", email: `admin@${DOMAIN}`, name: "Admin", passwordHash: hash, role: "admin", isActive: true }).returning();
  adminUserId = a!.id;
  const [m] = await db.insert(hrMitarbeiter).values({ companyId, name: "Kai Kalender", jobTitle: "Verwalter", startDate: "2022-01-01" }).returning();
  maId = m!.id;
  const [u] = await db.insert(hrUrlaub).values({ companyId, mitarbeiterId: maId, type: "krank", startDate: "2026-10-05", endDate: "2026-10-07", days: 3, status: "ausstehend" }).returning();
  urlaubId = u!.id;
  admin = await loginAs(app, `admin@${DOMAIN}`);
});
afterAll(async () => { await db.delete(companies).where(eq(companies.code, CODE)); });

describe("Termin-Bildung", () => {
  const u = { type: "krank", startDate: "2026-10-05", endDate: "2026-10-07", reason: "Grippe" } as any;
  it("im Teamkalender steht bei Krankheit nur Abwesend -- der Grund ist ein Gesundheitsdatum", () => {
    const t = terminFuer(u, "Kai Kalender", "team");
    expect(t.titel).toBe("Abwesend: Kai Kalender");
    expect(t.beschreibung).toBeNull();
    expect(t.ganztaegig).toBe(true);
  });
  it("im eigenen Kalender steht die Art, im Teamkalender bei Urlaub Name und Art", () => {
    expect(terminFuer({ ...u, type: "urlaub" }, "Kai", "eigen").titel).toBe("Urlaub");
    expect(terminFuer({ ...u, type: "urlaub" }, "Kai", "team").titel).toBe("Abwesend: Kai (Urlaub)");
    expect(terminFuer(u, "Kai", "eigen").beschreibung).toBe("Grippe");
  });
});

describe("Abwesenheit → Kalender", () => {
  it("ohne Kalenderverbindung: Genehmigung geht durch, kein Eintrag, kein Fehler", async () => {
    const res = await admin.patch(`/api/hr/urlaub/${urlaubId}`).send({ status: "genehmigt" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("genehmigt");
    const sync = await admin.post(`/api/hr/abwesenheiten/${urlaubId}/kalender`);
    expect(sync.status).toBe(200);
    expect(sync.body.eintraege).toEqual([]);
    expect(sync.body.fehler).toBeNull();
  });

  it("der Teamkalender muss eine Firmenverbindung sein", async () => {
    const [nutzer] = await db.insert(kalenderTokens).values({ companyId, userId: adminUserId, provider: "microsoft", modus: "nutzer", konto: `admin@${DOMAIN}` }).returning();
    const res = await admin.put("/api/hr/abwesenheiten/kalender/team").send({ verbindungId: nutzer!.id });
    expect(res.status).toBe(400);
  });

  it("legt den Teamkalender fest — nur einen je Firma", async () => {
    // kalender_tokens ist eindeutig je (user, provider) -- der Admin hat schon die Nutzer-Verbindung.
    // Firmenverbindungen haengen deshalb an eigenen Dienstkonten.
    const [u1] = await db.insert(users).values({ companyId, username: "hrk-dienst1", email: `dienst1@${DOMAIN}`, name: "Dienst 1", passwordHash: "x", role: "mitarbeiter", isActive: true }).returning();
    const [f1] = await db.insert(kalenderTokens).values({ companyId, userId: u1!.id, provider: "microsoft", modus: "firma", konto: "abwesend@hr-kal.test", kalenderName: "Abwesenheiten" }).returning();
    const [u2] = await db.insert(users).values({ companyId, username: "hrk-dienst", email: `dienst@${DOMAIN}`, name: "Dienst", passwordHash: "x", role: "mitarbeiter", isActive: true }).returning();
    const [f2] = await db.insert(kalenderTokens).values({ companyId, userId: u2!.id, provider: "microsoft", modus: "firma", konto: "team@hr-kal.test" }).returning();

    expect((await admin.put("/api/hr/abwesenheiten/kalender/team").send({ verbindungId: f1!.id })).status).toBe(200);
    expect((await admin.put("/api/hr/abwesenheiten/kalender/team").send({ verbindungId: f2!.id })).status).toBe(200);
    const stand = await admin.get("/api/hr/abwesenheiten/kalender");
    expect(stand.status).toBe(200);
    expect(stand.body.teamkalender.id).toBe(f2!.id);
    expect(stand.body.kandidaten).toHaveLength(2);
  });

  it("mit Teamkalender ohne gültiges Token: Fehler steht an der Abwesenheit, Genehmigung bleibt", async () => {
    const sync = await admin.post(`/api/hr/abwesenheiten/${urlaubId}/kalender`);
    expect(sync.status).toBe(200);
    expect(sync.body.fehler).toBeTruthy();
    expect(sync.body.eintraege).toEqual([]);
    const [u] = await db.select().from(hrUrlaub).where(eq(hrUrlaub.id, urlaubId));
    expect(u!.status).toBe("genehmigt");
    expect(u!.kalenderFehler).toBeTruthy();
    const stand = await admin.get("/api/hr/abwesenheiten/kalender");
    expect(stand.body.abwesenheiten.mitFehler).toHaveLength(1);
    expect(stand.body.abwesenheiten.mitFehler[0].id).toBe(urlaubId);
  }, 30_000);

  it("Nachholen fasst die Fehlerfälle an und meldet sie", async () => {
    const res = await admin.post("/api/hr/abwesenheiten/kalender/nachholen");
    expect(res.status).toBe(200);
    expect(res.body.geprueft).toBeGreaterThanOrEqual(1);
    expect(res.body.fehler).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
