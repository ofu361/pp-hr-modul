// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Weiterbildungspflicht § 34c GewO / § 15b MaBV (0436):
// 20 Stunden in drei Kalenderjahren je Person. Übersicht mit Lage, Erfassung je Mitarbeiter.
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
import { GraduationCap, AlertTriangle, ChevronLeft, Loader2, Plus, Trash2, ShieldAlert } from "lucide-react";

interface Stand { mitarbeiterId: number; pflichtig: boolean; zeitraumVon: number; zeitraumBis: number; stundenImZeitraum: number; soll: number; rest: number; verstrichen: number; lage: string; vorzeitraumVerfehlt: boolean; vorzeitraumStunden: number | null; hinweis: string; name?: string; jobTitle?: string; abteilung?: string | null; stundenGesamt?: number }
interface Uebersicht { stichtag: string; soll: number; zusammenfassung: { pflichtig: number; erfuellt: number; imRueckstand: number; verstoesse: number; vermutlichPflichtig: { id: number; name: string; jobTitle: string }[] }; staende: Stand[] }
interface Eintrag { id: number; titel: string; anbieter: string | null; datum: string; stunden: string; mabvRelevant: boolean; notiz: string }

const LAGE: Record<string, { label: string; ton: string }> = {
  im_rueckstand: { label: "Im Rückstand", ton: "bg-red-500/15 text-red-800 border-red-500/40" },
  knapp: { label: "Knapp — letztes Jahr", ton: "bg-amber-500/15 text-amber-800 border-amber-500/40" },
  auf_kurs: { label: "Auf Kurs", ton: "bg-sky-500/10 text-sky-800 border-sky-500/30" },
  erfuellt: { label: "Erfüllt", ton: "bg-emerald-500/10 text-emerald-800 border-emerald-500/30" },
  nicht_pflichtig: { label: "Nicht pflichtig", ton: "bg-muted text-muted-foreground" },
};
const fmtH = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const fmtD = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" });

export default function WeiterbildungPage() {
  const perms = usePermissions();
  const canView = perms.role === "admin" || perms.role === "manager";
  const [maId, setMaId] = useState<number | null>(null);
  if (!canView) return <NoAccess />;
  return maId == null ? <Uebersicht onWaehle={setMaId} /> : <Detail mitarbeiterId={maId} zurueck={() => setMaId(null)} />;
}

