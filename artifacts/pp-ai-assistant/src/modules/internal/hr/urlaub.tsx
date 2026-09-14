// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Urlaubsverwaltung
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calendar, Plus, CheckCircle2, XCircle, Clock, Loader2, User,
} from "lucide-react";

interface Mitarbeiter { id: number; name: string; status: string; }

interface Urlaub {
  id: number; mitarbeiterId: number; mitarbeiterName?: string;
  type: string; startDate: string; endDate: string; days: number;
  status: string; approvedBy?: number; approvedAt?: string;
  reason?: string; notes?: string; createdAt: string;
}

const TYPE_STYLES: Record<string, { label: string; color: string }> = {
  urlaub: { label: "Urlaub", color: "bg-blue-100 text-blue-700" },
  krank: { label: "Krankmeldung", color: "bg-orange-100 text-orange-700" },
  sonderurlaub: { label: "Sonderurlaub", color: "bg-[#1E4068]/10 text-[#1E4068]" },
  überstunden: { label: "Überstunden", color: "bg-muted text-muted-foreground" },
  homeoffice: { label: "Homeoffice", color: "bg-teal-100 text-teal-700" },
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  ausstehend: { label: "Ausstehend", color: "bg-amber-100 text-amber-700" },
  genehmigt: { label: "Genehmigt", color: "bg-green-100 text-green-700" },
  abgelehnt: { label: "Abgelehnt", color: "bg-red-100 text-red-700" },
};

const EMPTY_FORM = { mitarbeiterId: "", type: "urlaub", startDate: "", endDate: "", reason: "" };

export default function UrlaubPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePermissions();
  const canApprove = perms.role === "admin" || perms.role === "manager";

  const [tab, setTab] = useState<"alle" | "ausstehend">("alle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approveId, setApproveId] = useState<number | null>(null);
  const [approveAction, setApproveAction] = useState<"genehmigt" | "abgelehnt" | null>(null);
  const [comment, setComment] = useState("");
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);

  const { data: urlaube = [], isLoading } = useQuery<Urlaub[]>({
    queryKey: ["hr-urlaub"],
    queryFn: () => apiFetch<Urlaub[]>("/api/hr/urlaub"),
    staleTime: 20_000,
  });

  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });

  const activeMa = mitarbeiter.filter((m) => m.status === "aktiv");

  const addMut = useMutation({
    mutationFn: (d: typeof EMPTY_FORM) => apiFetch("/api/hr/urlaub", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hr-urlaub"] }); toast({ title: "Antrag eingereicht ✓" }); setDialogOpen(false); setForm(EMPTY_FORM); },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const decideMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/hr/urlaub/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["hr-urlaub"] });
      toast({ title: v.status === "genehmigt" ? "Genehmigt ✓" : "Abgelehnt" });
      setApproveId(null); setApproveAction(null); setComment("");
    },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const pending = urlaube.filter((u) => u.status === "ausstehend");
  const displayed = tab === "ausstehend" ? pending : urlaube;

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <Calendar className="w-6 h-6" /> Urlaub & Abwesenheiten
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{urlaube.length} Anträge gesamt</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2" style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
          <Plus className="w-4 h-4" /> Neuer Antrag
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["alle", "ausstehend"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "alle" ? `Alle (${urlaube.length})` : (
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> Ausstehend
                {pending.length > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pending.length}</span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      {!isLoading && displayed.length === 0 && (
        <Card><CardContent className="py-14 text-center text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Keine Anträge</p>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {displayed.map((u, i) => {
          const typeInfo = TYPE_STYLES[u.type] ?? { label: u.type, color: "bg-muted text-muted-foreground" };
          const statusInfo = STATUS_STYLES[u.status] ?? { label: u.status, color: "bg-muted text-muted-foreground" };
          return (
            <motion.div key={u.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          {u.mitarbeiterName ?? `MA #${u.mitarbeiterId}`}
                        </span>
                        <Badge className={cn("text-xs border-0", typeInfo.color)}>{typeInfo.label}</Badge>
                        <Badge className={cn("text-xs border-0", statusInfo.color)}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(u.startDate).toLocaleDateString("de-DE")} – {new Date(u.endDate).toLocaleDateString("de-DE")}
                        <span className="text-muted-foreground ml-2">({u.days} {u.days === 1 ? "Tag" : "Tage"})</span>
                      </p>
                      {u.reason && <p className="text-xs text-muted-foreground">{u.reason}</p>}
                    </div>
                    {canApprove && u.status === "ausstehend" && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => { setApproveId(u.id); setApproveAction("abgelehnt"); }}>
                          <XCircle className="w-3.5 h-3.5" /> Ablehnen
                        </Button>
                        <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => { setApproveId(u.id); setApproveAction("genehmigt"); }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Genehmigen
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Neuer Antrag Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setDialogOpen(false); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Neuer Abwesenheitsantrag</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm">Mitarbeiter</Label>
              <Select value={form.mitarbeiterId} onValueChange={(v) => setForm((f) => ({ ...f, mitarbeiterId: v }))}>
                <SelectTrigger><SelectValue placeholder="Mitarbeiter wählen…" /></SelectTrigger>
                <SelectContent>{activeMa.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Art der Abwesenheit</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_STYLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Von</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Bis</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Begründung</Label>
              <Input placeholder="z.B. Familienurlaub" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button disabled={addMut.isPending || !form.mitarbeiterId || !form.startDate || !form.endDate}
              onClick={() => addMut.mutate(form)} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {addMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Einreichen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Genehmigung Dialog */}
      <Dialog open={approveAction != null} onOpenChange={(v) => { if (!v) { setApproveId(null); setApproveAction(null); setComment(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={cn("flex items-center gap-2", approveAction === "genehmigt" ? "text-green-700" : "text-red-700")}>
              {approveAction === "genehmigt" ? <><CheckCircle2 className="w-5 h-5" /> Antrag genehmigen</> : <><XCircle className="w-5 h-5" /> Antrag ablehnen</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm">Kommentar {approveAction === "abgelehnt" ? "(Pflicht)" : "(optional)"}</Label>
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Begründung…" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setApproveId(null); setApproveAction(null); setComment(""); }}>Abbrechen</Button>
            <Button disabled={decideMut.isPending || (approveAction === "abgelehnt" && !comment.trim())}
              onClick={() => approveId && approveAction && decideMut.mutate({ id: approveId, status: approveAction })}
              className={cn("gap-2", approveAction === "genehmigt" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700")}>
              {decideMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {approveAction === "genehmigt" ? "Genehmigen" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
