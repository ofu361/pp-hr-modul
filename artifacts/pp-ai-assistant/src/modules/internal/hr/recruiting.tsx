// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Recruiting (Stellenangebote & Bewerber)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BewerbungAusMail } from "./bewerbung-aus-mail";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Briefcase, Plus, Users, MapPin, Calendar, Loader2, UserPlus } from "lucide-react";

interface Stelle {
  id: number; title: string; department?: string; description?: string;
  employmentType?: string; salaryMin?: number; salaryMax?: number;
  location?: string; remote?: boolean;
  status: string; publishDate?: string; closingDate?: string; createdAt: string;
}

interface Bewerber {
  id: number; stelleId?: number; stelleTitle?: string;
  name: string; email?: string; phone?: string;
  status: string; notes?: string; appliedAt: string; interviewDate?: string; createdAt: string;
}

const STELLE_STATUS: Record<string, string> = {
  offen: "bg-green-100 text-green-700", besetzt: "bg-blue-100 text-blue-700",
  pausiert: "bg-amber-100 text-amber-700", geschlossen: "bg-muted text-muted-foreground",
};
const STELLE_LABELS: Record<string, string> = {
  offen: "Offen", besetzt: "Besetzt", pausiert: "Pausiert", geschlossen: "Geschlossen",
};

const BEW_PIPELINE: { key: string; label: string; color: string }[] = [
  { key: "neu", label: "Neu", color: "bg-muted text-muted-foreground" },
  { key: "in-prüfung", label: "In Prüfung", color: "bg-blue-100 text-blue-700" },
  { key: "interview", label: "Interview", color: "bg-[#1E4068]/10 text-[#1E4068]" },
  { key: "angebot", label: "Angebot", color: "bg-amber-100 text-amber-700" },
  { key: "angestellt", label: "Angestellt", color: "bg-green-100 text-green-700" },
  { key: "abgelehnt", label: "Abgelehnt", color: "bg-red-100 text-red-700" },
];

const EMP_TYPES = ["vollzeit", "teilzeit", "minijob", "werkstudent", "praktikant"];

