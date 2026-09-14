// © 2026 P&P Group. Proprietary & Confidential.
// HR-Dokumentgenerator (0436) — Arbeitsvertrag, Nachtrag, Zeugnis als PDF.
//
// Die Umkehrung der KI-Auslesung: aus den erfassten Vertragsfeldern entsteht
// das Dokument, nicht umgekehrt. Bewusst ENTWURF — jede Seite trägt einen
// Entwurfsvermerk, und der Vertrag enthält nur die Klauseln, die aus den
// Feldern folgen. Was ein Anwalt hineinschreibt (Verschwiegenheit,
// Nebentätigkeit im Detail, Ausschlussfristen), steht als Platzhalter, nicht
// als erfundener Rechtstext.
//
// Das Zeugnis kommt in zwei Schritten: der TEXT wird von der KI aus den
// Beurteilungen entworfen (Zeugnissprache ist eine eigene Kunst, und die
// verschlüsselten Formulierungen sind bekannt), der Mensch redigiert ihn in
// der Maske, das PDF entsteht aus dem redigierten Text. Kein Zeugnis verlässt
// das Haus ungelesen.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { winAnsi, wrap } from "../pdf-text.js";
import { callClaude } from "../ai-providers.js";

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const CONTENT_W = A4.w - 2 * MARGIN;

const ART: Record<string, string> = {
  unbefristet: "unbefristet", befristet_sachgrund: "befristet (mit Sachgrund)", befristet_sachgrundlos: "befristet (ohne Sachgrund, § 14 Abs. 2 TzBfG)",
  ausbildung: "Ausbildungsverhältnis", sonstiges: "",
};
const TERMIN: Record<string, string> = { monatsende: "zum Monatsende", quartalsende: "zum Quartalsende", fuenfzehnter_oder_monatsende: "zum 15. oder zum Ende eines Kalendermonats", jederzeit: "ohne festen Termin" };

const fmtDatum = (s: string | null | undefined) => s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const fmtEur = (c: number | null | undefined) => c == null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);

export interface Arbeitgeber { name: string; strasse?: string | null; ort?: string | null; vertretenDurch?: string | null }
export interface VertragFuerDokument {
  vertragsart: string; beginn: string; ende: string | null; probezeitBis: string | null;
  kuendigungsfristWert: number | null; kuendigungsfristEinheit: string | null; kuendigungstermin: string | null;
  wochenstunden: string | null; gehaltMonatCent: number | null; urlaubstage: number | null;
  wettbewerbsverbot: boolean; nebentaetigkeitErlaubt: boolean | null; sachgrund: string | null;
}
export interface MitarbeiterFuerDokument { name: string; jobTitle: string; address?: string | null; city?: string | null; zipCode?: string | null; birthDate?: string | null; startDate: string; endDate?: string | null; abteilung?: string | null }

// ── Schreibwerkzeug ─────────────────────────────────────────────────────────

