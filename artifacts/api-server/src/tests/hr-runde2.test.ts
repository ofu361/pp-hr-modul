// © 2026 P&P Group. Proprietary & Confidential.
// HR Runde 2 (0436) — Import, Urlaubskonto, § 34c, Offboarding, Tageslauf, Prognosequelle.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loginAs } from "./helpers/auth";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

const { default: app } = await import("../app.js");
const { db, companies, users, gesellschaften, hrMitarbeiter, hrUrlaub, anfrageVerteiler, hrErinnerungen, notifications, hrKostenParameter } = await import("@workspace/db");
const { ladeWochenPrognose } = await import("../services/liquiditaet-prognose.js");
const { liquiditaetSzenarien } = await import("@workspace/db");

const DOMAIN = "hr-r2.test";
const CODE   = "HRRUND02";
const PW     = "hr-r2-pw-123!";
let admin: ReturnType<typeof request.agent>;
let companyId: number, adminId: number, kevinUser: number;

function inTagen(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const heute = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  await db.delete(companies).where(eq(companies.code, CODE));
  const hash = await bcrypt.hash(PW, 10);
  const [c] = await db.insert(companies).values({ name: "HR Runde 2 GmbH", code: CODE, domain: DOMAIN }).returning();
  companyId = c!.id;
  const [a] = await db.insert(users).values({ companyId, username: "hrr2-admin", email: `admin@${DOMAIN}`, name: "Admin", passwordHash: hash, role: "admin", isActive: true }).returning();
  adminId = a!.id;
  const [k] = await db.insert(users).values({ companyId, username: "hrr2-kevin", email: `kevin@${DOMAIN}`, name: "Kevin", passwordHash: hash, role: "mitarbeiter", isActive: true }).returning();
  kevinUser = k!.id;
  await db.insert(gesellschaften).values({ companyId, nummer: "GS-7001", name: "Runde Zwei Verwaltung GmbH" });
  admin = await loginAs(app, `admin@${DOMAIN}`);
});
afterAll(async () => { await db.delete(companies).where(eq(companies.code, CODE)); });

describe("Import", () => {
  const csv = `Name;Gesellschaft;Stelle;Abteilung;Eintritt;Wochenstunden;Monatsbrutto;Urlaubstage;E-Mail;34c
Kevin Bauer;GS-7001;Vermietungsmanager;Vermietung;01.03.2019;40;4.200,00;30;kevin@hr-r2.test;ja
Richter, Anna;Runde Zwei Verwaltung GmbH;Buchhalterin;Buchhaltung;2015-04-01;30;3600;30;;nein
Ohne Datum;GS-7001;Assistenz;;;40;3000;30;;
Jahresgehalt;GS-7001;Asset Manager;;01.01.2020;40;96000;30;;
Kevin Bauer;GS-7001;Doppelt;;01.01.2020;40;1000;30;;`;

  it("Vorschau: erkennt Spalten, urteilt je Zeile, schreibt nichts", async () => {
    const res = await admin.post("/api/hr/import/vorschau").send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.spaltenErkannt.name).toBe("Name");
    expect(res.body.spaltenErkannt.monatsbrutto).toBe("Monatsbrutto");
    expect(res.body.spaltenErkannt.mabv).toBe("34c");
    const z = res.body.zeilen;
    expect(z[0].urteil).toBe("neu");
    expect(z[0].felder.salaryGross).toBe(420_000);        // 4.200,00 → Cent
    expect(z[0].felder.startDate).toBe("2019-03-01");     // deutsches Datum
    expect(z[0].felder.mabvPflichtig).toBe(true);
    expect(z[1].name).toBe("Anna Richter");                // „Nachname, Vorname" gedreht
    expect(z[1].felder.gesellschaftId).toBeTruthy();       // per Name gefunden
    expect(z[1].felder.salaryGross).toBe(360_000);
    expect(z[2].urteil).toBe("fehler"); expect(z[2].probleme.join()).toMatch(/Eintritt/);
    expect(z[3].urteil).toBe("fehler"); expect(z[3].probleme.join()).toMatch(/Jahreswert/);
    expect(z[4].urteil).toBe("fehler"); expect(z[4].probleme.join()).toMatch(/doppelt/);
    const [{ n }] = await db.select({ n: hrMitarbeiter.id }).from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)).then((r) => [{ n: r.length }]);
    expect(n).toBe(0);
  });

  it("Übernahme legt nur die guten Zeilen an; ein zweiter Lauf aktualisiert statt zu verdoppeln", async () => {
    const res = await admin.post("/api/hr/import/uebernehmen").send({ csv });
    expect(res.status).toBe(200);
    expect(res.body.angelegt).toBe(2);
    expect(res.body.fehlerzeilen).toHaveLength(3);
    const csv2 = csv.replace("4.200,00", "4.400,00");
    const v2 = await admin.post("/api/hr/import/vorschau").send({ csv: csv2 });
    expect(v2.body.zeilen[0].urteil).toBe("aktualisieren");
    expect(v2.body.zeilen[0].aenderungen.join()).toMatch(/Monatsbrutto: 420000 → 440000/);
    expect(v2.body.zeilen[1].urteil).toBe("unveraendert");
    const r2 = await admin.post("/api/hr/import/uebernehmen").send({ csv: csv2 });
    expect(r2.body.aktualisiert).toBe(1);
    const alle = await db.select().from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId));
    expect(alle).toHaveLength(2);
    expect(alle.find((m) => m.name === "Kevin Bauer")!.salaryGross).toBe(440_000);
  });
});

