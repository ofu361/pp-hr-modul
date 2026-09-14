// © 2026 P&P Group. Proprietary & Confidential.
// HR — Mitarbeiter Self-Service (eigene Daten, Schichten, Urlaub, Ziele)
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, User, Calendar, Clock, GraduationCap, Target, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SelfServiceData {
  mitarbeiter: {
    id: number; name: string; jobTitle: string; abteilung?: string;
    employmentType: string; startDate: string; weeklyHours?: number;
    urlaubstageProJahr: number;
  };
  urlaube: Array<{ id: number; type: string; startDate: string; endDate: string; days: number; status: string; }>;
  schichten: Array<{ id: number; date: string; startTime: string; endTime: string; shiftType: string; status: string; }>;
  qualifikationen: Array<{ id: number; qualifikationName?: string; ablaufdatum?: string; status: string; }>;
  ziele: Array<{ id: number; title: string; status: string; progressPct: number; targetDate?: string; }>;
  urlaubsgenommen: number;
}

const TYPE_LABELS: Record<string, string> = {
  urlaub: "Urlaub", krank: "Krankmeldung", sonderurlaub: "Sonderurlaub",
  überstunden: "Überstunden", homeoffice: "Homeoffice",
};
const STATUS_BADGE: Record<string, string> = {
  ausstehend: "bg-amber-100 text-amber-700",
  genehmigt:  "bg-green-100 text-green-700",
  abgelehnt:  "bg-red-100 text-red-700",
};
const SHIFT_LABELS: Record<string, string> = {
  normal: "Normal", frueh: "Früh", spaet: "Spät",
  nacht: "Nacht", bereitschaft: "Bereitschaft", homeoffice: "Homeoffice",
};
const GOAL_STATUS_STYLE: Record<string, string> = {
  "offen": "bg-muted text-muted-foreground",
  "in-bearbeitung": "bg-blue-100 text-blue-700",
  "erreicht": "bg-green-100 text-green-700",
  "nicht-erreicht": "bg-red-100 text-red-700",
};

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export default function SelfServicePage() {
  const { data, isLoading, error } = useQuery<SelfServiceData>({
    queryKey: ["hr-self-service"],
    queryFn: () => apiFetch<SelfServiceData>("/api/hr/self-service"),
    staleTime: 30_000,
    retry: false,
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (error || !data) {
    return (
      <Card><CardContent className="py-14 text-center text-muted-foreground">
        <User className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="font-medium">Kein Mitarbeiterprofil verknüpft</p>
        <p className="text-sm mt-1">Bitte einen Administrator bitten, Ihr Benutzerkonto mit einem Mitarbeiterprofil zu verbinden.</p>
      </CardContent></Card>
    );
  }

  const { mitarbeiter: ma, urlaube, schichten, qualifikationen, ziele, urlaubsgenommen } = data;
  const urlaubsrest = ma.urlaubstageProJahr - urlaubsgenommen;
  const recentUrlaube = [...urlaube].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 5);
  const expiringQuals = qualifikationen.filter(q => { const d = daysUntil(q.ablaufdatum ?? undefined); return d !== null && d <= 60; });

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-[#1E4068] flex items-center justify-center text-white text-xl font-bold shrink-0">
          {ma.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E4068" }}>{ma.name}</h1>
          <p className="text-muted-foreground text-sm">{ma.jobTitle}{ma.abteilung ? ` · ${ma.abteilung}` : ""}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ma.employmentType} · seit {new Date(ma.startDate).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
            {ma.weeklyHours ? ` · ${ma.weeklyHours}h/Woche` : ""}
          </p>
        </div>
      </div>

      {expiringQuals.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-3 flex items-center gap-2 text-amber-700 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{expiringQuals.length} Qualifikation{expiringQuals.length > 1 ? "en laufen" : " läuft"} demnächst ab: {expiringQuals.map(q => q.qualifikationName).join(", ")}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Urlaubskonto */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Urlaubskonto</span>
            </div>
            <div className="text-3xl font-bold" style={{ color: "#1E4068" }}>{urlaubsrest}</div>
            <div className="text-xs text-muted-foreground mt-0.5">von {ma.urlaubstageProJahr} Tagen verfügbar</div>
            <Progress value={(urlaubsgenommen / ma.urlaubstageProJahr) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        {/* Nächste Schichten */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nächste Schichten</span>
            </div>
            {schichten.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine geplant</p>
            ) : (
              <div className="space-y-1.5">
                {schichten.slice(0, 3).map(s => (
                  <div key={s.id} className="text-xs">
                    <span className="font-medium">{new Date(s.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" })}</span>
                    <span className="text-muted-foreground ml-2">{s.startTime}–{s.endTime} · {SHIFT_LABELS[s.shiftType] ?? s.shiftType}</span>
                  </div>
                ))}
                {schichten.length > 3 && <p className="text-xs text-muted-foreground">+{schichten.length - 3} weitere</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Qualifikationen */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Qualifikationen</span>
            </div>
            {qualifikationen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine hinterlegt</p>
            ) : (
              <div className="space-y-1">
                {qualifikationen.slice(0, 4).map(q => {
                  const days = daysUntil(q.ablaufdatum ?? undefined);
                  const expired = days !== null && days < 0;
                  const expiring = !expired && days !== null && days <= 60;
                  return (
                    <div key={q.id} className="flex items-center gap-1.5 text-xs">
                      {expired ? <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                        : expiring ? <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        : <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
                      <span className={cn(expired ? "text-red-600" : expiring ? "text-amber-600" : "")}>
                        {q.qualifikationName ?? `#${q.id}`}
                        {days !== null && ` (${expired ? "abgelaufen" : `${days}d`})`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ziele */}
      {ziele.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4" /> Meine Ziele</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {ziele.map(z => (
              <div key={z.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{z.title}</span>
                    <Badge className={cn("text-xs border-0", GOAL_STATUS_STYLE[z.status] ?? "bg-muted")}>{z.status}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{z.progressPct}%</span>
                </div>
                <Progress value={z.progressPct} className="h-1.5" />
                {z.targetDate && <p className="text-xs text-muted-foreground mt-0.5">Zieldatum: {new Date(z.targetDate).toLocaleDateString("de-DE")}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Letzte Abwesenheitsanträge */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Calendar className="w-4 h-4" /> Meine Abwesenheitsanträge</CardTitle></CardHeader>
        <CardContent>
          {recentUrlaube.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Anträge</p>
          ) : (
            <div className="space-y-2">
              {recentUrlaube.map(u => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs border-0 bg-blue-100 text-blue-700">{TYPE_LABELS[u.type] ?? u.type}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(u.startDate).toLocaleDateString("de-DE")} – {new Date(u.endDate).toLocaleDateString("de-DE")}
                      <span className="ml-1">({u.days}d)</span>
                    </span>
                  </div>
                  <Badge className={cn("text-xs border-0", STATUS_BADGE[u.status] ?? "bg-muted text-muted-foreground")}>{u.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