class Schreiber {
  private pdf!: PDFDocument; private page!: PDFPage; private font!: PDFFont; private bold!: PDFFont; private y = 0;
  private constructor() {}
  static async neu(): Promise<Schreiber> {
    const s = new Schreiber();
    s.pdf = await PDFDocument.create();
    s.font = await s.pdf.embedFont(StandardFonts.Helvetica);
    s.bold = await s.pdf.embedFont(StandardFonts.HelveticaBold);
    s.seite();
    return s;
  }
  private seite() { this.page = this.pdf.addPage([A4.w, A4.h]); this.y = A4.h - MARGIN; this.entwurfsvermerk(); }
  private entwurfsvermerk() {
    this.page.drawText(winAnsi("ENTWURF — vor Unterschrift rechtlich prüfen"), { x: MARGIN, y: A4.h - 30, size: 8, font: this.bold, color: rgb(0.7, 0.2, 0.2) });
  }
  private brauche(h: number) { if (this.y - h < MARGIN + 30) this.seite(); }
  zeile(text: string, o: { size?: number; bold?: boolean; grau?: boolean; einzug?: number; abstand?: number } = {}) {
    const size = o.size ?? 10.5; const f = o.bold ? this.bold : this.font;
    for (const l of wrap(text, f, size, CONTENT_W - (o.einzug ?? 0))) {
      this.brauche(size + 5);
      this.page.drawText(winAnsi(l), { x: MARGIN + (o.einzug ?? 0), y: this.y, size, font: f, color: o.grau ? rgb(0.45, 0.45, 0.5) : rgb(0.12, 0.12, 0.14) });
      this.y -= size + 4.5;
    }
    this.y -= o.abstand ?? 4;
  }
  ueberschrift(t: string) { this.y -= 6; this.zeile(t, { size: 12, bold: true, abstand: 6 }); }
  titel(t: string) { this.zeile(t, { size: 17, bold: true, abstand: 14 }); }
  leer(h = 10) { this.y -= h; }
  paragraph(nr: number, titel: string, absaetze: string[]) {
    this.ueberschrift(`§ ${nr} ${titel}`);
    absaetze.forEach((a, i) => this.zeile(absaetze.length > 1 ? `(${i + 1}) ${a}` : a, { abstand: 5 }));
  }
  unterschriften(links: string, rechts: string) {
    this.brauche(80); this.y -= 40;
    const y = this.y;
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 200, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    this.page.drawLine({ start: { x: A4.w - MARGIN - 200, y }, end: { x: A4.w - MARGIN, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
    this.page.drawText(winAnsi(links), { x: MARGIN, y: y - 12, size: 9, font: this.font, color: rgb(0.4, 0.4, 0.45) });
    this.page.drawText(winAnsi(rechts), { x: A4.w - MARGIN - 200, y: y - 12, size: 9, font: this.font, color: rgb(0.4, 0.4, 0.45) });
    this.y -= 30;
  }
  async fertig(): Promise<Uint8Array> { return this.pdf.save(); }
}

// ── Arbeitsvertrag / Nachtrag ───────────────────────────────────────────────

export async function arbeitsvertragPdf(ag: Arbeitgeber, m: MitarbeiterFuerDokument, v: VertragFuerDokument, art: "vertrag" | "nachtrag", ort: string): Promise<Uint8Array> {
  const s = await Schreiber.neu();
  const stunden = v.wochenstunden ? Number(v.wochenstunden) : null;
  s.titel(art === "vertrag" ? "Arbeitsvertrag" : "Nachtrag zum Arbeitsvertrag");
  s.zeile("zwischen", { grau: true });
  s.zeile(`${ag.name}${ag.strasse ? `, ${ag.strasse}` : ""}${ag.ort ? `, ${ag.ort}` : ""}${ag.vertretenDurch ? `, vertreten durch ${ag.vertretenDurch}` : ""}`, { bold: true });
  s.zeile("— nachfolgend „Arbeitgeber“ —", { grau: true, abstand: 8 });
  s.zeile("und", { grau: true });
  s.zeile(`${m.name}${m.birthDate ? `, geboren am ${fmtDatum(m.birthDate)}` : ""}${m.address ? `, ${m.address}` : ""}${m.zipCode || m.city ? `, ${[m.zipCode, m.city].filter(Boolean).join(" ")}` : ""}`, { bold: true });
  s.zeile("— nachfolgend „Arbeitnehmer“ —", { grau: true, abstand: 14 });

  if (art === "nachtrag") {
    s.zeile(`Der Arbeitsvertrag vom ${fmtDatum(m.startDate)} wird mit Wirkung zum ${fmtDatum(v.beginn)} wie folgt geändert. Alle übrigen Bestimmungen bleiben unberührt.`, { abstand: 10 });
  }

  let n = 1;
  const befristet = v.vertragsart.startsWith("befristet");
  s.paragraph(n++, "Beginn und Dauer", [
    `Das Arbeitsverhältnis beginnt am ${fmtDatum(v.beginn)}${befristet ? ` und endet am ${fmtDatum(v.ende)}, ohne dass es einer Kündigung bedarf` : " und wird auf unbestimmte Zeit geschlossen"}.`,
    ...(befristet ? [v.vertragsart === "befristet_sachgrundlos" ? "Die Befristung erfolgt ohne Sachgrund gemäß § 14 Abs. 2 TzBfG." : `Die Befristung erfolgt aus folgendem Sachgrund: ${v.sachgrund ?? "[Sachgrund eintragen]"}.`] : []),
    ...(v.probezeitBis ? [`Die ersten Monate bis zum ${fmtDatum(v.probezeitBis)} gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis beidseitig mit einer Frist von zwei Wochen gekündigt werden (§ 622 Abs. 3 BGB).`] : []),
  ]);
  s.paragraph(n++, "Tätigkeit", [
    `Der Arbeitnehmer wird als ${m.jobTitle || "[Stellenbezeichnung]"}${m.abteilung ? ` im Bereich ${m.abteilung}` : ""} eingestellt.`,
    "Der Arbeitgeber behält sich vor, dem Arbeitnehmer eine andere gleichwertige Tätigkeit zuzuweisen, die seinen Kenntnissen und Fähigkeiten entspricht.",
  ]);
  s.paragraph(n++, "Arbeitszeit", [
    stunden != null ? `Die regelmäßige wöchentliche Arbeitszeit beträgt ${String(stunden).replace(".", ",")} Stunden.` : "Die regelmäßige wöchentliche Arbeitszeit beträgt [Stunden] Stunden.",
    "Beginn und Ende der täglichen Arbeitszeit sowie die Pausen richten sich nach den betrieblichen Regelungen.",
  ]);
  s.paragraph(n++, "Vergütung", [
    v.gehaltMonatCent != null ? `Der Arbeitnehmer erhält ein monatliches Bruttogehalt von ${fmtEur(v.gehaltMonatCent)}, zahlbar jeweils am Ende des Monats.` : "Der Arbeitnehmer erhält ein monatliches Bruttogehalt von [Betrag] EUR.",
    "Die Abtretung oder Verpfändung von Vergütungsansprüchen ist ausgeschlossen.",
  ]);
  s.paragraph(n++, "Urlaub", [
    `Der Arbeitnehmer hat Anspruch auf ${v.urlaubstage ?? "[Tage]"} Arbeitstage Erholungsurlaub im Kalenderjahr${stunden != null && stunden < 40 ? " (bezogen auf eine Fünftagewoche; bei weniger Arbeitstagen anteilig)" : ""}. Der gesetzliche Mindesturlaub bleibt unberührt.`,
    "Die zeitliche Lage des Urlaubs ist mit dem Arbeitgeber abzustimmen.",
  ]);
  const frist = v.kuendigungsfristWert && v.kuendigungsfristEinheit
    ? `${v.kuendigungsfristWert} ${v.kuendigungsfristEinheit === "wochen" ? (v.kuendigungsfristWert === 1 ? "Woche" : "Wochen") : (v.kuendigungsfristWert === 1 ? "Monat" : "Monaten")} ${TERMIN[v.kuendigungstermin ?? ""] ?? ""}`.trim()
    : null;
  s.paragraph(n++, "Kündigung", [
    frist ? `Nach Ablauf der Probezeit kann das Arbeitsverhältnis beidseitig mit einer Frist von ${frist} gekündigt werden. Verlängert sich die gesetzliche Kündigungsfrist für den Arbeitgeber (§ 622 Abs. 2 BGB), gilt die längere Frist für beide Seiten.` : "Nach Ablauf der Probezeit gelten die gesetzlichen Kündigungsfristen (§ 622 BGB).",
    "Die Kündigung bedarf der Schriftform (§ 623 BGB).",
  ]);
  s.paragraph(n++, "Nebentätigkeit", [
    v.nebentaetigkeitErlaubt === false ? "Jede entgeltliche Nebentätigkeit bedarf der vorherigen schriftlichen Zustimmung des Arbeitgebers. Die Zustimmung wird erteilt, wenn betriebliche Interessen nicht beeinträchtigt werden."
      : v.nebentaetigkeitErlaubt === true ? "Nebentätigkeiten sind dem Arbeitgeber anzuzeigen; sie dürfen die Arbeitsleistung nicht beeinträchtigen und nicht in Wettbewerb zum Arbeitgeber stehen."
      : "[Regelung zur Nebentätigkeit eintragen]",
  ]);
  if (v.wettbewerbsverbot) s.paragraph(n++, "Nachvertragliches Wettbewerbsverbot", ["[Vom Anwalt zu formulieren: Dauer, Umfang, Karenzentschädigung nach §§ 74 ff. HGB — ohne Entschädigung ist das Verbot unverbindlich.]"]);
  s.paragraph(n++, "Verschwiegenheit, Datenschutz", ["Der Arbeitnehmer ist verpflichtet, über alle Geschäfts- und Betriebsgeheimnisse sowie personenbezogene Daten von Mietern, Eigentümern und Geschäftspartnern Stillschweigen zu bewahren — auch nach Beendigung des Arbeitsverhältnisses. [Datenschutzverpflichtung nach Art. 29/32 DSGVO als Anlage.]"]);
  s.paragraph(n++, "Schlussbestimmungen", ["Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.", "[Ausschlussfristen, Verweis auf Betriebsvereinbarungen — vom Anwalt zu prüfen.]"]);
  s.leer(8);
  s.zeile(`${ort}, den ____________`, { grau: true });
  s.unterschriften(ag.name, m.name);
  return s.fertig();
}

// ── Zeugnis ─────────────────────────────────────────────────────────────────

const ZEUGNIS_SYSTEM = `Du entwirfst ein qualifiziertes Arbeitszeugnis nach deutschem Recht (§ 109 GewO). Regeln:
- Wohlwollend UND wahr. Zeugnissprache: Leistungsbewertung über die bekannten Stufen ("stets zu unserer vollsten Zufriedenheit" = sehr gut, "stets zu unserer vollen Zufriedenheit" = gut, "zu unserer vollen Zufriedenheit" = befriedigend). Wähle die Stufe aus der Gesamtnote der Beurteilungen (5 = sehr gut … 3 = befriedigend); unter 3 formuliere neutral-wohlwollend ohne Abwertungscodes.
- Keine verschlüsselten Negativformulierungen ("bemühte sich", "im Rahmen seiner Fähigkeiten", "war stets pünktlich"). Keine Angaben zu Krankheit, Betriebsrat, Gewerkschaft, Religion, Schwangerschaft, Elternzeit-Gründen.
- Aufbau: Einleitung (Person, Zeitraum, Position), Aufgabenbeschreibung (aus Stellenbezeichnung und Abteilung ableiten, branchenüblich für Immobilienverwaltung), Leistungsbeurteilung (Fachwissen, Arbeitsweise, Belastbarkeit, Erfolge — nur mit Beleg aus den Beurteilungen), Sozialverhalten (Vorgesetzte, Kollegen, Kunden — in dieser Reihenfolge), Beendigungsformel neutral ("auf eigenen Wunsch" nur wenn im Text angegeben, sonst "endet zum"), Schlussformel mit Dank und Zukunftswünschen passend zur Note.
- Dritte Person, Vergangenheit, Name mit "Herr"/"Frau" NICHT raten — nutze den vollen Namen ohne Anrede, wenn das Geschlecht nicht angegeben ist.
- Antworte NUR mit dem Zeugnistext, Absätze durch Leerzeilen getrennt, ohne Überschrift, ohne Ort/Datum/Unterschrift.`;

export async function zeugnisEntwurf(m: MitarbeiterFuerDokument, beurteilungen: Array<{ period: string; rating: number; staerken: string | null; verbesserungen: string | null }>, ende: string | null, grund: string | null): Promise<{ text: string; note: number | null; hinweise: string[] }> {
  const hinweise: string[] = [];
  const note = beurteilungen.length ? Math.round((beurteilungen.reduce((s, b) => s + b.rating, 0) / beurteilungen.length) * 10) / 10 : null;
  if (!beurteilungen.length) hinweise.push("Keine Beurteilungen vorhanden — die Leistungsbeurteilung ist ohne Grundlage und muss von der Führungskraft geschrieben werden.");
  const eingabe = [
    `Name: ${m.name}`, `Position: ${m.jobTitle}${m.abteilung ? ` (${m.abteilung})` : ""}`,
    `Beschäftigt von ${fmtDatum(m.startDate)} bis ${ende ? fmtDatum(ende) : "[Austrittsdatum]"}`,
    grund ? `Beendigungsgrund (nur verwenden, wenn zeugnisfähig): ${grund}` : "Beendigungsgrund: nicht angegeben — neutral formulieren",
    note != null ? `Gesamtnote aus ${beurteilungen.length} Beurteilung(en): ${note} von 5` : "Keine Beurteilungen",
    ...beurteilungen.map((b) => `Beurteilung ${b.period} (${b.rating}/5): Stärken: ${b.staerken ?? "—"}; Entwicklungsfelder (NICHT ins Zeugnis, nur zur Einordnung): ${b.verbesserungen ?? "—"}`),
  ].join("\n");
  const antwort = await callClaude({ model: process.env.HR_AUSLESE_MODELL ?? "claude-sonnet-4-6", max_tokens: 2000, system: ZEUGNIS_SYSTEM, messages: [{ role: "user", content: eingabe }] });
  let text = antwort.text.trim();
  // Art.-9-Schutz auch hier: das Modell soll nicht, aber „soll" ist keine Prüfung.
  if (/krank|schwanger|elternzeit|betriebsrat|gewerkschaft|religion|behinder/i.test(text)) hinweise.push("Der Entwurf enthält ein Wort aus dem Sperrbereich (Krankheit, Schwangerschaft, Betriebsrat …) — vor Freigabe streichen.");
  if (beurteilungen.length && note != null && note < 3) hinweise.push(`Gesamtnote ${note}: Zeugnis muss trotzdem wohlwollend sein (BAG); prüfen, dass keine Abwertungscodes enthalten sind.`);
  return { text, note, hinweise };
}

export async function zeugnisPdf(ag: Arbeitgeber, m: MitarbeiterFuerDokument, text: string, ort: string, datum: string): Promise<Uint8Array> {
  const s = await Schreiber.neu();
  s.zeile(ag.name, { bold: true, size: 12 });
  if (ag.strasse || ag.ort) s.zeile([ag.strasse, ag.ort].filter(Boolean).join(", "), { grau: true, size: 9, abstand: 20 });
  s.titel("Arbeitszeugnis");
  for (const absatz of text.split(/\n\s*\n/).map((a) => a.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean)) s.zeile(absatz, { abstand: 9 });
  s.leer(10);
  s.zeile(`${ort}, ${fmtDatum(datum)}`, { grau: true });
  s.unterschriften(ag.vertretenDurch ? `${ag.name}, ${ag.vertretenDurch}` : ag.name, "");
  return s.fertig();
}

// ── Bewerbung aus Mailtext ──────────────────────────────────────────────────

const BEWERBUNG_SYSTEM = `Du liest den Text einer Bewerbungs-E-Mail und antwortest NUR mit JSON:
{ "name": "<Vor- und Nachname oder null>", "email": "<E-Mail oder null>", "phone": "<Telefon oder null>",
  "stelle": "<Stellenbezeichnung, auf die sich die Person bewirbt, oder null>",
  "kurzprofil": "<3–5 Sätze: Ausbildung, Berufserfahrung, Verfügbarkeit, Gehaltswunsch — nur was im Text steht>",
  "passung": ["<Stichworte, die zur Immobilienverwaltung/Vermietung passen>"],
  "istBewerbung": true|false }
Erfinde nichts. Fehlt etwas, null. Keine Angaben zu Alter, Herkunft, Familienstand, Religion, Gesundheit — auch wenn sie im Text stehen.`;

export async function bewerbungAusText(text: string, stellen: Array<{ id: number; title: string }>): Promise<{ name: string | null; email: string | null; phone: string | null; stelleText: string | null; stelleId: number | null; kurzprofil: string; passung: string[]; istBewerbung: boolean; hinweise: string[] }> {
  const antwort = await callClaude({ model: process.env.HR_AUSLESE_MODELL ?? "claude-sonnet-4-6", max_tokens: 1200, system: BEWERBUNG_SYSTEM, messages: [{ role: "user", content: `Offene Stellen: ${stellen.map((s) => s.title).join(", ") || "keine"}\n\nMAIL:\n${text.slice(0, 20_000)}` }] });
  const roh = antwort.text.trim(); const a = roh.indexOf("{"), z = roh.lastIndexOf("}");
  if (a < 0 || z < 0) throw new Error("KI-Antwort enthielt kein JSON");
  const e = JSON.parse(roh.slice(a, z + 1)) as Record<string, unknown>;
  const hinweise: string[] = [];
  const email = typeof e.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email) ? e.email.toLowerCase() : null;
  // Belegprüfung: E-Mail und Telefon müssen im Text stehen.
  if (email && !text.toLowerCase().includes(email)) hinweise.push("E-Mail steht so nicht im Text — prüfen.");
  const phone = typeof e.phone === "string" ? e.phone.trim() : null;
  if (phone && !text.replace(/[\s\-/()]/g, "").includes(phone.replace(/[\s\-/()]/g, ""))) hinweise.push("Telefonnummer steht so nicht im Text — prüfen.");
  const stelleText = typeof e.stelle === "string" ? e.stelle : null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]/g, "");
  const stelleId = stelleText ? stellen.find((s) => norm(s.title) === norm(stelleText))?.id ?? stellen.find((s) => norm(stelleText).includes(norm(s.title)) || norm(s.title).includes(norm(stelleText)))?.id ?? null : null;
  if (stelleText && !stelleId) hinweise.push(`Stelle „${stelleText}" passt zu keiner offenen Stelle — zuordnen oder Stelle anlegen.`);
  return {
    name: typeof e.name === "string" ? e.name.trim() : null, email, phone, stelleText, stelleId,
    kurzprofil: typeof e.kurzprofil === "string" ? e.kurzprofil.slice(0, 1500) : "",
    passung: Array.isArray(e.passung) ? (e.passung as unknown[]).map(String).slice(0, 8) : [],
    istBewerbung: e.istBewerbung !== false, hinweise,
  };
}