describe("Urlaubskonto über die Route", () => {
  it("rechnet Teilzeit in Tagen und trennt genommen von verplant", async () => {
    const [anna] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), eq(hrMitarbeiter.name, "Anna Richter")));
    await admin.patch(`/api/hr/mitarbeiter/${anna!.id}`).send({ arbeitstageProWoche: 4 });
    const jahr = new Date().getFullYear();
    await db.insert(hrUrlaub).values([
      { companyId, mitarbeiterId: anna!.id, type: "urlaub", startDate: `${jahr}-01-05`, endDate: `${jahr}-01-09`, days: 4, status: "genehmigt" },
      { companyId, mitarbeiterId: anna!.id, type: "urlaub", startDate: `${jahr}-12-28`, endDate: `${jahr}-12-30`, days: 3, status: "genehmigt" },
    ]);
    const res = await admin.get(`/api/hr/mitarbeiter/${anna!.id}/urlaubskonto?jahr=${jahr}`);
    expect(res.status).toBe(200);
    expect(res.body.anspruch).toBe(24);   // 30 × 4/5
    expect(res.body.genommen).toBe(4);
    expect(res.body.verplant).toBe(3);
    const korr = await admin.post(`/api/hr/mitarbeiter/${anna!.id}/urlaubskonto/korrektur`).send({ jahr, art: "uebertrag", tage: "5", grund: "Rest Vorjahr laut Lohnabrechnung" });
    expect(korr.status).toBe(201);
    const ohneGrund = await admin.post(`/api/hr/mitarbeiter/${anna!.id}/urlaubskonto/korrektur`).send({ jahr, art: "korrektur", tage: "1", grund: "" });
    expect(ohneGrund.status).toBe(400);
    const nach = await admin.get(`/api/hr/mitarbeiter/${anna!.id}/urlaubskonto?jahr=${jahr}`);
    expect(nach.body.uebertrag).toBe(5);
    expect(nach.body.uebertragGesetzt).toBe(true);
    const liste = await admin.get(`/api/hr/urlaubskonten?jahr=${jahr}`);
    expect(liste.body.konten.length).toBe(2);
  });
});

