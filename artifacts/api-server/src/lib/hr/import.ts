// © 2026 P&P Group. Proprietary & Confidential.
// Personalstamm-Import (0436) — aus CSV/Excel-Export der Lohnabrechnung.
//
// Auf srv-ppsw stehen null Mitarbeiter. Jede Auswertung zeigt bis dahin „—".
// Der Import ist deshalb die wichtigste Verbesserung: nicht mehr Masken,
// sondern Daten. Er arbeitet in zwei Schritten — VORSCHAU (nichts wird
// geschrieben, jede Zeile bekommt ein Urteil) und ÜBERNAHME (nur, was in
// der Vorschau grün oder gelb war).
//
// ⚠ Spaltennamen sind frei: „Monatsbrutto", „Gehalt", „Brutto/Monat" landen
//   alle auf salary_gross. Die Zuordnung steht unten; wer eine neue Bezeichnung
//   sieht, ergänzt sie dort statt die Datei umzubenennen.
// ⚠ Gehalt kommt in EURO (so steht es in jeder Lohnliste) und wird hier in
//   CENT gewandelt — die einzige Stelle, an der der Faktor 100 anfällt.
import { parse } from "csv-parse/sync";
import { and, eq } from "drizzle-orm";
import { db, hrMitarbeiter, gesellschaften } from "@workspace/db";

const SPALTEN: Record<string, readonly string[]> = {
  name:            ["name", "mitarbeiter", "vollname", "nachname vorname", "personal"],
  vorname:         ["vorname", "first name", "firstname"],
  nachname:        ["nachname", "familienname", "last name", "lastname", "surname"],
  personalnummer:  ["personalnummer", "persnr", "pers-nr", "pnr", "mitarbeiternummer", "nr"],
  gesellschaft:    ["gesellschaft", "firma", "rechtstraeger", "rechtsträger", "arbeitgeber", "gs", "mandant"],
  jobTitle:        ["stellenbezeichnung", "stelle", "position", "job", "jobtitle", "job_title", "funktion", "taetigkeit", "tätigkeit", "berufsbezeichnung"],
  abteilung:       ["abteilung", "bereich", "department", "kostenstelle"],
  startDate:       ["eintritt", "eintrittsdatum", "start", "start_date", "beginn", "seit", "einstellungsdatum"],
  endDate:         ["austritt", "austrittsdatum", "ende", "end_date", "bis"],
  employmentType:  ["beschaeftigungsart", "beschäftigungsart", "art", "vertragsart", "employment_type", "arbeitszeitmodell"],
  weeklyHours:     ["wochenstunden", "stunden", "std/woche", "wochenarbeitszeit", "weekly_hours", "arbeitszeit"],
  arbeitstage:     ["arbeitstage", "tage/woche", "arbeitstage_pro_woche", "wochentage"],
  monatsbrutto:    ["monatsbrutto", "brutto", "gehalt", "bruttogehalt", "grundgehalt", "brutto/monat", "monatsgehalt", "salary", "lohn"],
  urlaubstage:     ["urlaubstage", "urlaub", "urlaubsanspruch", "jahresurlaub"],
  email:           ["email", "e-mail", "mail", "e_mail"],
  phone:           ["telefon", "phone", "mobil", "handy", "tel"],
  birthDate:       ["geburtsdatum", "geboren", "birth_date", "geb"],
  mabv:            ["34c", "mabv", "weiterbildungspflicht", "sachkunde"],
};

const ART_MAP: Record<string, string> = {
  vollzeit: "vollzeit", vz: "vollzeit", "full-time": "vollzeit", fulltime: "vollzeit",
  teilzeit: "teilzeit", tz: "teilzeit", "part-time": "teilzeit", parttime: "teilzeit",
  minijob: "minijob", "geringfügig": "minijob", geringfuegig: "minijob", aushilfe: "minijob",
  werkstudent: "werkstudent", praktikant: "praktikant", praktikum: "praktikant",
  freiberuflich: "freiberuflich", freelancer: "freiberuflich", azubi: "vollzeit", ausbildung: "vollzeit",
};

