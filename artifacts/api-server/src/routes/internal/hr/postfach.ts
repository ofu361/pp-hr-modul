// © 2026 P&P Group. Proprietary & Confidential.
// HR — Postfach: IMAP-Sync, E-Mail-Liste, SMTP-Versand, Vorlagen
import { Router, type IRouter } from "express";
import { BRAND } from "../../../config/brand.js";
import { and, eq, desc, or, ilike } from "drizzle-orm";
import { db, hrEmails, integrations } from "@workspace/db";
import { requireAuth, requireRole } from "../../../middlewares/auth.js";
import { requirePermission } from "../../../lib/permissions.js";
import { decryptConfig } from "../../../lib/integration-crypto.js";
// @ts-ignore
import nodemailer from "nodemailer";
// @ts-ignore
import { ImapFlow } from "imapflow";
import { badRequest, notFound } from "../../../lib/http-errors.js";
import { WRITE_ROLES, cid } from "./shared.js";

const router: IRouter = Router();

// Helper: load integration config
async function getEmailCfg(companyId: number, type: "email_imap" | "email_smtp") {
  const [row] = await db.select().from(integrations)
    .where(and(eq(integrations.companyId, companyId), eq(integrations.type, type)));
  if (!row || !row.isActive) return null;
  try { return JSON.parse(decryptConfig(row.config)) as Record<string, unknown>; } catch { return null; }
}