describe("§ 34c Weiterbildung", () => {
  it("führt Stunden, erkennt den Rückstand und die vermutlich Pflichtigen", async () => {
    const [kevin] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), eq(hrMitarbeiter.name, "Kevin Bauer")));
    const [anna]  = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), eq(hrMitarbeiter.name, "Anna Richter")));
    expect(kevin!.mabvPflichtig).toBe(true);   // aus dem Import
    const w = await admin.post(`/api/hr/mitarbeiter/${kevin!.id}/weiterbildung`).send({ titel: "Mietrecht aktuell", anbieter: "IVD", datum: heute(), stunden: "6,5", mabvRelevant: true });
    expect(w.status).toBe(201);
    const zuViel = await admin.post(`/api/hr/mitarbeiter/${kevin!.id}/weiterbildung`).send({ titel: "x", datum: heute(), stunden: "100" });
    expect(zuViel.status).toBe(400);
    const res = await admin.get("/api/hr/weiterbildung");
    expect(res.status).toBe(200);
    const k = res.body.staende.find((s: any) => s.mitarbeiterId === kevin!.id);
    expect(k.pflichtig).toBe(true);
    expect(k.stundenImZeitraum).toBe(6.5);
    expect(k.rest).toBe(13.5);
    // Anna heißt „Buchhalterin" — nicht vermutlich pflichtig; Kevin ist schon markiert.
    expect(res.body.zusammenfassung.vermutlichPflichtig.map((m: any) => m.id)).not.toContain(anna!.id);
    expect(res.body.zusammenfassung.pflichtig).toBe(1);
  });
});