function Uebersicht({ onWaehle }: { onWaehle: (id: number) => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data, isLoading } = useQuery<Uebersicht>({ queryKey: ["hr-weiterbildung"], queryFn: () => apiFetch("/api/hr/weiterbildung"), staleTime: 30_000 });
  const pflichtig = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/mitarbeiter/${id}`, { method: "PATCH", body: JSON.stringify({ mabvPflichtig: true }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-weiterbildung"] }); toast({ title: "Als pflichtig markiert ✓" }); },
  });
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><GraduationCap className="h-6 w-6" /> Weiterbildungspflicht § 34c</h1>
        <p className="text-sm text-muted-foreground">20 Stunden in drei Kalenderjahren je Makler und Wohnimmobilienverwalter (§ 15b MaBV). Versäumnis: Bußgeld bis zur Gewerbeuntersagung.</p>
      </div>
      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}
      {data && (
        <>
          {data.zusammenfassung.verstoesse > 0 && (
            <Card className="border-red-500/40 bg-red-500/5"><CardContent className="p-4 flex items-start gap-3 text-sm"><ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" /><div><strong>{data.zusammenfassung.verstoesse}</strong> Person(en) haben den letzten Dreijahreszeitraum NICHT erfüllt — das ist ein bereits eingetretener Verstoß, nicht ein Risiko.</div></CardContent></Card>
          )}
          {data.zusammenfassung.vermutlichPflichtig.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="p-4 text-sm space-y-2">
              <div className="flex items-start gap-2"><AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" /><div>Diese Mitarbeiter tragen Makler/Verwalter/Vermietung im Titel, sind aber <strong>nicht als pflichtig markiert</strong> — vermutlich eine Lücke, keine Absicht:</div></div>
              <div className="flex flex-wrap gap-1 pl-7">{data.zusammenfassung.vermutlichPflichtig.map((m) => <Button key={m.id} size="sm" variant="outline" className="h-7" disabled={pflichtig.isPending} onClick={() => pflichtig.mutate(m.id)}>{m.name} · als pflichtig markieren</Button>)}</div>
            </CardContent></Card>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            <K label="Pflichtige" wert={String(data.zusammenfassung.pflichtig)} />
            <K label="Erfüllt" wert={String(data.zusammenfassung.erfuellt)} ton="text-emerald-700" />
            <K label="Im Rückstand / knapp" wert={String(data.zusammenfassung.imRueckstand)} ton={data.zusammenfassung.imRueckstand > 0 ? "text-amber-700" : undefined} />
            <K label="Verstöße (Vorzeitraum)" wert={String(data.zusammenfassung.verstoesse)} ton={data.zusammenfassung.verstoesse > 0 ? "text-red-700" : undefined} />
          </div>
          <div className="space-y-2">
            {data.staende.filter((s) => s.pflichtig || (s.stundenGesamt ?? 0) > 0).map((s) => (
              <Card key={s.mitarbeiterId} className={cn("cursor-pointer hover:bg-accent/40", LAGE[s.lage]?.ton.split(" ").filter((c) => c.startsWith("border")).join(" "))} onClick={() => onWaehle(s.mitarbeiterId)}>
                <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2 flex-wrap">{s.name} <span className="text-muted-foreground font-normal">{s.jobTitle}</span>
                      <Badge variant="outline" className={cn("font-normal", LAGE[s.lage]?.ton)}>{LAGE[s.lage]?.label}</Badge>
                      {s.vorzeitraumVerfehlt && <Badge variant="outline" className="font-normal bg-red-500/15 text-red-800 border-red-500/40">Verstoß {s.zeitraumVon - 3}–{s.zeitraumVon - 1}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{s.hinweis}</div>
                  </div>
                  {s.pflichtig && (
                    <div className="w-48">
                      <div className="flex justify-between text-xs"><span>{fmtH(s.stundenImZeitraum)} / {s.soll} h</span><span className="text-muted-foreground">{s.zeitraumVon}–{s.zeitraumBis}</span></div>
                      <div className="h-2 rounded bg-muted mt-1 relative"><div className={cn("h-2 rounded", s.lage === "erfuellt" ? "bg-emerald-500" : s.lage === "im_rueckstand" ? "bg-red-500" : "bg-primary")} style={{ width: `${Math.min(100, (s.stundenImZeitraum / s.soll) * 100)}%` }} /><div className="absolute top-0 h-2 w-px bg-foreground/50" style={{ left: `${Math.round(s.verstrichen * 100)}%` }} title="verstrichene Zeit" /></div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {data.staende.every((s) => !s.pflichtig) && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Noch niemand als § 34c-pflichtig markiert. Am Mitarbeiter setzen (Feld „Weiterbildungspflicht") — oder oben übernehmen.</CardContent></Card>}
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ mitarbeiterId, zurueck }: { mitarbeiterId: number; zurueck: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data: ma } = useQuery<{ name: string; jobTitle: string; mabvPflichtig: boolean }>({ queryKey: ["hr-mitarbeiter", mitarbeiterId], queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}`) });
  const { data } = useQuery<{ stand: Stand; eintraege: Eintrag[] }>({ queryKey: ["hr-weiterbildung", mitarbeiterId], queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/weiterbildung`) });
  const [f, setF] = useState({ titel: "", anbieter: "", datum: new Date().toISOString().slice(0, 10), stunden: "", mabvRelevant: true, notiz: "" });
  const neu = () => { qc.invalidateQueries({ queryKey: ["hr-weiterbildung"] }); qc.invalidateQueries({ queryKey: ["hr-weiterbildung", mitarbeiterId] }); };
  const anlegen = useMutation({
    mutationFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/weiterbildung`, { method: "POST", body: JSON.stringify(f) }),
    onSuccess: () => { neu(); setF((a) => ({ ...a, titel: "", anbieter: "", stunden: "", notiz: "" })); toast({ title: "Weiterbildung erfasst ✓" }); },
    onError: (e: any) => toast({ title: "Nicht erfasst", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const loeschen = useMutation({ mutationFn: (id: number) => apiFetch(`/api/hr/weiterbildung/${id}`, { method: "DELETE" }), onSuccess: neu });
  const pflicht = useMutation({ mutationFn: (v: boolean) => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}`, { method: "PATCH", body: JSON.stringify({ mabvPflichtig: v }) }), onSuccess: () => { neu(); qc.invalidateQueries({ queryKey: ["hr-mitarbeiter", mitarbeiterId] }); } });
  const s = data?.stand;
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={zurueck}><ChevronLeft className="h-4 w-4 mr-1" /> Übersicht</Button>
        <div><h1 className="text-xl font-semibold">{ma?.name ?? "…"}</h1><p className="text-sm text-muted-foreground">{ma?.jobTitle}</p></div>
        <div className="ml-auto"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(ma?.mabvPflichtig)} onChange={(e) => pflicht.mutate(e.target.checked)} /> Weiterbildungspflicht § 34c</label></div>
      </div>
      {s && (
        <Card className={LAGE[s.lage]?.ton.split(" ").filter((c) => c.startsWith("border")).join(" ")}><CardContent className="p-4 text-sm flex flex-wrap items-center gap-3">
          <Badge variant="outline" className={cn("font-normal", LAGE[s.lage]?.ton)}>{LAGE[s.lage]?.label}</Badge>
          <span>{s.hinweis}</span>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-4 space-y-3">
        <div className="font-medium text-sm">Weiterbildung erfassen</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1 lg:col-span-2"><Label className="text-xs">Titel</Label><Input value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} placeholder="z. B. Mietrecht aktuell 2026" /></div>
          <div className="space-y-1"><Label className="text-xs">Anbieter</Label><Input value={f.anbieter} onChange={(e) => setF({ ...f, anbieter: e.target.value })} placeholder="IVD, Haufe, IHK …" /></div>
          <div className="space-y-1"><Label className="text-xs">Datum</Label><Input type="date" value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">Stunden</Label><Input inputMode="decimal" value={f.stunden} onChange={(e) => setF({ ...f, stunden: e.target.value })} placeholder="z. B. 4" /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mabvRelevant} onChange={(e) => setF({ ...f, mabvRelevant: e.target.checked })} /> zählt für § 34c (MaBV Anlage 1: Immobilienrecht, Vermietung, Verwaltung, Finanzierung …)</label>
          <Button size="sm" disabled={anlegen.isPending || !f.titel || !f.stunden} onClick={() => anlegen.mutate()}><Plus className="h-4 w-4 mr-1" /> Erfassen</Button>
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <div className="font-medium text-sm mb-2">Nachweise ({data?.eintraege.length ?? 0})</div>
        {data?.eintraege.length === 0 && <div className="text-sm text-muted-foreground">Noch keine Weiterbildung erfasst.</div>}
        <div className="divide-y text-sm">
          {data?.eintraege.map((e) => (
            <div key={e.id} className="py-2 flex items-center justify-between gap-2">
              <div><div className="font-medium">{e.titel} {!e.mabvRelevant && <Badge variant="secondary" className="font-normal ml-1">nicht § 34c</Badge>}</div><div className="text-xs text-muted-foreground">{fmtD(e.datum)}{e.anbieter ? ` · ${e.anbieter}` : ""}{e.notiz ? ` · ${e.notiz}` : ""}</div></div>
              <div className="flex items-center gap-2"><span className="font-medium">{fmtH(Number(e.stunden))} h</span><Button size="sm" variant="ghost" className="h-7" onClick={() => loeschen.mutate(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}

function K({ label, wert, ton }: { label: string; wert: string; ton?: string }) {
  return <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={cn("text-lg font-semibold", ton)}>{wert}</div></CardContent></Card>;
}
