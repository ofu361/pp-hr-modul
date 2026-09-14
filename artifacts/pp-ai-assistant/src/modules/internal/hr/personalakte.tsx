// © 2026 P&P Group. Proprietary & Confidential.
// HR — Digitale Personalakte (Dokumente je Mitarbeiter)
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen, Plus, Trash2, Loader2, FileText, AlertTriangle, User,
} from "lucide-react";

interface Mitarbeiter { id: number; name: string; status: string; jobTitle: string; abteilung?: string; }
interface PersonalakteDok {
  id: number; mitarbeiterId: number; docType: string; title: string;
  fileUrl?: string; expiresAt?: string; notes?: string; createdAt: string;
}

const DOC_TYPE_STYLES: Record<string, { label: string; color: string }> = {
  arbeitsvertrag: { label: "Arbeitsvertrag", color: "bg-blue-100 text-blue-700" },
  zeugnis:        { label: "Zeugnis",         color: "bg-green-100 text-green-700" },
  bescheinigung:  { label: "Bescheinigung",   color: "bg-purple-100 text-purple-700" },
  abmahnung:      { label: "Abmahnung",       color: "bg-red-100 text-red-700" },
  sonstiges:      { label: "Sonstiges",       color: "bg-muted text-muted-foreground" },
};

const EMPTY_FORM = { docType: "sonstiges", title: "", fileUrl: "", expiresAt: "", notes: "" };

function isExpiringSoon(dateStr?: string): boolean {
  if (!dateStr) return false;
  const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}
function isExpired(dateStr?: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function PersonalaktePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePermissions();
  const canWrite = perms.role === "admin" || perms.role === "manager";

  const [selectedMa, setSelectedMa] = useState<Mitarbeiter | null>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });

  const { data: dokumente = [], isLoading: docsLoading } = useQuery<PersonalakteDok[]>({
    queryKey: ["hr-personalakte", selectedMa?.id],
    queryFn: () => apiFetch<PersonalakteDok[]>(`/api/hr/personalakte/${selectedMa!.id}`),
    enabled: !!selectedMa,
    staleTime: 20_000,
  });

  const addMut = useMutation({
    mutationFn: (d: typeof EMPTY_FORM) =>
      apiFetch(`/api/hr/personalakte/${selectedMa!.id}`, { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-personalakte"] }); toast({ title: "Dokument hinzugefügt ✓" }); setDialogOpen(false); setForm(EMPTY_FORM); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/hr/personalakte/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-personalakte"] }); toast({ title: "Dokument gelöscht" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const filtered = mitarbeiter.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.abteilung?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
          <FolderOpen className="w-6 h-6" /> Digitale Personalakte
        </h1>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-5">
        {/* Mitarbeiterliste */}
        <div className="space-y-2">
          <Input placeholder="Mitarbeiter suchen…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
          <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
            {filtered.map(m => (
              <button key={m.id} onClick={() => setSelectedMa(m)}
                className={cn("w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors",
                  selectedMa?.id === m.id ? "bg-[#1E4068] text-white" : "hover:bg-muted/70")}>
                <div className="font-medium flex items-center gap-2">
                  <User className="w-3.5 h-3.5 shrink-0" /> {m.name}
                </div>
                <div className={cn("text-xs mt-0.5", selectedMa?.id === m.id ? "text-white/70" : "text-muted-foreground")}>
                  {m.jobTitle || "—"} {m.abteilung ? `· ${m.abteilung}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Dokumentenbereich */}
        <div>
          {!selectedMa ? (
            <Card><CardContent className="py-16 text-center text-muted-foreground">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>Mitarbeiter auswählen</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground">{selectedMa.name} — Akte</h2>
                {canWrite && (
                  <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2"
                    style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
                    <Plus className="w-3.5 h-3.5" /> Dokument
                  </Button>
                )}
              </div>

              {docsLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : dokumente.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Noch keine Dokumente</p>
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {dokumente.map((d, i) => {
                    const typeInfo = DOC_TYPE_STYLES[d.docType] ?? DOC_TYPE_STYLES.sonstiges;
                    const expired = isExpired(d.expiresAt ?? undefined);
                    const expiringSoon = !expired && isExpiringSoon(d.expiresAt ?? undefined);
                    return (
                      <motion.div key={d.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <Card className={cn("hover:shadow-sm transition-shadow", expired && "border-red-300")}>
                          <CardContent className="p-3 flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{d.title}</span>
                                  <Badge className={cn("text-xs border-0", typeInfo.color)}>{typeInfo.label}</Badge>
                                  {expired && <Badge className="text-xs border-0 bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Abgelaufen</Badge>}
                                  {expiringSoon && <Badge className="text-xs border-0 bg-amber-100 text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Läuft ab</Badge>}
                                </div>
                                {d.expiresAt && <p className="text-xs text-muted-foreground mt-0.5">Gültig bis: {new Date(d.expiresAt).toLocaleDateString("de-DE")}</p>}
                                {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                                {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Datei öffnen</a>}
                              </div>
                            </div>
                            {canWrite && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600"
                                onClick={() => deleteMut.mutate(d.id)} aria-label="Dokument löschen">
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Dokument hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm">Dokumententyp</Label>
              <Select value={form.docType} onValueChange={v => setForm(f => ({ ...f, docType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DOC_TYPE_STYLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Titel / Bezeichnung</Label>
              <Input placeholder="z.B. Arbeitsvertrag 2026" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Gültig bis (optional)</Label>
              <Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Datei-URL (optional)</Label>
              <Input placeholder="https://…" value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Notiz</Label>
              <Textarea rows={2} placeholder="Optional…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button disabled={addMut.isPending || !form.title}
              onClick={() => addMut.mutate(form)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
