// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Personalstamm-Import (0436): CSV einfügen oder Datei wählen,
// Vorschau mit Urteil je Zeile, dann Übernahme. Nichts wird ohne Vorschau geschrieben.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import NoAccess from "@/shared/components/no-access";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Info } from "lucide-react";

interface Zeile { nr: number; urteil: "neu" | "aktualisieren" | "fehler" | "unveraendert"; name: string; felder: Record<string, unknown>; vorhandenId: number | null; probleme: string[]; aenderungen: string[] }
interface Vorschau { zeilen: Zeile[]; spaltenErkannt: Record<string, string>; spaltenUnbekannt: string[]; zusammenfassung: { neu: number; aktualisieren: number; unveraendert: number; fehler: number } }

const URTEIL: Record<Zeile["urteil"], { label: string; ton: string }> = {
  neu: { label: "Neu", ton: "bg-emerald-500/10 text-emerald-800 border-emerald-500/30" },
  aktualisieren: { label: "Aktualisieren", ton: "bg-amber-500/15 text-amber-800 border-amber-500/40" },
  unveraendert: { label: "Unverändert", ton: "bg-muted text-muted-foreground" },
  fehler: { label: "Fehler", ton: "bg-red-500/15 text-red-800 border-red-500/40" },
};
const FELD: Record<string, string> = { name: "Name", vorname: "Vorname", nachname: "Nachname", gesellschaft: "Gesellschaft", jobTitle: "Stelle", abteilung: "Abteilung", startDate: "Eintritt", endDate: "Austritt", employmentType: "Beschäftigungsart", weeklyHours: "Wochenstunden", arbeitstage: "Arbeitstage/Woche", monatsbrutto: "Monatsbrutto", urlaubstage: "Urlaubstage", email: "E-Mail", phone: "Telefon", birthDate: "Geburtsdatum", mabv: "§ 34c", personalnummer: "Personalnummer" };
const BEISPIEL = `Name;Gesellschaft;Stelle;Abteilung;Eintritt;Wochenstunden;Monatsbrutto;Urlaubstage;E-Mail;34c
Kevin Bauer;GS-0001;Vermietungsmanager;Vermietung;01.03.2019;40;4.200,00;30;k.bauer@pp-group.com;ja
Anna Richter;P&P Wohnbau GmbH;Buchhalterin;Buchhaltung;01.04.2015;40;4500;30;a.richter@pp-group.com;nein`;

