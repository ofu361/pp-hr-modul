// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Gehalts-Marktvergleich: Marktwerte aus benannten Quellen erfassen,
// eigene Bänder dagegenlegen. Keine KI-Zahlen — ein Modell kennt keine
// aktuellen regionalen Gehälter, und eine erfundene Zahl mit Quelle „KI" wäre
// schlimmer als keine.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import NoAccess from "@/shared/components/no-access";
import { TrendingUp, AlertTriangle, Plus, Loader2, Trash2, ExternalLink, Info } from "lucide-react";

interface Marktwert {
  id: number; stellengruppe: string; anzeige: string; region: string; quelle: string; jahr: number;
  jahresbruttoP25Cent: number | null; jahresbruttoMedianCent: number; jahresbruttoP75Cent: number | null; erfasstAm: string; notiz: string;
}
interface Zeile {
  stellengruppe: string; anzeige: string; mitglieder: number; mitGehalt: number;
  hausJahresbruttoMedianCent: number | null; hausBelastbar: boolean;
  markt: { medianCent: number | null; p25Cent: number | null; p75Cent: number | null; quellen: { quelle: string; region: string; jahr: number; medianCent: number }[] } | null;
  abweichungBp: number | null; lage: "unter_p25" | "unter_median" | "im_band" | "ueber_median" | "ueber_p75" | null;
}
interface Vergleich {
  stichtag: string; einheit: string;
  luecken: { gruppen: number; ohneMarktwert: number; ohneGehalt: number; marktOhneHaus: string[]; aelterAls2Jahre: number };
  zeilen: Zeile[];
}

const fmtEur = (c: number | null | undefined) => c == null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const fmtBp = (bp: number | null) => bp == null ? "—" : `${bp > 0 ? "+" : ""}${(bp / 100).toFixed(1).replace(".", ",")} %`;
const LAGE: Record<NonNullable<Zeile["lage"]>, { label: string; ton: string }> = {
  unter_p25:    { label: "Unter dem unteren Marktviertel", ton: "bg-red-500/15 text-red-800 border-red-500/40" },
  unter_median: { label: "Unter Marktmedian",             ton: "bg-amber-500/15 text-amber-800 border-amber-500/40" },
  im_band:      { label: "Marktüblich",                   ton: "bg-emerald-500/10 text-emerald-800 border-emerald-500/30" },
  ueber_median: { label: "Über Marktmedian",              ton: "bg-sky-500/10 text-sky-800 border-sky-500/30" },
  ueber_p75:    { label: "Über dem oberen Marktviertel",  ton: "bg-sky-500/15 text-sky-900 border-sky-500/40" },
};
const QUELLEN_HILFE = [
  { name: "Entgeltatlas der Bundesagentur für Arbeit", url: "https://web.arbeitsagentur.de/entgeltatlas/", hinweis: "kostenlos, nach Beruf und Region, Median und Quartile" },
  { name: "Gehaltsreports (StepStone, Kienbaum, Robert Half)", url: "", hinweis: "jährlich, teils kostenpflichtig, Branche Immobilien" },
  { name: "Tarifverträge (z. B. Wohnungswirtschaft)", url: "", hinweis: "Entgeltgruppen mit Stufen — als Untergrenze brauchbar" },
];

