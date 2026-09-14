// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Arbeitsverträge: Fristen-Arbeitsliste, Verträge je Mitarbeiter,
// Kündigungsrechner, KI-Auslesung (Vorschlag mit Fundstelle, Übernahme je Feld).
import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import NoAccess from "@/shared/components/no-access";
import {
  FileSignature, AlertTriangle, CalendarClock, Scale, Sparkles, Loader2, Check, ChevronLeft, Plus, Calculator, FileDown,
} from "lucide-react";

// ── Typen ────────────────────────────────────────────────────────────────────

interface Frist {
  vertragId: number; mitarbeiterId: number; art: "probezeit" | "befristung" | "tzbfg";
  stichtag: string; entscheidenBis: string; tageBisEntscheidung: number;
  dringlichkeit: "ueberfaellig" | "diese_woche" | "diesen_monat" | "quartal" | "spaeter";
  hinweis: string; name: string; jobTitle: string;
}
interface Kette {
  vertraege: number; verlaengerungen: number; gesamtMonate: number;
  restMonate: number; restVerlaengerungen: number;
  lage: "frei" | "knapp" | "erreicht" | "ueberschritten" | "nicht_anwendbar";
}
interface FristenAntwort {
  stichtag: string; fristen: Frist[];
  tzbfg: { mitarbeiterId: number; name: string; kette: Kette }[];
  luecken: { aktiveMitarbeiter: number; ohneVertrag: number; ohneVertragNamen: { id: number; name: string }[] };
}
interface Vertrag {
  id: number; mitarbeiterId: number; vertragsart: string; beginn: string; ende: string | null;
  istVerlaengerung: boolean; sachgrund: string | null; probezeitBis: string | null;
  kuendigungsfristWert: number | null; kuendigungsfristEinheit: string | null; kuendigungstermin: string | null;
  wochenstunden: string | null; gehaltMonatCent: number | null; urlaubstage: number | null;
  wettbewerbsverbot: boolean; nebentaetigkeitErlaubt: boolean | null; personalakteId: number | null;
  kiAuslesung: Auslese | null; status: string; notiz: string;
}
interface Mitarbeiter { id: number; name: string; jobTitle: string; status: string }
interface Dokument { id: number; docType: string; title: string; fileUrl: string | null }
interface Treffer { feld: string; wert: string | number | boolean | null; zitat: string | null; belegt: boolean; begruendung?: string }
interface Auslese { treffer: Treffer[]; hinweise: string[]; modell: string; am?: string }
interface Kuendigung {
  kuendigungAm: string; betriebsjahre: number;
  gesetzlich: { wert: number; einheit: string; termin: string; ende: string };
  vertraglich: { wert: number; einheit: string; termin: string; ende: string } | null;
  massgeblichesEnde: string; massgeblich: "gesetzlich" | "vertraglich" | "probezeit"; inProbezeit: boolean;
}

// ── Labels ───────────────────────────────────────────────────────────────────

