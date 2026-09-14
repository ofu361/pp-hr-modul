// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Personalauswertung je GESELLSCHAFT (Rechtsträger), Admin/Manager.
//
// ⚠ Nicht zu verwechseln mit einer Auswertung „je Firma": `companyId` ist der
//   MANDANT und liefert genau eine Zeile. Was hier gruppiert wird, sind die
//   Rechtsträger darunter (GS-####) — das ist der Zweck der Fläche (0427).
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useToast } from "@/shared/hooks/use-toast";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import NoAccess from "@/shared/components/no-access";
import {
  Building2, Euro, Users, HeartPulse, Settings2, Loader2, AlertTriangle, TrendingDown,
} from "lucide-react";

interface Zeile {
  gesellschaftId: number | null; nummer: string | null; name: string;
  mitarbeiter: number; vzae: number; ohneGehalt: number;
  jahresbruttoCent: number; vollkostenCent: number; schnittJahresbruttoCent: number | null;
  krankTage: number; krankEpisoden: number; krankKostenCent: number; krankquoteBp: number;
  urlaubTage: number; urlaubsanspruchTage: number;
  abwesenheitNachArt: Record<string, number>;
}

interface Auswertung {
  jahr: number;
  parameter: { arbeitstageProJahr: number; agNebenkostenBp: number; hinterlegt: boolean };
  zuordnung: { gesamt: number; ohneGesellschaft: number; ohneGehalt: number };
  zeilen: Zeile[];
  summe: {
    mitarbeiter: number; ohneGehalt: number; vzae: number;
    jahresbruttoCent: number; vollkostenCent: number;
    krankTage: number; krankKostenCent: number; urlaubTage: number;
  };
}

