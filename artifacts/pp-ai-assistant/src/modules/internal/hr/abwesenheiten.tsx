// © 2026 P&P Group. Proprietary & Confidential.
// HR — Erweitertes Abwesenheitsmanagement (Bradford-Faktor, Statistiken, alle Typen)
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, AlertTriangle, Calendar, Users } from "lucide-react";
import { AbwesenheitKalenderKarte } from "./abwesenheit-kalender-karte";
import { BemKarte } from "./bem-karte";

interface BradfordEntry {
  mitarbeiterId: number; name: string;
  bradfordScore: number; krankEpisoden: number; krankTage: number;
  byType: Record<string, number>;
}

const TYPE_LABELS: Record<string, string> = {
  urlaub: "Urlaub", krank: "Krank", sonderurlaub: "Sonderurlaub",
  überstunden: "Überstunden", homeoffice: "Homeoffice",
  elternzeit: "Elternzeit", pflegezeit: "Pflegezeit",
};
const TYPE_COLORS: Record<string, string> = {
  urlaub: "bg-blue-100 text-blue-700", krank: "bg-orange-100 text-orange-700",
  sonderurlaub: "bg-[#1E4068]/10 text-[#1E4068]", überstunden: "bg-muted text-muted-foreground",
  homeoffice: "bg-teal-100 text-teal-700", elternzeit: "bg-pink-100 text-pink-700",
  pflegezeit: "bg-violet-100 text-violet-700",
};

function bradfordRisk(score: number): { label: string; color: string } {
  if (score >= 900) return { label: "Kritisch", color: "text-red-600" };
  if (score >= 441) return { label: "Hoch",     color: "text-orange-500" };
  if (score >= 100) return { label: "Mittel",   color: "text-amber-500" };
  return { label: "Niedrig", color: "text-green-600" };
}

export default function AbwesenheitenPage() {
  const [view, setView] = useState<"bradford" | "overview">("bradford");

  const { data: stats = [], isLoading } = useQuery<BradfordEntry[]>({
    queryKey: ["hr-abwesenheits-statistik"],
    queryFn: () => apiFetch<BradfordEntry[]>("/api/hr/abwesenheits-statistik"),
    staleTime: 60_000,
  });

  const maxScore = Math.max(1, ...stats.map(s => s.bradfordScore));

  const totalByType: Record<string, number> = {};
  for (const s of stats) {
    for (const [t, d] of Object.entries(s.byType)) {
      totalByType[t] = (totalByType[t] ?? 0) + d;
    }
  }
  const totalDays = Object.values(totalByType).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <Calendar className="w-6 h-6" /> Abwesenheitsmanagement
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Laufendes Kalenderjahr</p>
        </div>
      </div>

      {/* Kalenderanbindung (0431) */}
      <AbwesenheitKalenderKarte />
      {/* BEM-Pflicht (0436) — Gesundheitsdatum, nur manage_hr */}
      <BemKarte />

      {/* KPI-Kacheln */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Mitarbeiter</p>
            <p className="text-2xl font-bold text-[#1E4068]">{stats.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Gesamttage</p>
            <p className="text-2xl font-bold">{totalDays}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Krankheitstage</p>
            <p className="text-2xl font-bold text-orange-500">{totalByType.krank ?? 0}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Bradford ≥ 441</p>
            <p className="text-2xl font-bold text-red-500">{stats.filter(s => s.bradfordScore >= 441).length}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["bradford", "overview"] as const).map(t => (
          <button key={t} onClick={() => setView(t)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              view === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "bradford" ? "Bradford-Faktor" : "Typ-Übersicht"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : view === "bradford" ? (
        <div className="space-y-2">
          <Card className="mb-3 border-amber-200 bg-amber-50/50">
            <CardContent className="p-3 text-xs text-amber-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><strong>Bradford-Formel: B = S² × D</strong> (S = Krankheits­episoden, D = Krankheitstage im laufenden Jahr). Werte ≥ 441 gelten als Gesprächsanlass.</span>
            </CardContent>
          </Card>
          {stats.map((s, i) => {
            const risk = bradfordRisk(s.bradfordScore);
            return (
              <Card key={s.mitarbeiterId} className="hover:shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{s.name}</span>
                        <span className={cn("text-xs font-bold", risk.color)}>{risk.label}</span>
                        {s.bradfordScore >= 441 && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {s.krankEpisoden} Episode{s.krankEpisoden !== 1 ? "n" : ""} · {s.krankTage} Tage krank
                      </div>
                      <div className="mt-2">
                        <Progress value={(s.bradfordScore / maxScore) * 100} className="h-1.5" />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold" style={{ color: s.bradfordScore >= 441 ? "#DC2626" : "#1E4068" }}>{s.bradfordScore}</div>
                      <div className="text-xs text-muted-foreground">Bradford</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {stats.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Keine genehmigten Abwesenheiten im laufenden Jahr</p>
            </CardContent></Card>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Card><CardContent className="p-4">
            <h3 className="font-semibold mb-3 text-sm">Tage je Abwesenheitsart</h3>
            <div className="space-y-3">
              {Object.entries(totalByType).sort((a, b) => b[1] - a[1]).map(([type, days]) => (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-xs px-2 py-0.5 rounded font-medium", TYPE_COLORS[type] ?? "bg-muted text-muted-foreground")}>
                      {TYPE_LABELS[type] ?? type}
                    </span>
                    <span className="text-sm font-semibold">{days} Tage</span>
                  </div>
                  <Progress value={(days / totalDays) * 100} className="h-1.5" />
                </div>
              ))}
              {Object.keys(totalByType).length === 0 && <p className="text-sm text-muted-foreground">Keine Daten</p>}
            </div>
          </CardContent></Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {stats.filter(s => Object.keys(s.byType).length > 0).map(s => (
              <Card key={s.mitarbeiterId} className="hover:shadow-sm">
                <CardContent className="p-3">
                  <div className="font-medium text-sm mb-2">{s.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(s.byType).map(([t, d]) => (
                      <Badge key={t} className={cn("text-xs border-0", TYPE_COLORS[t] ?? "bg-muted text-muted-foreground")}>
                        {TYPE_LABELS[t] ?? t}: {d}d
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
