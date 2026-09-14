// © 2026 P&P Group. Proprietary & Confidential.
// Recruiting: Bewerbung aus Mailtext lesen (0436) — Vorschlag, den man in das
// Bewerber-Formular übernimmt. Nichts wird ohne Klick angelegt.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/shared/hooks/use-toast";
import { apiFetch } from "@/shared/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, X } from "lucide-react";

export interface BewerbungVorschlag { name: string | null; email: string | null; phone: string | null; stelleText: string | null; stelleId: number | null; kurzprofil: string; passung: string[]; istBewerbung: boolean; hinweise: string[] }

export function BewerbungAusMail({ onUebernehmen }: { onUebernehmen: (v: BewerbungVorschlag) => void }) {
  const { toast } = useToast();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [v, setV] = useState<BewerbungVorschlag | null>(null);
  const lesen = useMutation({
    mutationFn: () => apiFetch<BewerbungVorschlag>("/api/hr/bewerber/aus-text", { method: "POST", body: JSON.stringify({ text }) }),
    onSuccess: setV,
    onError: (e: any) => toast({ title: "Nicht lesbar", description: String(e?.message ?? e), variant: "destructive" }),
  });
  if (!offen) return <Button variant="outline" className="gap-2" onClick={() => setOffen(true)}><Sparkles className="w-4 h-4" /> Aus Mail lesen</Button>;
  return (
    <Card className="border-primary/40 w-full"><CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between"><div className="font-medium text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> Bewerbung aus Mailtext</div><Button size="sm" variant="ghost" onClick={() => setOffen(false)}><X className="h-4 w-4" /></Button></div>
      <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Text der Bewerbungs-Mail hier einfügen …" />
      <div className="flex justify-end"><Button size="sm" disabled={lesen.isPending || text.trim().length < 50} onClick={() => lesen.mutate()}>{lesen.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Lesen</Button></div>
      {v && (
        <div className="rounded border p-3 text-sm space-y-2">
          {!v.istBewerbung && <div className="text-amber-700 text-xs">Das Modell hält den Text nicht für eine Bewerbung.</div>}
          <div className="grid gap-1 sm:grid-cols-2">
            <div><span className="text-muted-foreground">Name:</span> {v.name ?? "—"}</div>
            <div><span className="text-muted-foreground">Stelle:</span> {v.stelleText ?? "—"} {v.stelleId ? <Badge variant="outline" className="font-normal ml-1">zugeordnet</Badge> : v.stelleText ? <Badge variant="secondary" className="font-normal ml-1">keine offene Stelle passt</Badge> : null}</div>
            <div><span className="text-muted-foreground">E-Mail:</span> {v.email ?? "—"}</div>
            <div><span className="text-muted-foreground">Telefon:</span> {v.phone ?? "—"}</div>
          </div>
          {v.kurzprofil && <p className="text-xs">{v.kurzprofil}</p>}
          {v.passung.length > 0 && <div className="flex flex-wrap gap-1">{v.passung.map((p) => <Badge key={p} variant="secondary" className="font-normal">{p}</Badge>)}</div>}
          {v.hinweise.map((h, i) => <div key={i} className="text-xs text-amber-700">• {h}</div>)}
          <div className="flex justify-end"><Button size="sm" onClick={() => { onUebernehmen(v); setOffen(false); }}>In Bewerber-Formular übernehmen</Button></div>
        </div>
      )}
    </CardContent></Card>
  );
}
