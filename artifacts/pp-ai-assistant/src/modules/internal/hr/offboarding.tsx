// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Offboarding (0436): Austritte mit Fortschritt, Schritte abhaken oder
// per Klick ausführen (Konto sperren, Kalender trennen, Verteiler), Zeugnis-Entwurf.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import NoAccess from "@/shared/components/no-access";
import { LogOut, ShieldAlert, ChevronLeft, Loader2, Check, Play, RotateCcw, Sparkles, FileDown, X } from "lucide-react";

interface Eintrag { mitarbeiterId: number; name: string; jobTitle: string; endDate: string; austrittsgrund: string | null; angelegt: boolean; gesamt: number; erledigt: number; offeneSicherheitsschritte: number; ausgeschieden: boolean; kritisch: boolean }
interface Schritt { schluessel: string; titel: string; beschreibung: string; automatisch: boolean; wann: string; status: string; ergebnis: string | null; erledigtAm: string | null }
interface Detail { mitarbeiter: { id: number; name: string; endDate: string | null; austrittsgrund: string | null; userId: number | null }; angelegt: boolean; schritte: Schritt[]; befund: { userId: number | null; kontoAktiv: boolean | null; kalenderAktiv: number; imVerteiler: boolean; betreuteObjekte: { id: number; name: string }[] } }

const WANN: Record<string, string> = { vorher: "Vor dem Austritt", austrittstag: "Am Austrittstag", danach: "Danach" };
const fmtD = (s: string | null) => s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" }) : "—";

export default function OffboardingPage() {
  const perms = usePermissions();
  const canView = perms.role === "admin" || perms.role === "manager";
  const [maId, setMaId] = useState<number | null>(null);
  if (!canView) return <NoAccess />;
  return maId == null ? <Liste onWaehle={setMaId} /> : <Detailansicht mitarbeiterId={maId} zurueck={() => setMaId(null)} />;
}

function Liste({ onWaehle }: { onWaehle: (id: number) => void }) {
  const { data, isLoading } = useQuery<{ stichtag: string; liste: Eintrag[] }>({ queryKey: ["hr-offboarding"], queryFn: () => apiFetch("/api/hr/offboarding"), staleTime: 30_000 });
  const kritisch = data?.liste.filter((e) => e.kritisch) ?? [];
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><LogOut className="h-6 w-6" /> Offboarding</h1>
        <p className="text-sm text-muted-foreground">Austritte der letzten 90 und nächsten 180 Tage. Die Liste entsteht automatisch, sobald ein Austrittsdatum am Mitarbeiter steht.</p>
      </div>
      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}
      {kritisch.length > 0 && (
        <Card className="border-red-500/40 bg-red-500/5"><CardContent className="p-4 flex items-start gap-3 text-sm"><ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" /><div><strong>{kritisch.length}</strong> Ausgeschiedene mit offenen Sicherheitsschritten (Konto, Kalender, Verteiler). Das ist das Loch, um das es geht — zuerst schließen.</div></CardContent></Card>
      )}
      <div className="space-y-2">
        {data?.liste.map((e) => (
          <Card key={e.mitarbeiterId} className={cn("cursor-pointer hover:bg-accent/40", e.kritisch && "border-red-500/40")} onClick={() => onWaehle(e.mitarbeiterId)}>
            <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium flex items-center gap-2">{e.name} <span className="text-muted-foreground font-normal">{e.jobTitle}</span>
                  {e.ausgeschieden ? <Badge variant="secondary" className="font-normal">ausgeschieden {fmtD(e.endDate)}</Badge> : <Badge variant="outline" className="font-normal">Austritt {fmtD(e.endDate)}</Badge>}
                  {e.kritisch && <Badge variant="outline" className="font-normal bg-red-500/15 text-red-800 border-red-500/40">{e.offeneSicherheitsschritte} Sicherheitsschritte offen</Badge>}
                </div>
                {e.austrittsgrund && <div className="text-xs text-muted-foreground">{e.austrittsgrund}</div>}
              </div>
              <div className="w-40">
                {e.angelegt ? <><div className="flex justify-between text-xs"><span>{e.erledigt} / {e.gesamt}</span><span className="text-muted-foreground">erledigt</span></div><div className="h-2 rounded bg-muted mt-1"><div className="h-2 rounded bg-primary" style={{ width: `${e.gesamt ? (e.erledigt / e.gesamt) * 100 : 0}%` }} /></div></> : <span className="text-xs text-muted-foreground">Liste noch nicht angelegt</span>}
              </div>
            </CardContent>
          </Card>
        ))}
        {data && data.liste.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Keine Austritte im Zeitraum.</CardContent></Card>}
      </div>
    </div>
  );
}

