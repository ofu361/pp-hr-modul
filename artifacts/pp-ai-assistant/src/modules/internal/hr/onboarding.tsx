// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Onboarding
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ClipboardList, ChevronDown, ChevronUp, Loader2, Plus, CheckSquare } from "lucide-react";

interface Mitarbeiter { id: number; name: string; startDate: string; status: string; }

interface OnboardingTask {
  id: number; mitarbeiterId: number; mitarbeiterName?: string;
  category: string; task: string; status: string;
  dueDate?: string; completedAt?: string; notes?: string; createdAt: string;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "dokumente", label: "Dokumente" },
  { key: "zugänge", label: "Zugänge & IT" },
  { key: "einführung", label: "Einführung" },
  { key: "ausstattung", label: "Ausstattung" },
  { key: "schulung", label: "Schulungen" },
  { key: "sonstiges", label: "Sonstiges" },
];

const TEMPLATES: Record<string, string[]> = {
  dokumente: ["Personalausweis kopieren", "Arbeitsvertrag unterschrieben", "Steuerkarte hinterlegen"],
  zugänge: ["E-Mail-Account erstellen", `-Zugang anlegen`, "Schlüssel aushändigen"],
  einführung: ["Bürorundgang", "Team vorstellen", "Prozesse erklären"],
  ausstattung: ["Laptop einrichten", "Handy konfigurieren", "Arbeitsplatz ausstatten"],
  schulung: ["Datenschutz-Schulung", "Brandschutz-Einweisung", `-System-Training`],
  sonstiges: ["Willkommensmappe übergeben", "Parkmöglichkeiten erklären", "Kantine vorstellen"],
};

