// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Urlaubskonten (0436): Anspruch nach BUrlG, Übertrag mit Verfall,
// genommen/verplant/beantragt, Rest. Korrekturen mit Pflichtbegründung.
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
import { CalendarDays, AlertTriangle, ChevronLeft, Loader2, Plus, Trash2, Info } from "lucide-react";

interface Konto {
  mitarbeiterId: number; jahr: number; anspruch: number; anspruchGrund: string; volleMonate: number;
  uebertrag: number; uebertragGesetzt: boolean; uebertragGenommen: number; uebertragVerfallen: number;
  korrekturen: number; genommen: number; verplant: number; beantragt: number; rest: number; restNachAntraegen: number; hinweise: string[];
  name?: string; jobTitle?: string; abteilung?: string | null; arbeitstageProWoche?: number; urlaubstageProJahr?: number;
}
interface Uebersicht { jahr: number; stichtag: string; konten: Konto[]; summe: { anspruch: number; genommen: number; verplant: number; rest: number; verfallen: number }; hinweise: { ueberzogen: number; hoherRest: number; uebertragOffen: number } }
interface Detail extends Konto { korrekturen: any; korrekturenListe?: never; urlaube: { id: number; startDate: string; endDate: string; days: number; status: string }[] }

const GRUND: Record<string, string> = { voll: "voller Jahresanspruch", eintritt_zwoelftel: "Eintritt 2. Halbjahr — Zwölftelung", austritt_zwoelftel: "Austritt 1. Halbjahr — Zwölftelung", nicht_beschaeftigt: "im Jahr nicht beschäftigt" };
const ART: Record<string, string> = { uebertrag: "Übertrag setzen", korrektur: "Korrektur", auszahlung: "Auszahlung", verfall: "Verfall" };
const fmtT = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
const fmtD = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" });

export default function UrlaubskontoPage() {
  const perms = usePermissions();
  const canView = perms.role === "admin" || perms.role === "manager";
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [maId, setMaId] = useState<number | null>(null);
  if (!canView) return <NoAccess />;
  return maId == null ? <Uebersicht jahr={jahr} setJahr={setJahr} onWaehle={setMaId} /> : <KontoDetail mitarbeiterId={maId} jahr={jahr} zurueck={() => setMaId(null)} />;
}