export interface ImportZeile {
  nr: number;
  urteil: "neu" | "aktualisieren" | "fehler" | "unveraendert";
  name: string;
  felder: Partial<{
    gesellschaftId: number | null; gesellschaftText: string; jobTitle: string; abteilung: string; startDate: string; endDate: string | null;
    employmentType: string; weeklyHours: number; arbeitstageProWoche: number; salaryGross: number; urlaubstageProJahr: number;
    email: string; phone: string; birthDate: string; mabvPflichtig: boolean;
  }>;
  vorhandenId: number | null;
  probleme: string[];
  aenderungen: string[];
}

export interface ImportVorschau {
  zeilen: ImportZeile[];
  spaltenErkannt: Record<string, string>;
  spaltenUnbekannt: string[];
  zusammenfassung: { neu: number; aktualisieren: number; unveraendert: number; fehler: number };
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c] ?? c)).replace(/[^a-z0-9/]/g, " ").replace(/\s+/g, " ").trim();
}

/** Datum in vielen Schreibweisen → YYYY-MM-DD. */
export function datumLesen(roh: unknown): string | null {
  if (roh == null) return null;
  const s = String(roh).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) { const j = m[3]!.length === 2 ? `20${m[3]}` : m[3]; return `${j}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`; }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  // Excel-Seriennummer
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); return d.toISOString().slice(0, 10); }
  return null;
}

/** „4.200,00 €", „4200", „4,200.00" → Euro als Zahl. */
export function euroLesen(roh: unknown): number | null {
  if (roh == null) return null;
  let s = String(roh).replace(/[€\s]/g, "").trim();
  if (!s) return null;
  // Deutsch: Punkt = Tausender, Komma = Dezimal — wenn ein Komma da ist.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function zahl(roh: unknown): number | null {
  const n = euroLesen(roh);
  return n;
}

function jaNein(roh: unknown): boolean | null {
  if (roh == null) return null;
  const s = String(roh).trim().toLowerCase();
  if (["ja", "j", "x", "1", "true", "yes", "y"].includes(s)) return true;
  if (["nein", "n", "0", "false", "no", ""].includes(s)) return false;
  return null;
}

