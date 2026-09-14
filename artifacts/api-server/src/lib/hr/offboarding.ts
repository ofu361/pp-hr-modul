// © 2026 P&P Group. Proprietary & Confidential.
// Offboarding (0436) — die Schritte eines Austritts, mit Rechteentzug per Klick.
//
// Heute ist der Austritt eine Checkliste im Kopf: Konto sperren, Outlook
// trennen, Objektbetreuung übergeben, Verteiler bereinigen, Schlüssel. Jeder
// vergessene Schritt ist ein Sicherheitsloch — ein aktives Konto eines
// Ausgeschiedenen ist die häufigste Ursache für Datenabfluss nach Kündigung.
//
// ⚠ Die automatischen Schritte laufen NUR per Klick, nie im Tageslauf. Der
//   Tageslauf legt die Liste an und erinnert; ein Konto zu sperren, weil ein
//   Austrittsdatum eingetragen wurde, das sich morgen ändert, wäre die falsche
//   Richtung der Automatik.
import { and, eq } from "drizzle-orm";
import { db, hrMitarbeiter, hrOffboarding, users, kalenderTokens, anfrageVerteiler, objektBetreuer, properties } from "@workspace/db";

export interface SchrittDefinition {
  schluessel: string;
  titel: string;
  beschreibung: string;
  automatisch: boolean;
  /** Frühestens ab wann sinnvoll: „vor" dem Austritt oder „am" Austrittstag. */
  wann: "vorher" | "austrittstag" | "danach";
}

export const OFFBOARDING_SCHRITTE: readonly SchrittDefinition[] = [
  { schluessel: "objektbetreuung_uebergeben", titel: "Objektbetreuung übergeben",         beschreibung: "Alle Objekte, die diese Person betreut, einem Kollegen zuordnen — sonst laufen Anfragen ins Leere.", automatisch: false, wann: "vorher" },
  { schluessel: "resturlaub_klaeren",         titel: "Resturlaub klären",                 beschreibung: "Nehmen oder abgelten (§ 7 Abs. 4 BUrlG). Der Stand steht im Urlaubskonto.", automatisch: false, wann: "vorher" },
  { schluessel: "zeugnis",                    titel: "Arbeitszeugnis erstellen",          beschreibung: "Anspruch nach § 109 GewO. Entwurf über den Dokumentgenerator, Freigabe durch die Führungskraft.", automatisch: false, wann: "vorher" },
  { schluessel: "wissensuebergabe",           titel: "Wissensübergabe dokumentieren",     beschreibung: "Offene Vorgänge, Ansprechpartner, Passwörter für Fachsysteme (nicht das Benutzerkonto).", automatisch: false, wann: "vorher" },
  { schluessel: "verteiler_entfernen",        titel: "Aus dem Anfrage-Verteiler nehmen",  beschreibung: "Setzt anfrage_verteiler.aktiv = false, damit keine neuen Anfragen mehr zugeteilt werden.", automatisch: true,  wann: "austrittstag" },
  { schluessel: "kalender_trennen",           titel: "Kalenderverbindung trennen",        beschreibung: "Stilllegt die Google-/Outlook-Verbindung — der Zugriffstoken wird nicht mehr erneuert.", automatisch: true,  wann: "austrittstag" },
  { schluessel: "konto_sperren",              titel: "Benutzerkonto sperren",             beschreibung: "Setzt users.is_active = false. Ein aktives Konto eines Ausgeschiedenen ist die häufigste Ursache für Datenabfluss.", automatisch: true,  wann: "austrittstag" },
  { schluessel: "zugaenge_hardware",          titel: "Schlüssel, Karten, Hardware",       beschreibung: "Büroschlüssel, Objektschlüssel, Zugangskarten, Laptop, Telefon zurücknehmen und quittieren.", automatisch: false, wann: "austrittstag" },
  { schluessel: "externe_zugaenge",           titel: "Externe Zugänge entziehen",         beschreibung: "Portale (IS24, Immowelt), Bank, DATEV, Handwerkerportale — überall, wo die Person eigene Zugangsdaten hatte.", automatisch: false, wann: "austrittstag" },
  { schluessel: "meldungen",                  titel: "Abmeldungen",                       beschreibung: "Sozialversicherung (DEÜV-Abmeldung durch die Lohnabrechnung), Berufsgenossenschaft, Lohnsteuerbescheinigung.", automatisch: false, wann: "danach" },
  { schluessel: "personalakte_aufbewahrung",  titel: "Personalakte: Aufbewahrung festlegen", beschreibung: "Lohnunterlagen 10 Jahre (§ 147 AO), Arbeitsvertrag/Zeugnis 3 Jahre nach Austritt (Verjährung), Bewerbungsdaten löschen.", automatisch: false, wann: "danach" },
];

