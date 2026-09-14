// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Persönlichkeitsprofile: Teamübersicht, Profil je Mitarbeiter,
// KI-Entwurf aus Beurteilungen. Nur für Rollen mit manage_hr.
//
// Die Einwilligung ist in der Maske kein Häkchen, sondern ein Datum — ein
// Datum muss man nachschlagen, ein Häkchen setzt man aus Gewohnheit.
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
import { Brain, Users, ShieldAlert, Sparkles, Loader2, ChevronLeft, Plus, Trash2 } from "lucide-react";

interface Profil {
  id: number; mitarbeiterId: number; methode: string; dimensionen: Record<string, number>;
  staerken: string[]; entwicklungsfelder: string[]; arbeitsstil: string | null; teamrolle: string | null;
  quelle: string; erhobenAm: string; einwilligungAm: string; sichtbarFuer: string; notiz: string;
}
interface Team {
  stichtag: string; abdeckung: { aktive: number; mitProfil: number };
  abteilungen: { abteilung: string; mitarbeiter: number; mitProfil: number; teamrollen: Record<string, number>;
    dimensionenSchnitt: Record<string, number>; haeufigeStaerken: { staerke: string; anzahl: number }[] }[];
}
interface Mitarbeiter { id: number; name: string; jobTitle: string; abteilung?: string }
interface Entwurf {
  staerken: string[]; entwicklungsfelder: string[]; arbeitsstil: string; teamrolle: string;
  belege: { zitat: string; belegt: boolean }[]; hinweise: string[];
  grundlage: { beurteilungen: number; zeitraeume: string[] }; modell: string;
}

const METHODE: Record<string, string> = { disg: "DISG", big_five: "Big Five", staerken: "Stärkenprofil", frei: "Frei" };
const QUELLE: Record<string, string> = { selbsteinschaetzung: "Selbsteinschätzung", fremdeinschaetzung: "Fremdeinschätzung", test: "Testverfahren", ki_entwurf: "KI-Entwurf" };
const SICHTBAR: Record<string, string> = { hr: "nur HR", fuehrungskraft: "HR + Führungskraft", selbst: "HR + Führungskraft + Mitarbeiter" };
const DIM_LABEL: Record<string, string> = {
  dominant: "Dominant", initiativ: "Initiativ", stetig: "Stetig", gewissenhaft: "Gewissenhaft",
  offenheit: "Offenheit", gewissenhaftigkeit: "Gewissenhaftigkeit", extraversion: "Extraversion", vertraeglichkeit: "Verträglichkeit", neurotizismus: "Emotionale Labilität",
};
const fmtDatum = (s: string | null) => s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" }) : "—";

export default function PersoenlichkeitPage() {
  const perms = usePermissions();
  const canView = perms.role === "admin" || perms.role === "manager";
  const [maId, setMaId] = useState<number | null>(null);
  if (!canView) return <NoAccess />;
  return maId == null ? <TeamUebersicht onWaehle={setMaId} /> : <MitarbeiterProfil mitarbeiterId={maId} zurueck={() => setMaId(null)} />;
}

