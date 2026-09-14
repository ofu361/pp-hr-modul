// © 2026 P&P Group. Proprietary & Confidential.
// HR Modul — KI-Assistent für Personalmanagement
import { useState } from "react";
import { motion } from "framer-motion";
import { KiChat } from "@/shared/components/ki-chat";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const BRIEFING_QUESTIONS = [
  "Wie können wir unsere Mitarbeiterzufriedenheit verbessern?",
  "Was sind Best Practices für Onboarding im Immobilienbereich?",
  "Wie gestalten wir attraktive Stellenanzeigen für Immobilienmakler?",
  "Welche Weiterbildungen sind im Immobiliensektor besonders wertvoll?",
  "Wie können wir die Fluktuation reduzieren?",
  "Was müssen wir beim Arbeitsrecht für Immobilienunternehmen beachten?",
];

export default function HrKiAssistentPage() {
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#1E4068" }}>
          <Bot className="w-6 h-6" /> HR-Assistent
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          KI-gestützte Beratung für Personalmanagement, Arbeitsrecht und Mitarbeiterentwicklung
        </p>
      </div>

      {/* Chat */}
      <div className="h-[600px]">
        <KiChat
          endpoint="/api/ki-chat/company"
          title="HR-Assistent"
          subtitle="KI-Beratung für Personalmanagement"
          icon={<Sparkles className="w-4 h-4 text-amber-400" />}
          suggestedQuestions={BRIEFING_QUESTIONS.slice(0, 4)}
        />
      </div>

      {/* Themenbereiche */}
      <div>
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Häufige HR-Fragen — direkt stellen
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {BRIEFING_QUESTIONS.map((q, i) => (
            <motion.div key={q} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Card
                className={cn(
                  "cursor-pointer hover:shadow-md transition-all border-2",
                  activeQuestion === q ? "border-amber-400 bg-amber-50" : "border-transparent hover:border-border"
                )}
                onClick={() => setActiveQuestion(q === activeQuestion ? null : q)}
              >
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: "#1E4068" }}>
                    {i + 1}
                  </div>
                  <p className="text-sm text-foreground leading-snug">{q}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {activeQuestion && (
          <motion.div
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-3 p-3 rounded-xl border-2 border-amber-300 bg-amber-50">
            <Sparkles className="w-4 h-4 shrink-0" style={{ color: "#CC7B5C" }} />
            <p className="text-sm text-amber-900 flex-1">{activeQuestion}</p>
            <Button size="sm" className="gap-2 shrink-0"
              style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}
              onClick={() => {
                // Zurueck nach oben zum Chat.
                // ⚠ Nicht `window.scrollTo`: seit dem 04.09.2026 rollt nicht mehr
                //   das Fenster, sondern `<main>` (components/layout.tsx). Das Fenster
                //   hat keinen Rollweg mehr — der Aufruf tat also nichts, ohne
                //   Fehlermeldung.
                document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
                setActiveQuestion(null);
              }}>
              <Bot className="w-3.5 h-3.5" /> Fragen
            </Button>
          </motion.div>
        )}
      </div>

      {/* Info Banner */}
      <Card className="border-border bg-muted">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground text-center">
            Der HR-Assistent nutzt KI-Technologie und gibt allgemeine Empfehlungen.
            Bei rechtlichen Fragen konsultieren Sie bitte einen Fachanwalt für Arbeitsrecht.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
