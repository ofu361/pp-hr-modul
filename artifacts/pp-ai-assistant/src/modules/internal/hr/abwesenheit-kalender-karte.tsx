// © 2026 P&P Group. Proprietary & Confidential.
// Karte in der Abwesenheiten-Maske: Stand der Kalenderanbindung (0431),
// Teamkalender festlegen, Fehler nachholen.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, RefreshCw, Loader2, AlertTriangle } from "lucide-react";

interface Verbindung { id: number; provider: string; konto: string | null; kalenderName: string | null; modus: string; aktiv: boolean; abwesenheitskalender: boolean }
interface Stand {
  teamkalender: Verbindung | null; kandidaten: Verbindung[];
  mitarbeiter: { aktive: number; ohneKonto: number; mitEigenemKalender: number };
  abwesenheiten: {
    genehmigt: number; imKalender: number;
    mitFehler: { id: number; name: string; type: string; startDate: string; endDate: string; fehler: string }[];
    ohneEintrag: { id: number; name: string; type: string; startDate: string; endDate: string }[];
  };
}
const fmt = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" });

export function AbwesenheitKalenderKarte() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const perms = usePermissions();
  const canWrite = perms.role === "admin" || perms.role === "manager";
  const { data, isLoading } = useQuery<Stand>({ queryKey: ["hr-abwesenheit-kalender"], queryFn: () => apiFetch("/api/hr/abwesenheiten/kalender"), staleTime: 30_000 });
  const neu = () => qc.invalidateQueries({ queryKey: ["hr-abwesenheit-kalender"] });

  const team = useMutation({
    mutationFn: (verbindungId: number | null) => apiFetch("/api/hr/abwesenheiten/kalender/team", { method: "PUT", body: JSON.stringify({ verbindungId }) }),
    onSuccess: () => { neu(); toast({ title: "Teamkalender gesetzt ✓" }); },
    onError: (e: any) => toast({ title: "Nicht gesetzt", description: String(e?.message ?? e), variant: "destructive" }),
  });
  const nachholen = useMutation({
    mutationFn: () => apiFetch<{ geprueft: number; fehler: number }>("/api/hr/abwesenheiten/kalender/nachholen", { method: "POST", body: "{}" }),
    onSuccess: (r) => { neu(); toast({ title: `${r.geprueft} geprüft, ${r.fehler} weiterhin mit Fehler` }); },
  });

  if (isLoading || !data) return null;
  const offen = data.abwesenheiten.mitFehler.length + data.abwesenheiten.ohneEintrag.length;

  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium"><CalendarCheck className="h-4 w-4" /> Abwesenheiten im Kalender</div>
        {canWrite && offen > 0 && (
          <Button size="sm" variant="outline" disabled={nachholen.isPending} onClick={() => nachholen.mutate()}>
            {nachholen.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Nachholen ({offen})
          </Button>
        )}
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-muted-foreground">Teamkalender</div>
          {data.teamkalender
            ? <div>{data.teamkalender.kalenderName ?? data.teamkalender.konto} <Badge variant="outline" className="font-normal ml-1">{data.teamkalender.provider === "microsoft" ? "Outlook" : "Google"}</Badge></div>
            : <div className="text-muted-foreground">nicht festgelegt</div>}
          {canWrite && (
            <select className="mt-1 h-8 rounded-md border bg-background px-2 text-xs w-full" value={data.teamkalender?.id ?? ""} onChange={(e) => team.mutate(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— kein Teamkalender —</option>
              {data.kandidaten.map((k) => <option key={k.id} value={k.id}>{k.kalenderName ?? k.konto} ({k.provider})</option>)}
            </select>
          )}
          {data.kandidaten.length === 0 && <div className="text-xs text-muted-foreground mt-1">Keine Firmenverbindung vorhanden — unter Integrationen › Kalender anlegen (Modus „Firma").</div>}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Eigene Kalender</div>
          <div><strong>{data.mitarbeiter.mitEigenemKalender}</strong> von {data.mitarbeiter.aktive} Mitarbeitern verbunden</div>
          {data.mitarbeiter.ohneKonto > 0 && <div className="text-xs text-muted-foreground">{data.mitarbeiter.ohneKonto} ohne Benutzerkonto — für sie gibt es keinen eigenen Kalender.</div>}
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Genehmigte Abwesenheiten (ab heute)</div>
          <div><strong>{data.abwesenheiten.imKalender}</strong> von {data.abwesenheiten.genehmigt} im Kalender</div>
        </div>
      </div>

      {data.abwesenheiten.mitFehler.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs space-y-1">
          <div className="flex items-center gap-1 font-medium text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> Nicht geschrieben — die Genehmigung gilt trotzdem</div>
          {data.abwesenheiten.mitFehler.slice(0, 5).map((f) => (
            <div key={f.id}>{f.name}, {fmt(f.startDate)}–{fmt(f.endDate)}: <span className="text-muted-foreground">{f.fehler}</span></div>
          ))}
          {data.abwesenheiten.mitFehler.length > 5 && <div className="text-muted-foreground">… und {data.abwesenheiten.mitFehler.length - 5} weitere</div>}
        </div>
      )}
      {data.abwesenheiten.ohneEintrag.length > 0 && !data.teamkalender && data.mitarbeiter.mitEigenemKalender === 0 && (
        <div className="text-xs text-muted-foreground">{data.abwesenheiten.ohneEintrag.length} genehmigte Abwesenheiten ohne Kalendereintrag — es gibt noch kein Ziel: weder Teamkalender noch verbundene eigene Kalender.</div>
      )}
    </CardContent></Card>
  );
}
