// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Mitarbeiterverwaltung
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { useGemerkteAnsicht } from "@/shared/hooks/use-gemerkte-ansicht";
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
  Users, Plus, Search, Pencil, Trash2, Loader2, Phone, Briefcase,
} from "lucide-react";

interface Mitarbeiter {
  id: number; companyId: number; userId?: number | null;
  name: string; jobTitle: string; abteilung?: string;
  employmentType: string; startDate: string; endDate?: string | null;
  status: string; weeklyHours?: number; salaryGross?: number;
  phone?: string; address?: string; city?: string;
  emergencyContact?: string; emergencyPhone?: string;
  notes?: string; createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  aktiv: "bg-green-100 text-green-700",
  elternzeit: "bg-blue-100 text-blue-700",
  krank: "bg-amber-100 text-amber-700",
  gekündigt: "bg-muted text-muted-foreground",
  ausgeschieden: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  aktiv: "Aktiv", elternzeit: "Elternzeit", krank: "Krank",
  gekündigt: "Gekündigt", ausgeschieden: "Ausgeschieden",
};

const EMP_LABELS: Record<string, string> = {
  vollzeit: "Vollzeit", teilzeit: "Teilzeit", minijob: "Minijob",
  werkstudent: "Werkstudent", praktikant: "Praktikant",
};

interface Benutzerkonto {
  id: number; name: string; username: string; email: string;
  role: string; isActive: boolean;
  /** Name des Mitarbeiters, der dieses Konto schon hat — sonst null. */
  belegtVon: string | null;
}

/** Wert des Auswahlfelds für „kein Konto". Select kann keinen leeren String. */
const KEIN_KONTO = "kein-konto";

const EMPTY: Partial<Mitarbeiter> = {
  name: "", jobTitle: "", abteilung: "", employmentType: "vollzeit",
  startDate: "", status: "aktiv", weeklyHours: undefined, phone: "", notes: "",
  userId: undefined,
};

