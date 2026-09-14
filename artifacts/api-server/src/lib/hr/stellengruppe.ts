// © 2026 P&P Group. Proprietary & Confidential.
/**
 * Stellengruppe aus der Stellenbezeichnung. Schreibweise darf nicht trennen:
 * „Verwalter", „verwalter " und „Verwalter  " sind eine Gruppe.
 *
 * Wird von Gehalt × Qualifikation UND vom Marktvergleich benutzt — beide müssen
 * denselben Schlüssel bilden, sonst findet der Vergleich die Gruppe nicht.
 */
export function stellengruppe(jobTitle: string | null | undefined): string {
  const t = (jobTitle ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return t || "ohne stellenbezeichnung";
}