export async function importVorschau(companyId: number, csvText: string): Promise<ImportVorschau> {
  // Trennzeichen erraten: Semikolon (deutsches Excel) vor Komma vor Tab.
  const kopf = csvText.split(/\r?\n/)[0] ?? "";
  const trenner = (kopf.match(/;/g) ?? []).length >= (kopf.match(/,/g) ?? []).length ? ((kopf.match(/\t/g) ?? []).length > (kopf.match(/;/g) ?? []).length ? "\t" : ";") : ",";
  const rows = parse(csvText.replace(/^﻿/, ""), { delimiter: trenner, columns: true, skip_empty_lines: true, relax_column_count: true, trim: true, bom: true }) as Record<string, string>[];

  // Spalten zuordnen
  const spaltenErkannt: Record<string, string> = {};
  const spaltenUnbekannt: string[] = [];
  const kopfzeilen = Object.keys(rows[0] ?? {});
  for (const k of kopfzeilen) {
    const n = norm(k);
    const feld = Object.entries(SPALTEN).find(([, namen]) => namen.some((x) => norm(x) === n))?.[0]
      ?? Object.entries(SPALTEN).find(([, namen]) => namen.some((x) => n.includes(norm(x)) && norm(x).length >= 4))?.[0];
    if (feld && !spaltenErkannt[feld]) spaltenErkannt[feld] = k; else spaltenUnbekannt.push(k);
  }
  const wert = (r: Record<string, string>, feld: string): string | undefined => spaltenErkannt[feld] ? r[spaltenErkannt[feld]!] : undefined;

  const [vorhandene, gs] = await Promise.all([
    db.select().from(hrMitarbeiter).where(eq(hrMitarbeiter.companyId, companyId)),
    db.select({ id: gesellschaften.id, nummer: gesellschaften.nummer, name: gesellschaften.name }).from(gesellschaften).where(eq(gesellschaften.companyId, companyId)),
  ]);
  const gsFinden = (text: string): number | null => {
    const t = norm(text);
    const treffer = gs.find((g) => norm(g.nummer) === t) ?? gs.find((g) => norm(g.name) === t) ?? gs.find((g) => norm(g.name).includes(t) && t.length >= 4);
    return treffer?.id ?? null;
  };

  const zeilen: ImportZeile[] = rows.map((r, i) => {
    const probleme: string[] = [];
    const felder: ImportZeile["felder"] = {};
    let name = (wert(r, "name") ?? "").trim();
    if (!name) {
      const vn = (wert(r, "vorname") ?? "").trim(), nn = (wert(r, "nachname") ?? "").trim();
      // Lohnlisten schreiben oft „Nachname, Vorname" — hier wird es „Vorname Nachname".
      name = [vn, nn].filter(Boolean).join(" ");
    }
    if (name.includes(",") && !wert(r, "vorname")) { const [nn, vn] = name.split(",").map((x) => x.trim()); name = `${vn} ${nn}`.trim(); }
    if (!name) probleme.push("Kein Name");

    const start = datumLesen(wert(r, "startDate"));
    if (!start) probleme.push(wert(r, "startDate") ? `Eintritt nicht lesbar: „${wert(r, "startDate")}"` : "Eintrittsdatum fehlt");
    else felder.startDate = start;
    const endeRoh = wert(r, "endDate");
    if (endeRoh) { const e = datumLesen(endeRoh); if (e) felder.endDate = e; else probleme.push(`Austritt nicht lesbar: „${endeRoh}"`); }

    const gText = (wert(r, "gesellschaft") ?? "").trim();
    if (gText) { const gid = gsFinden(gText); felder.gesellschaftText = gText; felder.gesellschaftId = gid; if (!gid) probleme.push(`Gesellschaft „${gText}" nicht im Stamm (GS-Nummer oder Name)`); }
    if (wert(r, "jobTitle")) felder.jobTitle = wert(r, "jobTitle")!.trim();
    if (wert(r, "abteilung")) felder.abteilung = wert(r, "abteilung")!.trim();
    const art = wert(r, "employmentType"); if (art) { const a = ART_MAP[norm(art)]; if (a) felder.employmentType = a; else probleme.push(`Beschäftigungsart „${art}" unbekannt`); }
    const std = zahl(wert(r, "weeklyHours")); if (std != null) { if (std > 0 && std <= 60) felder.weeklyHours = Math.round(std); else probleme.push(`Wochenstunden ${std} unplausibel`); }
    const tg = zahl(wert(r, "arbeitstage")); if (tg != null) { if (tg >= 1 && tg <= 6) felder.arbeitstageProWoche = Math.round(tg); else probleme.push(`Arbeitstage ${tg} unplausibel`); }
    const brutto = euroLesen(wert(r, "monatsbrutto"));
    if (brutto != null) {
      // Ein Jahresgehalt in der Monatsspalte fällt hier auf — 30.000 € im Monat hat niemand.
      if (brutto > 30_000) probleme.push(`Monatsbrutto ${brutto} € — Jahreswert? Erwartet wird der Monat.`);
      else if (brutto < 100) probleme.push(`Monatsbrutto ${brutto} € — Tausender fehlen?`);
      else felder.salaryGross = Math.round(brutto * 100);
    }
    const ut = zahl(wert(r, "urlaubstage")); if (ut != null) { if (ut >= 0 && ut <= 60) felder.urlaubstageProJahr = Math.round(ut); else probleme.push(`Urlaubstage ${ut} unplausibel`); }
    if (wert(r, "email")) { const e = wert(r, "email")!.trim().toLowerCase(); if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) felder.email = e; else probleme.push(`E-Mail „${e}" ungültig`); }
    if (wert(r, "phone")) felder.phone = wert(r, "phone")!.trim();
    const geb = datumLesen(wert(r, "birthDate")); if (geb) felder.birthDate = geb;
    const mabv = jaNein(wert(r, "mabv")); if (mabv != null) felder.mabvPflichtig = mabv;

    // Zuordnung zum Bestand: E-Mail schlägt Name; Name schreibweisenunabhängig.
    const vorh = (felder.email ? vorhandene.find((v) => v.email?.toLowerCase() === felder.email) : undefined)
      ?? vorhandene.find((v) => norm(v.name) === norm(name));
    const aenderungen: string[] = [];
    if (vorh) {
      const vergleich: Array<[string, unknown, unknown]> = [
        ["Stelle", vorh.jobTitle, felder.jobTitle], ["Abteilung", vorh.abteilung, felder.abteilung], ["Eintritt", vorh.startDate, felder.startDate],
        ["Austritt", vorh.endDate, felder.endDate], ["Gesellschaft", vorh.gesellschaftId, felder.gesellschaftId], ["Wochenstunden", vorh.weeklyHours, felder.weeklyHours],
        ["Monatsbrutto", vorh.salaryGross, felder.salaryGross], ["Urlaubstage", vorh.urlaubstageProJahr, felder.urlaubstageProJahr], ["E-Mail", vorh.email, felder.email],
      ];
      for (const [l, alt, neu] of vergleich) if (neu !== undefined && neu !== null && String(alt ?? "") !== String(neu)) aenderungen.push(`${l}: ${alt ?? "—"} → ${neu}`);
    }
    const urteil: ImportZeile["urteil"] = probleme.length ? "fehler" : vorh ? (aenderungen.length ? "aktualisieren" : "unveraendert") : "neu";
    return { nr: i + 2, urteil, name, felder, vorhandenId: vorh?.id ?? null, probleme, aenderungen };
  });

  // Doppelte Namen in der Datei selbst
  const gesehen = new Map<string, number>();
  for (const z of zeilen) { const k = norm(z.name); if (gesehen.has(k)) { z.probleme.push(`Name kommt doppelt vor (Zeile ${gesehen.get(k)})`); z.urteil = "fehler"; } else gesehen.set(k, z.nr); }

  return {
    zeilen, spaltenErkannt, spaltenUnbekannt,
    zusammenfassung: {
      neu: zeilen.filter((z) => z.urteil === "neu").length, aktualisieren: zeilen.filter((z) => z.urteil === "aktualisieren").length,
      unveraendert: zeilen.filter((z) => z.urteil === "unveraendert").length, fehler: zeilen.filter((z) => z.urteil === "fehler").length,
    },
  };
}