function fmtEur(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtProzent(bp: number) {
  return `${(bp / 100).toFixed(2).replace(".", ",")} %`;
}

const ART_LABELS: Record<string, string> = {
  urlaub: "Urlaub", krank: "Krank", sonderurlaub: "Sonderurlaub",
  "überstunden": "Überstunden", homeoffice: "Homeoffice",
};

export default function AuswertungGesellschaftPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = usePermissions();
  const canView  = perms.role === "admin" || perms.role === "manager";
  const canWrite = perms.role === "admin";

  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [dialogOffen, setDialogOffen] = useState(false);
  const [arbeitstage, setArbeitstage] = useState("");
  const [agProzent, setAgProzent] = useState("");

  const { data, isLoading } = useQuery<Auswertung>({
    queryKey: ["hr-auswertung-gesellschaft", jahr],
    queryFn: () => apiFetch<Auswertung>(`/api/hr/auswertung/gesellschaft?jahr=${jahr}`),
    staleTime: 30_000,
    enabled: canView,
  });

  const parameterMut = useMutation({
    mutationFn: (body: { jahr: number; arbeitstageProJahr: number; agNebenkostenBp: number }) =>
      apiFetch("/api/hr/kosten-parameter", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-auswertung-gesellschaft"] });
      toast({ title: "Kostenparameter gespeichert ✓" });
      setDialogOffen(false);
    },
    onError: (e: any) => toast({ title: "Nicht gespeichert", description: String(e?.message ?? e), variant: "destructive" }),
  });

  if (!canView) return <NoAccess />;

  const jahre = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  function dialogOeffnen() {
    setArbeitstage(String(data?.parameter.arbeitstageProJahr ?? 250));
    setAgProzent(String((data?.parameter.agNebenkostenBp ?? 2000) / 100).replace(".", ","));
    setDialogOffen(true);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Personalkosten je Gesellschaft
          </h1>
          <p className="text-sm text-muted-foreground">
            Gehälter, Abwesenheiten und Krankheitskosten je Rechtsträger
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={jahr}
            onChange={(e) => setJahr(Number(e.target.value))}
          >
            {jahre.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          {canWrite && (
            <Button variant="outline" size="sm" onClick={dialogOeffnen}>
              <Settings2 className="h-4 w-4 mr-1" /> Kostenparameter
            </Button>
          )}
        </div>
      </div>

      {/* Die Zahl, an der man abliest, wie belastbar die Aufteilung überhaupt
          ist. Ohne sie sieht eine Tabelle mit 40 unzugeordneten von 45
          Mitarbeitern genauso aus wie eine vollständige. */}
      {data && (data.zuordnung.ohneGesellschaft > 0 || data.zuordnung.ohneGehalt > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              {data.zuordnung.ohneGesellschaft > 0 && (
                <p>
                  <strong>{data.zuordnung.ohneGesellschaft} von {data.zuordnung.gesamt}</strong> Mitarbeitern
                  tragen keine Gesellschaft. Sie stehen als eigene Zeile „Ohne Gesellschaft" und sind
                  <strong> nicht</strong> auf die Rechtsträger verteilt.
                </p>
              )}
              {data.zuordnung.ohneGehalt > 0 && (
                <p>
                  Bei <strong>{data.zuordnung.ohneGehalt}</strong> Mitarbeitern ist kein Gehalt hinterlegt —
                  sie zählen in der Kopfzahl mit, in den Kosten mit null.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {data && !data.parameter.hinterlegt && (
        <Card className="border-muted">
          <CardContent className="p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Settings2 className="h-4 w-4 shrink-0" />
            Für {data.jahr} ist kein Kostenparameter hinterlegt. Gerechnet wird mit den Vorgabewerten
            ({data.parameter.arbeitstageProJahr} Arbeitstage, {fmtProzent(data.parameter.agNebenkostenBp)} Arbeitgeberanteil).
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground p-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …
        </div>
      )}

      {data && data.zeilen.length === 0 && !isLoading && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Für {data.jahr} sind keine Mitarbeiter erfasst.
        </CardContent></Card>
      )}

      {data && data.zeilen.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kennzahl icon={<Users className="h-4 w-4" />} label="Mitarbeiter"
              wert={String(data.summe.mitarbeiter)} zusatz={`${data.summe.vzae} VZÄ`} />
            <Kennzahl icon={<Euro className="h-4 w-4" />} label="Personalkosten p. a."
              wert={fmtEur(data.summe.vollkostenCent)} zusatz={`Brutto ${fmtEur(data.summe.jahresbruttoCent)}`} />
            <Kennzahl icon={<HeartPulse className="h-4 w-4" />} label="Krankheitstage"
              wert={String(data.summe.krankTage)} zusatz={`Urlaub ${data.summe.urlaubTage} Tage`} />
            <Kennzahl icon={<TrendingDown className="h-4 w-4" />} label="Kosten der Krankheitstage"
              wert={fmtEur(data.summe.krankKostenCent)} zusatz="in den Personalkosten enthalten" />
          </div>

          <div className="space-y-3">
            {data.zeilen.map((z) => (
              <motion.div key={String(z.gesellschaftId)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Card className={z.gesellschaftId === null ? "border-dashed" : undefined}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{z.name}</span>
                        {z.nummer && <Badge variant="outline">{z.nummer}</Badge>}
                        {z.gesellschaftId === null && <Badge variant="secondary">nicht zugeordnet</Badge>}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{fmtEur(z.vollkostenCent)}</div>
                        <div className="text-xs text-muted-foreground">Vollkosten p. a.</div>
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                      <Feld label="Mitarbeiter" wert={`${z.mitarbeiter}`} zusatz={`${z.vzae} VZÄ`} />
                      <Feld label="Jahresbrutto" wert={fmtEur(z.jahresbruttoCent)}
                        zusatz={z.ohneGehalt > 0 ? `${z.ohneGehalt} ohne Gehalt` : undefined} />
                      <Feld label="Ø Jahresbrutto"
                        wert={z.schnittJahresbruttoCent != null ? fmtEur(z.schnittJahresbruttoCent) : "—"} />
                      <Feld label="Krankheitstage" wert={`${z.krankTage}`}
                        zusatz={`${z.krankEpisoden} Episoden · ${fmtProzent(z.krankquoteBp)}`} />
                      <Feld label="Krankheitskosten" wert={fmtEur(z.krankKostenCent)} />
                      <Feld label="Urlaub" wert={`${z.urlaubTage} Tage`}
                        zusatz={`Anspruch ${z.urlaubsanspruchTage}`} />
                    </div>

                    {Object.keys(z.abwesenheitNachArt).length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {Object.entries(z.abwesenheitNachArt).map(([art, tage]) => (
                          <Badge key={art} variant="secondary" className="font-normal">
                            {ART_LABELS[art] ?? art}: {tage} Tage
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Kostenparameter {jahr}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Arbeitstage pro Jahr</Label>
              <Input value={arbeitstage} onChange={(e) => setArbeitstage(e.target.value)} inputMode="numeric" />
              <p className="text-xs text-muted-foreground">
                Teiler für den Tagessatz — daraus ergeben sich die Kosten eines Krankheitstages.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Arbeitgeberanteil in Prozent</Label>
              <Input value={agProzent} onChange={(e) => setAgProzent(e.target.value)} inputMode="decimal" />
              <p className="text-xs text-muted-foreground">
                Sozialversicherung und Umlagen über dem Bruttolohn. Üblich sind rund 20 %.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOffen(false)}>Abbrechen</Button>
            <Button
              disabled={parameterMut.isPending}
              onClick={() => parameterMut.mutate({
                jahr,
                arbeitstageProJahr: Math.round(Number(arbeitstage)),
                // Prozent → Basispunkte. Die Umrechnung gehört hierher, damit im
                // Feld eine Zahl steht, die jemand ohne Erklärung eintippen kann.
                agNebenkostenBp: Math.round(Number(String(agProzent).replace(",", ".")) * 100),
              })}
            >
              {parameterMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kennzahl({ icon, label, wert, zusatz }: { icon: React.ReactNode; label: string; wert: string; zusatz?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-xl font-semibold">{wert}</div>
        {zusatz && <div className="text-xs text-muted-foreground">{zusatz}</div>}
      </CardContent>
    </Card>
  );
}

function Feld({ label, wert, zusatz }: { label: string; wert: string; zusatz?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{wert}</div>
      {zusatz && <div className="text-xs text-muted-foreground">{zusatz}</div>}
    </div>
  );
}