function Uebersicht({ jahr, setJahr, onWaehle }: { jahr: number; setJahr: (j: number) => void; onWaehle: (id: number) => void }) {
  const { data, isLoading } = useQuery<Uebersicht>({ queryKey: ["hr-urlaubskonten", jahr], queryFn: () => apiFetch(`/api/hr/urlaubskonten?jahr=${jahr}`), staleTime: 30_000 });
  const jahre = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() + 1 - i);
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><CalendarDays className="h-6 w-6" /> Urlaubskonten</h1>
          <p className="text-sm text-muted-foreground">Anspruch nach BUrlG (Teilzeit in Tagen, Zwölftelung bei Ein-/Austritt), Übertrag mit Verfall am 31.03.</p>
        </div>
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={jahr} onChange={(e) => setJahr(Number(e.target.value))}>{jahre.map((j) => <option key={j} value={j}>{j}</option>)}</select>
      </div>
      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}
      {data && (
        <>
          {(data.hinweise.ueberzogen > 0 || data.hinweise.hoherRest > 0 || data.hinweise.uebertragOffen > 0) && (
            <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="p-4 flex items-start gap-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {data.hinweise.ueberzogen > 0 && <p><strong>{data.hinweise.ueberzogen}</strong> Konten sind überzogen.</p>}
                {data.hinweise.hoherRest > 0 && <p><strong>{data.hinweise.hoherRest}</strong> Mitarbeiter haben im Herbst noch 15+ Tage — das wird zum Jahresende geballt genommen oder verfällt.</p>}
                {data.hinweise.uebertragOffen > 0 && <p><strong>{data.hinweise.uebertragOffen}</strong> Mitarbeiter haben Übertrag, der am 31.03. verfällt.</p>}
              </div>
            </CardContent></Card>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            <K label="Anspruch gesamt" wert={`${fmtT(data.summe.anspruch)} Tage`} />
            <K label="Genommen" wert={`${fmtT(data.summe.genommen)} Tage`} zusatz={`${fmtT(data.summe.verplant)} verplant`} />
            <K label="Rest gesamt" wert={`${fmtT(data.summe.rest)} Tage`} />
            <K label="Verfallen (Übertrag)" wert={`${fmtT(data.summe.verfallen)} Tage`} ton={data.summe.verfallen > 0 ? "text-amber-700" : undefined} />
          </div>
          <div className="space-y-2">
            {data.konten.map((k) => (
              <Card key={k.mitarbeiterId} className={cn("cursor-pointer hover:bg-accent/40", k.rest < 0 && "border-red-500/40")} onClick={() => onWaehle(k.mitarbeiterId)}>
                <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{k.name} <span className="text-muted-foreground font-normal">{k.jobTitle}{k.arbeitstageProWoche !== 5 ? ` · ${k.arbeitstageProWoche} Tage/Woche` : ""}</span></div>
                    <div className="text-xs text-muted-foreground">{GRUND[k.anspruchGrund]}{k.uebertrag > 0 ? ` · Übertrag ${fmtT(k.uebertrag)}${k.uebertragVerfallen > 0 ? ` (${fmtT(k.uebertragVerfallen)} verfallen)` : ""}` : ""}{k.beantragt > 0 ? ` · ${fmtT(k.beantragt)} beantragt` : ""}</div>
                  </div>
                  <div className="grid grid-cols-4 gap-5 text-right">
                    <F label="Anspruch" wert={fmtT(k.anspruch)} />
                    <F label="Genommen" wert={fmtT(k.genommen)} />
                    <F label="Verplant" wert={fmtT(k.verplant)} />
                    <F label="Rest" wert={fmtT(k.rest)} ton={k.rest < 0 ? "text-red-700" : k.rest >= 15 ? "text-amber-700" : "text-emerald-700"} />
                  </div>
                </CardContent>
              </Card>
            ))}
            {data.konten.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Keine Mitarbeiter im Jahr {jahr}.</CardContent></Card>}
          </div>
        </>
      )}
    </div>
  );
}