/** Übernimmt nur die Zeilen mit Urteil neu/aktualisieren. Fehlerzeilen bleiben liegen. */
export async function importUebernehmen(companyId: number, vorschau: ImportVorschau): Promise<{ angelegt: number; aktualisiert: number; uebersprungen: number }> {
  let angelegt = 0, aktualisiert = 0, uebersprungen = 0;
  await db.transaction(async (tx) => {
    for (const z of vorschau.zeilen) {
      if (z.urteil === "fehler" || z.urteil === "unveraendert") { uebersprungen++; continue; }
      const f = z.felder;
      const werte = {
        ...(f.gesellschaftId !== undefined ? { gesellschaftId: f.gesellschaftId } : {}),
        ...(f.jobTitle !== undefined ? { jobTitle: f.jobTitle } : {}),
        ...(f.abteilung !== undefined ? { abteilung: f.abteilung } : {}),
        ...(f.endDate !== undefined ? { endDate: f.endDate } : {}),
        ...(f.employmentType !== undefined ? { employmentType: f.employmentType } : {}),
        ...(f.weeklyHours !== undefined ? { weeklyHours: f.weeklyHours } : {}),
        ...(f.arbeitstageProWoche !== undefined ? { arbeitstageProWoche: f.arbeitstageProWoche } : {}),
        ...(f.salaryGross !== undefined ? { salaryGross: f.salaryGross } : {}),
        ...(f.urlaubstageProJahr !== undefined ? { urlaubstageProJahr: f.urlaubstageProJahr } : {}),
        ...(f.email !== undefined ? { email: f.email } : {}),
        ...(f.phone !== undefined ? { phone: f.phone } : {}),
        ...(f.birthDate !== undefined ? { birthDate: f.birthDate } : {}),
        ...(f.mabvPflichtig !== undefined ? { mabvPflichtig: f.mabvPflichtig } : {}),
      };
      if (z.urteil === "neu") {
        await tx.insert(hrMitarbeiter).values({
          companyId, name: z.name, startDate: f.startDate!, jobTitle: f.jobTitle ?? "",
          status: f.endDate && f.endDate < new Date().toISOString().slice(0, 10) ? "ausgeschieden" : "aktiv",
          ...werte,
        });
        angelegt++;
      } else {
        await tx.update(hrMitarbeiter).set({ ...werte, ...(f.startDate ? { startDate: f.startDate } : {}), updatedAt: new Date() })
          .where(and(eq(hrMitarbeiter.id, z.vorhandenId!), eq(hrMitarbeiter.companyId, companyId)));
        aktualisiert++;
      }
    }
  });
  return { angelegt, aktualisiert, uebersprungen };
}

