// © 2026 P&P Group. Proprietary & Confidential.
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, Briefcase, Calendar,
  GraduationCap, ClipboardList, Euro, Bot, Inbox,
  Clock, FolderOpen, ShieldCheck, FileSpreadsheet,
  UserCircle, Star, Network, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/shared/hooks/use-permissions";

type Tab = { href: string; label: string; icon: React.ElementType; roles?: string[] | null };
type Group = { key: string; label: string; tabs: Tab[] };

const GROUPS: Group[] = [
  {
    key: "stammdaten",
    label: "Stammdaten",
    tabs: [
      { href: "/hr/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
      { href: "/hr/mitarbeiter",  label: "Mitarbeiter",  icon: Users           },
      { href: "/hr/organigramm",  label: "Organigramm",  icon: Network         },
      { href: "/hr/personalakte", label: "Personalakte", icon: FolderOpen,     roles: ["admin","manager"] },
    ],
  },
  {
    key: "zeit",
    label: "Zeit & Planung",
    tabs: [
      { href: "/hr/schichtplanung", label: "Dienstplan",    icon: Clock          },
      { href: "/hr/urlaub",         label: "Urlaub",        icon: Calendar       },
      { href: "/hr/abwesenheiten",  label: "Abwesenheiten", icon: AlertTriangle, roles: ["admin","manager"] },
    ],
  },
  {
    key: "entwicklung",
    label: "Entwicklung",
    tabs: [
      { href: "/hr/qualifikationen", label: "Qualifikationen", icon: ShieldCheck                      },
      { href: "/hr/beurteilungen",   label: "Beurteilungen",   icon: Star,       roles: ["admin","manager"] },
      { href: "/hr/recruiting",      label: "Recruiting",      icon: Briefcase                        },
      { href: "/hr/onboarding",      label: "Onboarding",      icon: ClipboardList                    },
      { href: "/hr/schulungen",      label: "Schulungen",      icon: GraduationCap                    },
    ],
  },
  {
    key: "verwaltung",
    label: "Verwaltung",
    tabs: [
      { href: "/hr/self-service",  label: "Self-Service",  icon: UserCircle                          },
      { href: "/hr/postfach",      label: "Postfach",      icon: Inbox                               },
      { href: "/hr/gehaelter",     label: "Gehälter",      icon: Euro,          roles: ["admin","manager"] },
      { href: "/hr/datev-export",  label: "DATEV-Export",  icon: FileSpreadsheet, roles: ["admin"]   },
    ],
  },
  {
    key: "ki",
    label: "KI",
    tabs: [
      { href: "/hr/ki-assistent", label: "KI-Assistent", icon: Bot },
    ],
  },
];

export default function HrLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const perms = usePermissions();

  const groups = GROUPS.map(g => ({
    ...g,
    tabs: g.tabs.filter(t => !t.roles || (perms.role && t.roles.includes(perms.role))),
  })).filter(g => g.tabs.length > 0);

  const activeGroup = groups.find(g =>
    g.tabs.some(t => location === t.href || location.startsWith(t.href + "/"))
  ) ?? groups[0];

  return (
    <div className="space-y-0">
      <div className="border-b border-border bg-background">
        <nav className="flex gap-0 overflow-x-auto px-1">
          {groups.map(g => (
            <Link key={g.key} href={g.tabs[0].href}>
              <button className={cn(
                "px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap",
                g.key === activeGroup.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}>
                {g.label}
              </button>
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-b border-border/60 bg-muted/30">
        <nav className="flex gap-0 overflow-x-auto px-1">
          {activeGroup.tabs.map(({ href, label, icon: Icon }) => {
            const active = location === href || location.startsWith(href + "/");
            return (
              <Link key={href} href={href}>
                <button className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="pt-5">{children}</div>
    </div>
  );
}