describe("Tageslauf: Abwesenheit → Verteiler, Offboarding, Erinnerungen", () => {
  it("setzt abwesend_bis für heute laufende Abwesenheiten und räumt abgelaufene auf", async () => {
    const [kevin] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), eq(hrMitarbeiter.name, "Kevin Bauer")));
    await db.update(hrMitarbeiter).set({ userId: kevinUser }).where(eq(hrMitarbeiter.id, kevin!.id));
    await db.insert(anfrageVerteiler).values({ companyId, userId: kevinUser, aktiv: true, abwesendBis: inTagen(-3) }); // abgelaufener Handeintrag
    await db.insert(anfrageVerteiler).values({ companyId, userId: adminId, aktiv: true, abwesendBis: inTagen(-3) });   // abgelaufen, keine HR-Abwesenheit → wird freigegeben
    await db.insert(hrUrlaub).values({ companyId, mitarbeiterId: kevin!.id, type: "urlaub", startDate: inTagen(-1), endDate: inTagen(4), days: 4, status: "genehmigt" });

    const lauf = await admin.post("/api/hr/tageslauf");
    expect(lauf.status).toBe(200);
    expect(lauf.body.verteilerGesetzt).toBe(1);
    expect(lauf.body.verteilerFreigegeben).toBe(1);
    const [vk] = await db.select().from(anfrageVerteiler).where(eq(anfrageVerteiler.userId, kevinUser));
    expect(vk!.abwesendBis).toBe(inTagen(4));
    const [va] = await db.select().from(anfrageVerteiler).where(eq(anfrageVerteiler.userId, adminId));
    expect(va!.abwesendBis).toBeNull();
    // Ein Handeintrag, der WEITER reicht, bleibt.
    await db.update(anfrageVerteiler).set({ abwesendBis: inTagen(30) }).where(eq(anfrageVerteiler.userId, kevinUser));
    await admin.post("/api/hr/tageslauf");
    const [vk2] = await db.select().from(anfrageVerteiler).where(eq(anfrageVerteiler.userId, kevinUser));
    expect(vk2!.abwesendBis).toBe(inTagen(30));
  });

  it("Probezeit-Frist wird genau einmal gemeldet; Offboarding wird bei Austritt angelegt", async () => {
    const [anna] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), eq(hrMitarbeiter.name, "Anna Richter")));
    await admin.post(`/api/hr/mitarbeiter/${anna!.id}/vertraege`).send({ vertragsart: "unbefristet", beginn: inTagen(-100), probezeitBis: inTagen(20) });
    await admin.patch(`/api/hr/mitarbeiter/${anna!.id}`).send({ endDate: inTagen(30), austrittsgrund: "Eigene Kündigung" });

    const lauf1 = await admin.post("/api/hr/tageslauf");
    expect(lauf1.body.fristenGemeldet).toBeGreaterThanOrEqual(1);
    expect(lauf1.body.offboardingAngelegt).toBe(1);
    const lauf2 = await admin.post("/api/hr/tageslauf");
    expect(lauf2.body.fristenGemeldet).toBe(0);
    expect(lauf2.body.offboardingAngelegt).toBe(0);

    const erinnerungen = await db.select().from(hrErinnerungen).where(eq(hrErinnerungen.companyId, companyId));
    expect(erinnerungen.some((e) => e.schluessel.startsWith("frist:probezeit:"))).toBe(true);
    const meld = await db.select().from(notifications).where(and(eq(notifications.companyId, companyId), eq(notifications.userId, adminId)));
    expect(meld.some((n) => n.type === "hr_frist")).toBe(true);
    expect(meld.some((n) => n.type === "hr_offboarding")).toBe(true);

    const ob = await admin.get(`/api/hr/mitarbeiter/${anna!.id}/offboarding`);
    expect(ob.status).toBe(200);
    expect(ob.body.angelegt).toBe(true);
    expect(ob.body.schritte.filter((s: any) => s.automatisch)).toHaveLength(3);
  });

  it("automatischer Schritt Konto sperren wirkt nur per Klick -- und dann wirklich", async () => {
    const [kevin] = await db.select().from(hrMitarbeiter).where(and(eq(hrMitarbeiter.companyId, companyId), eq(hrMitarbeiter.name, "Kevin Bauer")));
    await admin.patch(`/api/hr/mitarbeiter/${kevin!.id}`).send({ endDate: inTagen(-1) });
    await admin.post(`/api/hr/mitarbeiter/${kevin!.id}/offboarding`);
    const [vorher] = await db.select({ a: users.isActive }).from(users).where(eq(users.id, kevinUser));
    expect(vorher!.a).toBe(true);   // der Tageslauf hat NICHT gesperrt
    const r = await admin.patch(`/api/hr/mitarbeiter/${kevin!.id}/offboarding/konto_sperren`).send({ aktion: "ausfuehren" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("erledigt");
    const [nachher] = await db.select({ a: users.isActive }).from(users).where(eq(users.id, kevinUser));
    expect(nachher!.a).toBe(false);
    const v = await admin.patch(`/api/hr/mitarbeiter/${kevin!.id}/offboarding/verteiler_entfernen`).send({ aktion: "ausfuehren" });
    expect(v.body.ergebnis).toMatch(/Verteiler/);
    const [vk] = await db.select().from(anfrageVerteiler).where(eq(anfrageVerteiler.userId, kevinUser));
    expect(vk!.aktiv).toBe(false);
  });
});

describe("Personalkosten in der Liquiditätsprognose", () => {
  it("bucht die Gehälter am Zahltag als eigene Quelle", async () => {
    await db.insert(liquiditaetSzenarien).values({ companyId, name: "Basis", istStandard: true, erstelltVon: adminId } as any).onConflictDoNothing();
    await db.insert(hrKostenParameter).values({ companyId, jahr: new Date().getFullYear(), arbeitstageProJahr: 250, agNebenkostenBp: 2000, zahltag: 28 }).onConflictDoNothing();
    // Kevin ist ausgeschieden (endDate gestern) — Anna (3.600 €, Austritt in 30 Tagen) zählt im ersten Monat.
    const p = await ladeWochenPrognose(companyId, null, 13);
    const personal = p.wochen.flatMap((w) => w.posten.filter((x) => x.quelle === "personal"));
    expect(personal.length).toBeGreaterThanOrEqual(1);
    // 3.600 € × 1,20 = 4.320 € — negativ, weil Abfluss.
    expect(personal[0]!.betragCents).toBe(-432_000);
    expect(personal[0]!.bezeichnung).toMatch(/Gehälter/);
    expect(p.datenlage.personalMitarbeiter).toBeGreaterThanOrEqual(1);
  });
});
