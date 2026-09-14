// © 2026 P&P Group. Proprietary & Confidential.
// KI-Auslesung eines Arbeitsvertrags — VORSCHLAG, keine Übernahme.
//
// Das Modell liefert je Feld einen Wert UND ein wörtliches Zitat aus dem
// Vertragstext. Jedes Zitat wird gegen den Text geprüft: steht es nicht drin,
// gilt der Wert als „nicht belegt" und wird in der Maske so gezeigt. Das ist
// der Schutz gegen die eine Fehlerart, die bei Vertragsdaten nicht passieren
// darf — eine erfundene Kündigungsfrist, die plausibel aussieht.
//
// Geschrieben wird hier NICHTS. Die Übernahme in hr_arbeitsvertraege ist ein
// eigener Klick des Menschen (PATCH), Feld für Feld.
import { callClaude } from "../ai-providers.js";

export const AUSLESE_FELDER = [
  "vertragsart", "beginn", "ende", "probezeitBis",
  "kuendigungsfristWert", "kuendigungsfristEinheit", "kuendigungstermin",
  "wochenstunden", "gehaltMonatCent", "urlaubstage",
  "wettbewerbsverbot", "nebentaetigkeitErlaubt", "sachgrund",
] as const;
export type AusleseFeld = (typeof AUSLESE_FELDER)[number];

export interface AusleseTreffer {
  feld: AusleseFeld;
  wert: string | number | boolean | null;
  zitat: string | null;
  /** Zitat im Text gefunden — nur dann ist der Wert belegt. */
  belegt: boolean;
  /** Freitext des Modells, warum es so gelesen hat (z. B. „Frist ‚6 Wochen zum Quartalsende‘ → 6 / wochen / quartalsende"). */
  begruendung?: string;
}

export interface AusleseErgebnis {
  treffer: AusleseTreffer[];
  hinweise: string[];
  modell: string;
  textLaenge: number;
  gekuerzt: boolean;
}

const MAX_ZEICHEN = 60_000;

const SYSTEM = `Du liest deutsche Arbeitsverträge aus und antwortest AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Erklärtext davor oder danach.

Ziel-Felder (Schlüssel exakt so):
- vertragsart: "unbefristet" | "befristet_sachgrund" | "befristet_sachgrundlos" | "ausbildung" | "sonstiges"
- beginn: "YYYY-MM-DD"
- ende: "YYYY-MM-DD" oder null (nur bei Befristung)
- probezeitBis: "YYYY-MM-DD" oder null — aus Beginn + Probezeitdauer rechnen
- kuendigungsfristWert: Zahl oder null
- kuendigungsfristEinheit: "wochen" | "monate" | null
- kuendigungstermin: "monatsende" | "quartalsende" | "fuenfzehnter_oder_monatsende" | "jederzeit" | null
- wochenstunden: Zahl oder null
- gehaltMonatCent: Monatsbrutto in CENT als ganze Zahl (4.200,00 € → 420000) oder null. Bei Jahresgehalt durch 12 teilen und das sagen.
- urlaubstage: Zahl oder null
- wettbewerbsverbot: true | false | null (true nur bei NACHvertraglichem Wettbewerbsverbot)
- nebentaetigkeitErlaubt: true | false | null (false, wenn genehmigungspflichtig oder verboten)
- sachgrund: Text oder null (nur bei Befristung mit Sachgrund)

Antwortformat:
{
  "treffer": [
    { "feld": "<Schlüssel>", "wert": <Wert>, "zitat": "<wörtliche Textstelle aus dem Vertrag, max. 200 Zeichen>", "begruendung": "<kurz>" }
  ],
  "hinweise": ["<Auffälligkeiten: unklare Klauseln, Widersprüche, fehlende Angaben>"]
}

Regeln:
- Ein Treffer je Feld. Fehlt ein Feld im Vertrag, setze wert null und zitat null.
- Das Zitat MUSS wörtlich im Vertragstext stehen. Kein Zitat erfinden, kein Zitat umformulieren.
- Rechne nichts, was nicht aus dem Text folgt. Wenn nur „Probezeit sechs Monate" steht und der Beginn bekannt ist, darfst du probezeitBis rechnen und das in der Begründung sagen.
- Ist eine Kündigungsfrist als „gesetzlich" bezeichnet, setze kuendigungsfristWert null und schreibe das in die Hinweise.`;

function normalisiere(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[„“"‚‘'»«]/g, "").trim();
}

export async function vertragAuslesen(text: string): Promise<AusleseErgebnis> {
  const gekuerzt = text.length > MAX_ZEICHEN;
  const eingabe = gekuerzt ? text.slice(0, MAX_ZEICHEN) : text;
  const modell = process.env.HR_AUSLESE_MODELL ?? "claude-sonnet-4-6";

  const antwort = await callClaude({
    model: modell,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: `VERTRAGSTEXT:\n\n${eingabe}` }],
  });

  // Das Modell soll reines JSON liefern; falls doch Text drumherum steht, das
  // erste vollständige Objekt herausschneiden.
  const roh = antwort.text.trim();
  const start = roh.indexOf("{"), endeIdx = roh.lastIndexOf("}");
  if (start < 0 || endeIdx < 0) throw new Error("KI-Antwort enthielt kein JSON");
  let geparst: { treffer?: unknown; hinweise?: unknown };
  try { geparst = JSON.parse(roh.slice(start, endeIdx + 1)); }
  catch { throw new Error("KI-Antwort war kein gültiges JSON"); }

  const textNorm = normalisiere(eingabe);
  const treffer: AusleseTreffer[] = [];
  const erlaubt = new Set<string>(AUSLESE_FELDER);
  for (const t of Array.isArray(geparst.treffer) ? geparst.treffer : []) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const feld = String(o.feld ?? "");
    if (!erlaubt.has(feld)) continue;
    const zitat = typeof o.zitat === "string" && o.zitat.trim() ? o.zitat.trim().slice(0, 300) : null;
    const wert = o.wert === undefined ? null : (o.wert as AusleseTreffer["wert"]);
    // Belegt ist ein Wert nur, wenn sein Zitat wirklich im Text steht. Ein
    // Wert ohne Zitat ist kein Treffer, sondern eine Behauptung.
    const belegt = wert != null && zitat != null && textNorm.includes(normalisiere(zitat));
    treffer.push({
      feld: feld as AusleseFeld, wert, zitat, belegt,
      begruendung: typeof o.begruendung === "string" ? o.begruendung.slice(0, 300) : undefined,
    });
  }

  const hinweise = (Array.isArray(geparst.hinweise) ? geparst.hinweise : [])
    .filter((h): h is string => typeof h === "string").map((h) => h.slice(0, 500));
  if (gekuerzt) hinweise.unshift(`Der Vertragstext war länger als ${MAX_ZEICHEN.toLocaleString("de-DE")} Zeichen und wurde für die Auslesung gekürzt.`);
  const unbelegt = treffer.filter((t) => t.wert != null && !t.belegt).length;
  if (unbelegt > 0) hinweise.unshift(`${unbelegt} Wert(e) ohne belegbare Textstelle — vor Übernahme im Original prüfen.`);

  return { treffer, hinweise, modell, textLaenge: text.length, gekuerzt };
}
