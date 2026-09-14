// © 2026 P&P Group. Proprietary & Confidential.
// HR — Leistungsbeurteilungen & Zielvereinbarungen
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Star, Target, Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface Beurteilung {
  id: number; mitarbeiterId: number; mitarbeiterName?: string;
  period: string; rating: number; staerken?: string;
  verbesserungen?: string; zieleNaechstePeriode?: string;
  notes?: string; createdAt: string;
}
interface Ziel {
  id: number; mitarbeiterId: number; mitarbeiterName?: string;
  title: string; description?: string; targetDate?: string;
  status: string; progressPct: number; createdAt: string;
}
interface Mitarbeiter { id: number; name: string; status: string; }

const STAR_LABELS = ["", "Ungenügend", "Verbesserungsbedarf", "Erfüllt", "Gut", "Hervorragend"];
const GOAL_STATUS_STYLE: Record<string, string> = {
  "offen":            "bg-muted text-muted-foreground",
  "in-bearbeitung":   "bg-blue-100 text-blue-700",
  "erreicht":         "bg-green-100 text-green-700",
  "nicht-erreicht":   "bg-red-100 text-red-700",
};

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)}
          className={cn("transition-colors", onChange ? "cursor-pointer hover:scale-110" : "cursor-default")}>
          <Star className={cn("w-5 h-5", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
        </button>
      ))}
      {value > 0 && <span className="text-xs text-muted-foreground ml-1 self-center">{STAR_LABELS[value]}</span>}
    </div>
  );
}

const EMPTY_BFORM = { mitarbeiterId: "", period: "", rating: 3, staerken: "", verbesserungen: "", zieleNaechstePeriode: "", notes: "" };
const EMPTY_ZFORM = { mitarbeiterId: "", title: "", description: "", targetDate: "", status: "offen", progressPct: 0 };