function Detailansicht({ mitarbeiterId, zurueck }: { mitarbeiterId: number; zurueck: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const { data, isLoading } = useQuery<Detail>({ queryKey: ["hr-offboarding", mitarbeiterId], queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/offboarding`) });
  const neu = () => { qc.invalidateQueries({ queryKey: ["hr-offboarding"] }); qc.invalidateQueries({ queryKey: ["hr-offboarding", mitarbeiterId] }); };
  const anlegen = useMutation({ mutationFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/offboarding`, { method: "POST", body: "{}" }), onSuccess: neu, onError: (e: any) => toast({ title: "Nicht angelegt", description: String(e?.message ?? e), variant: "destructive" }) });
  const schritt = useMutation({
    mutationFn: ({ s, aktion }: { s: string; aktion: string }) => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/offboarding/${s}`, { method: "PATCH", body: JSON.stringify({ aktion }) }),
    onSuccess: (r: any) => { neu(); if (r?.ergebnis) toast({ title: r.ergebnis }); },
    onError: (e: any) => toast({ title: "Fehlgeschlagen", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const [zeugnis, setZeugnis] = useState<{ text: string; note: number | null; hinweise: string[] } | null>(null);
  const [zeugnisOffen, setZeugnisOffen] = useState(false);
  const entwurf = useMutation({ mutationFn: () => apiFetch<{ text: string; note: number | null; hinweise: string[] }>(`/api/hr/mitarbeiter/${mitarbeiterId}/zeugnis/entwurf`, { method: "POST", body: "{}" }), onSuccess: (z) => { setZeugnis(z); setZeugnisOffen(true); }, onError: (e: any) => toast({ title: "Kein Entwurf", description: String(e?.message ?? e), variant: "destructive" }) });

  async function zeugnisPdf() {
    if (!zeugnis) return;
    const r = await fetch(`/api/hr/mitarbeiter/${mitarbeiterId}/zeugnis/pdf`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: zeugnis.text }), credentials: "include" });
    if (!r.ok) { toast({ title: "PDF fehlgeschlagen", description: await r.text(), variant: "destructive" }); return; }
    const blob = await r.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `Arbeitszeugnis_${data?.mitarbeiter.name ?? "Entwurf"}.pdf`; a.click(); URL.revokeObjectURL(url);
  }

  const gruppen = ["vorher", "austrittstag", "danach"];
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={zurueck}><ChevronLeft className="h-4 w-4 mr-1" /> Übersicht</Button>
        <div><h1 className="text-xl font-semibold">{data?.mitarbeiter.name ?? "…"}</h1><p className="text-sm text-muted-foreground">Austritt {fmtD(data?.mitarbeiter.endDate ?? null)}{data?.mitarbeiter.austrittsgrund ? ` · ${data.mitarbeiter.austrittsgrund}` : ""}</p></div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={entwurf.isPending} onClick={() => entwurf.mutate()}>{entwurf.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Zeugnis-Entwurf</Button>
          {data && !data.angelegt && <Button size="sm" disabled={anlegen.isPending} onClick={() => anlegen.mutate()}>Liste anlegen</Button>}
        </div>
      </div>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}

      {data && (
        <Card className="border-muted"><CardContent className="p-3 text-sm grid gap-2 sm:grid-cols-4">
          <B label="Benutzerkonto" wert={data.befund.userId == null ? "keins verknüpft" : data.befund.kontoAktiv ? "AKTIV" : "gesperrt"} warn={Boolean(data.befund.kontoAktiv) && Boolean(data.mitarbeiter.endDate && data.mitarbeiter.endDate < new Date().toISOString().slice(0, 10))} />
          <B label="Kalenderverbindungen" wert={String(data.befund.kalenderAktiv)} warn={data.befund.kalenderAktiv > 0} />
          <B label="Im Anfrage-Verteiler" wert={data.befund.imVerteiler ? "ja" : "nein"} warn={data.befund.imVerteiler} />
          <B label="Betreute Objekte" wert={String(data.befund.betreuteObjekte.length)} warn={data.befund.betreuteObjekte.length > 0} zusatz={data.befund.betreuteObjekte.slice(0, 3).map((o) => o.name).join(", ") + (data.befund.betreuteObjekte.length > 3 ? " …" : "")} />
        </CardContent></Card>
      )}

      {zeugnisOffen && zeugnis && (
        <Card className="border-primary/40"><CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between"><div className="font-medium text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> Zeugnis-Entwurf {zeugnis.note != null && <Badge variant="outline" className="font-normal">Ø Beurteilung {String(zeugnis.note).replace(".", ",")} / 5</Badge>}</div><Button size="sm" variant="ghost" onClick={() => setZeugnisOffen(false)}><X className="h-4 w-4" /></Button></div>
          {zeugnis.hinweise.length > 0 && <div className="rounded bg-amber-500/10 border border-amber-500/30 p-2 text-xs space-y-1">{zeugnis.hinweise.map((h, i) => <div key={i}>• {h}</div>)}</div>}
          <p className="text-xs text-muted-foreground">Entwurf aus den Beurteilungen — redigieren, dann als PDF. Kein Zeugnis verlässt das Haus ungelesen.</p>
          <Textarea rows={16} value={zeugnis.text} onChange={(e) => setZeugnis({ ...zeugnis, text: e.target.value })} className="font-serif text-sm" />
          <div className="flex justify-end"><Button size="sm" onClick={zeugnisPdf}><FileDown className="h-4 w-4 mr-1" /> Als PDF (Entwurf)</Button></div>
        </CardContent></Card>
      )}

      {data?.angelegt && gruppen.map((g) => (
        <div key={g} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{WANN[g]}</h2>
          {data.schritte.filter((s) => s.wann === g).map((s) => (
            <Card key={s.schluessel} className={cn(s.status === "erledigt" && "opacity-70", s.status === "entfaellt" && "opacity-50")}>
              <CardContent className="p-3 flex flex-wrap items-start justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium flex items-center gap-2">
                    {s.status === "erledigt" ? <Check className="h-4 w-4 text-emerald-600" /> : s.status === "entfaellt" ? <X className="h-4 w-4 text-muted-foreground" /> : <span className="h-4 w-4 rounded-full border inline-block" />}
                    {s.titel}
                    {s.automatisch && <Badge variant="outline" className="font-normal">per Klick</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground pl-6">{s.beschreibung}</div>
                  {s.ergebnis && <div className="text-xs pl-6 mt-0.5">→ {s.ergebnis}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {s.status === "offen" && s.automatisch && <Button size="sm" disabled={schritt.isPending} onClick={() => { if (confirm(`${s.titel} jetzt ausführen?`)) schritt.mutate({ s: s.schluessel, aktion: "ausfuehren" }); }}><Play className="h-3.5 w-3.5 mr-1" /> Ausführen</Button>}
                  {s.status === "offen" && <Button size="sm" variant="outline" disabled={schritt.isPending} onClick={() => schritt.mutate({ s: s.schluessel, aktion: "erledigt" })}><Check className="h-3.5 w-3.5 mr-1" /> Erledigt</Button>}
                  {s.status === "offen" && <Button size="sm" variant="ghost" disabled={schritt.isPending} onClick={() => schritt.mutate({ s: s.schluessel, aktion: "entfaellt" })}>Entfällt</Button>}
                  {s.status !== "offen" && <Button size="sm" variant="ghost" disabled={schritt.isPending} onClick={() => schritt.mutate({ s: s.schluessel, aktion: "oeffnen" })}><RotateCcw className="h-3.5 w-3.5" /></Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
      {data && !data.angelegt && <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">{data.mitarbeiter.endDate ? "Liste noch nicht angelegt — der Tageslauf legt sie 60 Tage vor dem Austritt an, oder oben per Klick." : "Kein Austrittsdatum am Mitarbeiter — erst dort eintragen."}</CardContent></Card>}
    </div>
  );
}

function B({ label, wert, warn, zusatz }: { label: string; wert: string; warn?: boolean; zusatz?: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className={cn("font-medium", warn && "text-amber-700")}>{wert}</div>{zusatz && <div className="text-xs text-muted-foreground truncate">{zusatz}</div>}</div>;
}