export default function ImportPage() {
  const perms = usePermissions(); const qc = useQueryClient(); const { toast } = useToast();
  const canWrite = perms.role === "admin" || perms.role === "manager";
  const [csv, setCsv] = useState("");
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [ergebnis, setErgebnis] = useState<{ angelegt: number; aktualisiert: number; uebersprungen: number; fehlerzeilen: { nr: number; name: string; probleme: string[] }[] } | null>(null);
  const datei = useRef<HTMLInputElement>(null);

  const pruefen = useMutation({
    mutationFn: () => apiFetch<Vorschau>("/api/hr/import/vorschau", { method: "POST", body: JSON.stringify({ csv }) }),
    onSuccess: (v) => { setVorschau(v); setErgebnis(null); },
    onError: (e: any) => toast({ title: "Vorschau fehlgeschlagen", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const uebernehmen = useMutation({
    mutationFn: () => apiFetch<typeof ergebnis>("/api/hr/import/uebernehmen", { method: "POST", body: JSON.stringify({ csv }) }),
    onSuccess: (r) => { setErgebnis(r); setVorschau(null); qc.invalidateQueries({ queryKey: ["hr-mitarbeiter"] }); toast({ title: `${r!.angelegt} angelegt, ${r!.aktualisiert} aktualisiert ✓` }); },
    onError: (e: any) => toast({ title: "Übernahme fehlgeschlagen", description: String(e?.message ?? e), variant: "destructive" }),
  });

  if (!canWrite) return <NoAccess />;

  async function dateiLesen(f: File) {
    // Excel speichert CSV oft als Windows-1252 — ein Umlaut-Test entscheidet, ob UTF-8 gepasst hat.
    const puffer = await f.arrayBuffer();
    let text = new TextDecoder("utf-8", { fatal: false }).decode(puffer);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(puffer);
    setCsv(text); setVorschau(null); setErgebnis(null);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Upload className="h-6 w-6" /> Personalstamm importieren</h1>
        <p className="text-sm text-muted-foreground">CSV aus Lohnabrechnung oder Excel. Erst Vorschau — jede Zeile bekommt ein Urteil —, dann Übernahme. Bestehende Mitarbeiter werden über E-Mail oder Namen erkannt und aktualisiert, nicht verdoppelt.</p>
      </div>

      <Card><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={datei} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => e.target.files?.[0] && dateiLesen(e.target.files[0])} />
          <Button size="sm" variant="outline" onClick={() => datei.current?.click()}><FileSpreadsheet className="h-4 w-4 mr-1" /> CSV-Datei wählen</Button>
          <Button size="sm" variant="ghost" onClick={() => { setCsv(BEISPIEL); setVorschau(null); }}>Beispiel einfügen</Button>
          <span className="text-xs text-muted-foreground">Spaltennamen sind frei (Name, Eintritt, Monatsbrutto, Gesellschaft …); Trennzeichen wird erkannt. Gehalt in Euro.</span>
        </div>
        <Textarea rows={8} value={csv} onChange={(e) => { setCsv(e.target.value); setVorschau(null); }} placeholder="Name;Gesellschaft;Stelle;Eintritt;Wochenstunden;Monatsbrutto&#10;…" className="font-mono text-xs" />
        <div className="flex justify-end"><Button size="sm" disabled={pruefen.isPending || csv.trim().length < 10} onClick={() => pruefen.mutate()}>{pruefen.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Vorschau</Button></div>
      </CardContent></Card>

      {vorschau && (
        <>
          <Card className="border-muted"><CardContent className="p-3 text-xs space-y-1">
            <div className="flex items-center gap-1 font-medium"><Info className="h-3.5 w-3.5" /> Erkannte Spalten</div>
            <div className="flex flex-wrap gap-1">{Object.entries(vorschau.spaltenErkannt).map(([f, k]) => <Badge key={f} variant="secondary" className="font-normal">{k} → {FELD[f] ?? f}</Badge>)}</div>
            {vorschau.spaltenUnbekannt.length > 0 && <div className="text-muted-foreground">Nicht zugeordnet (werden ignoriert): {vorschau.spaltenUnbekannt.join(", ")}</div>}
          </CardContent></Card>
          <div className="grid gap-3 sm:grid-cols-4">
            <K label="Neu" wert={vorschau.zusammenfassung.neu} ton="text-emerald-700" />
            <K label="Aktualisieren" wert={vorschau.zusammenfassung.aktualisieren} ton="text-amber-700" />
            <K label="Unverändert" wert={vorschau.zusammenfassung.unveraendert} />
            <K label="Fehler (bleiben liegen)" wert={vorschau.zusammenfassung.fehler} ton={vorschau.zusammenfassung.fehler > 0 ? "text-red-700" : undefined} />
          </div>
          <div className="divide-y rounded border text-sm max-h-[28rem] overflow-y-auto">
            {vorschau.zeilen.map((z) => (
              <div key={z.nr} className="p-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground w-8">Z. {z.nr}</span><span className="font-medium">{z.name || "—"}</span><Badge variant="outline" className={cn("font-normal", URTEIL[z.urteil].ton)}>{URTEIL[z.urteil].label}</Badge></div>
                  {z.probleme.map((p, i) => <div key={i} className="text-xs text-red-700 pl-10 flex gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{p}</div>)}
                  {z.aenderungen.map((a, i) => <div key={i} className="text-xs text-amber-800 pl-10">{a}</div>)}
                  {z.urteil === "neu" && <div className="text-xs text-muted-foreground pl-10">{[z.felder.jobTitle, z.felder.gesellschaftText, z.felder.startDate, z.felder.salaryGross != null ? `${(Number(z.felder.salaryGross) / 100).toLocaleString("de-DE")} €` : null].filter(Boolean).join(" · ")}</div>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVorschau(null)}>Verwerfen</Button>
            <Button disabled={uebernehmen.isPending || (vorschau.zusammenfassung.neu + vorschau.zusammenfassung.aktualisieren === 0)} onClick={() => uebernehmen.mutate()}>{uebernehmen.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} {vorschau.zusammenfassung.neu + vorschau.zusammenfassung.aktualisieren} Zeilen übernehmen</Button>
          </div>
        </>
      )}

      {ergebnis && (
        <Card className="border-emerald-500/40 bg-emerald-500/5"><CardContent className="p-4 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> {ergebnis.angelegt} angelegt, {ergebnis.aktualisiert} aktualisiert, {ergebnis.uebersprungen} übersprungen.</div>
          {ergebnis.fehlerzeilen.length > 0 && <div className="text-xs text-muted-foreground">Nicht übernommen: {ergebnis.fehlerzeilen.map((f) => `Z. ${f.nr} ${f.name} (${f.probleme[0]})`).join("; ")}</div>}
          <div className="text-xs text-muted-foreground">Nächste Schritte: Verträge erfassen (Fristen), Benutzerkonten verknüpfen (Kalender, Verteiler), § 34c-Pflicht setzen.</div>
        </CardContent></Card>
      )}
    </div>
  );
}

function K({ label, wert, ton }: { label: string; wert: number; ton?: string }) {
  return <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={cn("text-lg font-semibold", ton)}>{wert}</div></CardContent></Card>;
}
