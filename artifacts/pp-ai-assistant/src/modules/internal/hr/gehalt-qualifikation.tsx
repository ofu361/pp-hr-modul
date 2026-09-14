// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — Gehalt × Qualifikation (Admin/Manager).
//
// Alle Gehälter hier sind auf VOLLZEIT gerechnet. Das steht in der Maske dran,
// weil eine Zahl ohne diesen Hinweis falsch gelesen wird: 4.000 € bei einer
// Halbtagskraft sind hier 4.000 €, nicht 2.000 €.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { usePermissions } from "@/shared/hooks/use-permissions";
import { apiFetch } from "@/shared/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import NoAccess from "@/shared/components/no-access";
import {
  Award, Users, Loader2, AlertTriangle, ArrowDownRight, ArrowUpRight, Info,
} from "lucide-react";

interface Qualifikation {
  qualifikationId: number; name: string; category: string;
  traeger: number; traegerMitGehalt: number;
  medianVollzeitCent: number | null; minVollzeitCent: number | null; maxVollzeitCent: number | null;
  aufschlagBp: number | null;
}
interface Stellengruppe {
  gruppe: string; anzeige: string; mitglieder: number; mitGehalt: number; bandGueltig: boolean;
  medianVollzeitCent: number | null; minVollzeitCent: number | null; maxVollzeitCent: number | null;
  medianQualifikationen: number; auffaellig: number;
}
interface Person {
  id: number; name: string; jobTitle: string; gruppe: string; abteilung: string | null;
  employmentType: string; weeklyHours: number;
  monatCent: number | null; vollzeitCent: number | null; betriebsjahre: number;
  qualifikationen: number; abgelaufen: number;
  bandPositionBp: number | null; abweichungBp: number | null;
  auffaellig: "unter_band_trotz_qualifikation" | "ueber_band_ohne_vorsprung" | null;
}
interface Auswertung {
  stichtag: string;
  parameter: { vollzeitStunden: number; mindestgroesseBand: number; bandToleranzBp: number };
  luecken: {
    mitarbeiter: number; ohneGehalt: number; ohneQualifikation: number;
    ohneStellenbezeichnung: number; mitAbgelaufenen: number; gruppenOhneBand: number;
  };
  jeQualifikation: Qualifikation[];
  jeStellengruppe: Stellengruppe[];
  mitarbeiter: Person[];
}

function fmtEur(cents: number | null) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}
function fmtBp(bp: number | null, vorzeichen = true) {
  if (bp == null) return "—";
  const v = (bp / 100).toFixed(1).replace(".", ",");
  return `${vorzeichen && bp > 0 ? "+" : ""}${v} %`;
}

const KATEGORIE: Record<string, string> = { technisch: "Technisch", sicherheit: "Sicherheit", rechtlich: "Rechtlich", sonstige: "Sonstige" };
const AUFFAELLIG: Record<NonNullable<Person["auffaellig"]>, { label: string; ton: string; icon: typeof ArrowDownRight }> = {
  unter_band_trotz_qualifikation: { label: "Unter Band trotz Qualifikation", ton: "text-amber-700 bg-amber-500/10 border-amber-500/40", icon: ArrowDownRight },
  ueber_band_ohne_vorsprung:      { label: "Über Band ohne Vorsprung",       ton: "text-sky-700 bg-sky-500/10 border-sky-500/40",       icon: ArrowUpRight },
};

type Reiter = "auffaellig" | "qualifikationen" | "gruppen" | "alle";