export default function RecruitingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [stelleDialog, setStelleDialog] = useState(false);
  const [bewerberDialog, setBewerberDialog] = useState(false);
  const [filterStelle, setFilterStelle] = useState("alle");
  const [stelleForm, setStelleForm] = useState<Partial<Stelle>>({ status: "offen" });
  const [bewForm, setBewForm] = useState<Partial<Bewerber>>({ status: "neu" });

  const { data: stellen = [], isLoading: loadingStellen } = useQuery<Stelle[]>({
    queryKey: ["hr-stellen"],
    queryFn: () => apiFetch<Stelle[]>("/api/hr/stellungen"),
    staleTime: 30_000,
  });

  const { data: bewerber = [], isLoading: loadingBew } = useQuery<Bewerber[]>({
    queryKey: ["hr-bewerber"],
    queryFn: () => apiFetch<Bewerber[]>("/api/hr/bewerber"),
    staleTime: 30_000,
  });

  const addStelleMut = useMutation({
    mutationFn: (d: Partial<Stelle>) => apiFetch("/api/hr/stellungen", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-stellen"] }); toast({ title: "Stelle erstellt ✓" }); setStelleDialog(false); setStelleForm({ status: "offen" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const addBewMut = useMutation({
    mutationFn: (d: Partial<Bewerber>) => apiFetch("/api/hr/bewerber", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-bewerber"] }); toast({ title: "Bewerber hinzugefügt ✓" }); setBewerberDialog(false); setBewForm({ status: "neu" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const updateBewMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/hr/bewerber/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-bewerber"] }); toast({ title: "Status aktualisiert ✓" }); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const filteredBew = filterStelle === "alle"
    ? bewerber
    : bewerber.filter((b) => String(b.stelleId) === filterStelle);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <Briefcase className="w-6 h-6" /> Recruiting
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{stellen.filter((s) => s.status === "offen").length} offene Stellen · {bewerber.length} Bewerber</p>
        </div>
        <div className="flex gap-2">
          <BewerbungAusMail onUebernehmen={(v) => {
            // Der Vorschlag füllt das Formular — angelegt wird erst mit dem Klick im Dialog.
            setBewForm({ status: "neu", name: v.name ?? "", email: v.email ?? undefined, phone: v.phone ?? undefined, stelleId: v.stelleId ?? undefined,
              notes: [v.kurzprofil, v.passung.length ? `Passung: ${v.passung.join(", ")}` : ""].filter(Boolean).join("\n") });
            setBewerberDialog(true);
          }} />
          <Button variant="outline" onClick={() => setBewerberDialog(true)} className="gap-2">
            <UserPlus className="w-4 h-4" /> Bewerber
          </Button>
          <Button onClick={() => setStelleDialog(true)} className="gap-2" style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
            <Plus className="w-4 h-4" /> Stelle ausschreiben
          </Button>
        </div>
      </div>

      {/* Stellenangebote */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Stellenangebote</h2>
        {loadingStellen ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {stellen.length === 0 && (
              <Card className="col-span-2"><CardContent className="py-10 text-center text-muted-foreground">
                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Noch keine Stellen ausgeschrieben</p>
              </CardContent></Card>
            )}
            {stellen.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-foreground">{s.title}</p>
                        {s.department && <p className="text-xs text-muted-foreground">{s.department}</p>}
                      </div>
                      <Badge className={cn("text-xs border-0 shrink-0", STELLE_STATUS[s.status] ?? "bg-muted text-muted-foreground")}>
                        {STELLE_LABELS[s.status] ?? s.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {s.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.location}</span>}
                      {s.closingDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />bis {new Date(s.closingDate).toLocaleDateString("de-DE")}</span>}
                      {s.employmentType && <span>{s.employmentType}</span>}
                    </div>
                    {(s.salaryMin || s.salaryMax) && (
                      <p className="text-xs font-medium text-green-700">
                        {s.salaryMin ? `ab ${(s.salaryMin / 100).toLocaleString("de-DE")} €` : ""}
                        {s.salaryMin && s.salaryMax ? " – " : ""}
                        {s.salaryMax ? `bis ${(s.salaryMax / 100).toLocaleString("de-DE")} €` : ""}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {bewerber.filter((b) => b.stelleId === s.id).length} Bewerber
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Bewerber */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bewerber</h2>
          <Select value={filterStelle} onValueChange={setFilterStelle}>
            <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Alle Stellen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Stellen</SelectItem>
              {stellen.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loadingBew ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-2">
            {filteredBew.length === 0 && (
              <Card><CardContent className="py-10 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-20" /><p>Keine Bewerber</p>
              </CardContent></Card>
            )}
            {filteredBew.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.stelleTitle ?? stellen.find((s) => s.id === b.stelleId)?.title ?? "—"} · {b.email}
                      </p>
                    </div>
                    <Select value={b.status} onValueChange={(v) => updateBewMut.mutate({ id: b.id, status: v })}>
                      <SelectTrigger className="w-36 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BEW_PIPELINE.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Stelle Dialog */}
      <Dialog open={stelleDialog} onOpenChange={(v) => { if (!v) { setStelleDialog(false); setStelleForm({ status: "offen" }); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Neue Stelle ausschreiben</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([["title", "Stellenbezeichnung *", "text", "z.B. Immobilienmakler"], ["department", "Abteilung", "text", "Vertrieb"], ["location", "Standort", "text", "München"], ["closingDate", "Bewerbungsschluss", "date", ""]] as [keyof Stelle, string, string, string][]).map(([k, label, type, ph]) => (
              <div key={k} className="space-y-1">
                <Label className="text-sm">{label}</Label>
                <Input type={type} placeholder={ph} value={(stelleForm[k] as string) ?? ""} onChange={(e) => setStelleForm((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-sm">Beschäftigungsart</Label>
              <Select value={stelleForm.employmentType ?? ""} onValueChange={(v) => setStelleForm((f) => ({ ...f, employmentType: v }))}>
                <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>{EMP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Beschreibung</Label>
              <Textarea rows={3} value={stelleForm.description ?? ""} onChange={(e) => setStelleForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setStelleDialog(false)}>Abbrechen</Button>
            <Button disabled={addStelleMut.isPending || !stelleForm.title?.trim()} onClick={() => addStelleMut.mutate(stelleForm)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addStelleMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Ausschreiben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bewerber Dialog */}
      <Dialog open={bewerberDialog} onOpenChange={(v) => { if (!v) { setBewerberDialog(false); setBewForm({ status: "neu" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Bewerber hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {([["name", "Name *", "text", ""], ["email", "E-Mail", "email", ""], ["phone", "Telefon", "tel", ""]] as [keyof Bewerber, string, string, string][]).map(([k, label, type, ph]) => (
              <div key={k} className="space-y-1">
                <Label className="text-sm">{label}</Label>
                <Input type={type} placeholder={ph} value={(bewForm[k] as string) ?? ""} onChange={(e) => setBewForm((f) => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-sm">Bewerbung für</Label>
              <Select value={String(bewForm.stelleId ?? "")} onValueChange={(v) => setBewForm((f) => ({ ...f, stelleId: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Stelle wählen…" /></SelectTrigger>
                <SelectContent>{stellen.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Notizen</Label>
              <Textarea rows={2} value={bewForm.notes ?? ""} onChange={(e) => setBewForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setBewerberDialog(false)}>Abbrechen</Button>
            <Button disabled={addBewMut.isPending || !bewForm.name?.trim()} onClick={() => addBewMut.mutate(bewForm)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addBewMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