export default function BeurteilungenPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePermissions();
  const canWrite = perms.role === "admin" || perms.role === "manager";

  const [tab, setTab] = useState<"beurteilungen" | "ziele">("beurteilungen");
  const [bDialogOpen, setBDialogOpen] = useState(false);
  const [zDialogOpen, setZDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [bForm, setBForm] = useState<typeof EMPTY_BFORM>(EMPTY_BFORM);
  const [zForm, setZForm] = useState<typeof EMPTY_ZFORM>(EMPTY_ZFORM);
  const [editingZiel, setEditingZiel] = useState<Ziel | null>(null);
  const [filterMa, setFilterMa] = useState("");

  const { data: beurteilungen = [], isLoading: bLoading } = useQuery<Beurteilung[]>({
    queryKey: ["hr-beurteilungen"],
    queryFn: () => apiFetch<Beurteilung[]>("/api/hr/beurteilungen"),
    staleTime: 30_000,
  });
  const { data: ziele = [], isLoading: zLoading } = useQuery<Ziel[]>({
    queryKey: ["hr-ziele"],
    queryFn: () => apiFetch<Ziel[]>("/api/hr/ziele"),
    staleTime: 30_000,
  });
  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });
  const aktiveMa = mitarbeiter.filter(m => m.status === "aktiv");

  const addBMut = useMutation({
    mutationFn: (d: typeof EMPTY_BFORM) => apiFetch("/api/hr/beurteilungen", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-beurteilungen"] }); toast({ title: "Beurteilung gespeichert ✓" }); setBDialogOpen(false); setBForm(EMPTY_BFORM); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const addZMut = useMutation({
    mutationFn: (d: typeof EMPTY_ZFORM) => apiFetch("/api/hr/ziele", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-ziele"] }); toast({ title: "Ziel angelegt ✓" }); setZDialogOpen(false); setZForm(EMPTY_ZFORM); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const patchZMut = useMutation({
    mutationFn: ({ id, ...d }: { id: number } & Partial<typeof EMPTY_ZFORM>) =>
      apiFetch(`/api/hr/ziele/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-ziele"] }); toast({ title: "Ziel aktualisiert ✓" }); setEditingZiel(null); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const deleteZMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/ziele/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-ziele"] }); toast({ title: "Gelöscht" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const filteredB = filterMa
    ? beurteilungen.filter(b => b.mitarbeiterName?.toLowerCase().includes(filterMa.toLowerCase()))
    : beurteilungen;
  const filteredZ = filterMa
    ? ziele.filter(z => z.mitarbeiterName?.toLowerCase().includes(filterMa.toLowerCase()))
    : ziele;

  const openEditZiel = (z: Ziel) => {
    setZForm({ mitarbeiterId: String(z.mitarbeiterId), title: z.title, description: z.description ?? "", targetDate: z.targetDate ?? "", status: z.status, progressPct: z.progressPct });
    setEditingZiel(z);
    setZDialogOpen(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
          <Star className="w-6 h-6" /> Beurteilungen & Ziele
        </h1>
        <div className="flex gap-2">
          <Input placeholder="Mitarbeiter filtern…" value={filterMa} onChange={e => setFilterMa(e.target.value)} className="h-8 text-sm w-44" />
          {canWrite && (
            <Button size="sm" onClick={() => { tab === "beurteilungen" ? setBDialogOpen(true) : setZDialogOpen(true); }}
              className="gap-2" style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
              <Plus className="w-3.5 h-3.5" /> {tab === "beurteilungen" ? "Beurteilung" : "Ziel"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["beurteilungen", "ziele"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "beurteilungen" ? `Beurteilungen (${beurteilungen.length})` : `Ziele (${ziele.length})`}
          </button>
        ))}
      </div>

      {tab === "beurteilungen" ? (
        bLoading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-2">
            {filteredB.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="hover:shadow-sm cursor-pointer" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{b.mitarbeiterName ?? `MA #${b.mitarbeiterId}`}</span>
                          <Badge variant="secondary" className="text-xs">{b.period}</Badge>
                        </div>
                        <div className="mt-1"><StarRating value={b.rating} /></div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                        {new Date(b.createdAt).toLocaleDateString("de-DE")}
                        {expandedId === b.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                    {expandedId === b.id && (
                      <div className="mt-4 space-y-3 border-t border-border pt-3">
                        {b.staerken && <div><p className="text-xs font-semibold text-muted-foreground mb-1">Stärken</p><p className="text-sm">{b.staerken}</p></div>}
                        {b.verbesserungen && <div><p className="text-xs font-semibold text-muted-foreground mb-1">Verbesserungsbereiche</p><p className="text-sm">{b.verbesserungen}</p></div>}
                        {b.zieleNaechstePeriode && <div><p className="text-xs font-semibold text-muted-foreground mb-1">Ziele nächste Periode</p><p className="text-sm">{b.zieleNaechstePeriode}</p></div>}
                        {b.notes && <div><p className="text-xs font-semibold text-muted-foreground mb-1">Notizen</p><p className="text-sm">{b.notes}</p></div>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {filteredB.length === 0 && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Star className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Keine Beurteilungen</p>
              </CardContent></Card>
            )}
          </div>
        )
      ) : (
        zLoading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-2">
            {filteredZ.map((z, i) => (
              <motion.div key={z.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="hover:shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">{z.title}</span>
                          <Badge className={cn("text-xs border-0", GOAL_STATUS_STYLE[z.status] ?? "bg-muted")}>{z.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{z.mitarbeiterName ?? `MA #${z.mitarbeiterId}`}{z.targetDate ? ` · Bis ${new Date(z.targetDate).toLocaleDateString("de-DE")}` : ""}</p>
                        {z.description && <p className="text-xs text-muted-foreground mt-0.5">{z.description}</p>}
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={z.progressPct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground shrink-0">{z.progressPct}%</span>
                        </div>
                      </div>
                      {canWrite && (
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditZiel(z)} aria-label="Ziel bearbeiten"><Pencil className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-red-600" onClick={() => deleteZMut.mutate(z.id)} aria-label="Ziel löschen"><Trash2 className="w-3.5 h-3.5" aria-hidden="true" /></Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {filteredZ.length === 0 && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Keine Ziele</p>
              </CardContent></Card>
            )}
          </div>
        )
      )}

      {/* Dialog: Beurteilung */}
      <Dialog open={bDialogOpen} onOpenChange={v => { if (!v) { setBDialogOpen(false); setBForm(EMPTY_BFORM); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Neue Beurteilung</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-sm">Mitarbeiter</Label>
                <Select value={bForm.mitarbeiterId} onValueChange={v => setBForm(f => ({ ...f, mitarbeiterId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                  <SelectContent>{aktiveMa.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-sm">Periode (z.B. 2026-H1)</Label>
                <Input placeholder="2026-H1" value={bForm.period} onChange={e => setBForm(f => ({ ...f, period: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1"><Label className="text-sm">Gesamtbewertung</Label>
              <StarRating value={bForm.rating} onChange={v => setBForm(f => ({ ...f, rating: v }))} />
            </div>
            <div className="space-y-1"><Label className="text-sm">Stärken</Label>
              <Textarea rows={2} placeholder="Was läuft besonders gut?" value={bForm.staerken} onChange={e => setBForm(f => ({ ...f, staerken: e.target.value }))} />
            </div>
            <div className="space-y-1"><Label className="text-sm">Verbesserungsbereiche</Label>
              <Textarea rows={2} placeholder="Woran sollte gearbeitet werden?" value={bForm.verbesserungen} onChange={e => setBForm(f => ({ ...f, verbesserungen: e.target.value }))} />
            </div>
            <div className="space-y-1"><Label className="text-sm">Ziele nächste Periode</Label>
              <Textarea rows={2} placeholder="Konkrete Ziele für das nächste Halbjahr…" value={bForm.zieleNaechstePeriode} onChange={e => setBForm(f => ({ ...f, zieleNaechstePeriode: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setBDialogOpen(false)}>Abbrechen</Button>
            <Button disabled={addBMut.isPending || !bForm.mitarbeiterId || !bForm.period}
              onClick={() => addBMut.mutate(bForm)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addBMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ziel */}
      <Dialog open={zDialogOpen} onOpenChange={v => { if (!v) { setZDialogOpen(false); setZForm(EMPTY_ZFORM); setEditingZiel(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingZiel ? "Ziel bearbeiten" : "Neues Ziel"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editingZiel && (
              <div className="space-y-1"><Label className="text-sm">Mitarbeiter</Label>
                <Select value={zForm.mitarbeiterId} onValueChange={v => setZForm(f => ({ ...f, mitarbeiterId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                  <SelectContent>{aktiveMa.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1"><Label className="text-sm">Ziel</Label>
              <Input placeholder="z.B. Kundenzufriedenheit auf 4.5 steigern" value={zForm.title} onChange={e => setZForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1"><Label className="text-sm">Beschreibung</Label>
              <Textarea rows={2} value={zForm.description} onChange={e => setZForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-sm">Zieldatum</Label>
                <Input type="date" value={zForm.targetDate} onChange={e => setZForm(f => ({ ...f, targetDate: e.target.value }))} />
              </div>
              <div className="space-y-1"><Label className="text-sm">Status</Label>
                <Select value={zForm.status} onValueChange={v => setZForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="offen">Offen</SelectItem>
                    <SelectItem value="in-bearbeitung">In Bearbeitung</SelectItem>
                    <SelectItem value="erreicht">Erreicht</SelectItem>
                    <SelectItem value="nicht-erreicht">Nicht erreicht</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-sm">Fortschritt: {zForm.progressPct}%</Label>
              <input type="range" min={0} max={100} value={zForm.progressPct}
                onChange={e => setZForm(f => ({ ...f, progressPct: Number(e.target.value) }))}
                className="w-full accent-[#1E4068]" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { setZDialogOpen(false); setEditingZiel(null); setZForm(EMPTY_ZFORM); }}>Abbrechen</Button>
            <Button
              disabled={(editingZiel ? patchZMut.isPending : addZMut.isPending) || !zForm.title || (!editingZiel && !zForm.mitarbeiterId)}
              onClick={() => editingZiel ? patchZMut.mutate({ id: editingZiel.id, ...zForm }) : addZMut.mutate(zForm)}
              style={{ backgroundColor: "#1E4068", color: "white" }}>
              {(editingZiel ? patchZMut.isPending : addZMut.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingZiel ? "Aktualisieren" : "Erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
