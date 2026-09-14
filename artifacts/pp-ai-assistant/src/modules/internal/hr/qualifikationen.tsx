// © 2026 P&P Group. Proprietary & Confidential.
// HR — Qualifikations-Tracker (Zertifikate, Ablaufdaten, je Mitarbeiter)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { useGemerkteAnsicht } from "@/shared/hooks/use-gemerkte-ansicht";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GraduationCap, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, User } from "lucide-react";

interface Qualifikation { id: number; name: string; category: string; description?: string; renewalRequired: boolean; renewalIntervalMonths?: number; }
interface MaQual { id: number; mitarbeiterId: number; qualifikationId: number; erworbrenAm: string; ablaufdatum?: string; zertifikatNr?: string; status: string; qualifikationName?: string; qualifikationCategory?: string; renewalRequired?: boolean; }
interface Mitarbeiter { id: number; name: string; status: string; jobTitle: string; }

const CAT_COLORS: Record<string, string> = {
  technisch:  "bg-blue-100 text-blue-700",
  sicherheit: "bg-red-100 text-red-700",
  rechtlich:  "bg-purple-100 text-purple-700",
  sonstige:   "bg-muted text-muted-foreground",
};

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const EMPTY_QUAL_FORM = { name: "", category: "sonstige", description: "", renewalRequired: false, renewalIntervalMonths: "" };
const EMPTY_MA_QUAL_FORM = { qualifikationId: "", erworbrenAm: "", ablaufdatum: "", zertifikatNr: "" };