const ART: Record<string, string> = {
  unbefristet: "Unbefristet", befristet_sachgrund: "Befristet (mit Sachgrund)",
  befristet_sachgrundlos: "Befristet (sachgrundlos)", ausbildung: "Ausbildung", sonstiges: "Sonstiges",
};
const TERMIN: Record<string, string> = {
  monatsende: "zum Monatsende", quartalsende: "zum Quartalsende",
  fuenfzehnter_oder_monatsende: "zum 15. oder Monatsende", jederzeit: "jederzeit",
};
const DRINGLICH: Record<Frist["dringlichkeit"], { label: string; ton: string }> = {
  ueberfaellig: { label: "Überfällig",   ton: "bg-red-500/15 text-red-800 border-red-500/40" },
  diese_woche:  { label: "Diese Woche",  ton: "bg-amber-500/15 text-amber-800 border-amber-500/40" },
  diesen_monat: { label: "Diesen Monat", ton: "bg-yellow-500/15 text-yellow-800 border-yellow-500/40" },
  quartal:      { label: "Quartal",      ton: "bg-sky-500/10 text-sky-800 border-sky-500/30" },
  spaeter:      { label: "Später",       ton: "bg-muted text-muted-foreground" },
};
const LAGE: Record<Kette["lage"], { label: string; ton: string }> = {
  ueberschritten:  { label: "§ 14 überschritten — gilt als unbefristet", ton: "bg-red-500/15 text-red-800 border-red-500/40" },
  erreicht:        { label: "§ 14 ausgeschöpft",  ton: "bg-amber-500/15 text-amber-800 border-amber-500/40" },
  knapp:           { label: "§ 14 knapp",         ton: "bg-yellow-500/15 text-yellow-800 border-yellow-500/40" },
  frei:            { label: "§ 14 frei",          ton: "bg-muted text-muted-foreground" },
  nicht_anwendbar: { label: "",                   ton: "" },
};
const FELD_LABEL: Record<string, string> = {
  vertragsart: "Vertragsart", beginn: "Beginn", ende: "Ende", probezeitBis: "Probezeit bis",
  kuendigungsfristWert: "Kündigungsfrist", kuendigungsfristEinheit: "Einheit", kuendigungstermin: "Kündigungstermin",
  wochenstunden: "Wochenstunden", gehaltMonatCent: "Monatsbrutto", urlaubstage: "Urlaubstage",
  wettbewerbsverbot: "Wettbewerbsverbot", nebentaetigkeitErlaubt: "Nebentätigkeit erlaubt", sachgrund: "Sachgrund",
};

const fmtDatum = (s: string | null | undefined) => s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" }) : "—";
const fmtEur = (c: number | null | undefined) => c == null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const fmtWert = (feld: string, w: Treffer["wert"]) => {
  if (w == null) return "—";
  if (feld === "gehaltMonatCent") return fmtEur(Number(w));
  if (feld === "vertragsart") return ART[String(w)] ?? String(w);
  if (feld === "kuendigungstermin") return TERMIN[String(w)] ?? String(w);
  if (typeof w === "boolean") return w ? "ja" : "nein";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(w))) return fmtDatum(String(w));
  return String(w);
};

// ── Seite ────────────────────────────────────────────────────────────────────

export default function VertraegePage() {
  const perms = usePermissions();
  const canView  = perms.role === "admin" || perms.role === "manager";
  const [maId, setMaId] = useState<number | null>(null);
  if (!canView) return <NoAccess />;
  return maId == null
    ? <Fristenliste onWaehle={setMaId} />
    : <MitarbeiterVertraege mitarbeiterId={maId} zurueck={() => setMaId(null)} />;
}

// ── Arbeitsliste ─────────────────────────────────────────────────────────────