function TeamUebersicht({ onWaehle }: { onWaehle: (id: number) => void }) {
  const { data, isLoading } = useQuery<Team>({ queryKey: ["hr-persoenlichkeit-team"], queryFn: () => apiFetch("/api/hr/persoenlichkeit/team"), staleTime: 30_000 });
  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({ queryKey: ["hr-mitarbeiter"], queryFn: () => apiFetch("/api/hr/mitarbeiter"), staleTime: 30_000 });
  const [suche, setSuche] = useState("");
  const gefiltert = useMemo(() => mitarbeiter.filter((m) => m.name.toLowerCase().includes(suche.toLowerCase())).slice(0, 15), [mitarbeiter, suche]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Brain className="h-6 w-6" /> Persönlichkeit &amp; Teamrollen</h1>
        <p className="text-sm text-muted-foreground">Arbeitsstil, Stärken und Rollen — nur mit dokumentierter Einwilligung, sichtbar standardmäßig nur für HR.</p>
      </div>
      <Card className="border-muted"><CardContent className="p-3 text-xs text-muted-foreground flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Keine Angaben zu Gesundheit, Religion, Herkunft, Familie oder Sexualität (Art. 9 DSGVO) — die Maske weist solche Texte ab. Fragebögen an Mitarbeiter brauchen die Beteiligung des Betriebsrats (§ 94 BetrVG).</span>
      </CardContent></Card>

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}
      {data && (
        <>
          <Card><CardContent className="p-4 flex items-center gap-3 text-sm">
            <Users className="h-4 w-4" /> <strong>{data.abdeckung.mitProfil}</strong> von {data.abdeckung.aktive} aktiven Mitarbeitern haben ein Profil.
          </CardContent></Card>
          <div className="grid gap-3 md:grid-cols-2">
            {data.abteilungen.map((a) => (
              <Card key={a.abteilung}><CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.abteilung}</span>
                  <span className="text-xs text-muted-foreground">{a.mitProfil} / {a.mitarbeiter} mit Profil</span>
                </div>
                {Object.keys(a.teamrollen).length > 0 && (
                  <div className="flex flex-wrap gap-1">{Object.entries(a.teamrollen).map(([r, n]) => <Badge key={r} variant="secondary" className="font-normal">{r} ×{n}</Badge>)}</div>
                )}
                {a.haeufigeStaerken.length > 0 && (
                  <div className="text-xs text-muted-foreground">Stärken im Team: {a.haeufigeStaerken.map((s) => `${s.staerke}${s.anzahl > 1 ? ` (${s.anzahl})` : ""}`).join(" · ")}</div>
                )}
                {Object.keys(a.dimensionenSchnitt).length > 0 && (
                  <div className="space-y-1 pt-1">
                    {Object.entries(a.dimensionenSchnitt).map(([k, v]) => {
                      const [, dim] = k.split(".");
                      return <Balken key={k} label={`${DIM_LABEL[dim ?? ""] ?? dim} (Ø)`} wert={v} />;
                    })}
                  </div>
                )}
                {a.mitProfil === 0 && <div className="text-xs text-muted-foreground">Noch keine Profile.</div>}
              </CardContent></Card>
            ))}
          </div>
        </>
      )}

      <Card><CardContent className="p-4 space-y-2">
        <Label className="text-xs">Mitarbeiter öffnen</Label>
        <Input placeholder="Name suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <div className="flex flex-wrap gap-1">{gefiltert.map((m) => <Button key={m.id} size="sm" variant="ghost" className="h-7" onClick={() => onWaehle(m.id)}>{m.name}</Button>)}</div>
      </CardContent></Card>
    </div>
  );
}