export default function QualifikationenPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePermissions();
  const canWrite = perms.role === "admin" || perms.role === "manager";

  // Reiter UND Suche gemerkt: der Reiter ist hier die eigentliche Stelle, an
  // der man stand (s. use-gemerkte-ansicht.ts).
  const [ansicht, setAnsicht] = useGemerkteAnsicht("hr-qualifikationen.ansicht", {
    tab: "mitarbeiter", search: "",
  });
  const tab = ansicht.tab === "katalog" ? "katalog" : "mitarbeiter";
  const { search } = ansicht;
  const [selectedMa, setSelectedMa] = useState<Mitarbeiter | null>(null);
  const [qualDialogOpen, setQualDialogOpen] = useState(false);
  const [maQualDialogOpen, setMaQualDialogOpen] = useState(false);
  const [qualForm, setQualForm] = useState<typeof EMPTY_QUAL_FORM>(EMPTY_QUAL_FORM);
  const [maQualForm, setMaQualForm] = useState<typeof EMPTY_MA_QUAL_FORM>(EMPTY_MA_QUAL_FORM);

  const { data: katalog = [] } = useQuery<Qualifikation[]>({
    queryKey: ["hr-qualifikationen"],
    queryFn: () => apiFetch<Qualifikation[]>("/api/hr/qualifikationen"),
    staleTime: 60_000,
  });
  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });
  const { data: maQuals = [], isLoading: maQualsLoading } = useQuery<MaQual[]>({
    queryKey: ["hr-ma-qualifikationen", selectedMa?.id],
    queryFn: () => apiFetch<MaQual[]>(`/api/hr/mitarbeiter/${selectedMa!.id}/qualifikationen`),
    enabled: !!selectedMa,
    staleTime: 20_000,
  });

  const addQualMut = useMutation({
    mutationFn: (d: typeof EMPTY_QUAL_FORM) => apiFetch("/api/hr/qualifikationen", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-qualifikationen"] }); toast({ title: "Qualifikation angelegt ✓" }); setQualDialogOpen(false); setQualForm(EMPTY_QUAL_FORM); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });
  const deleteQualMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/qualifikationen/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-qualifikationen"] }); toast({ title: "Gelöscht" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });
  const addMaQualMut = useMutation({
    mutationFn: (d: typeof EMPTY_MA_QUAL_FORM) =>
      apiFetch(`/api/hr/mitarbeiter/${selectedMa!.id}/qualifikationen`, { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-ma-qualifikationen"] }); toast({ title: "Qualifikation zugewiesen ✓" }); setMaQualDialogOpen(false); setMaQualForm(EMPTY_MA_QUAL_FORM); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });
  const deleteMaQualMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/mitarbeiter-qualifikationen/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-ma-qualifikationen"] }); toast({ title: "Gelöscht" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const filteredMa = mitarbeiter.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) && m.status === "aktiv");

  const expiringCount = maQuals.filter(q => { const d = daysUntil(q.ablaufdatum ?? undefined); return d !== null && d <= 60 && d >= 0; }).length;
  const expiredCount = maQuals.filter(q => { const d = daysUntil(q.ablaufdatum ?? undefined); return d !== null && d < 0; }).length;

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
          <GraduationCap className="w-6 h-6" /> Qualifikationen & Zertifikate
        </h1>
        {canWrite && (
          <Button size="sm" onClick={() => setQualDialogOpen(true)} variant="outline" className="gap-2">
            <Plus className="w-3.5 h-3.5" /> Qualifikation anlegen
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["mitarbeiter", "katalog"] as const).map(t => (
          <button key={t} onClick={() => setAnsicht({ tab: t })}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "mitarbeiter" ? "Je Mitarbeiter" : `Katalog (${katalog.length})`}
          </button>
        ))}
      </div>

      {tab === "katalog" ? (
        <div className="space-y-2">
          {katalog.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Noch keine Qualifikationen angelegt</p>
            </CardContent></Card>
          )}
          {katalog.map((q, i) => (
            <motion.div key={q.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="hover:shadow-sm">
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{q.name}</span>
                      <Badge className={cn("text-xs border-0", CAT_COLORS[q.category] ?? CAT_COLORS.sonstige)}>{q.category}</Badge>
                      {q.renewalRequired && <Badge className="text-xs border-0 bg-amber-100 text-amber-700">Erneuerung nötig · {q.renewalIntervalMonths} Mon.</Badge>}
                    </div>
                    {q.description && <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>}
                  </div>
                  {canWrite && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600"
                      onClick={() => deleteQualMut.mutate(q.id)} aria-label="Qualifikation löschen">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-5">
          <div className="space-y-2">
            <Input placeholder="Mitarbeiter suchen…" value={search} onChange={e => setAnsicht({ search: e.target.value })} className="h-8 text-sm" />
            <div className="space-y-1 max-h-[560px] overflow-y-auto pr-1">
              {filteredMa.map(m => (
                <button key={m.id} onClick={() => setSelectedMa(m)}
                  className={cn("w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                    selectedMa?.id === m.id ? "bg-[#1E4068] text-white" : "hover:bg-muted/70")}>
                  <div className="font-medium flex items-center gap-2"><User className="w-3.5 h-3.5 shrink-0" />{m.name}</div>
                  <div className={cn("text-xs", selectedMa?.id === m.id ? "text-white/70" : "text-muted-foreground")}>{m.jobTitle || "—"}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            {!selectedMa ? (
              <Card><CardContent className="py-14 text-center text-muted-foreground">
                <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Mitarbeiter auswählen</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">{selectedMa.name}</h2>
                    {expiringCount > 0 && <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{expiringCount} läuft ab (≤60 Tage)</p>}
                    {expiredCount > 0 && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{expiredCount} abgelaufen</p>}
                  </div>
                  {canWrite && (
                    <Button size="sm" onClick={() => setMaQualDialogOpen(true)} className="gap-2"
                      style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
                      <Plus className="w-3.5 h-3.5" /> Zuweisen
                    </Button>
                  )}
                </div>
                {maQualsLoading ? <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div> : (
                  <div className="space-y-2">
                    {maQuals.map((q, i) => {
                      const days = daysUntil(q.ablaufdatum ?? undefined);
                      const expired = days !== null && days < 0;
                      const expiring = !expired && days !== null && days <= 60;
                      return (
                        <motion.div key={q.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                          <Card className={cn("hover:shadow-sm", expired && "border-red-300", expiring && "border-amber-300")}>
                            <CardContent className="p-3 flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                {expired ? <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                  : expiring ? <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                  : <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />}
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm">{q.qualifikationName ?? `Qual. #${q.qualifikationId}`}</span>
                                    <Badge className={cn("text-xs border-0", CAT_COLORS[q.qualifikationCategory ?? "sonstige"])}>{q.qualifikationCategory ?? "sonstige"}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">Erworben: {new Date(q.erworbrenAm).toLocaleDateString("de-DE")}</p>
                                  {q.ablaufdatum && (
                                    <p className={cn("text-xs", expired ? "text-red-600" : expiring ? "text-amber-600" : "text-muted-foreground")}>
                                      Gültig bis: {new Date(q.ablaufdatum).toLocaleDateString("de-DE")}
                                      {days !== null && ` (${expired ? `${Math.abs(days)} Tage überfällig` : `${days} Tage`})`}
                                    </p>
                                  )}
                                  {q.zertifikatNr && <p className="text-xs text-muted-foreground">Zert.-Nr.: {q.zertifikatNr}</p>}
                                </div>
                              </div>
                              {canWrite && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600"
                                  onClick={() => deleteMaQualMut.mutate(q.id)} aria-label="Zuweisung löschen">
                                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                    {maQuals.length === 0 && (
                      <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Keine Qualifikationen zugewiesen</CardContent></Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialog: Neue Qualifikation im Katalog */}
      <Dialog open={qualDialogOpen} onOpenChange={v => { if (!v) { setQualDialogOpen(false); setQualForm(EMPTY_QUAL_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Qualifikation anlegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-sm">Name</Label>
              <Input placeholder="z.B. Elektrofachkraft §5" value={qualForm.name} onChange={e => setQualForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1"><Label className="text-sm">Kategorie</Label>
              <Select value={qualForm.category} onValueChange={v => setQualForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="technisch">Technisch</SelectItem>
                  <SelectItem value="sicherheit">Sicherheit</SelectItem>
                  <SelectItem value="rechtlich">Rechtlich</SelectItem>
                  <SelectItem value="sonstige">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={qualForm.renewalRequired} onCheckedChange={v => setQualForm(f => ({ ...f, renewalRequired: v }))} />
              <Label className="text-sm">Erneuerung erforderlich</Label>
            </div>
            {qualForm.renewalRequired && (
              <div className="space-y-1"><Label className="text-sm">Erneuerungsintervall (Monate)</Label>
                <Input type="number" min={1} value={qualForm.renewalIntervalMonths} onChange={e => setQualForm(f => ({ ...f, renewalIntervalMonths: e.target.value }))} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setQualDialogOpen(false)}>Abbrechen</Button>
            <Button disabled={addQualMut.isPending || !qualForm.name}
              onClick={() => addQualMut.mutate(qualForm)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addQualMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Qualifikation einem Mitarbeiter zuweisen */}
      <Dialog open={maQualDialogOpen} onOpenChange={v => { if (!v) { setMaQualDialogOpen(false); setMaQualForm(EMPTY_MA_QUAL_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Qualifikation zuweisen — {selectedMa?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-sm">Qualifikation</Label>
              <Select value={maQualForm.qualifikationId} onValueChange={v => setMaQualForm(f => ({ ...f, qualifikationId: v }))}>
                <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
                <SelectContent>{katalog.map(q => <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-sm">Erworben am</Label>
                <Input type="date" value={maQualForm.erworbrenAm} onChange={e => setMaQualForm(f => ({ ...f, erworbrenAm: e.target.value }))} />
              </div>
              <div className="space-y-1"><Label className="text-sm">Ablaufdatum (opt.)</Label>
                <Input type="date" value={maQualForm.ablaufdatum} onChange={e => setMaQualForm(f => ({ ...f, ablaufdatum: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1"><Label className="text-sm">Zertifikat-Nr. (opt.)</Label>
              <Input placeholder="Z.B. EF-2026-001" value={maQualForm.zertifikatNr} onChange={e => setMaQualForm(f => ({ ...f, zertifikatNr: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setMaQualDialogOpen(false)}>Abbrechen</Button>
            <Button disabled={addMaQualMut.isPending || !maQualForm.qualifikationId || !maQualForm.erworbrenAm}
              onClick={() => addMaQualMut.mutate(maQualForm)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addMaQualMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Zuweisen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
