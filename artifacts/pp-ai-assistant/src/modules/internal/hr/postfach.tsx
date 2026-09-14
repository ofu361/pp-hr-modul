// © 2026 P&P Group. Proprietary & Confidential.
// HR Postfach — IMAP-Synchronisation + E-Mail senden
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Mail, Send, RefreshCw, Search, Settings, Loader2,
  Inbox, MailOpen, User,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/shared/lib/api";
import { useToast } from "@/shared/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HrEmail {
  id: number; subject?: string; fromAddress?: string; fromName?: string;
  toAddress?: string; date?: string; bodyText?: string; isRead: boolean;
  isIncoming: boolean; linkedBeweberId?: number; createdAt: string;
}

interface Template {
  id: string; label: string; subject: string; body: string;
}

interface Bewerber {
  id: number; name: string; stelleTitle?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  const now = new Date();
  const diff = now.getTime() - dt.getTime();
  if (diff < 86_400_000) return dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 86_400_000) return dt.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  return dt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function senderLabel(email: HrEmail) {
  return email.isIncoming
    ? (email.fromName || email.fromAddress || "Unbekannt")
    : `An: ${email.toAddress}`;
}

// ── Compose Dialog ────────────────────────────────────────────────────────────

function ComposeDialog({
  open, onClose, defaultTo = "", defaultSubject = "", defaultBody = "",
  linkedBeweberId, bewerberList,
}: {
  open: boolean; onClose: () => void;
  defaultTo?: string; defaultSubject?: string; defaultBody?: string;
  linkedBeweberId?: number; bewerberList: Bewerber[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["hr-email-templates"],
    queryFn:  () => apiFetch<Template[]>("/api/hr/postfach/templates"),
    staleTime: Infinity,
  });

  const [to,      setTo]      = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body,    setBody]    = useState(defaultBody);
  const [tplId,   setTplId]   = useState("");

  function applyTemplate(id: string) {
    const t = templates.find(t => t.id === id);
    if (!t) return;
    setTplId(id);
    if (!subject) setSubject(t.subject);
    setBody(t.body);
  }

  const sendMut = useMutation({
    mutationFn: () => apiFetch("/api/hr/postfach/send", {
      method: "POST",
      body: JSON.stringify({ to, subject, body, linkedBeweberId }),
    }),
    onSuccess: () => {
      toast({ title: "E-Mail gesendet ✓", description: `An ${to}` });
      qc.invalidateQueries({ queryKey: ["hr-emails"] });
      onClose();
    },
    onError: (e: any) => {
      if (e?.needsSetup) {
        toast({ title: "SMTP nicht konfiguriert", description: "Bitte erst unter Einstellungen → Integrationen einrichten.", variant: "destructive" });
      } else {
        toast({ title: "Fehler", description: e?.message ?? "E-Mail konnte nicht gesendet werden.", variant: "destructive" });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" /> E-Mail verfassen
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Template selector */}
          <div>
            <Label className="text-xs">Vorlage (optional)</Label>
            <Select value={tplId} onValueChange={applyTemplate}>
              <SelectTrigger className="h-9 text-sm mt-1">
                <SelectValue placeholder="Vorlage auswählen…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">An *</Label>
            <Input className="h-9 mt-1 text-sm" value={to} onChange={e => setTo(e.target.value)} placeholder="empfaenger@example.com" />
          </div>
          <div>
            <Label className="text-xs">Betreff *</Label>
            <Input className="h-9 mt-1 text-sm" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Betreff…" />
          </div>
          <div>
            <Label className="text-xs">Nachricht *</Label>
            <Textarea className="mt-1 text-sm" rows={10} value={body} onChange={e => setBody(e.target.value)} placeholder="Ihre Nachricht…" />
          </div>
          <p className="text-xs text-muted-foreground">
            Platzhalter: {"{{name}}"}, {"{{stelle}}"}, {"{{datum}}"} etc. bitte manuell ersetzen
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={() => sendMut.mutate()}
            disabled={!to.trim() || !subject.trim() || !body.trim() || sendMut.isPending}
            className="gap-2"
            style={{ backgroundColor: "#1E4068" }}>
            {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HrPostfach() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search,       setSearch]       = useState("");
  const [unreadOnly,   setUnreadOnly]   = useState(false);
  const [selectedId,   setSelectedId]   = useState<number | null>(null);
  const [showCompose,  setShowCompose]  = useState(false);
  const [replyTo,      setReplyTo]      = useState<HrEmail | null>(null);

  // Emails
  const { data: emails = [], isLoading, refetch } = useQuery<HrEmail[]>({
    queryKey: ["hr-emails", search, unreadOnly],
    queryFn: () => apiFetch<HrEmail[]>(`/api/hr/postfach/emails?${new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(unreadOnly ? { unread: "1" } : {}),
    })}`),
    staleTime: 30_000,
  });

  // Bewerber (for linking)
  const { data: bewerberList = [] } = useQuery<Bewerber[]>({
    queryKey: ["hr-bewerber-simple"],
    queryFn: () => apiFetch<Bewerber[]>("/api/hr/bewerber"),
    staleTime: 60_000,
  });

  // IMAP Sync
  const syncMut = useMutation({
    mutationFn: () => apiFetch("/api/hr/postfach/sync", { method: "POST" }),
    onSuccess: (data: any) => {
      toast({ title: "Synchronisiert ✓", description: `${data.synced ?? 0} neue E-Mails importiert` });
      qc.invalidateQueries({ queryKey: ["hr-emails"] });
    },
    onError: (e: any) => {
      if (e?.needsSetup) {
        toast({ title: "IMAP nicht konfiguriert", description: "Bitte IMAP-Zugangsdaten unter Einstellungen → Integrationen eintragen.", variant: "destructive" });
      } else {
        toast({ title: "Sync fehlgeschlagen", description: e?.message ?? "Verbindung zum Postfach konnte nicht hergestellt werden.", variant: "destructive" });
      }
    },
  });

  // Mark read mutation
  const markReadMut = useMutation({
    mutationFn: ({ id, isRead }: { id: number; isRead: boolean }) =>
      apiFetch(`/api/hr/postfach/emails/${id}`, { method: "PATCH", body: JSON.stringify({ isRead }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr-emails"] }),
  });

  const selected = emails.find(e => e.id === selectedId) ?? null;
  const unreadCount = emails.filter(e => !e.isRead && e.isIncoming).length;

  function openEmail(email: HrEmail) {
    setSelectedId(email.id);
    if (!email.isRead) markReadMut.mutate({ id: email.id, isRead: true });
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black text-foreground flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" />
            HR Postfach
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white border-0 text-xs">{unreadCount}</Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">Synchronisiertes IMAP-Postfach für HR-Kommunikation</p>
        </div>
        <div className="flex gap-2">
          <Link href="/agent/integrationen">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Settings className="w-3.5 h-3.5" /> E-Mail einrichten
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending} className="gap-1.5">
            <RefreshCw className={cn("w-3.5 h-3.5", syncMut.isPending && "animate-spin")} />
            {syncMut.isPending ? "Sync…" : "Abrufen"}
          </Button>
          <Button size="sm" onClick={() => setShowCompose(true)} className="gap-1.5"
            style={{ backgroundColor: "#CC7B5C", color: "#1E4068" }}>
            <Pencil className="w-3.5 h-3.5" /> Neue E-Mail
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Absender, Betreff suchen…" className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button
          onClick={() => setUnreadOnly(v => !v)}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
            unreadOnly ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:border-border"
          )}>
          <MailOpen className="w-3.5 h-3.5" />
          Nur Ungelesen {unreadCount > 0 && `(${unreadCount})`}
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-4 min-h-[520px]">

        {/* Email list */}
        <Card className="border overflow-hidden">
          <div className="divide-y divide-border overflow-y-auto max-h-[600px]">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!isLoading && emails.length === 0 && (
              <div className="py-12 text-center text-muted-foreground px-4">
                <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-muted-foreground">Keine E-Mails</p>
                <p className="text-xs mt-1">Postfach noch nicht synchronisiert oder leer.</p>
                <Button size="sm" variant="outline" className="mt-4 gap-1.5 text-xs"
                  onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
                  <RefreshCw className="w-3 h-3" /> Jetzt abrufen
                </Button>
              </div>
            )}
            {emails.map((email) => (
              <button
                key={email.id}
                onClick={() => openEmail(email)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-accent transition-colors",
                  selectedId === email.id && "bg-primary/5 border-l-2 border-primary",
                )}>
                <div className="flex items-start gap-2">
                  <div className="shrink-0 mt-0.5">
                    {email.isIncoming
                      ? <Mail className={cn("w-4 h-4", !email.isRead ? "text-primary" : "text-muted-foreground")} />
                      : <Send className="w-4 h-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn("text-xs truncate", !email.isRead && email.isIncoming ? "font-bold text-foreground" : "text-muted-foreground")}>
                        {senderLabel(email)}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(email.date)}</span>
                    </div>
                    <p className={cn("text-xs truncate mt-0.5", !email.isRead && email.isIncoming ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {email.subject || "(kein Betreff)"}
                    </p>
                    {email.bodyText && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
                        {email.bodyText.replace(/\n/g, " ").slice(0, 80)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Email detail */}
        <Card className="border overflow-hidden">
          {!selected ? (
            <div className="h-full flex items-center justify-center py-16 text-center px-6">
              <div>
                <MailOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">E-Mail auswählen</p>
                <p className="text-xs text-muted-foreground mt-1">Klicken Sie links auf eine E-Mail, um sie zu lesen</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Detail header */}
              <div className="px-5 py-4 border-b border-border space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-bold text-foreground leading-tight">{selected.subject || "(kein Betreff)"}</h2>
                  <div className="flex gap-2 shrink-0">
                    {selected.isIncoming && (
                      <Button size="sm" variant="outline" className="text-xs gap-1"
                        onClick={() => setReplyTo(selected)}>
                        <Send className="w-3 h-3" /> Antworten
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {selected.isIncoming
                      ? `Von: ${selected.fromName ? `${selected.fromName} <${selected.fromAddress}>` : selected.fromAddress}`
                      : `An: ${selected.toAddress}`
                    }
                  </span>
                  <span>{fmtDate(selected.date)}</span>
                  {selected.linkedBeweberId && (
                    <Badge className="bg-[#1E4068]/10 text-[#1E4068] border-0 text-[10px]">
                      Bewerber verknüpft
                    </Badge>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                  {selected.bodyText || "(Kein Inhalt)"}
                </pre>
              </div>

              {/* Link applicant */}
              {selected.isIncoming && !selected.linkedBeweberId && bewerberList.length > 0 && (
                <div className="px-5 py-3 border-t border-border bg-muted">
                  <p className="text-xs text-muted-foreground mb-2">Mit Bewerber verknüpfen:</p>
                  <div className="flex gap-2 flex-wrap">
                    {bewerberList.slice(0, 5).map(b => (
                      <button
                        key={b.id}
                        onClick={() => {
                          apiFetch(`/api/hr/postfach/emails/${selected.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ linkedBeweberId: b.id }),
                          }).then(() => qc.invalidateQueries({ queryKey: ["hr-emails"] }));
                        }}
                        className="text-[11px] px-2 py-1 rounded-full border border-border bg-card hover:bg-accent hover:border-[#1E4068] text-muted-foreground hover:text-[#1E4068] transition-colors">
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Compose new */}
      <ComposeDialog
        open={showCompose}
        onClose={() => setShowCompose(false)}
        bewerberList={bewerberList}
      />

      {/* Reply dialog */}
      {replyTo && (
        <ComposeDialog
          open={!!replyTo}
          onClose={() => setReplyTo(null)}
          defaultTo={replyTo.fromAddress ?? ""}
          defaultSubject={`Re: ${replyTo.subject ?? ""}`}
          bewerberList={bewerberList}
          linkedBeweberId={replyTo.linkedBeweberId}
        />
      )}
    </div>
  );
}