function MitarbeiterProfil({ mitarbeiterId, zurueck }: { mitarbeiterId: number; zurueck: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: ma } = useQuery<Mitarbeiter>({ queryKey: ["hr-mitarbeiter", mitarbeiterId], queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}`) });
  const { data, isLoading } = useQuery<{ profile: Profil[]; dimensionen: Record<string, string[]> }>({
    queryKey: ["hr-persoenlichkeit", mitarbeiterId], queryFn: () => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/persoenlichkeit`),
  });
  const [neu, setNeu] = useState(false);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const invalidiere = () => { qc.invalidateQueries({ queryKey: ["hr-persoenlichkeit", mitarbeiterId] }); qc.invalidateQueries({ queryKey: ["hr-persoenlichkeit-team"] }); };

  const anlegen = useMutation({
    mutationFn: (b: Record<string, unknown>) => apiFetch(`/api/hr/mitarbeiter/${mitarbeiterId}/persoenlichkeit`, { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { invalidiere(); setNeu(false); setEntwurf(null); toast({ title: "Profil angelegt ✓" }); },
    onError: (e: any) => toast({ title: "Nicht angelegt", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const loeschen = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/persoenlichkeit/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidiere(); toast({ title: "Profil gelöscht" }); },
  });
  const entwurfHolen = useMutation({
    mutationFn: () => apiFetch<Entwurf>(`/api/hr/mitarbeiter/${mitarbeiterId}/persoenlichkeit/entwurf`, { method: "POST", body: "{}" }),
    onSuccess: (e) => { setEntwurf(e); setNeu(true); },
    onError: (e: any) => toast({ title: "Kein Entwurf", description: String(e?.message ?? e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={zurueck}><ChevronLeft className="h-4 w-4 mr-1" /> Übersicht</Button>
        <div><h1 className="text-xl font-semibold">{ma?.name ?? "…"}</h1><p className="text-sm text-muted-foreground">{ma?.jobTitle}{ma?.abteilung ? ` · ${ma.abteilung}` : ""}</p></div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={entwurfHolen.isPending} onClick={() => entwurfHolen.mutate()}>{entwurfHolen.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Entwurf aus Beurteilungen</Button>
          {!neu && <Button size="sm" onClick={() => setNeu(true)}><Plus className="h-4 w-4 mr-1" /> Profil erfassen</Button>}
        </div>
      </div>

      {neu && data && <ProfilFormular dimensionen={data.dimensionen} entwurf={entwurf} onAbbrechen={() => { setNeu(false); setEntwurf(null); }} onSpeichern={(b) => anlegen.mutate(b)} laeuft={anlegen.isPending} />}

      {isLoading && <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …</div>}
      {data && data.profile.length === 0 && !neu && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Noch kein Profil.</CardContent></Card>}
      {data?.profile.map((p, i) => (
        <Card key={p.id} className={i > 0 ? "opacity-70" : undefined}><CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{METHODE[p.methode] ?? p.methode}</span>
              <Badge variant="outline" className="font-normal">{QUELLE[p.quelle] ?? p.quelle}</Badge>
              {p.teamrolle && <Badge variant="secondary" className="font-normal">{p.teamrolle}</Badge>}
              {i === 0 && <Badge className="font-normal">aktuell</Badge>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              erhoben {fmtDatum(p.erhobenAm)} · Einwilligung {fmtDatum(p.einwilligungAm)} · {SICHTBAR[p.sichtbarFuer]}
              <Button size="sm" variant="ghost" className="h-7" onClick={() => { if (confirm("Profil löschen?")) loeschen.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          {Object.keys(p.dimensionen).length > 0 && (
            <div className="grid gap-1 sm:grid-cols-2">{Object.entries(p.dimensionen).map(([k, v]) => <Balken key={k} label={DIM_LABEL[k] ?? k} wert={v} />)}</div>
          )}
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><div className="text-xs text-muted-foreground">Stärken</div><div className="flex flex-wrap gap-1 mt-1">{p.staerken.length ? p.staerken.map((s) => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>) : "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Entwicklungsfelder</div><div className="flex flex-wrap gap-1 mt-1">{p.entwicklungsfelder.length ? p.entwicklungsfelder.map((s) => <Badge key={s} variant="outline" className="font-normal">{s}</Badge>) : "—"}</div></div>
          </div>
          {p.arbeitsstil && <div className="text-sm"><div className="text-xs text-muted-foreground">Arbeitsstil</div>{p.arbeitsstil}</div>}
          {p.notiz && <div className="text-xs text-muted-foreground">{p.notiz}</div>}
        </CardContent></Card>
      ))}
    </div>
  );
}

function ProfilFormular({ dimensionen, entwurf, onAbbrechen, onSpeichern, laeuft }: {
  dimensionen: Record<string, string[]>; entwurf: Entwurf | null; onAbbrechen: () => void; onSpeichern: (b: Record<string, unknown>) => void; laeuft: boolean;
}) {
  const heute = new Date().toISOString().slice(0, 10);
  const [methode, setMethode] = useState(entwurf ? "frei" : "disg");
  const [quelle, setQuelle] = useState(entwurf ? "ki_entwurf" : "selbsteinschaetzung");
  const [erhobenAm, setErhobenAm] = useState(heute);
  const [einwilligungAm, setEinwilligungAm] = useState("");
  const [sichtbar, setSichtbar] = useState("hr");
  const [dims, setDims] = useState<Record<string, number>>({});
  const [staerken, setStaerken] = useState((entwurf?.staerken ?? []).join(", "));
  const [felder, setFelder] = useState((entwurf?.entwicklungsfelder ?? []).join(", "));
  const [arbeitsstil, setArbeitsstil] = useState(entwurf?.arbeitsstil ?? "");
  const [teamrolle, setTeamrolle] = useState(entwurf?.teamrolle ?? "");
  const [notiz, setNotiz] = useState("");
  const keys = dimensionen[methode] ?? [];

  return (
    <Card className="border-primary/40"><CardContent className="p-4 space-y-4">
      {entwurf && (
        <div className="rounded border border-sky-500/30 bg-sky-500/5 p-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-medium"><Sparkles className="h-3.5 w-3.5" /> KI-Entwurf aus {entwurf.grundlage.beurteilungen} Beurteilung(en) — vorausgefüllt, nichts gespeichert.</div>
          {entwurf.hinweise.map((h, i) => <div key={i}>• {h}</div>)}
          {entwurf.belege.length > 0 && <div className="pt-1 space-y-0.5">{entwurf.belege.map((b, i) => <div key={i} className={cn("italic", !b.belegt && "text-red-700")}>„{b.zitat}"{!b.belegt && " — so nicht in den Beurteilungen"}</div>)}</div>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <F label="Methode"><Sel value={methode} onChange={(v) => { setMethode(v); setDims({}); }} o={METHODE} /></F>
        <F label="Quelle"><Sel value={quelle} onChange={setQuelle} o={QUELLE} /></F>
        <F label="Erhoben am"><Input type="date" value={erhobenAm} onChange={(e) => setErhobenAm(e.target.value)} /></F>
        <F label="Einwilligung am (Pflicht)"><Input type="date" value={einwilligungAm} onChange={(e) => setEinwilligungAm(e.target.value)} className={!einwilligungAm ? "border-amber-500" : undefined} /></F>
        <F label="Sichtbar für"><Sel value={sichtbar} onChange={setSichtbar} o={SICHTBAR} /></F>
      </div>
      {keys.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {keys.map((k) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-xs"><span>{DIM_LABEL[k] ?? k}</span><span className="text-muted-foreground">{dims[k] ?? 50}</span></div>
              <input type="range" min={0} max={100} value={dims[k] ?? 50} onChange={(e) => setDims((d) => ({ ...d, [k]: Number(e.target.value) }))} className="w-full" />
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Stärken (Komma-getrennt)"><Input value={staerken} onChange={(e) => setStaerken(e.target.value)} placeholder="Struktur, Verlässlichkeit" /></F>
        <F label="Entwicklungsfelder"><Input value={felder} onChange={(e) => setFelder(e.target.value)} placeholder="Delegieren" /></F>
        <F label="Teamrolle"><Input value={teamrolle} onChange={(e) => setTeamrolle(e.target.value)} placeholder="Umsetzer, Koordinator, Ideengeber …" /></F>
        <F label="Notiz"><Input value={notiz} onChange={(e) => setNotiz(e.target.value)} /></F>
      </div>
      <F label="Arbeitsstil"><Textarea rows={3} value={arbeitsstil} onChange={(e) => setArbeitsstil(e.target.value)} /></F>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onAbbrechen}>Abbrechen</Button>
        <Button disabled={laeuft || !einwilligungAm} onClick={() => onSpeichern({
          methode, quelle, erhobenAm, einwilligungAm, sichtbarFuer: sichtbar,
          dimensionen: keys.length ? Object.fromEntries(keys.map((k) => [k, dims[k] ?? 50])) : {},
          staerken: staerken.split(",").map((s) => s.trim()).filter(Boolean),
          entwicklungsfelder: felder.split(",").map((s) => s.trim()).filter(Boolean),
          arbeitsstil: arbeitsstil || null, teamrolle: teamrolle || null, notiz,
        })}>{laeuft && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Anlegen</Button>
      </div>
    </CardContent></Card>
  );
}

function Balken({ label, wert }: { label: string; wert: number }) {
  return (
    <div className="text-xs">
      <div className="flex justify-between"><span>{label}</span><span className="text-muted-foreground">{wert}</span></div>
      <div className="h-1.5 rounded bg-muted mt-0.5"><div className="h-1.5 rounded bg-primary" style={{ width: `${Math.max(0, Math.min(100, wert))}%` }} /></div>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>; }
function Sel({ value, onChange, o }: { value: string; onChange: (v: string) => void; o: Record<string, string> }) {
  return <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>{Object.entries(o).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
}
