// © 2026 P&P Group. Proprietary & Confidential.
// Karte in der Abwesenheiten-Maske: BEM-Pflicht (§ 167 Abs. 2 SGB IX, 0436).
// Gesundheitsdatum — nur für manage_hr; die Route gibt anderen 403, die Karte bleibt dann leer.
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HeartPulse, Info } from "lucide-react";

interface Pruefung { mitarbeiterId: number; name: string; jobTitle: string; krankArbeitstage: number; episoden: number; laengsteEpisodeTage: number; pflicht: boolean; restBisSchwelle: number }
interface Bem { stichtag: string; schwelle: number; pflicht: Pruefung[]; naheSchwelle: Pruefung[]; uebrige: number; hinweis: string }

export function BemKarte() {
  const { data } = useQuery<Bem>({ queryKey: ["hr-bem"], queryFn: () => apiFetch("/api/hr/bem"), staleTime: 60_000, retry: false });
  if (!data) return null;
  if (data.pflicht.length === 0 && data.naheSchwelle.length === 0) {
    return <Card className="border-muted"><CardContent className="p-3 text-xs text-muted-foreground flex items-center gap-2"><HeartPulse className="h-4 w-4" /> BEM-Pflicht (§ 167 SGB IX): niemand über {data.schwelle} Krankheitstagen in zwölf Monaten.</CardContent></Card>;
  }
  return (
    <Card className={data.pflicht.length ? "border-red-500/40" : "border-amber-500/40"}><CardContent className="p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 font-medium"><HeartPulse className="h-4 w-4" /> Betriebliches Eingliederungsmanagement (§ 167 Abs. 2 SGB IX)</div>
      {data.pflicht.map((p) => (
        <div key={p.mitarbeiterId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-500/30 bg-red-500/5 p-2">
          <div><span className="font-medium">{p.name}</span> <span className="text-muted-foreground">{p.jobTitle}</span></div>
          <div className="flex items-center gap-2"><Badge variant="outline" className="font-normal bg-red-500/15 text-red-800 border-red-500/40">BEM anbieten</Badge><span className="text-xs">{String(p.krankArbeitstage).replace(".", ",")} Tage · {p.episoden} Episoden</span></div>
        </div>
      ))}
      {data.naheSchwelle.map((p) => (
        <div key={p.mitarbeiterId} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
          <div><span className="font-medium">{p.name}</span> <span className="text-muted-foreground">{p.jobTitle}</span></div>
          <span className="text-xs text-muted-foreground">{String(p.krankArbeitstage).replace(".", ",")} Tage — noch {String(p.restBisSchwelle).replace(".", ",")} bis zur Schwelle</span>
        </div>
      ))}
      <div className="text-xs text-muted-foreground flex gap-1"><Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />{data.hinweis}</div>
    </CardContent></Card>
  );
}