// POST /api/hr/postfach/sync — fetch emails from IMAP, store in hr_emails
router.post("/hr/postfach/sync", requireAuth, async (req, res): Promise<void> => {
  const companyId = cid(req);
  const cfg = await getEmailCfg(companyId, "email_imap");
  if (!cfg) { res.status(400).json({ error: "IMAP nicht konfiguriert", needsSetup: true }); return; }

  const client = new ImapFlow({
    host: cfg.host as string,
    port: (cfg.port as number) || 993,
    secure: true,
    auth: { user: cfg.user as string, pass: cfg.password as string },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const fetched: Array<typeof hrEmails.$inferInsert> = [];

  try {
    const total = (client.mailbox as { exists: number }).exists;
    const start = Math.max(1, total - 49); // last 50 emails
    for await (const msg of client.fetch(`${start}:*`, {
      envelope: true, bodyParts: ["1", "text", "html"],
    })) {
      const msgId = String(msg.uid ?? msg.seq);
      // Skip if already stored
      const [existing] = await db.select({ id: hrEmails.id }).from(hrEmails)
        .where(and(eq(hrEmails.companyId, companyId), eq(hrEmails.messageId, msgId)));
      if (existing) continue;

      const bodyText = msg.bodyParts?.get("1")?.toString("utf8") ?? msg.bodyParts?.get("text")?.toString("utf8") ?? "";
      fetched.push({
        companyId,
        messageId:   msgId,
        subject:     msg.envelope?.subject ?? "(kein Betreff)",
        fromAddress: msg.envelope?.from?.[0]?.address ?? "",
        fromName:    msg.envelope?.from?.[0]?.name ?? "",
        toAddress:   msg.envelope?.to?.[0]?.address ?? "",
        date:        msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
        bodyText:    bodyText.slice(0, 8000),
        isRead:      false,
        isIncoming:  true,
      });
    }
  } finally { lock.release(); }
  await client.logout();

  if (fetched.length > 0) {
    await db.insert(hrEmails).values(fetched);
  }
  res.json({ synced: fetched.length });
});

// GET /api/hr/postfach/emails
router.get("/hr/postfach/emails", requireAuth, async (req, res): Promise<void> => {
  const companyId = cid(req);
  const search = req.query.q as string | undefined;
  const unreadOnly = req.query.unread === "1";

  let query = db.select().from(hrEmails).where(
    and(
      eq(hrEmails.companyId, companyId),
      ...(unreadOnly ? [eq(hrEmails.isRead, false)] : []),
      ...(search ? [or(
        ilike(hrEmails.subject,     `%${search}%`),
        ilike(hrEmails.fromAddress, `%${search}%`),
        ilike(hrEmails.fromName,    `%${search}%`),
      )] : []),
    )
  ).$dynamic();

  const rows = await query.orderBy(desc(hrEmails.date)).limit(100);
  res.json(rows);
});

// PATCH /api/hr/postfach/emails/:id — mark read, link bewerber
router.patch("/hr/postfach/emails/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const b  = req.body as Record<string, any>;
  const u: Record<string, any> = {};
  if (b.isRead !== undefined)          u.isRead          = Boolean(b.isRead);
  if (b.linkedBeweberId !== undefined) u.linkedBeweberId = b.linkedBeweberId ? Number(b.linkedBeweberId) : null;
  const [updated] = await db.update(hrEmails).set(u)
    .where(and(eq(hrEmails.id, id), eq(hrEmails.companyId, cid(req)))).returning();
  if (!updated) throw notFound("Nicht gefunden");
  res.json(updated);
});

// POST /api/hr/postfach/send — send email via SMTP
router.post("/hr/postfach/send", requireAuth, requirePermission("manage_hr"), async (req, res): Promise<void> => {
  const companyId = cid(req);
  const cfg = await getEmailCfg(companyId, "email_smtp");
  if (!cfg) { res.status(400).json({ error: "SMTP nicht konfiguriert", needsSetup: true }); return; }

  const { to, subject, body, linkedBeweberId } = req.body as {
    to: string; subject: string; body: string; linkedBeweberId?: number;
  };
  if (!to || !subject || !body) throw badRequest("to, subject und body erforderlich");

  const transporter = nodemailer.createTransport({
    host:   cfg.host as string,
    port:   (cfg.port as number) || 587,
    secure: (cfg.port as number) === 465,
    auth:   { user: cfg.user as string, pass: cfg.password as string },
  });

  await transporter.sendMail({
    from:    `"${(cfg.fromName as string) || `${BRAND.name} HR`}" <${cfg.user}>`,
    to,
    subject,
    text: body,
  });

  // Store sent email in hr_emails
  await db.insert(hrEmails).values({
    companyId,
    subject,
    fromAddress:     String(cfg.user),
    toAddress:       to,
    date:            new Date().toISOString(),
    bodyText:        body,
    isRead:          true,
    isIncoming:      false,
    linkedBeweberId: linkedBeweberId ?? undefined,
  });

  res.json({ success: true });
});

// GET /api/hr/postfach/templates — predefined HR email templates
router.get("/hr/postfach/templates", requireAuth, (_req, res): void => {
  res.json([
    {
      id: "bewerbung_eingang",
      label: "Bewerbungseingang bestätigen",
      subject: "Eingang Ihrer Bewerbung bei P&P Group",
      body: "Sehr geehrte/r {{name}},\n\nvielen Dank für Ihre Bewerbung als {{stelle}} bei P&P Group.\n\nWir haben Ihre Unterlagen erhalten und werden diese sorgfältig prüfen. Sie erhalten in Kürze eine weitere Rückmeldung von uns.\n\nMit freundlichen Grüßen\nPersonalabteilung P&P Group",
    },
    {
      id: "interview_einladung",
      label: "Einladung zum Vorstellungsgespräch",
      subject: "Einladung zum Vorstellungsgespräch — {{stelle}}",
      body: "Sehr geehrte/r {{name}},\n\nwir haben Ihre Bewerbung als {{stelle}} geprüft und möchten Sie gerne persönlich kennenlernen.\n\nWir laden Sie herzlich zu einem Vorstellungsgespräch ein:\n\nDatum: {{datum}}\nUhrzeit: {{uhrzeit}}\nAdresse: {{adresse}}\n\nBitte bestätigen Sie Ihre Teilnahme per Antwort auf diese E-Mail.\n\nMit freundlichen Grüßen\nPersonalabteilung P&P Group",
    },
    {
      id: "absage",
      label: "Absage",
      subject: "Ihre Bewerbung bei P&P Group",
      body: "Sehr geehrte/r {{name}},\n\nvielen Dank für Ihre Bewerbung als {{stelle}} und Ihr Interesse an einer Tätigkeit bei P&P Group.\n\nNach sorgfältiger Prüfung müssen wir Ihnen leider mitteilen, dass wir Ihre Bewerbung nicht weiter berücksichtigen können, da wir uns für andere Kandidaten entschieden haben.\n\nWir wünschen Ihnen für Ihre berufliche Zukunft alles Gute.\n\nMit freundlichen Grüßen\nPersonalabteilung P&P Group",
    },
    {
      id: "angebot",
      label: "Vertragsangebot",
      subject: "Vertragsangebot — {{stelle}} bei P&P Group",
      body: "Sehr geehrte/r {{name}},\n\nwir freuen uns sehr, Ihnen folgendes Angebot unterbreiten zu dürfen:\n\nPosition: {{stelle}}\nStartdatum: {{datum}}\nBeschäftigungsart: {{typ}}\n\nWir würden uns sehr freuen, Sie bald in unserem Team willkommen zu heißen.\n\nBitte melden Sie sich bei Rückfragen jederzeit bei uns.\n\nMit freundlichen Grüßen\nPersonalabteilung P&P Group",
    },
    {
      id: "willkommen",
      label: "Willkommen (Onboarding)",
      subject: "Herzlich Willkommen bei P&P Group, {{name}}!",
      body: "Liebe/r {{name}},\n\nwir freuen uns sehr, Sie ab {{datum}} in unserem Team begrüßen zu dürfen!\n\nZur Vorbereitung Ihres ersten Arbeitstages erhalten Sie in Kürze weitere Informationen zu:\n- Ihrem Arbeitsplatz\n- Ihren Zugangsdaten\n- Dem Ablauf Ihrer Einarbeitung\n\nBei Fragen stehen wir Ihnen jederzeit zur Verfügung.\n\nWir freuen uns auf eine erfolgreiche Zusammenarbeit!\n\nMit freundlichen Grüßen\nPersonalabteilung P&P Group",
    },
    {
      id: "urlaub_genehmigt",
      label: "Urlaubsgenehmigung",
      subject: "Urlaubsantrag genehmigt",
      body: "Liebe/r {{name}},\n\nIhr Urlaubsantrag für den Zeitraum {{von}} bis {{bis}} ({{tage}} Tage) wurde genehmigt.\n\nWir wünschen Ihnen eine schöne Auszeit!\n\nMit freundlichen Grüßen\nPersonalabteilung P&P Group",
    },
    {
      id: "urlaub_abgelehnt",
      label: "Urlaubsablehnung",
      subject: "Urlaubsantrag — Rückmeldung",
      body: "Liebe/r {{name}},\n\nleider können wir Ihren Urlaubsantrag für den Zeitraum {{von}} bis {{bis}} zum aktuellen Zeitpunkt nicht genehmigen.\n\nGrund: {{grund}}\n\nBitte sprechen Sie uns für einen alternativen Termin an.\n\nMit freundlichen Grüßen\nPersonalabteilung P&P Group",
    },
  ]);
});

export default router;
