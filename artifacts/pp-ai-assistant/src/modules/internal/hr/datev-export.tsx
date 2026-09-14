// © 2026 P&P Group. Proprietary & Confidential.
// HR — DATEV Lohn-Export
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, Info, Loader2, Users } from "lucide-react";

interface Mitarbeiter {
  id: number; name: string; status: string; jobTitle: string;
  employmentType: string; weeklyHours?: number; salaryGross?: number;
  startDate: string; abteilung?: string;
}

function centToEuro(cents?: number | null): string {
  if (!cents) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default function DatevExportPage() {
  const { toast } = useToast();
  const perms = usePermissions();
  const [downloading, setDownloading] = useState(false);

  const { data: mitarbeiter = [], isLoading } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });

  const aktive = mitarbeiter.filter(m => m.status === "aktiv");

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/hr/datev-export", {
        credentials: "include",
        headers: { Accept: "text/csv" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DATEV-Lohn-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export heruntergeladen ✓" });
    } catch (e) {
      toast({ title: "Fehler beim Export", description: String(e), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  if (perms.role !== "admin") {
    return (
      <Card><CardContent className="py-14 text-center text-muted-foreground">
        <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="font-medium">Nur für Administratoren</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <FileSpreadsheet className="w-6 h-6" /> DATEV Lohn-Export
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            CSV-Export für DATEV Lohn & Gehalt / Steuerberater
          </p>
        </div>
        <Button onClick={handleDownload} disabled={downloading || aktive.length === 0}
          className="gap-2" style={{ backgroundColor: "#1E4068", color: "white" }}>
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          CSV herunterladen ({aktive.length} MA)
        </Button>
      </div>

      {/* Hinweis */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-medium">Exportierte Felder</p>
            <p>Personalnummer · Nachname · Vorname · Geburtsdatum · Eintrittsdatum · Beschäftigungsart · Wochenstunden · Bruttolohn · Kostenstelle</p>
            <p className="text-xs text-blue-600 mt-1">IBAN und Steuerklasse werden aus Datenschutzgründen nicht gespeichert und müssen ggf. im DATEV-System ergänzt werden.</p>
          </div>
        </CardContent>
      </Card>

      {/* Vorschau-Tabelle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> Vorschau — Aktive Mitarbeiter ({aktive.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">#</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Name</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Stelle</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Art</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Std/Woche</th>
                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {aktive.map((m, i) => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{String(i + 1).padStart(6, "0")}</td>
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{m.jobTitle || "—"}</td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary" className="text-xs">{m.employmentType}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{m.weeklyHours ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-medium">{centToEuro(m.salaryGross)}</td>
                    </tr>
                  ))}
                  {aktive.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Keine aktiven Mitarbeiter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