export default function MitarbeiterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [ansicht, setAnsicht] = useGemerkteAnsicht("hr-mitarbeiter.ansicht", { search: "", statusFilter: "alle" });
  const { search, statusFilter } = ansicht;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Mitarbeiter | null>(null);
  const [form, setForm] = useState<Partial<Mitarbeiter>>(EMPTY);

  const { data: mitarbeiter = [], isLoading } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 30_000,
  });

  // Konten der Firma für das Feld „Benutzerkonto". Erst laden, wenn der Dialog
  // offen ist — die Liste wird sonst bei jedem Seitenaufruf mitgeholt, obwohl
  // sie nur beim Bearbeiten gebraucht wird.
  const { data: konten = [] } = useQuery<Benutzerkonto[]>({
    queryKey: ["hr-benutzer-auswahl"],
    queryFn: () => apiFetch<Benutzerkonto[]>("/api/hr/benutzer-auswahl"),
    enabled: dialogOpen,
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: (data: Partial<Mitarbeiter>) =>
      editing
        ? apiFetch(`/api/hr/mitarbeiter/${editing.id}`, { method: "PATCH", body: JSON.stringify(data) })
        : apiFetch("/api/hr/mitarbeiter", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-mitarbeiter"] });
      qc.invalidateQueries({ queryKey: ["hr-stats"] });
      toast({ title: editing ? "Mitarbeiter aktualisiert ✓" : "Mitarbeiter hinzugefügt ✓" });
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/mitarbeiter/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-mitarbeiter"] });
      qc.invalidateQueries({ queryKey: ["hr-stats"] });
      toast({ title: "Mitarbeiter gelöscht" });
      setDeleteId(null);
    },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const filtered = mitarbeiter
    .filter((m) => statusFilter === "alle" || m.status === statusFilter)
    .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.jobTitle?.toLowerCase().includes(search.toLowerCase()));

  function openAdd() { setEditing(null); setForm(EMPTY); setDialogOpen(true); }
  function openEdit(m: Mitarbeiter) {
    setEditing(m);
    setForm({ name: m.name, jobTitle: m.jobTitle, abteilung: m.abteilung, employmentType: m.employmentType,
      startDate: m.startDate?.slice(0, 10), status: m.status, weeklyHours: m.weeklyHours,
      phone: m.phone, notes: m.notes, userId: m.userId ?? null });
    setDialogOpen(true);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <Users className="w-6 h-6" /> Mitarbeiter
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{mitarbeiter.length} Mitarbeiter insgesamt</p>
        </div>
        <Button onClick={openAdd} className="gap-2" style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
          <Plus className="w-4 h-4" /> Mitarbeiter hinzufügen
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Name oder Stelle suchen…" className="pl-9 h-9" value={search} onChange={(e) => setAnsicht({ search: e.target.value })} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setAnsicht({ statusFilter: v })}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      {!isLoading && filtered.length === 0 && (
        <Card><CardContent className="py-14 text-center text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">{search ? "Keine Treffer" : "Noch keine Mitarbeiter"}</p>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {filtered.map((m, i) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{m.name}</span>
                      <Badge className={cn("text-xs border-0", STATUS_COLORS[m.status] ?? "bg-muted text-muted-foreground")}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{EMP_LABELS[m.employmentType] ?? m.employmentType}</Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{m.jobTitle}</span>
                      {m.abteilung && <span>{m.abteilung}</span>}
                      {m.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{m.phone}</span>}
                      <span>Seit {new Date(m.startDate).toLocaleDateString("de-DE")}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openEdit(m)} className="gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteId(m.id)}
                      className="gap-1 text-red-600 border-red-200 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setEditing(null); setForm(EMPTY); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {([
              ["name", "Name *", "text", "Max Mustermann"],
              ["jobTitle", "Stellenbezeichnung *", "text", "Immobilienmakler"],
              ["abteilung", "Abteilung", "text", "Vertrieb"],
              ["startDate", "Eintrittsdatum *", "date", ""],
              ["weeklyHours", "Wochenstunden", "number", "40"],
              ["phone", "Telefon", "tel", "+49 151 ..."],
            ] as [keyof Mitarbeiter, string, string, string][]).map(([k, label, type, ph]) => (
              <div key={k} className="space-y-1">
                <Label className="text-sm">{label}</Label>
                <Input type={type} placeholder={ph} value={(form[k] as string) ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-sm">Beschäftigungsart</Label>
              <Select value={form.employmentType ?? "vollzeit"} onValueChange={(v) => setForm((f) => ({ ...f, employmentType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EMP_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Status</Label>
              <Select value={form.status ?? "aktiv"} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* ⚠ Ohne dieses Feld ist der Personalbereich nur halb da: `userId`
                ist die einzige Verbindung zwischen Login und Mitarbeiter, und
                bis 14.08.2026 schrieb sie kein Pfad. „Meine Daten"
                (/hr/self-service) lieferte deshalb jedem „Kein
                Mitarbeiterprofil gefunden" — und es gab keinen Weg aus der
                Oberfläche, das zu reparieren. Bereits vergebene Konten sind
                gesperrt statt versteckt: wer sucht, warum ein Kollege nicht in
                der Liste steht, soll die Antwort dort lesen können. */}
            <div className="space-y-1">
              <Label className="text-sm">Benutzerkonto</Label>
              <Select
                value={form.userId != null ? String(form.userId) : KEIN_KONTO}
                onValueChange={(v) => setForm((f) => ({ ...f, userId: v === KEIN_KONTO ? null : Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Kein Konto verknüpft" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEIN_KONTO}>— kein Konto verknüpft —</SelectItem>
                  {konten.map((k) => {
                    // Das eigene Konto bleibt wählbar, fremd vergebene nicht.
                    const eigenes = editing != null && k.id === editing.userId;
                    return (
                      <SelectItem key={k.id} value={String(k.id)} disabled={!!k.belegtVon && !eigenes}>
                        {k.name || k.username}
                        {k.email ? ` · ${k.email}` : ""}
                        {k.belegtVon && !eigenes ? ` — vergeben an ${k.belegtVon}` : ""}
                        {!k.isActive ? " (inaktiv)" : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Nötig für „Meine Daten", Urlaubsanträge und die eigene Zeiterfassung.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Notizen</Label>
              <Textarea placeholder="Interne Notizen…" rows={2} value={form.notes ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditing(null); setForm(EMPTY); }}>Abbrechen</Button>
            <Button disabled={saveMut.isPending || !form.name?.trim() || !form.jobTitle?.trim()}
              onClick={() => saveMut.mutate(form)}
              style={{ backgroundColor: "#1E4068", color: "white" }}>
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editing ? "Speichern" : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteId != null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mitarbeiter löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Diese Aktion kann nicht rückgängig gemacht werden.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Abbrechen</Button>
            <Button variant="destructive" disabled={deleteMut.isPending}
              onClick={() => deleteId && deleteMut.mutate(deleteId)}>
              {deleteMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