/** Legt die Schrittliste an, wenn sie noch fehlt. Idempotent. */
export async function offboardingAnlegen(companyId: number, mitarbeiterId: number): Promise<number> {
  const vorhanden = await db.select({ schritt: hrOffboarding.schritt }).from(hrOffboarding)
    .where(and(eq(hrOffboarding.companyId, companyId), eq(hrOffboarding.mitarbeiterId, mitarbeiterId)));
  const da = new Set(vorhanden.map((v) => v.schritt));
  const neu = OFFBOARDING_SCHRITTE.filter((s) => !da.has(s.schluessel));
  if (neu.length === 0) return 0;
  await db.insert(hrOffboarding).values(neu.map((s) => ({ companyId, mitarbeiterId, schritt: s.schluessel, automatisch: s.automatisch })));
  return neu.length;
}

/** Führt einen automatischen Schritt aus und liefert einen Ergebnistext. */
export async function schrittAusfuehren(companyId: number, mitarbeiterId: number, schritt: string): Promise<string> {
  const [m] = await db.select({ userId: hrMitarbeiter.userId, name: hrMitarbeiter.name }).from(hrMitarbeiter)
    .where(and(eq(hrMitarbeiter.id, mitarbeiterId), eq(hrMitarbeiter.companyId, companyId)));
  if (!m) throw new Error("Mitarbeiter nicht gefunden");
  if (!m.userId) return "Kein Benutzerkonto verknüpft — nichts zu tun.";

  switch (schritt) {
    case "konto_sperren": {
      const r = await db.update(users).set({ isActive: false }).where(and(eq(users.id, m.userId), eq(users.companyId, companyId))).returning({ id: users.id });
      return r.length ? "Benutzerkonto gesperrt (is_active = false)." : "Konto nicht gefunden.";
    }
    case "kalender_trennen": {
      const r = await db.update(kalenderTokens).set({ aktiv: false, updatedAt: new Date() })
        .where(and(eq(kalenderTokens.userId, m.userId), eq(kalenderTokens.companyId, companyId), eq(kalenderTokens.aktiv, true))).returning({ id: kalenderTokens.id });
      return r.length ? `${r.length} Kalenderverbindung(en) stillgelegt.` : "Keine aktive Kalenderverbindung.";
    }
    case "verteiler_entfernen": {
      const r = await db.update(anfrageVerteiler).set({ aktiv: false, updatedAt: new Date() })
        .where(and(eq(anfrageVerteiler.userId, m.userId), eq(anfrageVerteiler.companyId, companyId), eq(anfrageVerteiler.aktiv, true))).returning({ id: anfrageVerteiler.id });
      return r.length ? "Aus dem Anfrage-Verteiler genommen." : "Stand nicht im Verteiler.";
    }
    default:
      throw new Error(`Schritt ${schritt} ist nicht automatisch`);
  }
}

/** Was an der Person noch hängt — für die Anzeige der manuellen Schritte. */
export async function offboardingBefund(companyId: number, mitarbeiterId: number): Promise<{
  userId: number | null; kontoAktiv: boolean | null; kalenderAktiv: number; imVerteiler: boolean; betreuteObjekte: { id: number; name: string }[];
}> {
  const [m] = await db.select({ userId: hrMitarbeiter.userId }).from(hrMitarbeiter).where(and(eq(hrMitarbeiter.id, mitarbeiterId), eq(hrMitarbeiter.companyId, companyId)));
  if (!m?.userId) return { userId: null, kontoAktiv: null, kalenderAktiv: 0, imVerteiler: false, betreuteObjekte: [] };
  const [[u], kal, [v], obj] = await Promise.all([
    db.select({ isActive: users.isActive }).from(users).where(eq(users.id, m.userId)),
    db.select({ id: kalenderTokens.id }).from(kalenderTokens).where(and(eq(kalenderTokens.userId, m.userId), eq(kalenderTokens.aktiv, true))),
    db.select({ aktiv: anfrageVerteiler.aktiv }).from(anfrageVerteiler).where(eq(anfrageVerteiler.userId, m.userId)),
    db.select({ id: properties.id, name: properties.title }).from(objektBetreuer).innerJoin(properties, eq(objektBetreuer.propertyId, properties.id))
      .where(and(eq(objektBetreuer.userId, m.userId), eq(objektBetreuer.companyId, companyId))),
  ]);
  return { userId: m.userId, kontoAktiv: u?.isActive ?? null, kalenderAktiv: kal.length, imVerteiler: Boolean(v?.aktiv), betreuteObjekte: obj.slice(0, 50) };
}
