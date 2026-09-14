// © 2026 P&P Group. Proprietary & Confidential.
import {
  pgTable, serial, text, timestamp, integer, bigint, boolean, jsonb, index, numeric, uniqueIndex, date,
} from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { users }     from "./users";
import { gesellschaften } from "./dms-wurzeln";

// ── Mitarbeiter (extended employee profile) ───────────────────────────────────

export const EMPLOYMENT_TYPES = [
  "vollzeit", "teilzeit", "minijob", "werkstudent", "praktikant", "freiberuflich",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYEE_STATUSES = [
  "aktiv", "elternzeit", "krank", "gekündigt", "ausgeschieden",
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const hrMitarbeiter = pgTable(
  "hr_mitarbeiter",
  {
    id:                  serial("id").primaryKey(),
    companyId:           integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId:              integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** ⚠ NICHT companyId. `companyId` ist der MANDANT, `gesellschaftId` der
     *  RECHTSTRÄGER (GS-####), dem die Personalkosten zuzurechnen sind. Bleibt
     *  nullable: kein Bestandssatz trägt sie heute, und ein geratener Default
     *  täuschte eine Zuordnungsquote vor, die es nicht gibt (0427). */
    gesellschaftId:      integer("gesellschaft_id").references(() => gesellschaften.id, { onDelete: "set null" }),
    /** Teilzeit zählt in TAGEN, nicht in Stunden: 3 Tage/Woche = 3/5 des Urlaubs (0436). */
    arbeitstageProWoche: integer("arbeitstage_pro_woche").notNull().default(5),
    /** § 34c GewO: 20 Stunden Weiterbildung in drei Jahren (§ 15b MaBV). */
    mabvPflichtig:       boolean("mabv_pflichtig").notNull().default(false),
    austrittsgrund:      text("austrittsgrund"),
    name:                text("name").notNull(),
    jobTitle:            text("job_title").notNull().default(""),
    abteilung:           text("abteilung"),
    employmentType:      text("employment_type").notNull().default("vollzeit"),
    startDate:           text("start_date").notNull(),
    endDate:             text("end_date"),
    status:              text("status").notNull().default("aktiv"),
    weeklyHours:         integer("weekly_hours"),
    salaryGross:         integer("salary_gross"),   // €-Cent, admin only
    email:               text("email"),
    phone:               text("phone"),
    address:             text("address"),
    city:                text("city"),
    zipCode:             text("zip_code"),
    emergencyContact:    text("emergency_contact"),
    emergencyPhone:      text("emergency_phone"),
    birthDate:           text("birth_date"),
    notes:               text("notes"),
    // ── ZeitMind-Felder (seit Migration 0051) ─────────────────────────────────
    stundensatz:         numeric("stundensatz",  { precision: 8,  scale: 2 }),
    monatslohn:          numeric("monatslohn",   { precision: 10, scale: 2 }),
    lohnart:             text("lohnart").notNull().default("stundenlohn"),
    kalenderfarbe:       text("kalenderfarbe").notNull().default("#6366f1"),
    zmRolle:             text("zm_rolle").notNull().default("sonstige"),
    urlaubstageProJahr:  integer("urlaubstage_pro_jahr").notNull().default(30),
    // ── Lohnabrechnung-Felder (seit Migration 0064) ───────────────────────────
    steuerklasse:        integer("steuerklasse").notNull().default(1),
    kirchensteuer:       boolean("kirchensteuer").notNull().default(false),
    freibetragCents:     integer("freibetrag_cents").notNull().default(0),  // jährlicher Lohnsteuerfreibetrag
    kinderzahl:          integer("kinderzahl").notNull().default(0),
    kvZusatzbeitragBp:   integer("kv_zusatzbeitrag_bp").notNull().default(85), // 0.85% AN-Anteil Zusatzbeitrag
    createdAt:           timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("hr_mitarbeiter_company_idx").on(t.companyId),
    index("hr_mitarbeiter_gesellschaft_idx").on(t.companyId, t.gesellschaftId),
  ],
);

// ── Urlaub (leave requests) ───────────────────────────────────────────────────

export const LEAVE_TYPES = [
  "urlaub", "krank", "sonderurlaub", "überstunden", "homeoffice",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = ["ausstehend", "genehmigt", "abgelehnt"] as const;

export interface KalenderEintrag { verbindungId: number; externalId: string; ziel: "eigen" | "team" }
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const hrUrlaub = pgTable(
  "hr_urlaub",
  {
    id:             serial("id").primaryKey(),
    companyId:      integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId:  integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    type:           text("type").notNull().default("urlaub"),
    startDate:      text("start_date").notNull(),
    endDate:        text("end_date").notNull(),
    days:           integer("days").notNull().default(1),
    status:         text("status").notNull().default("ausstehend"),
    approvedBy:     integer("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt:     timestamp("approved_at", { withTimezone: true }),
    reason:         text("reason"),
    notes:          text("notes"),
    // ── Kalender (0431) ──────────────────────────────────────────────────────
    /** Wo der Eintrag liegt: [{ verbindungId, externalId, ziel: "eigen" | "team" }]. */
    kalenderEintraege: jsonb("kalender_eintraege").$type<KalenderEintrag[]>().notNull().default([]),
    /** Letzter Fehler beim Schreiben — die Genehmigung bleibt davon unberührt. */
    kalenderFehler: text("kalender_fehler"),
    kalenderAt:     timestamp("kalender_at", { withTimezone: true }),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_urlaub_company_idx").on(t.companyId)],
);

// ── Stellenangebote (job openings) ────────────────────────────────────────────

export const JOB_STATUSES = ["offen", "besetzt", "pausiert", "geschlossen"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const hrStellungen = pgTable(
  "hr_stellungen",
  {
    id:             serial("id").primaryKey(),
    companyId:      integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    title:          text("title").notNull(),
    department:     text("department"),
    description:    text("description"),
    requirements:   text("requirements"),
    employmentType: text("employment_type"),
    salaryMin:      integer("salary_min"),   // €-Cent
    salaryMax:      integer("salary_max"),   // €-Cent
    location:       text("location"),
    remote:         boolean("remote").notNull().default(false),
    status:         text("status").notNull().default("offen"),
    publishDate:    text("publish_date"),
    closingDate:    text("closing_date"),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_stellungen_company_idx").on(t.companyId)],
);

// ── Bewerber (job applicants) ─────────────────────────────────────────────────

export const APPLICANT_STATUSES = [
  "neu", "in-prüfung", "interview", "angebot", "angestellt", "abgelehnt",
] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export const hrBewerber = pgTable(
  "hr_bewerber",
  {
    id:            serial("id").primaryKey(),
    companyId:     integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    stelleId:      integer("stelle_id").references(() => hrStellungen.id, { onDelete: "set null" }),
    name:          text("name").notNull(),
    email:         text("email"),
    phone:         text("phone"),
    status:        text("status").notNull().default("neu"),
    notes:         text("notes"),
    cvNotes:       text("cv_notes"),
    appliedAt:     text("applied_at").notNull(),
    interviewDate: text("interview_date"),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_bewerber_company_idx").on(t.companyId)],
);

// ── Onboarding tasks ──────────────────────────────────────────────────────────

export const ONBOARDING_CATEGORIES = [
  "dokumente", "zugänge", "einführung", "ausstattung", "schulung", "sonstiges",
] as const;
export type OnboardingCategory = (typeof ONBOARDING_CATEGORIES)[number];

export const hrOnboarding = pgTable(
  "hr_onboarding",
  {
    id:            serial("id").primaryKey(),
    companyId:     integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId: integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    category:      text("category").notNull().default("sonstiges"),
    task:          text("task").notNull(),
    status:        text("status").notNull().default("offen"),
    dueDate:       text("due_date"),
    completedAt:   timestamp("completed_at", { withTimezone: true }),
    assignedTo:    integer("assigned_to").references(() => users.id, { onDelete: "set null" }),
    notes:         text("notes"),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_onboarding_company_idx").on(t.companyId)],
);

// ── Schulungen (trainings) ────────────────────────────────────────────────────

export const TRAINING_TYPES   = ["pflicht", "freiwillig", "extern"] as const;
export const TRAINING_STATUSES = ["geplant", "laufend", "abgeschlossen", "abgesagt"] as const;

export const hrSchulungen = pgTable(
  "hr_schulungen",
  {
    id:                 serial("id").primaryKey(),
    companyId:          integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    title:              text("title").notNull(),
    description:        text("description"),
    trainer:            text("trainer"),
    type:               text("type").notNull().default("freiwillig"),
    date:               text("date"),
    durationHours:      integer("duration_hours"),
    location:           text("location"),
    status:             text("status").notNull().default("geplant"),
    maxParticipants:    integer("max_participants"),
    participants:       jsonb("participants").$type<number[]>().default([]),
    certificateRequired: boolean("certificate_required").notNull().default(false),
    createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:          timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_schulungen_company_idx").on(t.companyId)],
);

// ── HR E-Mail Postfach (IMAP sync cache) ─────────────────────────────────────

export const hrEmails = pgTable(
  "hr_emails",
  {
    id:              serial("id").primaryKey(),
    companyId:       integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    messageId:       text("message_id"),          // IMAP UID for dedup
    subject:         text("subject"),
    fromAddress:     text("from_address"),
    fromName:        text("from_name"),
    toAddress:       text("to_address"),
    date:            text("date"),
    bodyText:        text("body_text"),
    bodyHtml:        text("body_html"),
    isRead:          boolean("is_read").notNull().default(false),
    isIncoming:      boolean("is_incoming").notNull().default(true),
    folder:          text("folder").notNull().default("INBOX"),
    linkedBeweberId: integer("linked_bewerber_id").references(() => hrBewerber.id, { onDelete: "set null" }),
    createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_emails_company_idx").on(t.companyId)],
);

// ── Schichten / Dienstplan ────────────────────────────────────────────────────

export const SHIFT_TYPES    = ["normal", "frueh", "spaet", "nacht", "bereitschaft", "homeoffice"] as const;
export const SHIFT_STATUSES = ["geplant", "bestaetigt", "abwesend"] as const;

export const hrSchichten = pgTable(
  "hr_schichten",
  {
    id:            serial("id").primaryKey(),
    companyId:     integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId: integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    date:          text("date").notNull(),
    startTime:     text("start_time").notNull().default("08:00"),
    endTime:       text("end_time").notNull().default("17:00"),
    shiftType:     text("shift_type").notNull().default("normal"),
    status:        text("status").notNull().default("geplant"),
    notes:         text("notes"),
    createdBy:     integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:     timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_schichten_company_idx").on(t.companyId)],
);

// ── Digitale Personalakte ─────────────────────────────────────────────────────

export const PERSONALAKTE_DOC_TYPES = [
  "arbeitsvertrag", "zeugnis", "bescheinigung", "abmahnung", "sonstiges",
] as const;

export const hrPersonalakte = pgTable(
  "hr_personalakte",
  {
    id:            serial("id").primaryKey(),
    companyId:     integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId: integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    docType:       text("doc_type").notNull().default("sonstiges"),
    title:         text("title").notNull(),
    fileUrl:       text("file_url"),
    expiresAt:     text("expires_at"),
    notes:         text("notes"),
    uploadedBy:    integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_personalakte_company_idx").on(t.companyId)],
);

// ── Qualifikations-Katalog ────────────────────────────────────────────────────

export const QUALIFIKATION_CATEGORIES = ["technisch", "sicherheit", "rechtlich", "sonstige"] as const;

export const hrQualifikationen = pgTable(
  "hr_qualifikationen",
  {
    id:                      serial("id").primaryKey(),
    companyId:               integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name:                    text("name").notNull(),
    category:                text("category").notNull().default("sonstige"),
    description:             text("description"),
    renewalRequired:         boolean("renewal_required").notNull().default(false),
    renewalIntervalMonths:   integer("renewal_interval_months"),
    createdAt:               timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_qualifikationen_company_idx").on(t.companyId)],
);

export const hrMitarbeiterQualifikationen = pgTable(
  "hr_mitarbeiter_qualifikationen",
  {
    id:              serial("id").primaryKey(),
    companyId:       integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId:   integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    qualifikationId: integer("qualifikation_id").notNull().references(() => hrQualifikationen.id, { onDelete: "cascade" }),
    erworbrenAm:     text("erworben_am").notNull(),
    ablaufdatum:     text("ablaufdatum"),
    zertifikatNr:    text("zertifikat_nr"),
    status:          text("status").notNull().default("aktiv"),
    notes:           text("notes"),
    createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_ma_qual_company_idx").on(t.companyId)],
);

// ── Leistungsbeurteilungen ────────────────────────────────────────────────────

export const hrBeurteilungen = pgTable(
  "hr_beurteilungen",
  {
    id:                    serial("id").primaryKey(),
    companyId:             integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId:         integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    period:                text("period").notNull(),
    rating:                integer("rating").notNull().default(3),
    staerken:              text("staerken"),
    verbesserungen:        text("verbesserungen"),
    zieleNaechstePeriode:  text("ziele_naechste_periode"),
    notes:                 text("notes"),
    createdBy:             integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt:             timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:             timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_beurteilungen_company_idx").on(t.companyId)],
);

// ── Ziele / OKR ───────────────────────────────────────────────────────────────

export const GOAL_STATUSES = ["offen", "in-bearbeitung", "erreicht", "nicht-erreicht"] as const;

export const hrZiele = pgTable(
  "hr_ziele",
  {
    id:            serial("id").primaryKey(),
    companyId:     integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId: integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    title:         text("title").notNull(),
    description:   text("description"),
    targetDate:    text("target_date"),
    status:        text("status").notNull().default("offen"),
    progressPct:   integer("progress_pct").notNull().default(0),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:     timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_ziele_company_idx").on(t.companyId)],
);

// ── Kostenparameter der Personalrechnung ──────────────────────────────────────
//
// Was ein Krankheitstag kostet, ist keine Naturkonstante: es hängt an den
// Arbeitstagen des Jahres und am Arbeitgeberanteil zur Sozialversicherung.
// Beide ändern sich jährlich. Stünden sie im Code, wäre jede historische
// Auswertung rückwirkend falsch, sobald jemand den Satz anpasst (0427).

export const hrKostenParameter = pgTable(
  "hr_kosten_parameter",
  {
    id:                 serial("id").primaryKey(),
    companyId:          integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    jahr:               integer("jahr").notNull(),
    arbeitstageProJahr: integer("arbeitstage_pro_jahr").notNull().default(250),
    /** ⚠ BASISPUNKTE, nicht Prozent: 2000 = 20,00 %. Ganzzahlig, weil der
     *  Faktor 100 in dieser Domäne die häufigste stille Fehlerquelle ist. */
    agNebenkostenBp:    integer("ag_nebenkosten_bp").notNull().default(2000),
    /** Tag im Monat, an dem die Gehälter abgehen — 28 heißt Monatsende (0436). */
    zahltag:            integer("zahltag").notNull().default(28),
    notiz:              text("notiz").notNull().default(""),
    createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:          timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("hr_kosten_parameter_company_jahr_uq").on(t.companyId, t.jahr)],
);

// ── Arbeitsverträge ───────────────────────────────────────────────────────────
//
// Eigene Tabelle, nicht Spalten am Mitarbeiter: ein Mitarbeiter hat über die
// Jahre MEHRERE Verträge (befristet → verlängert → entfristet). § 14 Abs. 2
// TzBfG erlaubt die sachgrundlose Befristung höchstens zwei Jahre und drei
// Verlängerungen — das lässt sich nur über Vertragszeilen zählen (0428).
//
// ⚠ `hrPersonalakte` bleibt das DOKUMENT. Hier steht, was DARIN steht.

export const VERTRAGSARTEN = [
  "unbefristet", "befristet_sachgrund", "befristet_sachgrundlos", "ausbildung", "sonstiges",
] as const;
export type Vertragsart = (typeof VERTRAGSARTEN)[number];

export const KUENDIGUNGSTERMINE = [
  "monatsende", "quartalsende", "fuenfzehnter_oder_monatsende", "jederzeit",
] as const;
export type Kuendigungstermin = (typeof KUENDIGUNGSTERMINE)[number];

export const VERTRAG_STATUSES = ["aktiv", "beendet", "abgeloest"] as const;

export const hrArbeitsvertraege = pgTable(
  "hr_arbeitsvertraege",
  {
    id:                     serial("id").primaryKey(),
    companyId:              integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId:          integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    vertragsart:            text("vertragsart").notNull().default("unbefristet"),
    beginn:                 date("beginn").notNull(),
    /** NULL bei unbefristeten Verträgen; ein CHECK erzwingt das Ende bei befristeten. */
    ende:                   date("ende"),
    /** Verlängerung eines vorherigen befristeten Vertrags — zählt in die § 14-Kette. */
    istVerlaengerung:       boolean("ist_verlaengerung").notNull().default(false),
    sachgrund:              text("sachgrund"),
    probezeitBis:           date("probezeit_bis"),
    kuendigungsfristWert:   integer("kuendigungsfrist_wert"),
    kuendigungsfristEinheit: text("kuendigungsfrist_einheit"),
    kuendigungstermin:      text("kuendigungstermin"),
    wochenstunden:          numeric("wochenstunden", { precision: 5, scale: 2 }),
    /** Vertragsgehalt bei Abschluss, Monatsbrutto in CENT. Der aktuelle Stand steht am Mitarbeiter. */
    gehaltMonatCent:        integer("gehalt_monat_cent"),
    urlaubstage:            integer("urlaubstage"),
    wettbewerbsverbot:      boolean("wettbewerbsverbot").notNull().default(false),
    nebentaetigkeitErlaubt: boolean("nebentaetigkeit_erlaubt"),
    personalakteId:         integer("personalakte_id").references(() => hrPersonalakte.id, { onDelete: "set null" }),
    /** Letzter KI-Vorschlag mit Fundstellen — bleibt, damit man nachlesen kann, WOHER ein Wert kam. */
    kiAuslesung:            jsonb("ki_auslesung"),
    status:                 text("status").notNull().default("aktiv"),
    notiz:                  text("notiz").notNull().default(""),
    createdAt:              timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:              timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_arbeitsvertraege_company_ma_idx").on(t.companyId, t.mitarbeiterId)],
);

// ── Persönlichkeitsprofile ────────────────────────────────────────────────────
//
// Die sensibelsten Daten im HR-Modul: ein Urteil über einen Menschen. Deshalb
// stehen drei Regeln in der Tabelle statt in einer Richtlinie — Einwilligung
// ist NOT NULL, Quelle ist NOT NULL, Dimensionen liegen je Methode getrennt
// (0429). Was hier NICHT liegt: Art.-9-Daten (Gesundheit, Religion, Herkunft).

export const PROFIL_METHODEN  = ["disg", "big_five", "staerken", "frei"] as const;
export const PROFIL_QUELLEN   = ["selbsteinschaetzung", "fremdeinschaetzung", "test", "ki_entwurf"] as const;
export const PROFIL_SICHTBAR  = ["hr", "fuehrungskraft", "selbst"] as const;

/** Dimensionen je Methode — die Maske zeigt genau diese Schlüssel, nichts anderes. */
export const PROFIL_DIMENSIONEN: Record<string, readonly string[]> = {
  disg:     ["dominant", "initiativ", "stetig", "gewissenhaft"],
  big_five: ["offenheit", "gewissenhaftigkeit", "extraversion", "vertraeglichkeit", "neurotizismus"],
  staerken: [],
  frei:     [],
};

export const hrPersoenlichkeitsprofile = pgTable(
  "hr_persoenlichkeitsprofile",
  {
    id:                 serial("id").primaryKey(),
    companyId:          integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId:      integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    methode:            text("methode").notNull().default("frei"),
    /** Skalenwerte 0–100 je Dimension; Schlüssel laut PROFIL_DIMENSIONEN[methode]. */
    dimensionen:        jsonb("dimensionen").$type<Record<string, number>>().notNull().default({}),
    staerken:           text("staerken").array().notNull().default([]),
    entwicklungsfelder: text("entwicklungsfelder").array().notNull().default([]),
    arbeitsstil:        text("arbeitsstil"),
    teamrolle:          text("teamrolle"),
    quelle:             text("quelle").notNull(),
    erhobenAm:          date("erhoben_am").notNull(),
    /** NOT NULL und per CHECK nicht nach der Erhebung — ohne Einwilligung kein Profil. */
    einwilligungAm:     date("einwilligung_am").notNull(),
    sichtbarFuer:       text("sichtbar_fuer").notNull().default("hr"),
    kiEntwurf:          jsonb("ki_entwurf"),
    notiz:              text("notiz").notNull().default(""),
    erstelltVon:        integer("erstellt_von").references(() => users.id, { onDelete: "set null" }),
    createdAt:          timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:          timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_persoenlichkeitsprofile_company_ma_idx").on(t.companyId, t.mitarbeiterId)],
);

// ── Marktgehälter ─────────────────────────────────────────────────────────────
//
// Erfasst aus benannten Quellen, nicht generiert — ein Sprachmodell kennt
// keine aktuellen regionalen Gehaltsdaten (0430).
//
// ⚠ EINHEIT: JAHRESBRUTTO VOLLZEIT IN CENT. `salary_gross` am Mitarbeiter ist
//   ein MONATSwert. Der Vergleich rechnet intern ×12, nie den Markt /12.

export const hrMarktgehaelter = pgTable(
  "hr_marktgehaelter",
  {
    id:                     serial("id").primaryKey(),
    companyId:              integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    /** Normalisiert (klein, ein Leerzeichen) — derselbe Schlüssel wie in der Auswertung Gehalt × Qualifikation. */
    stellengruppe:          text("stellengruppe").notNull(),
    anzeige:                text("anzeige").notNull(),
    region:                 text("region").notNull().default("Deutschland"),
    quelle:                 text("quelle").notNull(),
    jahr:                   integer("jahr").notNull(),
    jahresbruttoP25Cent:    bigint("jahresbrutto_p25_cent", { mode: "number" }),
    jahresbruttoMedianCent: bigint("jahresbrutto_median_cent", { mode: "number" }).notNull(),
    jahresbruttoP75Cent:    bigint("jahresbrutto_p75_cent", { mode: "number" }),
    erfasstAm:              date("erfasst_am").notNull(),
    notiz:                  text("notiz").notNull().default(""),
    erstelltVon:            integer("erstellt_von").references(() => users.id, { onDelete: "set null" }),
    createdAt:              timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:              timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("hr_marktgehaelter_gruppe_quelle_uq").on(t.companyId, t.stellengruppe, t.region, t.quelle, t.jahr),
    index("hr_marktgehaelter_company_gruppe_idx").on(t.companyId, t.stellengruppe),
  ],
);

// ── Runde 2 (0436): Urlaubskonto, Weiterbildung, Erinnerungen, Offboarding ──

export const URLAUB_KORREKTUR_ARTEN = ["uebertrag", "korrektur", "auszahlung", "verfall"] as const;

export const hrUrlaubKorrekturen = pgTable(
  "hr_urlaub_korrekturen",
  {
    id:            serial("id").primaryKey(),
    companyId:     integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId: integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    jahr:          integer("jahr").notNull(),
    /** `uebertrag` ERSETZT den gerechneten Übertrag; die anderen werden addiert. */
    art:           text("art").notNull(),
    tage:          numeric("tage", { precision: 5, scale: 1 }).notNull(),
    grund:         text("grund").notNull().default(""),
    erstelltVon:   integer("erstellt_von"),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_urlaub_korrekturen_company_ma_idx").on(t.companyId, t.mitarbeiterId, t.jahr)],
);

export const hrWeiterbildung = pgTable(
  "hr_weiterbildung",
  {
    id:             serial("id").primaryKey(),
    companyId:      integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId:  integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    titel:          text("titel").notNull(),
    anbieter:       text("anbieter"),
    datum:          date("datum").notNull(),
    stunden:        numeric("stunden", { precision: 5, scale: 2 }).notNull(),
    /** Zählt für die 20 Stunden nach MaBV Anlage 1. */
    mabvRelevant:   boolean("mabv_relevant").notNull().default(true),
    personalakteId: integer("personalakte_id").references(() => hrPersonalakte.id, { onDelete: "set null" }),
    notiz:          text("notiz").notNull().default(""),
    erstelltVon:    integer("erstellt_von"),
    createdAt:      timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("hr_weiterbildung_company_ma_datum_idx").on(t.companyId, t.mitarbeiterId, t.datum)],
);

/** Welche Frist wem schon gemeldet wurde — der Schlüssel trägt den Stichtag, damit eine verschobene Frist erneut erinnert. */
export const hrErinnerungen = pgTable(
  "hr_erinnerungen",
  {
    id:         serial("id").primaryKey(),
    companyId:  integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    schluessel: text("schluessel").notNull(),
    gesendetAt: timestamp("gesendet_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("hr_erinnerungen_schluessel_uq").on(t.companyId, t.schluessel)],
);

export const OFFBOARDING_STATUS = ["offen", "erledigt", "entfaellt"] as const;

export const hrOffboarding = pgTable(
  "hr_offboarding",
  {
    id:            serial("id").primaryKey(),
    companyId:     integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    mitarbeiterId: integer("mitarbeiter_id").notNull().references(() => hrMitarbeiter.id, { onDelete: "cascade" }),
    schritt:       text("schritt").notNull(),
    status:        text("status").notNull().default("offen"),
    /** Per Klick ausführbar (Konto sperren, Verteiler, Kalender …). */
    automatisch:   boolean("automatisch").notNull().default(false),
    ergebnis:      text("ergebnis"),
    erledigtAm:    timestamp("erledigt_am", { withTimezone: true }),
    erledigtVon:   integer("erledigt_von"),
    createdAt:     timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("hr_offboarding_ma_schritt_uq").on(t.mitarbeiterId, t.schritt)],
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type HrEmail = typeof hrEmails.$inferSelect;

export type HrMitarbeiter             = typeof hrMitarbeiter.$inferSelect;
export type HrUrlaub                  = typeof hrUrlaub.$inferSelect;
export type HrStelle                  = typeof hrStellungen.$inferSelect;
export type HrBewerber                = typeof hrBewerber.$inferSelect;
export type HrOnboarding              = typeof hrOnboarding.$inferSelect;
export type HrSchulung                = typeof hrSchulungen.$inferSelect;
export type HrSchicht                 = typeof hrSchichten.$inferSelect;
export type HrPersonalakteDok         = typeof hrPersonalakte.$inferSelect;
export type HrQualifikation           = typeof hrQualifikationen.$inferSelect;
export type HrKostenParameter         = typeof hrKostenParameter.$inferSelect;
export type HrArbeitsvertrag          = typeof hrArbeitsvertraege.$inferSelect;
export type HrPersoenlichkeitsprofil  = typeof hrPersoenlichkeitsprofile.$inferSelect;
export type HrMarktgehalt             = typeof hrMarktgehaelter.$inferSelect;
export type HrWeiterbildung           = typeof hrWeiterbildung.$inferSelect;
export type HrOffboardingSchritt      = typeof hrOffboarding.$inferSelect;
export type HrMitarbeiterQualifikation = typeof hrMitarbeiterQualifikationen.$inferSelect;
export type HrBeurteilung             = typeof hrBeurteilungen.$inferSelect;
export type HrZiel                    = typeof hrZiele.$inferSelect;