function Fristenliste({ onWaehle }: { onWaehle: (id: number) => void }) {
  const { data, isLoading } = useQuery<FristenAntwort>({
    queryKey: ["hr-vertraege-fristen"],
    queryFn: () => apiFetch<FristenAntwort>("/api/hr/vertraege/fristen"),
    staleTime: 30_000,
  });
  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"], queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"), staleTime: 30_000,
  });
  const [suche, setSuche] = useState("");
  const gefiltert = useMemo(() => mitarbeiter.filter((m) => m.name.toLowerCase().includes(suche.toLowerCase())).slice(0, 12), [mitarbeiter, suche]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><FileSignature className="h-6 w-6" /> Arbeitsverträge &amp; Fristen</h1>
        <p className="text-sm text-muted-foreground">Probezeiten, Befristungen, § 14 TzBfG — sortiert nach dem Tag, bis zu dem entschieden sein muss.</p>
      </div>

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}

      {data && data.luecken.ohneVertrag > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>{data.luecken.ohneVertrag} von {data.luecken.aktiveMitarbeiter}</strong> aktiven Mitarbeitern haben keinen erfassten Vertrag — sie fehlen in dieser Liste, nicht weil nichts anliegt, sondern weil es niemand weiß.
            <div className="mt-2 flex flex-wrap gap-1">
              {data.luecken.ohneVertragNamen.map((m) => (
                <Button key={m.id} size="sm" variant="outline" className="h-7" onClick={() => onWaehle(m.id)}>{m.name}</Button>
              ))}
            </div>
          </div>
        </CardContent></Card>
      )}

      {data && data.tzbfg.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-2"><Scale className="h-4 w-4" /> Befristungsketten (§ 14 Abs. 2 TzBfG)</h2>
          {data.tzbfg.map((k) => (
            <Card key={k.mitarbeiterId} className={cn("cursor-pointer hover:bg-accent/40", LAGE[k.kette.lage].ton.split(" ").filter((c) => c.startsWith("border")).join(" "))} onClick={() => onWaehle(k.mitarbeiterId)}>
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="font-medium">{k.name}</div>
                <div className="text-muted-foreground">{k.kette.vertraege} Verträge · {k.kette.verlaengerungen} Verlängerungen · {k.kette.gesamtMonate} Monate</div>
                <Badge variant="outline" className={cn("font-normal", LAGE[k.kette.lage].ton)}>{LAGE[k.kette.lage].label}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Anstehende Entscheidungen ({data.fristen.length})</h2>
          {data.fristen.length === 0 && <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">Keine Fristen in den erfassten Verträgen.</CardContent></Card>}
          {data.fristen.map((f) => (
            <Card key={`${f.vertragId}-${f.art}`} className="cursor-pointer hover:bg-accent/40" onClick={() => onWaehle(f.mitarbeiterId)}>
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {f.name} <span className="text-muted-foreground font-normal">{f.jobTitle}</span>
                    <Badge variant="outline" className="font-normal">{f.art === "probezeit" ? "Probezeit" : "Befristung"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{f.hinweis}</div>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant="outline" className={cn("font-normal", DRINGLICH[f.dringlichkeit].ton)}>{DRINGLICH[f.dringlichkeit].label}</Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    entscheiden bis <strong>{fmtDatum(f.entscheidenBis)}</strong> · {f.art === "probezeit" ? "Probezeitende" : "Vertragsende"} {fmtDatum(f.stichtag)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card><CardContent className="p-4 space-y-2">
        <Label className="text-xs">Mitarbeiter öffnen</Label>
        <Input placeholder="Name suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {gefiltert.map((m) => <Button key={m.id} size="sm" variant="ghost" className="h-7" onClick={() => onWaehle(m.id)}>{m.name}</Button>)}
        </div>
      </CardContent></Card>
    </div>
  );
}

// ── Verträge eines Mitarbeiters ──────────────────────────────────────────────

function MitarbeiterVertraege({ mitarbeiterId, zurueck }: { mitarbeiterId: number; zurueck: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const perms = usePermissions();
  const canWrite = perms.role === "admin" || perms.role === "manager";

  const { data: ma } = useQuery<Mitarbeiter>({ queryKey: ["hr-mitarbeiter", mitarbeiterId], queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}`) });
  const { data, isLoading } = useQuery<{ vertraege: Vertrag[]; kette: Kette; fristen: Frist[] }>({
    queryKey: ["hr-vertraege", mitarbeiterId],
    queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/vertraege`),
  });
  const { data: dokumente = [] } = useQuery<Dokument[]>({
    queryKey: ["hr-personalakte", mitarbeiterId],
    queryFn: () => apiFetch(`/api/hr/personalakte/${mitarbeiterId}`),
  });

  const [neu, setNeu] = useState(false);
  const invalidiere = () => {
    qc.invalidateQueries({ queryKey: ["hr-vertraege", mitarbeiterId] });
    qc.invalidateQueries({ queryKey: ["hr-vertraege-fristen"] });
  };

  const anlegen = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/vertraege`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { invalidiere(); setNeu(false); toast({ title: "Vertrag angelegt ✓" }); },
    onError: (e: any) => toast({ title: "Nicht angelegt", description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={zurueck}><ChevronLeft className="h-4 w-4 mr-1" /> Fristenliste</Button>
        <div>
          <h1 className="text-xl font-semibold">{ma?.name ?? "…"}</h1>
          <p className="text-sm text-muted-foreground">{ma?.jobTitle}</p>
        </div>
        <div className="ml-auto">
          {canWrite && !neu && <Button size="sm" onClick={() => setNeu(true)}><Plus className="h-4 w-4 mr-1" /> Vertrag erfassen</Button>}
        </div>
      </div>

      {data && data.kette.lage !== "nicht_anwendbar" && (
        <Card className={LAGE[data.kette.lage].ton.split(" ").filter((c) => c.startsWith("border")).join(" ")}>
          <CardContent className="p-3 text-sm flex flex-wrap items-center gap-3">
            <Scale className="h-4 w-4" />
            <Badge variant="outline" className={cn("font-normal", LAGE[data.kette.lage].ton)}>{LAGE[data.kette.lage].label}</Badge>
            <span className="text-muted-foreground">
              {data.kette.gesamtMonate} von 24 Monaten · {data.kette.verlaengerungen} von 3 Verlängerungen
              {data.kette.lage !== "ueberschritten" && ` · noch ${data.kette.restMonate} Monate, ${data.kette.restVerlaengerungen} Verlängerung(en)`}
            </span>
          </CardContent>
        </Card>
      )}

      {neu && <VertragFormular dokumente={dokumente} onAbbrechen={() => setNeu(false)} onSpeichern={(b) => anlegen.mutate(b)} laeuft={anlegen.isPending} />}

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}
      {data && data.vertraege.length === 0 && !neu && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Noch kein Vertrag erfasst. Ohne Vertrag gibt es keine Fristen.</CardContent></Card>
      )}
      {data?.vertraege.map((v) => (
        <VertragKarte key={v.id} vertrag={v} dokumente={dokumente} canWrite={canWrite} onGeaendert={invalidiere}
          fristen={data.fristen.filter((f) => f.vertragId === v.id)} />
      ))}
    </div>
  );
}

// ── Formular (neu) ───────────────────────────────────────────────────────────

function VertragFormular({ dokumente, onAbbrechen, onSpeichern, laeuft }: {
  dokumente: Dokument[]; onAbbrechen: () => void; onSpeichern: (b: Record<string, unknown>) => void; laeuft: boolean;
}) {
  const [f, setF] = useState<Record<string, string | boolean>>({
    vertragsart: "unbefristet", beginn: "", ende: "", probezeitBis: "", kuendigungsfristWert: "", kuendigungsfristEinheit: "monate",
    kuendigungstermin: "monatsende", wochenstunden: "", gehaltEuro: "", urlaubstage: "", istVerlaengerung: false, wettbewerbsverbot: false, personalakteId: "", sachgrund: "",
  });
  const s = (k: string, v: string | boolean) => setF((a) => ({ ...a, [k]: v }));
  const befristet = String(f.vertragsart).startsWith("befristet");

  return (
    <Card className="border-primary/40"><CardContent className="p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <F label="Vertragsart"><Auswahl value={String(f.vertragsart)} onChange={(v) => s("vertragsart", v)} optionen={ART} /></F>
        <F label="Beginn"><Input type="date" value={String(f.beginn)} onChange={(e) => s("beginn", e.target.value)} /></F>
        <F label={befristet ? "Ende (Pflicht)" : "Ende"}><Input type="date" value={String(f.ende)} onChange={(e) => s("ende", e.target.value)} /></F>
        <F label="Probezeit bis"><Input type="date" value={String(f.probezeitBis)} onChange={(e) => s("probezeitBis", e.target.value)} /></F>
        <F label="Kündigungsfrist"><Input inputMode="numeric" placeholder="z. B. 3" value={String(f.kuendigungsfristWert)} onChange={(e) => s("kuendigungsfristWert", e.target.value)} /></F>
        <F label="Einheit"><Auswahl value={String(f.kuendigungsfristEinheit)} onChange={(v) => s("kuendigungsfristEinheit", v)} optionen={{ wochen: "Wochen", monate: "Monate" }} /></F>
        <F label="Kündigungstermin"><Auswahl value={String(f.kuendigungstermin)} onChange={(v) => s("kuendigungstermin", v)} optionen={TERMIN} /></F>
        <F label="Wochenstunden"><Input inputMode="decimal" placeholder="40" value={String(f.wochenstunden)} onChange={(e) => s("wochenstunden", e.target.value)} /></F>
        <F label="Monatsbrutto (€)"><Input inputMode="decimal" placeholder="4200" value={String(f.gehaltEuro)} onChange={(e) => s("gehaltEuro", e.target.value)} /></F>
        <F label="Urlaubstage"><Input inputMode="numeric" placeholder="30" value={String(f.urlaubstage)} onChange={(e) => s("urlaubstage", e.target.value)} /></F>
        <F label="Vertragsdokument (Personalakte)">
          <Auswahl value={String(f.personalakteId)} onChange={(v) => s("personalakteId", v)}
            optionen={{ "": "— keins —", ...Object.fromEntries(dokumente.map((d) => [String(d.id), d.title])) }} />
        </F>
        {befristet && <F label="Sachgrund"><Input value={String(f.sachgrund)} onChange={(e) => s("sachgrund", e.target.value)} /></F>}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(f.istVerlaengerung)} onChange={(e) => s("istVerlaengerung", e.target.checked)} /> Verlängerung eines befristeten Vertrags</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(f.wettbewerbsverbot)} onChange={(e) => s("wettbewerbsverbot", e.target.checked)} /> Nachvertragliches Wettbewerbsverbot</label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onAbbrechen}>Abbrechen</Button>
        <Button disabled={laeuft || !f.beginn} onClick={() => onSpeichern({
          vertragsart: f.vertragsart, beginn: f.beginn, ende: f.ende || null, probezeitBis: f.probezeitBis || null,
          kuendigungsfristWert: f.kuendigungsfristWert === "" ? null : Number(f.kuendigungsfristWert),
          kuendigungsfristEinheit: f.kuendigungsfristWert === "" ? null : f.kuendigungsfristEinheit,
          kuendigungstermin: f.kuendigungsfristWert === "" ? null : f.kuendigungstermin,
          wochenstunden: f.wochenstunden || null,
          gehaltMonatCent: f.gehaltEuro === "" ? null : Math.round(Number(String(f.gehaltEuro).replace(",", ".")) * 100),
          urlaubstage: f.urlaubstage === "" ? null : Number(f.urlaubstage),
          istVerlaengerung: f.istVerlaengerung, wettbewerbsverbot: f.wettbewerbsverbot,
          personalakteId: f.personalakteId || null, sachgrund: f.sachgrund || null,
        })}>{laeuft && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Anlegen</Button>
      </div>
    </CardContent></Card>
  );
}

// ── Karte eines Vertrags ─────────────────────────────────────────────────────

function VertragKarte({ vertrag: v, dokumente, canWrite, onGeaendert, fristen }: {
  vertrag: Vertrag; dokumente: Dokument[]; canWrite: boolean; onGeaendert: () => void; fristen: Frist[];
}) {
  const { toast } = useToast();
  const [zeigeRechner, setZeigeRechner] = useState(false);
  const [zeigeAuslese, setZeigeAuslese] = useState(false);
  const [kuendigungAm, setKuendigungAm] = useState(new Date().toISOString().slice(0, 10));
  const [auslese, setAuslese] = useState<Auslese | null>(v.kiAuslesung);
  const [freitext, setFreitext] = useState("");

  const { data: rechnung } = useQuery<Kuendigung>({
    queryKey: ["hr-kuendigung", v.id, kuendigungAm],
    queryFn: () => apiFetch(`/api/hr/vertraege/${v.id}/kuendigung?am=${kuendigungAm}`),
    enabled: zeigeRechner,
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch(`/api/hr/vertraege/${v.id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { onGeaendert(); toast({ title: "Übernommen ✓" }); },
    onError: (e: any) => toast({ title: "Nicht übernommen", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const auslesen = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch<Auslese>(`/api/hr/vertraege/${v.id}/auslesen`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (erg) => { setAuslese(erg); onGeaendert(); },
    onError: (e: any) => toast({ title: "Auslesung fehlgeschlagen", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const dok = dokumente.find((d) => d.id === v.personalakteId);
  const belegte = auslese?.treffer.filter((t) => t.wert != null && t.belegt) ?? [];

  return (
    <Card className={v.status !== "aktiv" ? "opacity-70" : undefined}><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{ART[v.vertragsart] ?? v.vertragsart}</span>
          <Badge variant={v.status === "aktiv" ? "default" : "secondary"} className="font-normal">{v.status === "aktiv" ? "aktiv" : v.status === "abgeloest" ? "abgelöst" : "beendet"}</Badge>
          {v.istVerlaengerung && <Badge variant="outline" className="font-normal">Verlängerung</Badge>}
          {fristen.map((f) => <Badge key={f.art} variant="outline" className={cn("font-normal", DRINGLICH[f.dringlichkeit].ton)}>{f.art === "probezeit" ? "Probezeit" : "Befristung"}: bis {fmtDatum(f.entscheidenBis)}</Badge>)}
        </div>
        <div className="flex gap-1">
          {v.status === "aktiv" && <Button size="sm" variant="outline" onClick={() => setZeigeRechner((x) => !x)}><Calculator className="h-4 w-4 mr-1" /> Kündigungsrechner</Button>}
          {canWrite && <Button size="sm" variant="outline" onClick={() => setZeigeAuslese((x) => !x)}><Sparkles className="h-4 w-4 mr-1" /> KI-Auslesung</Button>}
          {canWrite && <a href={`/api/hr/vertraege/${v.id}/pdf?art=${v.istVerlaengerung ? "nachtrag" : "vertrag"}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><FileDown className="h-4 w-4 mr-1" /> {v.istVerlaengerung ? "Nachtrag" : "Vertrag"} als PDF</Button></a>}
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Feld label="Beginn" wert={fmtDatum(v.beginn)} />
        <Feld label="Ende" wert={fmtDatum(v.ende)} />
        <Feld label="Probezeit bis" wert={fmtDatum(v.probezeitBis)} />
        <Feld label="Kündigungsfrist" wert={v.kuendigungsfristWert != null ? `${v.kuendigungsfristWert} ${v.kuendigungsfristEinheit === "wochen" ? "Wochen" : "Monate"} ${TERMIN[v.kuendigungstermin ?? ""] ?? ""}` : "gesetzlich"} />
        <Feld label="Stunden / Gehalt" wert={`${v.wochenstunden ?? "—"} h · ${fmtEur(v.gehaltMonatCent)}`} />
        <Feld label="Urlaub / Dokument" wert={`${v.urlaubstage ?? "—"} Tage`} zusatz={dok?.title ?? "kein Dokument"} />
      </div>

      {zeigeRechner && (
        <div className="rounded-md border p-3 space-y-2 text-sm bg-muted/30">
          <div className="flex items-center gap-2"><Label className="text-xs">Kündigung am</Label><Input type="date" className="h-8 w-44" value={kuendigungAm} onChange={(e) => setKuendigungAm(e.target.value)} /></div>
          {rechnung && (
            <div className="grid gap-2 sm:grid-cols-3">
              <div className={cn("rounded p-2", rechnung.massgeblich === "gesetzlich" && "bg-primary/10")}>
                <div className="text-xs text-muted-foreground">Gesetzlich (§ 622 BGB, {rechnung.betriebsjahre} Jahre)</div>
                <div className="font-medium">{rechnung.gesetzlich.wert} {rechnung.gesetzlich.einheit === "wochen" ? "Wochen" : "Monate"} {TERMIN[rechnung.gesetzlich.termin]}</div>
                <div>→ {fmtDatum(rechnung.gesetzlich.ende)}</div>
              </div>
              <div className={cn("rounded p-2", rechnung.massgeblich === "vertraglich" && "bg-primary/10")}>
                <div className="text-xs text-muted-foreground">Vertraglich</div>
                {rechnung.vertraglich ? <><div className="font-medium">{rechnung.vertraglich.wert} {rechnung.vertraglich.einheit === "wochen" ? "Wochen" : "Monate"} {TERMIN[rechnung.vertraglich.termin]}</div><div>→ {fmtDatum(rechnung.vertraglich.ende)}</div></> : <div className="text-muted-foreground">nicht vereinbart</div>}
              </div>
              <div className={cn("rounded p-2", rechnung.massgeblich === "probezeit" && "bg-primary/10")}>
                <div className="text-xs text-muted-foreground">Maßgeblich {rechnung.inProbezeit ? "(Probezeit: 2 Wochen)" : "(die längere Frist)"}</div>
                <div className="text-lg font-semibold">{fmtDatum(rechnung.massgeblichesEnde)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {zeigeAuslese && (
        <div className="rounded-md border p-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="font-medium">KI-Auslesung</span>
            <span className="text-xs text-muted-foreground">Vorschlag mit Fundstelle — übernommen wird nur, was du anklickst.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {dok?.fileUrl && <Button size="sm" disabled={auslesen.isPending} onClick={() => auslesen.mutate({ personalakteId: dok.id })}>{auslesen.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Dokument „{dok.title}" auslesen</Button>}
            {dokumente.filter((d) => d.fileUrl && d.id !== v.personalakteId).map((d) => (
              <Button key={d.id} size="sm" variant="outline" disabled={auslesen.isPending} onClick={() => auslesen.mutate({ personalakteId: d.id })}>{d.title}</Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">… oder Vertragstext einfügen</Label>
            <Textarea rows={4} value={freitext} onChange={(e) => setFreitext(e.target.value)} placeholder="Text des Arbeitsvertrags hier einfügen" />
            <Button size="sm" variant="outline" disabled={auslesen.isPending || freitext.trim().length < 50} onClick={() => auslesen.mutate({ text: freitext })}>Text auslesen</Button>
          </div>

          {auslese && (
            <div className="space-y-2">
              {auslese.hinweise.length > 0 && (
                <div className="rounded bg-amber-500/10 border border-amber-500/30 p-2 text-xs space-y-1">
                  {auslese.hinweise.map((h, i) => <div key={i}>• {h}</div>)}
                </div>
              )}
              <div className="text-xs text-muted-foreground">{auslese.modell}{auslese.am && ` · ${new Date(auslese.am).toLocaleString("de-DE")}`} · {belegte.length} belegte Werte</div>
              <div className="divide-y rounded border">
                {auslese.treffer.filter((t) => t.wert != null).map((t) => (
                  <div key={t.feld} className="p-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{FELD_LABEL[t.feld] ?? t.feld}:</span> {fmtWert(t.feld, t.wert)}
                        {t.belegt
                          ? <Badge variant="outline" className="font-normal text-emerald-700 border-emerald-500/40">belegt</Badge>
                          : <Badge variant="outline" className="font-normal text-red-700 border-red-500/40">nicht belegt</Badge>}
                      </div>
                      {t.zitat && <div className="text-xs text-muted-foreground italic mt-0.5">„{t.zitat}"</div>}
                      {t.begruendung && <div className="text-xs text-muted-foreground mt-0.5">{t.begruendung}</div>}
                    </div>
                    {canWrite && (
                      <Button size="sm" variant={t.belegt ? "default" : "outline"} className="h-7" disabled={patch.isPending}
                        onClick={() => patch.mutate({ [t.feld]: t.wert })}>
                        <Check className="h-3.5 w-3.5 mr-1" /> Übernehmen
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CardContent></Card>
  );
}

// ── Kleinteile ───────────────────────────────────────────────────────────────

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Auswahl({ value, onChange, optionen }: { value: string; onChange: (v: string) => void; optionen: Record<string, string> }) {
  return (
    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(optionen).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}
function Feld({ label, wert, zusatz }: { label: string; wert: string; zusatz?: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{wert}</div>{zusatz && <div className="text-xs text-muted-foreground">{zusatz}</div>}</div>;
}
