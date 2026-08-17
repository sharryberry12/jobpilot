/**
 * Drizzle → SQLite schema (SPEC §4).
 *
 * Conventions:
 *  - ids are prefixed nanoids (see lib/ids.ts); emails use the Gmail message id.
 *  - timestamps are ISO-8601 text (human-readable, sorts lexicographically).
 *  - JSON blobs are text columns named *_json; typed accessors live in lib/.
 */
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const isoNow = () => new Date().toISOString();

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    company: text("company").notNull(),
    roleTitle: text("role_title").notNull(),
    jdText: text("jd_text").notNull(),
    sourceUrl: text("source_url"),
    location: text("location"),
    /** Comma-separated override list of company email domains (SPEC §6.3 prefilter). */
    companyDomains: text("company_domains"),
    appliedAt: text("applied_at").notNull(),
    status: text("status").notNull().default("applied"),
    fitScore: real("fit_score"),
    /** Subscores + gap list JSON (SPEC §6.2 "store subscores and the explicit gap list"). */
    fitJson: text("fit_json"),
    resumeVersionId: text("resume_version_id"),
    ghosted: integer("ghosted", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().$defaultFn(isoNow),
    updatedAt: text("updated_at").notNull().$defaultFn(isoNow),
  },
  (t) => [index("applications_status_idx").on(t.status)],
);

/** Append-only. */
export const statusEvents = sqliteTable(
  "status_events",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    source: text("source", { enum: ["manual", "email", "system"] }).notNull(),
    emailId: text("email_id"),
    note: text("note"),
    createdAt: text("created_at").notNull().$defaultFn(isoNow),
  },
  (t) => [index("status_events_app_idx").on(t.applicationId, t.createdAt)],
);

export const emails = sqliteTable(
  "emails",
  {
    /** Gmail message id — natural key for idempotency. */
    id: text("id").primaryKey(),
    threadId: text("thread_id"),
    fromAddr: text("from_addr").notNull(),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    receivedAt: text("received_at").notNull(),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type"),
    confidence: real("confidence"),
    decidedBy: text("decided_by", { enum: ["auto", "user", "dismissed"] }),
    createdAt: text("created_at").notNull().$defaultFn(isoNow),
  },
  (t) => [
    index("emails_app_idx").on(t.applicationId),
    index("emails_received_idx").on(t.receivedAt),
  ],
);

export const reviewQueue = sqliteTable(
  "review_queue",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    proposedApplicationId: text("proposed_application_id"),
    proposedEvent: text("proposed_event"),
    confidence: real("confidence"),
    status: text("status", { enum: ["pending", "accepted", "corrected", "dismissed"] })
      .notNull()
      .default("pending"),
    /** Filled when status = corrected — the answer given by the user, reused as few-shot examples. */
    correctedApplicationId: text("corrected_application_id"),
    correctedEvent: text("corrected_event"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull().$defaultFn(isoNow),
  },
  (t) => [index("review_queue_status_idx").on(t.status)],
);

/** Singleton row (id = "master"). */
export const resumeMaster = sqliteTable("resume_master", {
  id: text("id").primaryKey().default("master"),
  profileJson: text("profile_json").notNull(),
  sourceFilename: text("source_filename"),
  updatedAt: text("updated_at").notNull().$defaultFn(isoNow),
});

export const resumeVersions = sqliteTable(
  "resume_versions",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    tailoredJson: text("tailored_json").notNull(),
    docxPath: text("docx_path"),
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().$defaultFn(isoNow),
  },
  (t) => [index("resume_versions_app_idx").on(t.applicationId)],
);

export const requirements = sqliteTable(
  "requirements",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    extractedJson: text("extracted_json").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(isoNow),
  },
  (t) => [index("requirements_app_idx").on(t.applicationId)],
);

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    /** Null for general (non-application) plans. */
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    goal: text("goal").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(isoNow),
  },
  (t) => [index("plans_app_idx").on(t.applicationId)],
);

export const planItems = sqliteTable(
  "plan_items",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["learn", "project"] }).notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    resourceUrl: text("resource_url"),
    status: text("status", { enum: ["todo", "doing", "done"] }).notNull().default("todo"),
    evidenceBullet: text("evidence_bullet"),
    completedAt: text("completed_at"),
    /** Preserves the planner ordering. */
    position: integer("position").notNull().default(0),
    /** Projects: what "done" means. */
    definitionOfDone: text("definition_of_done"),
    /** JSON string[] of skill names/slugs this item adds to the master profile when completed. */
    skillsJson: text("skills_json"),
  },
  (t) => [index("plan_items_plan_idx").on(t.planId)],
);

/** Small key/value store: last_history_id, last_sync_at, settings overrides. */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(isoNow),
});

// ── Row types ─────────────────────────────────────────────────────────────
export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type StatusEvent = typeof statusEvents.$inferSelect;
export type NewStatusEvent = typeof statusEvents.$inferInsert;
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
export type ReviewQueueItem = typeof reviewQueue.$inferSelect;
export type ResumeMaster = typeof resumeMaster.$inferSelect;
export type ResumeVersion = typeof resumeVersions.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
export type KvRow = typeof kv.$inferSelect;
