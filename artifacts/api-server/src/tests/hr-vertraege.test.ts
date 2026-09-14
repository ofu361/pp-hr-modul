// © 2026 P&P Group. Proprietary & Confidential.
// Arbeitsverträge (0428): Erfassung, Ablösung, Fristenliste, Kündigungsrechner,
// Mandantenschranke am Dokument.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const { default: app } = await import("../app.js");
const { db, companies, users, hrMitarbeiter, hrPersonalakte } = await import("@workspace/db");

const DOMAIN = "hr-vertrag.test";
const CODE   = "HRVERT01";
const FREMD  = "HRVERT02";
const PW     = "hr-vertrag-pw-123!";

let admin: ReturnType<typeof request.agent>;
let companyId: number;
let maAnna: number, maBert: number, maOhne: number;
let fremdesDokument: number;

function inTagen(n: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  await db.delete(companies).where(eq(companies.code, FREMD));
  const hash = await bcrypt.hash(PW, 10);
  const [c] = await db.insert(companies).values({ name: "HR Vertrag GmbH", code: CODE, domain: DOMAIN }).returning();
  companyId = c!.id;
  await db.insert(users).values({ companyId, username: "hrv-admin", email: `admin@${DOMAIN}`, name: "Admin", passwordHash: hash, role: "admin", isActive: true });

  const [a] = await db.insert(hrMitarbeiter).values({ companyId, name: "Anna", jobTitle: "Verwalterin", startDate: "2017-01-01" }).returning();
  const [b] = await db.insert(hrMitarbeiter).values({ companyId, name: "Bert", jobTitle: "Azubi", startDate: inTagen(-100) }).returning();
  const [o] = await db.insert(hrMitarbeiter).values({ companyId, name: "Ohne Vertrag", jobTitle: "Assistenz", startDate: "2024-01-01" }).returning();
  maAnna = a!.id; maBert = b!.id; maOhne = o!.id;

  const [f] = await db.insert(companies).values({ name: "Fremd", code: FREMD, domain: "fremd-vertrag.test" }).returning();
  const [fm] = await db.insert(hrMitarbeiter).values({ companyId: f!.id, name: "Fremd", jobTitle: "x", startDate: "2020-01-01" }).returning();
  const [fd] = await db.insert(hrPersonalakte).values({ companyId: f!.id, mitarbeiterId: fm!.id, docType: "arbeitsvertrag", title: "Fremder Vertrag" }).returning();
  fremdesDokument = fd!.id;

  admin = await loginAs(app, `admin@${DOMAIN}`);
});

afterAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  await db.delete(companies).where(eq(companies.code, FREMD));
});

