// © 2026 P&P Group. Proprietary & Confidential.
// HR Dashboard
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users, Briefcase, Calendar, GraduationCap, ClipboardList,
  TrendingUp, UserCheck, UserPlus, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/shared/lib/api";

interface HrStats {
  totalMitarbeiter: number;
  aktiv: number;
  elternzeit: number;
  neuEinstellungen: number;
  offeneUrlaube: number;
  offeneStellen: number;
}

export default function HrDashboard() {
  const { data: stats, isLoading } = useQuery<HrStats>({
    queryKey: ["hr-stats"],
    queryFn: () => apiFetch<HrStats>("/api/hr/stats"),
    staleTime: 60_000,
  });

  const kpis = [
    {
      label: "Mitarbeiter gesamt",
      value: isLoading ? "…" : String(stats?.totalMitarbeiter ?? 0),
      sub: `${stats?.aktiv ?? 0} aktiv`,
      icon: Users, color: "text-primary", bg: "bg-[#1E4068]/10",
    },
    {
      label: "Neue Einstellungen (90 Tage)",
      value: isLoading ? "…" : String(stats?.neuEinstellungen ?? 0),
      sub: "Letzte 90 Tage",
      icon: UserPlus, color: "text-green-700", bg: "bg-green-50",
    },
    {
      label: "Offene Urlaubsanträge",
      value: isLoading ? "…" : String(stats?.offeneUrlaube ?? 0),
      sub: stats?.offeneUrlaube ? "Genehmigung ausstehend" : "Alle bearbeitet",
      icon: Calendar,
      color: (stats?.offeneUrlaube ?? 0) > 0 ? "text-amber-700" : "text-muted-foreground",
      bg:    (stats?.offeneUrlaube ?? 0) > 0 ? "bg-amber-50" : "bg-muted",
    },
    {
      label: "Offene Stellen",
      value: isLoading ? "…" : String(stats?.offeneStellen ?? 0),
      sub: "Aktive Ausschreibungen",
      icon: Briefcase, color: "text-[#1E4068]", bg: "bg-[#1E4068]/10",
    },
  ];

  const quickLinks = [
    { href: "/hr/mitarbeiter",  label: "Mitarbeiterliste",   icon: Users,         desc: "Alle Mitarbeiter verwalten" },
    { href: "/hr/recruiting",   label: "Recruiting",         icon: Briefcase,     desc: "Stellen & Bewerber" },
    { href: "/hr/urlaub",       label: "Urlaubsverwaltung",  icon: Calendar,      desc: "Anträge genehmigen" },
    { href: "/hr/onboarding",   label: "Onboarding",         icon: ClipboardList, desc: "Neue Mitarbeiter einführen" },
    { href: "/hr/schulungen",   label: "Schulungen",         icon: GraduationCap, desc: "Trainings planen" },
    { href: "/hr/ki-assistent", label: "KI-Assistent",       icon: UserCheck,     desc: "HR-Beratung per KI" },
    // Runde 2 (0427–0436): vom Anzeige- zum Steuerinstrument.
    { href: "/hr/auswertung-gesellschaft", label: "Kosten je Gesellschaft", icon: Briefcase,     desc: "Gehälter, Krankheitskosten je Rechtsträger" },
    { href: "/hr/vertraege",     label: "Verträge & Fristen", icon: ClipboardList, desc: "Probezeit, Befristung, § 14 TzBfG" },
    { href: "/hr/urlaubskonto",  label: "Urlaubskonten",      icon: Calendar,      desc: "Anspruch, Übertrag, Rest" },
    { href: "/hr/weiterbildung", label: "§ 34c Weiterbildung", icon: GraduationCap, desc: "20 Stunden in drei Jahren" },
    { href: "/hr/offboarding",   label: "Offboarding",        icon: Users,         desc: "Austritte mit Rechteentzug" },
    { href: "/hr/import",        label: "Import",             icon: ClipboardList, desc: "Personalstamm aus CSV" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          HR-Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Personalmanagement — Mitarbeiter, Recruiting, Urlaub, Schulungen
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(({ label, value, sub, icon: Icon, color, bg }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="border">
              <CardContent className="p-4">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", bg)}>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-xl font-black mt-0.5", color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Module</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {quickLinks.map(({ href, label, icon: Icon, desc }, i) => (
            <motion.div key={href} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Link href={href}>
                <Card className="border hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group h-full">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors group-hover:bg-primary/10"
                      style={{ backgroundColor: "rgba(27,42,74,0.06)" }}>
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