export default function OnboardingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedMa, setSelectedMa] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [templateDialog, setTemplateDialog] = useState(false);
  const [templateMa, setTemplateMa] = useState<string>("");
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  const { data: mitarbeiter = [] } = useQuery<Mitarbeiter[]>({
    queryKey: ["hr-mitarbeiter"],
    queryFn: () => apiFetch<Mitarbeiter[]>("/api/hr/mitarbeiter"),
    staleTime: 60_000,
  });

  const { data: tasks = [], isLoading } = useQuery<OnboardingTask[]>({
    queryKey: ["hr-onboarding", selectedMa],
    queryFn: () => apiFetch<OnboardingTask[]>(`/api/hr/onboarding${selectedMa !== "all" ? `?mitarbeiterId=${selectedMa}` : ""}`),
    staleTime: 20_000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/hr/onboarding/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-onboarding"] }),
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  const bulkAddMut = useMutation({
    mutationFn: (items: { mitarbeiterId: number; category: string; task: string; status: string }[]) =>
      Promise.all(items.map((item) => apiFetch("/api/hr/onboarding", { method: "POST", body: JSON.stringify(item) }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-onboarding"] });
      toast({ title: "Onboarding-Aufgaben erstellt ✓" });
      setTemplateDialog(false);
      setSelectedTasks([]);
      setTemplateMa("");
    },
    onError: (e) => toast({ title: "Fehler", description: (e as Error).message, variant: "destructive" }),
  });

  // 90-day filter for recent hires
  const recentMa = mitarbeiter.filter((m) => {
    const days = (Date.now() - new Date(m.startDate).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 90;
  });

  const allMa = mitarbeiter;

  const done = tasks.filter((t) => t.status === "erledigt").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  function toggleTemplateTask(task: string) {
    setSelectedTasks((prev) => prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task]);
  }

  function submitTemplates() {
    if (!templateMa || selectedTasks.length === 0) return;
    const items = selectedTasks.map((task) => {
      const cat = Object.entries(TEMPLATES).find(([, tasks]) => tasks.includes(task))?.[0] ?? "sonstiges";
      return { mitarbeiterId: Number(templateMa), category: cat, task, status: "offen" };
    });
    bulkAddMut.mutate(items);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
            <ClipboardList className="w-6 h-6" /> Onboarding
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aufgaben für neue Mitarbeiter verwalten</p>
        </div>
        <Button onClick={() => setTemplateDialog(true)} className="gap-2" style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
          <Plus className="w-4 h-4" /> Mitarbeiter onboarden
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm shrink-0">Mitarbeiter:</Label>
        <Select value={selectedMa} onValueChange={setSelectedMa}>
          <SelectTrigger className="w-64 h-9">
            <SelectValue placeholder="Alle / Auswählen…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Mitarbeiter</SelectItem>
            {recentMa.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">Neueinstellungen (90 Tage)</SelectLabel>
                {recentMa.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
              </SelectGroup>
            )}
            {allMa.filter((m) => !recentMa.find((r) => r.id === m.id)).length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground">Weitere Mitarbeiter</SelectLabel>
                {allMa.filter((m) => !recentMa.find((r) => r.id === m.id)).map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Progress */}
      {total > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Fortschritt</span>
              <span className="text-muted-foreground">{done} / {total} erledigt ({pct}%)</span>
            </div>
            <div className="h-2 bg-accent rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#CC7B5C" }} />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}

      {!isLoading && tasks.length === 0 && (
        <Card><CardContent className="py-14 text-center text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Keine Onboarding-Aufgaben</p>
          <p className="text-xs mt-1">Klicke auf "Mitarbeiter onboarden" um Aufgaben anzulegen.</p>
        </CardContent></Card>
      )}

      {/* Category sections */}
      {CATEGORIES.map(({ key, label }) => {
        const catTasks = tasks.filter((t) => t.category === key);
        if (catTasks.length === 0) return null;
        const catDone = catTasks.filter((t) => t.status === "erledigt").length;
        const isOpen = !collapsed[key];
        return (
          <Card key={key}>
            <CardHeader className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleCollapse(key)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{label}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{catDone}/{catTasks.length}</Badge>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="pt-0 px-4 pb-3 space-y-1.5">
                {catTasks.map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                    <button
                      onClick={() => toggleMut.mutate({ id: t.id, status: t.status === "erledigt" ? "offen" : "erledigt" })}
                      className={cn("mt-0.5 shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors",
                        t.status === "erledigt" ? "border-green-500 bg-green-500 text-white" : "border-border hover:border-green-400")}>
                      {t.status === "erledigt" && <CheckSquare className="w-3 h-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", t.status === "erledigt" && "line-through text-muted-foreground")}>{t.task}</p>
                      {t.dueDate && <p className="text-xs text-muted-foreground">Fällig: {new Date(t.dueDate).toLocaleDateString("de-DE")}</p>}
                      {t.mitarbeiterName && selectedMa === "all" && <p className="text-xs text-muted-foreground">{t.mitarbeiterName}</p>}
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Template Dialog */}
      <Dialog open={templateDialog} onOpenChange={(v) => { if (!v) { setTemplateDialog(false); setSelectedTasks([]); setTemplateMa(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mitarbeiter onboarden</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm">Mitarbeiter</Label>
              <Select value={templateMa} onValueChange={setTemplateMa}>
                <SelectTrigger><SelectValue placeholder="Mitarbeiter wählen…" /></SelectTrigger>
                <SelectContent>{allMa.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label className="text-sm">Aufgaben auswählen</Label>
              {CATEGORIES.map(({ key, label }) => (
                <div key={key}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                  <div className="space-y-1">
                    {TEMPLATES[key].map((task) => (
                      <label key={task} className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground py-0.5">
                        <input type="checkbox" checked={selectedTasks.includes(task)}
                          onChange={() => toggleTemplateTask(task)} className="rounded" />
                        {task}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {selectedTasks.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedTasks.length} Aufgaben ausgewählt</p>
            )}
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Abbrechen</Button>
            <Button disabled={bulkAddMut.isPending || !templateMa || selectedTasks.length === 0}
              onClick={submitTemplates} style={{ backgroundColor: "#1E4068", color: "white" }}>
              {bulkAddMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Aufgaben erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
