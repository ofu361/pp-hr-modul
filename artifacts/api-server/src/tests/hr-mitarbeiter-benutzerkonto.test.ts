// © 2026 P&P Group. Proprietary & Confidential.
// `hr_mitarbeiter.user_id` ist die einzige Verbindung zwischen Login und
// Mitarbeiter — und wurde bis 14.08.2026 von keinem unterstützten Pfad
// geschrieben. `/hr/self-service` löst darüber auf und lieferte deshalb jedem
// `notFound`.
//
// Geprüft wird hier nicht bloß, DASS sich die Verknüpfung setzen lässt, sondern
// die beiden Schranken, ohne die sie gefährlich wäre: kein fremdes Konto, und
// kein Konto zweimal. Die zweite ist der eigentliche Grund — `/hr/self-service`
// nimmt `.limit(1)`, bei zwei Treffern bekäme jemand fremde Gehalts- und
// Urlaubsdaten zu sehen, und zwar in nicht vorhersagbarer Auswahl.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const { default: app } = await import("../app.js");
const { db, companies, users } = await import("@workspace/db");

const DOMAIN = "hr-konto.test";
const CODE   = "HRKONTO1";
const FREMD  = "HRKONTO2";
const PW     = "hr-konto-pw-123!";

let admin: ReturnType<typeof request.agent>;
let mitarbeiterKonto: number;
let zweitesKonto: number;
let fremdesKonto: number;

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  await db.delete(companies).where(eq(companies.code, FREMD));
  const hash = await bcrypt.hash(PW, 10);

  const [c] = await db.insert(companies).values({ name: "HR Konto GmbH", code: CODE, domain: DOMAIN }).returning();
  const companyId = c!.id;
  await db.insert(users).values({
    companyId, username: "hr-admin", email: `admin@${DOMAIN}`, name: "Admin",
    passwordHash: hash, role: "admin", isActive: true,
  });

  const [m1] = await db.insert(users).values({
    companyId, username: "hr-ma1", email: `ma1@${DOMAIN}`, name: "Mara Muster",
    passwordHash: hash, role: "mitarbeiter", isActive: true,
  }).returning();
  const [m2] = await db.insert(users).values({
    companyId, username: "hr-ma2", email: `ma2@${DOMAIN}`, name: "Toni Test",
    passwordHash: hash, role: "mitarbeiter", isActive: true,
  }).returning();
  mitarbeiterKonto = m1!.id;
  zweitesKonto     = m2!.id;

  // Eigene Firma, damit die Mandantenschranke etwas zu prüfen hat.
  const [f] = await db.insert(companies).values({ name: "Fremd GmbH", code: FREMD, domain: "fremd-hr.test" }).returning();
  const [fu] = await db.insert(users).values({
    companyId: f!.id, username: "fremd-ma", email: "ma@fremd-hr.test", name: "Fremd Person",
    passwordHash: hash, role: "mitarbeiter", isActive: true,
  }).returning();
  fremdesKonto = fu!.id;

  admin = await loginAs(app, `admin@${DOMAIN}`);
});

afterAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  await db.delete(companies).where(eq(companies.code, FREMD));
});

const anlegen = (body: Record<string, unknown>) =>
  admin.post("/api/hr/mitarbeiter").send({ name: "Mara Muster", startDate: "2026-01-01", ...body });

describe("hr_mitarbeiter.user_id — Verknüpfung Login ↔ Mitarbeiter", () => {
  it("POST setzt die Verknüpfung", async () => {
    const res = await anlegen({ userId: mitarbeiterKonto });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(mitarbeiterKonto);
  });

  it("POST ohne userId legt weiterhin an — das Feld ist freiwillig", async () => {
    const res = await anlegen({ name: "Ohne Konto" });
    expect(res.status).toBe(201);
    expect(res.body.userId ?? null).toBeNull();
  });

  it("weist ein Konto einer FREMDEN Firma ab", async () => {
    const res = await anlegen({ name: "Fremdversuch", userId: fremdesKonto });
    expect(res.status).toBe(400);
    expect(String(res.body.error ?? res.body.message)).toMatch(/nicht zu dieser Firma/i);
  });

  it("weist ein bereits vergebenes Konto ab — sonst wird self-service mehrdeutig", async () => {
    const erst = await anlegen({ name: "Erste", userId: zweitesKonto });
    expect(erst.status).toBe(201);

    const zweit = await anlegen({ name: "Zweite", userId: zweitesKonto });
    expect(zweit.status).toBe(400);
    expect(String(zweit.body.error ?? zweit.body.message)).toMatch(/bereits mit/i);
  });

  it("PATCH setzt und löst die Verknüpfung", async () => {
    const angelegt = await anlegen({ name: "Umhaengen" });
    const id = angelegt.body.id as number;

    const gesetzt = await admin.patch(`/api/hr/mitarbeiter/${id}`).send({ userId: mitarbeiterKonto });
    // mitarbeiterKonto hängt schon am ersten Datensatz → muss abgewiesen werden.
    expect(gesetzt.status).toBe(400);

    const [frei] = await db.insert(users).values({
      companyId: (await db.select().from(companies).where(eq(companies.code, CODE)))[0]!.id,
      username: "hr-ma3", email: `ma3@${DOMAIN}`, name: "Frei Konto",
      passwordHash: await bcrypt.hash(PW, 10), role: "mitarbeiter", isActive: true,
    }).returning();

    const ok = await admin.patch(`/api/hr/mitarbeiter/${id}`).send({ userId: frei!.id });
    expect(ok.status).toBe(200);
    expect(ok.body.userId).toBe(frei!.id);

    // Ausdrückliches null löst — und darf nicht als „nicht mitgeschickt" gelten.
    const geloest = await admin.patch(`/api/hr/mitarbeiter/${id}`).send({ userId: null });
    expect(geloest.status).toBe(200);
    expect(geloest.body.userId ?? null).toBeNull();
  });

  it("dasselbe Konto beim eigenen Datensatz erneut zu speichern ist erlaubt", async () => {
    const angelegt = await anlegen({ name: "Nochmal Speichern", userId: undefined });
    const id = angelegt.body.id as number;

    const [konto] = await db.insert(users).values({
      companyId: (await db.select().from(companies).where(eq(companies.code, CODE)))[0]!.id,
      username: "hr-ma4", email: `ma4@${DOMAIN}`, name: "Vier Konto",
      passwordHash: await bcrypt.hash(PW, 10), role: "mitarbeiter", isActive: true,
    }).returning();

    await admin.patch(`/api/hr/mitarbeiter/${id}`).send({ userId: konto!.id }).expect(200);
    // Zweites Speichern ohne Änderung darf nicht an der eigenen Zeile scheitern.
    const wieder = await admin.patch(`/api/hr/mitarbeiter/${id}`).send({ userId: konto!.id, jobTitle: "Neu" });
    expect(wieder.status).toBe(200);
  });

  it("die Auswahlliste nennt die Firma-Konten und markiert vergebene", async () => {
    const res = await admin.get("/api/hr/benutzer-auswahl");
    expect(res.status).toBe(200);

    const ids = (res.body as Array<{ id: number }>).map(k => k.id);
    expect(ids).toContain(mitarbeiterKonto);
    expect(ids).not.toContain(fremdesKonto);

    const belegt = (res.body as Array<{ id: number; belegtVon: string | null }>)
      .find(k => k.id === mitarbeiterKonto);
    expect(belegt?.belegtVon).toBeTruthy();
  });
});
