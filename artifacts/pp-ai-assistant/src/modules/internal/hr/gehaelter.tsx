// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Gehälter (Admin/Manager only)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import NoAccess from "@/shared/components/no-access";
import { Euro, TrendingUp, Users, Pencil, Loader2, Lock, Shield } from "lucide-react";

interface Mitarbeiter {
  id: number; name: string; jobTitle: string; abteilung?: string;
  employmentType: string; status: string; weeklyHours?: number;
  salaryGross?: number; createdAt: string;
}

function fmtEur(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

const EMP_LABELS: Record<string, string> = {
  vollzeit: "Vollzeit", teilzeit: "Teilzeit", minijob: "Minijob",
  werkstudent: "Werkstudent", praktikant: "Praktikant",
};

export default function GehaelterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePermissions();
  const canView = perms.role === "admin" || perms.role === "manager";

  const [editId, setEditId] = useState<number | null>(null);
  const [salaryInput, setSalaryInput] = useState("");

  // AG-Anteil aus hr_kosten_parameter (0427) — vorher stand hier eine feste 1.2,
  // die jede Auswertung rückwirkend falsch gemacht hätte, sobald der Satz sich ändert.
  const { data: parameter } = useQuery<{ agNebenkostenBp: number; hinterlegt: boolean }>({
    queryKey: ["hr-kosten-parameter", new Date().getFullYear()],
    queryFn: () => apiFetch(`/api/hr/kosten-parameter?jahr=${new Date().getFullYear()}`),
    staleTime: 300_000, enabled: canView,
  });
  const agFaktor = 1 + (parameter?.agNebenkostenBp ?? 2000) / 10000;

  const { data: mitarbeiter = [], isLoading } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 30_000,
    enabled: canView,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, salaryGross }: { id: number; salaryGross: number }) =>
      apiFetch(`/api/hr/mitarbeiter/${id}`, { method: "PATCH", body: JSON.stringify({ salaryGross }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-mitarbeiter"] });
      toast({ title: "Gehalt aktualisiert ✓" });
      setEditId(null);
      setSalaryInput("");
    },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  if (!canView) {
    return <NoAccess message="Gehaltsdaten sind vertraulich und nur für Admin/Manager sichtbar." />;
  }

  const activeWithSalary = mitarbeiter.filter((m) => m.status === "aktiv" && m.salaryGross != null);
  const allActive = mitarbeiter.filter((m) => m.status === "aktiv");

  const totalMonthly = activeWithSalary.reduce((s, m) => s + (m.salaryGross ?? 0), 0);
  const avgSalary = activeWithSalary.length > 0 ? Math.round(totalMonthly / activeWithSalary.length) : 0;
  const totalWithEmployer = Math.round(totalMonthly * agFaktor);

  const sorted = [...allActive].sort((a, b) => (b.salaryGross ?? 0) - (a.salaryGross ?? 0));

  function openEdit(m: Mitarbeiter) {
    setEditId(m.id);
    setSalaryInput(m.salaryGross ? String(Math.round(m.salaryGross / 100)) : "");
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <Euro className="w-6 h-6" /> Gehälter
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeWithSalary.length} Mitarbeiter mit Gehaltsdaten</p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4 text-amber-600" />
          <span className="text-xs text-amber-800 font-medium">Vertraulich — nur für Admin/Manager</span>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Monatliche Lohnkosten", value: isLoading ? "…" : fmtEur(totalMonthly), icon: Euro, color: "text-foreground", bg: "bg-muted" },
          { label: "Inkl. Arbeitgeberanteil", value: isLoading ? "…" : fmtEur(totalWithEmployer), icon: TrendingUp, color: "text-red-700", bg: "bg-red-50" },
          { label: "Ø Bruttogehalt", value: isLoading ? "…" : fmtEur(avgSalary), icon: Users, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Jährliche Hochrechnung", value: isLoading ? "…" : fmtEur(totalWithEmployer * 12), icon: TrendingUp, color: "text-amber-700", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", bg)}>
                <Icon className={cn("w-4 h-4", color)} />
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("text-xl font-black mt-0.5", color)}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AG-Hinweis */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="px-4 py-3 flex items-center gap-3">
          <Shield className="w-4 h-4 text-amber-700 shrink-0" />
          <p className="text-xs text-amber-800">
            Arbeitgeberanteil zur Sozialversicherung mit 20% pauschal kalkuliert. Für genaue Zahlen bitte Steuerberater konsultieren.
          </p>
        </CardContent>
      </Card>

      {/* Employee List */}
      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      <div className="space-y-2">
        {sorted.map((m, i) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{m.name}</span>
                      <Badge variant="outline" className="text-xs">{EMP_LABELS[m.employmentType] ?? m.employmentType}</Badge>
                      {m.abteilung && <span className="text-xs text-muted-foreground">{m.abteilung}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{m.jobTitle}{m.weeklyHours ? ` · ${m.weeklyHours}h/Woche` : ""}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Bruttogehalt / Monat</p>
                      <p className="font-bold text-foreground text-lg">
                        {m.salaryGross ? fmtEur(m.salaryGross) : <span className="text-muted-foreground text-sm">Nicht hinterlegt</span>}
                      </p>
                      {m.salaryGross && (
                        <p className="text-xs text-muted-foreground">
                          inkl. AG: {fmtEur(Math.round(m.salaryGross * agFaktor))} · p.a.: {fmtEur(Math.round(m.salaryGross * 12 * agFaktor))}
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openEdit(m)} className="gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {!isLoading && allActive.length === 0 && (
          <Card><CardContent className="py-14 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Keine aktiven Mitarbeiter</p>
          </CardContent></Card>
        )}
      </div>

      {/* Edit Salary Dialog */}
      <Dialog open={editId != null} onOpenChange={(v) => { if (!v) { setEditId(null); setSalaryInput(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Gehalt bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {mitarbeiter.find((m) => m.id === editId)?.name}
            </p>
            <div className="space-y-1">
              <Label className="text-sm">Bruttogehalt (€/Monat)</Label>
              <Input
                type="number"
                placeholder="z.B. 3500"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
              />
              {salaryInput && (
                <p className="text-xs text-muted-foreground">
                  Jahresgehalt inkl. AG-Anteil ({((agFaktor - 1) * 100).toFixed(1).replace(".", ",")} %): {fmtEur(Math.round(Number(salaryInput) * 100 * 12 * agFaktor))}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { setEditId(null); setSalaryInput(""); }}>Abbrechen</Button>
            <Button
              disabled={updateMut.isPending || !salaryInput || isNaN(Number(salaryInput))}
              onClick={() => editId && updateMut.mutate({ id: editId, salaryGross: Math.round(Number(salaryInput) * 100) })}
              style={{ backgroundColor: "#1E4068", color: "white" }}>
              {updateMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