describe("Arbeitsverträge", () => {
  let annaVertrag1: number;

  it("legt einen befristeten Vertrag an und verlangt dafür ein Ende", async () => {
    const ohneEnde = await admin.post(`/api/hr/mitarbeiter/${maAnna}/vertraege`)
      .send({ vertragsart: "befristet_sachgrundlos", beginn: "2025-01-01" });
    expect(ohneEnde.status).toBe(400);

    const res = await admin.post(`/api/hr/mitarbeiter/${maAnna}/vertraege`).send({
      vertragsart: "befristet_sachgrundlos", beginn: "2025-01-01", ende: "2025-12-31",
      probezeitBis: "2025-06-30", kuendigungsfristWert: 4, kuendigungsfristEinheit: "wochen",
      kuendigungstermin: "monatsende", wochenstunden: "38,5", gehaltMonatCent: 420000, urlaubstage: 30,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.wochenstunden)).toBe(38.5);
    annaVertrag1 = res.body.id;
  });

  it("ein neuer aktiver Vertrag löst den alten ab", async () => {
    const res = await admin.post(`/api/hr/mitarbeiter/${maAnna}/vertraege`).send({
      vertragsart: "befristet_sachgrundlos", beginn: "2026-01-01", ende: inTagen(60), istVerlaengerung: true,
    });
    expect(res.status).toBe(201);

    const liste = await admin.get(`/api/hr/mitarbeiter/${maAnna}/vertraege`);
    expect(liste.status).toBe(200);
    const alt = liste.body.vertraege.find((v: any) => v.id === annaVertrag1);
    expect(alt.status).toBe("abgeloest");
    expect(liste.body.vertraege.filter((v: any) => v.status === "aktiv")).toHaveLength(1);
    // Die Kette zählt beide, den abgelösten eingeschlossen — sie ist Geschichte, nicht Zustand.
    expect(liste.body.kette.vertraege).toBe(2);
    expect(liste.body.kette.verlaengerungen).toBe(1);
  });

  it("die Fristenliste kennt die Befristung, den Azubi in Probezeit — und wer gar keinen Vertrag hat", async () => {
    await admin.post(`/api/hr/mitarbeiter/${maBert}/vertraege`).send({
      vertragsart: "ausbildung", beginn: inTagen(-100), probezeitBis: inTagen(20),
    });
    const res = await admin.get("/api/hr/vertraege/fristen");
    expect(res.status).toBe(200);

    const arten = res.body.fristen.map((f: any) => `${f.name}:${f.art}`);
    expect(arten).toContain("Anna:befristung");
    expect(arten).toContain("Bert:probezeit");
    // Bert: Probezeitende in 20 Tagen → entscheiden in 6 Tagen → diese Woche.
    const bert = res.body.fristen.find((f: any) => f.name === "Bert");
    expect(bert.tageBisEntscheidung).toBe(6);
    expect(bert.dringlichkeit).toBe("diese_woche");
    // Anna: Vertragsende in 60 Tagen, Vorlauf 90 → die Entscheidung ist 30 Tage ÜBERFÄLLIG.
    // Das steht vor Berts sechs Tagen — dringlichstes zuerst.
    const anna = res.body.fristen.find((f: any) => f.name === "Anna");
    expect(anna.dringlichkeit).toBe("ueberfaellig");
    expect(res.body.fristen[0].name).toBe("Anna");

    expect(res.body.luecken.ohneVertrag).toBe(1);
    expect(res.body.luecken.ohneVertragNamen[0].id).toBe(maOhne);
  });

  it("rechnet die Kündigung mit der längeren Frist — hier der gesetzlichen, vom ersten Eintritt an", async () => {
    // Anna: Eintritt 2017 → 9 Jahre → 3 Monate zum Monatsende. Vertrag sagt 4 Wochen.
    const liste = await admin.get(`/api/hr/mitarbeiter/${maAnna}/vertraege`);
    const aktiv = liste.body.vertraege.find((v: any) => v.status === "aktiv");
    await admin.patch(`/api/hr/vertraege/${aktiv.id}`).send({ kuendigungsfristWert: 4, kuendigungsfristEinheit: "wochen", kuendigungstermin: "monatsende" });

    const res = await admin.get(`/api/hr/vertraege/${aktiv.id}/kuendigung?am=2026-03-10`);
    expect(res.status).toBe(200);
    expect(res.body.betriebsjahre).toBe(9);
    expect(res.body.massgeblich).toBe("gesetzlich");
    expect(res.body.massgeblichesEnde).toBe("2026-06-30");
    expect(res.body.vertraglich.ende).toBe("2026-04-30");
  });

  it("weist ein Dokument eines fremden Mandanten ab", async () => {
    const res = await admin.post(`/api/hr/mitarbeiter/${maAnna}/vertraege`)
      .send({ vertragsart: "unbefristet", beginn: "2026-02-01", personalakteId: fremdesDokument });
    expect(res.status).toBe(400);
  });

  it("die Auslesung verlangt Text oder Dokument", async () => {
    const liste = await admin.get(`/api/hr/mitarbeiter/${maAnna}/vertraege`);
    const aktiv = liste.body.vertraege.find((v: any) => v.status === "aktiv");
    const res = await admin.post(`/api/hr/vertraege/${aktiv.id}/auslesen`).send({});
    expect(res.status).toBe(400);
  });
});
