// © 2026 P&P Group. Proprietary & Confidential.
// HR — Organigramm (hierarchische Ansicht nach Abteilung)
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Network, Users, ChevronDown, ChevronRight } from "lucide-react";

interface Mitarbeiter {
  id: number; name: string; jobTitle: string; abteilung?: string;
  status: string; employmentType: string; startDate: string;
}

const STATUS_DOT: Record<string, string> = {
  aktiv:        "bg-green-500",
  elternzeit:   "bg-blue-400",
  krank:        "bg-amber-400",
  gekündigt:    "bg-muted-foreground",
  ausgeschieden:"bg-muted-foreground",
};

const ABTEILUNG_COLORS = [
  "#1E4068", "#CC7B5C", "#2D6A4F", "#7B5EA7", "#C77B2A",
  "#1A7A6E", "#8B3A3A", "#4A6FA5", "#5C6B3D", "#7A4E7A",
];

function MitarbeiterCard({ ma, color }: { ma: Mitarbeiter; color: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 min-w-[160px] max-w-[180px] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: color }}>
          {ma.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-xs truncate">{ma.name}</div>
          <div className="flex items-center gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[ma.status] ?? "bg-muted")} />
            <span className="text-[10px] text-muted-foreground">{ma.status}</span>
          </div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground truncate">{ma.jobTitle || "—"}</div>
      <div className="text-[10px] text-muted-foreground">{ma.employmentType}</div>
    </div>
  );
}

export default function OrganigrammPage() {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: mitarbeiter = [], isLoading } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });

  const filtered = search
    ? mitarbeiter.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.jobTitle.toLowerCase().includes(search.toLowerCase()) ||
        (m.abteilung ?? "").toLowerCase().includes(search.toLowerCase()))
    : mitarbeiter;

  const byAbteilung = useMemo(() => {
    const map: Record<string, Mitarbeiter[]> = {};
    for (const m of filtered) {
      const key = m.abteilung || "Ohne Abteilung";
      if (!map[key]) map[key] = [];
      map[key]!.push(m);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, "de"));
  }, [filtered]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    byAbteilung.forEach(([abt], i) => { map[abt] = ABTEILUNG_COLORS[i % ABTEILUNG_COLORS.length]!; });
    return map;
  }, [byAbteilung]);

  const aktiveGesamt = mitarbeiter.filter(m => m.status === "aktiv").length;
  const abteilungen = byAbteilung.length;

  const toggleCollapse = (abt: string) => {
    setCollapsed(s => { const n = new Set(s); n.has(abt) ? n.delete(abt) : n.add(abt); return n; });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <Network className="w-6 h-6" /> Organigramm
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {aktiveGesamt} aktive Mitarbeiter · {abteilungen} Abteilungen
          </p>
        </div>
        <Input placeholder="Name, Stelle oder Abteilung…" value={search}
          onChange={e => setSearch(e.target.value)} className="h-8 text-sm w-56" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : byAbteilung.length === 0 ? (
        <Card><CardContent className="py-14 text-center text-muted-foreground">
          <Network className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>Keine Mitarbeiter gefunden</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {byAbteilung.map(([abt, members]) => {
            const color = colorMap[abt] ?? "#1E4068";
            const isCollapsed = collapsed.has(abt);
            const aktive = members.filter(m => m.status === "aktiv").length;
            return (
              <div key={abt}>
                {/* Abteilungs-Header */}
                <button onClick={() => toggleCollapse(abt)}
                  className="flex items-center gap-3 mb-3 group w-full text-left">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                  <span className="font-bold text-base" style={{ color }}>{abt}</span>
                  <Badge variant="secondary" className="text-xs">
                    <Users className="w-3 h-3 mr-1" />{members.length}
                    {aktive < members.length && <span className="text-muted-foreground ml-1">({aktive} aktiv)</span>}
                  </Badge>
                  <span className="text-muted-foreground ml-auto">
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>

                {!isCollapsed && (
                  <>
                    {/* Verbindungslinie */}
                    <div className="relative ml-2 pl-5 border-l-2 border-dashed" style={{ borderColor: color + "60" }}>
                      {/* Karten-Gitter */}
                      <div className="flex flex-wrap gap-3 py-2">
                        {members.map(m => (
                          <div key={m.id} className="relative">
                            {/* horizontale Linie zum Node */}
                            <div className="absolute -left-5 top-1/2 w-5 h-0.5" style={{ backgroundColor: color + "60" }} />
                            <MitarbeiterCard ma={m} color={color} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legende */}
      {!isLoading && mitarbeiter.length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Status</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS_DOT).map(([status, dotClass]) => (
              <div key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={cn("w-2 h-2 rounded-full", dotClass)} />
                <span className="capitalize">{status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
