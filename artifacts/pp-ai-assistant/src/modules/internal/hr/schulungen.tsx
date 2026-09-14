// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Schulungsmanagement
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap, Plus, Calendar, User, MapPin, Clock, Users, Award, Loader2, CheckCircle2,
} from "lucide-react";

interface Schulung {
  id: number; title: string; description?: string; trainer?: string;
  type: string; date?: string; durationHours?: number; location?: string;
  status: string; maxParticipants?: number; participants?: number[];
  certificateRequired?: boolean; createdAt: string;
}

const TYPE_STYLES: Record<string, string> = {
  pflicht: "bg-red-100 text-red-700",
  freiwillig: "bg-blue-100 text-blue-700",
  extern: "bg-teal-100 text-teal-700",
};
const TYPE_LABELS: Record<string, string> = {
  pflicht: "Pflicht", freiwillig: "Freiwillig", extern: "Extern",
};

const STATUS_STYLES: Record<string, string> = {
  geplant: "bg-muted text-muted-foreground",
  laufend: "bg-blue-100 text-blue-700",
  abgeschlossen: "bg-green-100 text-green-700",
  abgesagt: "bg-red-100 text-red-700",
};
const STATUS_LABELS: Record<string, string> = {
  geplant: "Geplant", laufend: "Laufend", abgeschlossen: "Abgeschlossen", abgesagt: "Abgesagt",
};

const EMPTY = {
  title: "", trainer: "", type: "freiwillig", date: "", durationHours: "",
  location: "", maxParticipants: "", certificateRequired: false, description: "",
};

export default function SchulungenPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("alle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const { data: schulungen = [], isLoading } = useQuery<Schulung[]>({
    queryKey: ["hr-schulungen"],
    queryFn: () => apiFetch<Schulung[]>("/api/hr/schulungen"),
    staleTime: 30_000,
  });

  const addMut = useMutation({
    mutationFn: (d: typeof EMPTY) => apiFetch("/api/hr/schulungen", {
      method: "POST",
      body: JSON.stringify({
        ...d,
        durationHours: d.durationHours ? Number(d.durationHours) : undefined,
        maxParticipants: d.maxParticipants ? Number(d.maxParticipants) : undefined,
        status: "geplant",
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-schulungen"] }); toast({ title: "Schulung erstellt ✓" }); setDialogOpen(false); setForm(EMPTY); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const completeMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/schulungen/${id}`, { method: "PATCH", body: JSON.stringify({ status: "abgeschlossen" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-schulungen"] }); toast({ title: "Schulung als abgeschlossen markiert ✓" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const sorted = [...schulungen].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const filtered = statusFilter === "alle" ? sorted : sorted.filter((s) => s.status === statusFilter);

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <GraduationCap className="w-6 h-6" /> Schulungen
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{schulungen.length} Schulungen · {schulungen.filter((s) => s.status === "geplant").length} geplant</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2" style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
          <Plus className="w-4 h-4" /> Schulung anlegen
        </Button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-1 border rounded-lg p-0.5 bg-card w-fit">
        {(["alle", "geplant", "laufend", "abgeschlossen", "abgesagt"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              statusFilter === s ? "bg-[#1E4068] text-white" : "text-muted-foreground hover:text-foreground")}>
            {s === "alle" ? "Alle" : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      {!isLoading && filtered.length === 0 && (
        <Card><CardContent className="py-14 text-center text-muted-foreground">
          <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Keine Schulungen gefunden</p>
        </CardContent></Card>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="hover:shadow-md transition-shadow h-full">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{s.title}</p>
                    {s.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.description}</p>}
                  </div>
                  <div className="flex flex-col gap-1 items-end shrink-0">
                    <Badge className={cn("text-xs border-0", TYPE_STYLES[s.type] ?? "bg-muted text-muted-foreground")}>
                      {TYPE_LABELS[s.type] ?? s.type}
                    </Badge>
                    <Badge className={cn("text-xs border-0", STATUS_STYLES[s.status] ?? "bg-muted text-muted-foreground")}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {s.trainer && <span className="flex items-center gap-1"><User className="w-3 h-3" />{s.trainer}</span>}
                  {s.date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(s.date).toLocaleDateString("de-DE")}</span>}
                  {s.durationHours && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.durationHours}h</span>}
                  {s.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.location}</span>}
                  {s.maxParticipants && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {(s.participants?.length ?? 0)}/{s.maxParticipants} TN
                    </span>
                  )}
                  {s.certificateRequired && (
                    <span className="flex items-center gap-1 text-amber-600"><Award className="w-3 h-3" />Zertifikat</span>
                  )}
                </div>

                {s.status === "laufend" || s.status === "geplant" ? (
                  <Button size="sm" variant="outline" className="w-full gap-1 text-green-600 border-green-200 hover:bg-green-50"
                    disabled={completeMut.isPending}
                    onClick={() => completeMut.mutate(s.id)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Als abgeschlossen markieren
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setForm(EMPTY); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Neue Schulung anlegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([["title", "Titel *", "text", "z.B. Datenschutz-Grundlagen"], ["trainer", "Trainer", "text", ""], ["date", "Datum", "date", ""], ["durationHours", "Dauer (Stunden)", "number", "8"], ["location", "Ort", "text", "z.B. Konferenzraum A"], ["maxParticipants", "Max. Teilnehmer", "number", "20"]] as [keyof typeof EMPTY, string, string, string][]).map(([k, label, type, ph]) => (
              <div key={k} className="space-y-1">
                <Label className="text-sm">{label}</Label>
                <Input type={type} placeholder={ph} value={(form[k] as string) ?? ""} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-sm">Typ</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Beschreibung</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.certificateRequired as boolean}
                onChange={(e) => setForm((f) => ({ ...f, certificateRequired: e.target.checked }))} />
              Zertifikat erforderlich
            </label>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button disabled={addMut.isPending || !form.title?.trim()} onClick={() => addMut.mutate(form)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