function KontoDetail({ mitarbeiterId, jahr, zurueck }: { mitarbeiterId: number; jahr: number; zurueck: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data, isLoading } = useQuery<Detail>({ queryKey: ["hr-urlaubskonto", mitarbeiterId, jahr], queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/urlaubskonto?jahr=${jahr}`) });
  const [art, setArt] = useState("korrektur"); const [tage, setTage] = useState(""); const [grund, setGrund] = useState("");
  const neu = () => { qc.invalidateQueries({ queryKey: ["hr-urlaubskonto", mitarbeiterId] }); qc.invalidateQueries({ queryKey: ["hr-urlaubskonten"] }); };
  const korr = useMutation({
    mutationFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/urlaubskonto/korrektur`, { method: "POST", body: JSON.stringify({ jahr, art, tage, grund }) }),
    onSuccess: () => { neu(); setTage(""); setGrund(""); toast({ title: "Korrektur eingetragen ✓" }); },
    onError: (e: any) => toast({ title: "Nicht eingetragen", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const loeschen = useMutation({ mutationFn: (id: number) => apiFetch(`/api/hr/urlaubskonto/korrektur/${id}`, { method: "DELETE" }), onSuccess: neu });
  const korrekturen: { id: number; art: string; tage: string; grund: string; createdAt: string }[] = Array.isArray(data?.korrekturen) ? data!.korrekturen : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={zurueck}><ChevronLeft className="h-4 w-4 mr-1" /> Übersicht</Button>
        <h1 className="text-xl font-semibold">{data?.name ?? "…"} · Urlaubskonto {jahr}</h1>
      </div>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <K label="Anspruch" wert={fmtT(data.anspruch)} zusatz={GRUND[data.anspruchGrund]} />
            <K label="Übertrag" wert={fmtT(data.uebertrag)} zusatz={data.uebertragGesetzt ? "gesetzt" : "gerechnet"} />
            <K label="Verfallen" wert={fmtT(data.uebertragVerfallen)} ton={data.uebertragVerfallen > 0 ? "text-amber-700" : undefined} />
            <K label="Genommen" wert={fmtT(data.genommen)} />
            <K label="Verplant / beantragt" wert={`${fmtT(data.verplant)} / ${fmtT(data.beantragt)}`} />
            <K label="Rest" wert={fmtT(data.rest)} ton={data.rest < 0 ? "text-red-700" : "text-emerald-700"} zusatz={`nach Anträgen ${fmtT(data.restNachAntraegen)}`} />
          </div>
          {data.hinweise.length > 0 && <Card className="border-muted"><CardContent className="p-3 text-xs text-muted-foreground space-y-1">{data.hinweise.map((h, i) => <div key={i} className="flex gap-1"><Info className="h-3.5 w-3.5 shrink-0" />{h}</div>)}</CardContent></Card>}

          <Card><CardContent className="p-4 space-y-3">
            <div className="font-medium text-sm">Korrektur eintragen</div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1"><Label className="text-xs">Art</Label>
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={art} onChange={(e) => setArt(e.target.value)}>{Object.entries(ART).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div className="space-y-1"><Label className="text-xs">Tage {art === "auszahlung" || art === "verfall" ? "(mindert)" : "(±)"}</Label><Input inputMode="decimal" value={tage} onChange={(e) => setTage(e.target.value)} placeholder="z. B. 3" /></div>
              <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Grund (Pflicht)</Label><Input value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="z. B. Resturlaub 2025 laut Lohnabrechnung" /></div>
            </div>
            <div className="flex justify-end"><Button size="sm" disabled={korr.isPending || !tage || !grund} onClick={() => korr.mutate()}><Plus className="h-4 w-4 mr-1" /> Eintragen</Button></div>
            {korrekturen.length > 0 && (
              <div className="divide-y rounded border text-sm">
                {korrekturen.map((k) => (
                  <div key={k.id} className="p-2 flex items-center justify-between gap-2">
                    <div><Badge variant="outline" className="font-normal mr-2">{ART[k.art] ?? k.art}</Badge>{fmtT(Number(k.tage))} Tage <span className="text-muted-foreground">— {k.grund}</span></div>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => loeschen.mutate(k.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>

          <Card><CardContent className="p-4">
            <div className="font-medium text-sm mb-2">Urlaub {jahr}</div>
            {data.urlaube.length === 0 && <div className="text-sm text-muted-foreground">Kein Urlaub eingetragen.</div>}
            <div className="divide-y text-sm">
              {data.urlaube.map((u) => (
                <div key={u.id} className="py-1.5 flex justify-between"><span>{fmtD(u.startDate)} – {fmtD(u.endDate)}</span><span>{u.days} Tage <Badge variant={u.status === "genehmigt" ? "default" : u.status === "ausstehend" ? "secondary" : "outline"} className="font-normal ml-1">{u.status}</Badge></span></div>
              ))}
            </div>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

function K({ label, wert, zusatz, ton }: { label: string; wert: string; zusatz?: string; ton?: string }) {
  return <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={cn("text-lg font-semibold", ton)}>{wert}</div>{zusatz && <div className="text-xs text-muted-foreground">{zusatz}</div>}</CardContent></Card>;
}
function F({ label, wert, ton }: { label: string; wert: string; ton?: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className={cn("font-medium", ton)}>{wert}</div></div>;
}