export default function MarktgehaltPage() {
  const perms = usePermissions();
  const canView = perms.role === "admin" || perms.role === "manager";
  const canWrite = perms.role === "admin" || perms.role === "manager";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [reiter, setReiter] = useState<"vergleich" | "werte">("vergleich");
  const [neu, setNeu] = useState(false);
  const [vorbelegt, setVorbelegt] = useState("");

  const { data, isLoading } = useQuery<Vergleich>({ queryKey: ["hr-marktvergleich"], queryFn: () => apiFetch("/api/hr/auswertung/marktvergleich"), staleTime: 30_000, enabled: canView });
  const { data: werte = [] } = useQuery<Marktwert[]>({ queryKey: ["hr-marktgehaelter"], queryFn: () => apiFetch("/api/hr/marktgehaelter"), staleTime: 30_000, enabled: canView });
  const invalidiere = () => { qc.invalidateQueries({ queryKey: ["hr-marktvergleich"] }); qc.invalidateQueries({ queryKey: ["hr-marktgehaelter"] }); };

  const anlegen = useMutation({
    mutationFn: (b: Record<string, unknown>) => apiFetch("/api/hr/marktgehaelter", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { invalidiere(); setNeu(false); toast({ title: "Marktwert erfasst ✓" }); },
    onError: (e: any) => toast({ title: "Nicht erfasst", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const loeschen = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/marktgehaelter/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidiere(); toast({ title: "Gelöscht" }); },
  });

  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><TrendingUp className="h-6 w-6" /> Gehalts-Marktvergleich</h1>
          <p className="text-sm text-muted-foreground">Eigene Gehaltsbänder gegen erfasste Marktwerte — <strong>Jahresbrutto Vollzeit</strong>, Haus = Monatsbrutto × 12.</p>
        </div>
        {canWrite && !neu && <Button size="sm" onClick={() => { setVorbelegt(""); setNeu(true); }}><Plus className="h-4 w-4 mr-1" /> Marktwert erfassen</Button>}
      </div>

      {neu && <MarktwertFormular vorbelegt={vorbelegt} onAbbrechen={() => setNeu(false)} onSpeichern={(b) => anlegen.mutate(b)} laeuft={anlegen.isPending} />}

      {data && (data.luecken.ohneMarktwert > 0 || data.luecken.marktOhneHaus.length > 0 || data.luecken.aelterAls2Jahre > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {data.luecken.ohneMarktwert > 0 && <p><strong>{data.luecken.ohneMarktwert}</strong> von {data.luecken.gruppen} Stellengruppen ohne Marktwert — für sie gibt es keinen Vergleich.</p>}
            {data.luecken.marktOhneHaus.length > 0 && <p>Marktwerte ohne passende Hausgruppe (Schreibweise prüfen): <em>{data.luecken.marktOhneHaus.join(", ")}</em></p>}
            {data.luecken.aelterAls2Jahre > 0 && <p><strong>{data.luecken.aelterAls2Jahre}</strong> Marktwert(e) älter als zwei Jahre — der Markt ist seitdem weitergezogen.</p>}
          </div>
        </CardContent></Card>
      )}

      <div className="flex gap-1 border-b">
        {([["vergleich", "Vergleich"], ["werte", `Marktwerte (${werte.length})`]] as const).map(([k, l]) => (
          <Button key={k} variant="ghost" size="sm" className={cn("rounded-none border-b-2", reiter === k ? "border-primary" : "border-transparent text-muted-foreground")} onClick={() => setReiter(k)}>{l}</Button>
        ))}
      </div>

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}

      {reiter === "vergleich" && data && (
        <div className="space-y-2">
          {data.zeilen.map((z) => (
            <Card key={z.stellengruppe} className={z.lage ? LAGE[z.lage].ton.split(" ").filter((c) => c.startsWith("border")).join(" ") : "border-dashed"}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {z.anzeige}
                    <span className="text-xs text-muted-foreground font-normal">{z.mitglieder} MA{z.mitGehalt !== z.mitglieder ? ` · ${z.mitGehalt} mit Gehalt` : ""}</span>
                    {z.lage && <Badge variant="outline" className={cn("font-normal", LAGE[z.lage].ton)}>{LAGE[z.lage].label}</Badge>}
                    {!z.hausBelastbar && z.hausJahresbruttoMedianCent != null && <Badge variant="secondary" className="font-normal">Haus: unter 3 Gehälter</Badge>}
                  </div>
                  {z.markt && <div className="text-xs text-muted-foreground mt-0.5">Quellen: {z.markt.quellen.map((q) => `${q.quelle} ${q.jahr} (${q.region})`).join(" · ")}</div>}
                  {!z.markt && canWrite && <Button size="sm" variant="link" className="h-6 px-0 text-xs" onClick={() => { setVorbelegt(z.anzeige); setNeu(true); }}>Marktwert für „{z.anzeige}" erfassen</Button>}
                </div>
                <div className="grid grid-cols-3 gap-6 text-sm text-right">
                  <Feld label="Haus (Median)" wert={fmtEur(z.hausJahresbruttoMedianCent)} />
                  <Feld label="Markt (Median)" wert={fmtEur(z.markt?.medianCent)} zusatz={z.markt?.p25Cent != null ? `${fmtEur(z.markt.p25Cent)} – ${fmtEur(z.markt.p75Cent)}` : undefined} />
                  <Feld label="Abweichung" wert={fmtBp(z.abweichungBp)} ton={z.abweichungBp == null ? undefined : z.abweichungBp < -500 ? "text-amber-700" : z.abweichungBp > 500 ? "text-sky-700" : "text-emerald-700"} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reiter === "werte" && (
        <div className="space-y-3">
          <Card className="border-muted"><CardContent className="p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1 font-medium"><Info className="h-3.5 w-3.5" /> Woher Marktwerte kommen</div>
            {QUELLEN_HILFE.map((q) => (
              <div key={q.name} className="flex items-center gap-1">
                {q.url ? <a className="underline inline-flex items-center gap-1" href={q.url} target="_blank" rel="noreferrer">{q.name} <ExternalLink className="h-3 w-3" /></a> : <span>{q.name}</span>}
                <span>— {q.hinweis}</span>
              </div>
            ))}
          </CardContent></Card>
          {werte.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Noch keine Marktwerte erfasst.</CardContent></Card>}
          {werte.map((w) => (
            <Card key={w.id}><CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium">{w.anzeige} <span className="text-muted-foreground font-normal">· {w.region} · {w.jahr}</span></div>
                <div className="text-xs text-muted-foreground">{w.quelle}{w.notiz ? ` — ${w.notiz}` : ""}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right"><div className="font-medium">{fmtEur(w.jahresbruttoMedianCent)}</div><div className="text-xs text-muted-foreground">{w.jahresbruttoP25Cent != null ? `${fmtEur(w.jahresbruttoP25Cent)} – ${fmtEur(w.jahresbruttoP75Cent)}` : "Median"}</div></div>
                {canWrite && <Button size="sm" variant="ghost" className="h-7" onClick={() => { if (confirm("Marktwert löschen?")) loeschen.mutate(w.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MarktwertFormular({ vorbelegt, onAbbrechen, onSpeichern, laeuft }: { vorbelegt: string; onAbbrechen: () => void; onSpeichern: (b: Record<string, unknown>) => void; laeuft: boolean }) {
  const [f, setF] = useState({ stellengruppe: vorbelegt, region: "Deutschland", quelle: "", jahr: String(new Date().getFullYear()), p25: "", median: "", p75: "", notiz: "" });
  const s = (k: keyof typeof f, v: string) => setF((a) => ({ ...a, [k]: v }));
  const euroZuCent = (v: string) => v.trim() === "" ? null : Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100);
  return (
    <Card className="border-primary/40"><CardContent className="p-4 space-y-3">
      <div className="text-xs text-muted-foreground">Beträge als <strong>Jahresbrutto Vollzeit in Euro</strong> (z. B. 48000). Monatswerte werden abgewiesen.</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <F label="Stellengruppe"><Input value={f.stellengruppe} onChange={(e) => s("stellengruppe", e.target.value)} placeholder="Verwalter" /></F>
        <F label="Region"><Input value={f.region} onChange={(e) => s("region", e.target.value)} /></F>
        <F label="Quelle"><Input value={f.quelle} onChange={(e) => s("quelle", e.target.value)} placeholder="Entgeltatlas BA" /></F>
        <F label="Jahr"><Input inputMode="numeric" value={f.jahr} onChange={(e) => s("jahr", e.target.value)} /></F>
        <F label="Unteres Viertel (P25) €"><Input inputMode="decimal" value={f.p25} onChange={(e) => s("p25", e.target.value)} /></F>
        <F label="Median € (Pflicht)"><Input inputMode="decimal" value={f.median} onChange={(e) => s("median", e.target.value)} /></F>
        <F label="Oberes Viertel (P75) €"><Input inputMode="decimal" value={f.p75} onChange={(e) => s("p75", e.target.value)} /></F>
        <F label="Notiz"><Input value={f.notiz} onChange={(e) => s("notiz", e.target.value)} /></F>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onAbbrechen}>Abbrechen</Button>
        <Button disabled={laeuft || !f.stellengruppe || !f.quelle || !f.median} onClick={() => onSpeichern({
          stellengruppe: f.stellengruppe, region: f.region, quelle: f.quelle, jahr: Number(f.jahr),
          jahresbruttoP25Cent: euroZuCent(f.p25), jahresbruttoMedianCent: euroZuCent(f.median), jahresbruttoP75Cent: euroZuCent(f.p75), notiz: f.notiz,
        })}>{laeuft && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Erfassen</Button>
      </div>
    </CardContent></Card>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>; }
function Feld({ label, wert, zusatz, ton }: { label: string; wert: string; zusatz?: string; ton?: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className={cn("font-medium", ton)}>{wert}</div>{zusatz && <div className="text-xs text-muted-foreground">{zusatz}</div>}</div>;
}