export default function GehaltQualifikationPage() {
  const perms = usePermissions();
  const canView = perms.role === "admin" || perms.role === "manager";
  const [reiter, setReiter] = useState<Reiter>("auffaellig");

  const { data, isLoading } = useQuery<Auswertung>({
    queryKey: ["hr-gehalt-qualifikation"],
    queryFn: () => apiFetch<Auswertung>("/api/hr/auswertung/gehalt-qualifikation"),
    staleTime: 30_000,
    enabled: canView,
  });

  if (!canView) return <NoAccess />;

  const auffaellige = data?.mitarbeiter.filter((p) => p.auffaellig != null) ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Award className="h-6 w-6" /> Gehalt × Qualifikation
        </h1>
        <p className="text-sm text-muted-foreground">
          Gehaltsbänder je Stellengruppe, Aufschlag je Qualifikation, Auffälligkeiten —
          <strong> alle Beträge auf Vollzeit ({data?.parameter.vollzeitStunden ?? 40} h) gerechnet</strong>.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground p-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Wird geladen …
        </div>
      )}

      {data && (
        <>
          {/* Was der Auswertung fehlt, steht oben — nicht in einer Fußnote. */}
          {(data.luecken.ohneGehalt > 0 || data.luecken.ohneQualifikation > 0 || data.luecken.gruppenOhneBand > 0) && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-4 flex items-start gap-3 text-sm">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {data.luecken.ohneGehalt > 0 && <p><strong>{data.luecken.ohneGehalt}</strong> von {data.luecken.mitarbeiter} Mitarbeitern ohne hinterlegtes Gehalt — sie fehlen in jedem Band.</p>}
                  {data.luecken.ohneQualifikation > 0 && <p><strong>{data.luecken.ohneQualifikation}</strong> ohne eine einzige erfasste Qualifikation. Die Auswertung sieht nur, was eingetragen ist.</p>}
                  {data.luecken.mitAbgelaufenen > 0 && <p><strong>{data.luecken.mitAbgelaufenen}</strong> mit abgelaufenen Nachweisen — zählen nicht als Qualifikation.</p>}
                  {data.luecken.gruppenOhneBand > 0 && <p><strong>{data.luecken.gruppenOhneBand}</strong> Stellengruppen unter {data.parameter.mindestgroesseBand} Personen — kein Band, keine Auffälligkeit. Lieber „—" als eine Zahl, die etwas behauptet.</p>}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Kennzahl icon={<Users className="h-4 w-4" />} label="Mitarbeiter im Vergleich"
              wert={String(data.luecken.mitarbeiter - data.luecken.ohneGehalt)} zusatz={`von ${data.luecken.mitarbeiter}`} />
            <Kennzahl icon={<Award className="h-4 w-4" />} label="Qualifikationen im Katalog"
              wert={String(data.jeQualifikation.length)} zusatz={`${data.jeQualifikation.filter((q) => q.traeger > 0).length} mit Trägern`} />
            <Kennzahl icon={<AlertTriangle className="h-4 w-4" />} label="Auffälligkeiten"
              wert={String(auffaellige.length)} zusatz={`Toleranz ±${fmtBp(data.parameter.bandToleranzBp, false)} um den Median`} />
          </div>

          <div className="flex gap-1 border-b">
            {([
              ["auffaellig", `Auffällig (${auffaellige.length})`],
              ["qualifikationen", "Je Qualifikation"],
              ["gruppen", "Stellengruppen"],
              ["alle", "Alle Mitarbeiter"],
            ] as [Reiter, string][]).map(([k, l]) => (
              <Button key={k} variant="ghost" size="sm"
                className={cn("rounded-none border-b-2", reiter === k ? "border-primary" : "border-transparent text-muted-foreground")}
                onClick={() => setReiter(k)}>{l}</Button>
            ))}
          </div>

          {reiter === "auffaellig" && (
            auffaellige.length === 0
              ? <Leer text="Keine Auffälligkeiten — alle Mitarbeiter mit Band liegen innerhalb der Toleranz oder ihre Abweichung erklärt sich aus der Qualifikation." />
              : <PersonenListe personen={auffaellige} />
          )}

          {reiter === "alle" && <PersonenListe personen={data.mitarbeiter} />}

          {reiter === "qualifikationen" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Der Aufschlag ist ein Zusammenhang, keine Ursache: Träger können auch schlicht die Dienstälteren sein.
              </p>
              {data.jeQualifikation.map((q) => (
                <Card key={q.qualifikationId}>
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {q.name} <Badge variant="outline" className="font-normal">{KATEGORIE[q.category] ?? q.category}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {q.traeger} Träger{q.traegerMitGehalt !== q.traeger ? ` · ${q.traegerMitGehalt} mit Gehalt` : ""}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-6 text-sm text-right">
                      <Feld label="Median" wert={fmtEur(q.medianVollzeitCent)} />
                      <Feld label="Spanne" wert={q.minVollzeitCent != null ? `${fmtEur(q.minVollzeitCent)} – ${fmtEur(q.maxVollzeitCent)}` : "—"} />
                      <Feld label="ggü. Nicht-Trägern" wert={fmtBp(q.aufschlagBp)}
                        ton={q.aufschlagBp == null ? undefined : q.aufschlagBp >= 0 ? "text-emerald-700" : "text-amber-700"} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {reiter === "gruppen" && (
            <div className="space-y-2">
              {data.jeStellengruppe.map((g) => (
                <Card key={g.gruppe} className={!g.bandGueltig ? "border-dashed" : undefined}>
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {g.anzeige}
                        {!g.bandGueltig && <Badge variant="secondary" className="font-normal">kein Band</Badge>}
                        {g.auffaellig > 0 && <Badge className="font-normal bg-amber-500/15 text-amber-800 hover:bg-amber-500/15">{g.auffaellig} auffällig</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {g.mitglieder} Mitarbeiter · Ø {g.medianQualifikationen} Qualifikationen
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 text-sm text-right">
                      <Feld label="Median" wert={g.bandGueltig ? fmtEur(g.medianVollzeitCent) : "—"} />
                      <Feld label="Spanne" wert={g.bandGueltig ? `${fmtEur(g.minVollzeitCent)} – ${fmtEur(g.maxVollzeitCent)}` : "—"} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PersonenListe({ personen }: { personen: Person[] }) {
  if (personen.length === 0) return <Leer text="Keine Mitarbeiter." />;
  return (
    <div className="space-y-2">
      {personen.map((p) => {
        const a = p.auffaellig ? AUFFAELLIG[p.auffaellig] : null;
        const Icon = a?.icon;
        return (
          <motion.div key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
            <Card className={a ? a.ton.split(" ").filter((c) => c.startsWith("border")).join(" ") : undefined}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {p.name}
                    <span className="text-sm text-muted-foreground">{p.jobTitle || "ohne Stellenbezeichnung"}</span>
                    {p.abteilung && <Badge variant="outline" className="font-normal">{p.abteilung}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.weeklyHours} h/Woche · {p.betriebsjahre} Jahre im Haus · {p.qualifikationen} Qualifikationen
                    {p.abgelaufen > 0 && <span className="text-amber-700"> · {p.abgelaufen} abgelaufen</span>}
                  </div>
                  {a && Icon && (
                    <div className={cn("mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs", a.ton)}>
                      <Icon className="h-3 w-3" /> {a.label}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-6 text-sm text-right">
                  <Feld label="Vollzeit" wert={fmtEur(p.vollzeitCent)}
                    zusatz={p.weeklyHours !== 40 && p.monatCent != null ? `tatsächlich ${fmtEur(p.monatCent)}` : undefined} />
                  <Feld label="zum Median" wert={fmtBp(p.abweichungBp)}
                    ton={p.abweichungBp == null ? undefined : p.abweichungBp < 0 ? "text-amber-700" : "text-emerald-700"} />
                  <Feld label="Im Band" wert={p.bandPositionBp != null ? `${Math.round(p.bandPositionBp / 100)} %` : "—"} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function Kennzahl({ icon, label, wert, zusatz }: { icon: React.ReactNode; label: string; wert: string; zusatz?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-semibold">{wert}</div>
      {zusatz && <div className="text-xs text-muted-foreground">{zusatz}</div>}
    </CardContent></Card>
  );
}

function Feld({ label, wert, zusatz, ton }: { label: string; wert: string; zusatz?: string; ton?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-medium", ton)}>{wert}</div>
      {zusatz && <div className="text-xs text-muted-foreground">{zusatz}</div>}
    </div>
  );
}

function Leer({ text }: { text: string }) {
  return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{text}</CardContent></Card>;
}
