// © 2026 P&P Group. Proprietary & Confidential.
// HR — Schichtplanung / Dienstplan (Wochenkalender)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, Clock } from "lucide-react";

interface Schicht {
  id: number; mitarbeiterId: number; mitarbeiterName?: string;
  date: string; startTime: string; endTime: string;
  shiftType: string; status: string; notes?: string;
}
interface Mitarbeiter { id: number; name: string; status: string; kalenderfarbe?: string; }

const SHIFT_TYPE_STYLES: Record<string, { label: string; bg: string }> = {
  normal:      { label: "Normal",      bg: "bg-blue-100 text-blue-800" },
  frueh:       { label: "Frühschicht", bg: "bg-amber-100 text-amber-800" },
  spaet:       { label: "Spätschicht", bg: "bg-purple-100 text-purple-800" },
  nacht:       { label: "Nachtschicht", bg: "bg-slate-700 text-white" },
  bereitschaft:{ label: "Bereitschaft", bg: "bg-orange-100 text-orange-800" },
  homeoffice:  { label: "Homeoffice",  bg: "bg-teal-100 text-teal-800" },
};
const SHIFT_STATUS_STYLES: Record<string, string> = {
  geplant:    "border-l-4 border-l-blue-400",
  bestaetigt: "border-l-4 border-l-green-500",
  abwesend:   "border-l-4 border-l-red-400",
};

const EMPTY_FORM = { mitarbeiterId: "", date: "", startTime: "08:00", endTime: "17:00", shiftType: "normal", status: "geplant", notes: "" };

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=So
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d); mon.setDate(d.getDate() + diff); mon.setHours(0,0,0,0);
  return mon;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default function SchichtplanungPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePermissions();
  const canWrite = perms.role === "admin" || perms.role === "manager";

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState("");
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const von = isoDate(weekStart);
  const bis = isoDate(addDays(weekStart, 6));

  const { data: schichten = [], isLoading } = useQuery<Schicht[]>({
    queryKey: ["hr-schichten", von, bis],
    queryFn: () => apiFetch<Schicht[]>(`/api/hr/schichten?von=${von}&bis=${bis}`),
    staleTime: 20_000,
  });

  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });
  const aktiveMa = mitarbeiter.filter(m => m.status === "aktiv");

  const addMut = useMutation({
    mutationFn: (d: typeof EMPTY_FORM) => apiFetch("/api/hr/schichten", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-schichten"] }); toast({ title: "Schicht erstellt ✓" }); setDialogOpen(false); setForm(EMPTY_FORM); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/schichten/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-schichten"] }); toast({ title: "Schicht gelöscht" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const openDialog = (date?: string) => {
    setPrefillDate(date ?? "");
    setForm({ ...EMPTY_FORM, date: date ?? "" });
    setDialogOpen(true);
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <Clock className="w-6 h-6" /> Schichtplanung
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })} – {addDays(weekStart, 6).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Vorherige Woche"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Heute</Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Nächste Woche"><ChevronRight className="w-4 h-4" aria-hidden="true" /></Button>
          {canWrite && (
            <Button onClick={() => openDialog()} className="gap-2" style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
              <Plus className="w-4 h-4" /> Schicht
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const iso = isoDate(day);
            const isToday = iso === isoDate(new Date());
            const daySchichten = schichten.filter(s => s.date === iso);
            return (
              <div key={iso} className="min-h-[160px]">
                <div className={cn("text-center py-1.5 text-xs font-semibold rounded-t mb-1",
                  isToday ? "bg-[#1E4068] text-white" : "bg-muted text-muted-foreground")}>
                  <div>{WEEKDAYS_DE[i]}</div>
                  <div className="text-base font-bold">{day.getDate()}</div>
                </div>
                <div className="space-y-1 px-0.5">
                  {daySchichten.map(s => {
                    const typeStyle = SHIFT_TYPE_STYLES[s.shiftType] ?? { label: s.shiftType, bg: "bg-muted" };
                    return (
                      <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className={cn("rounded p-1.5 text-[11px] cursor-default group relative",
                          typeStyle.bg, SHIFT_STATUS_STYLES[s.status])}>
                        <div className="font-semibold truncate">{s.mitarbeiterName ?? `MA #${s.mitarbeiterId}`}</div>
                        <div className="opacity-80">{s.startTime}–{s.endTime}</div>
                        <div className="opacity-70">{typeStyle.label}</div>
                        {canWrite && (
                          <button onClick={() => deleteMut.mutate(s.id)}
                            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-600">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                  {canWrite && (
                    <button onClick={() => openDialog(iso)}
                      className="w-full text-center text-[10px] text-muted-foreground/50 hover:text-muted-foreground py-1 rounded border border-dashed border-muted/50 hover:border-muted transition-colors">
                      +
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legende */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        {Object.entries(SHIFT_TYPE_STYLES).map(([k, v]) => (
          <span key={k} className={cn("px-2 py-0.5 rounded text-xs font-medium", v.bg)}>{v.label}</span>
        ))}
      </div>

      {/* Dialog neue Schicht */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Neue Schicht</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm">Mitarbeiter</Label>
              <Select value={form.mitarbeiterId} onValueChange={v => setForm(f => ({ ...f, mitarbeiterId: v }))}>
                <SelectTrigger><SelectValue placeholder="Mitarbeiter wählen…" /></SelectTrigger>
                <SelectContent>{aktiveMa.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Datum</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Art</Label>
                <Select value={form.shiftType} onValueChange={v => setForm(f => ({ ...f, shiftType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SHIFT_TYPE_STYLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Von</Label>
                <Input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Bis</Label>
                <Input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Notiz</Label>
              <Input placeholder="Optional…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button disabled={addMut.isPending || !form.mitarbeiterId || !form.date}
              onClick={() => addMut.mutate(form)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
