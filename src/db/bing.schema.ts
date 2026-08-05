import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Bing Webmaster Tools site per project.
// OAuth tokens live in the better-auth `account` table under providerId
// "bing-webmaster"; this row only
// records which verified site maps to a project and whose grant to use when
// calling the Bing Webmaster API.
export const bingConnections = sqliteTable(
  "bing_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from GetUserSites — e.g. "https://example.com/".
    // Never normalize; Bing matches it byte-for-byte.
    siteUrl: text("site_url").notNull(),
    // Whose bing-webmaster grant should be used when calling the API.
    connectedByUserId: text("connected_by_user_id").notNull(),
    // Bing's `webmasteruid`, the stable per-account identifier.
    bingAccountId: text("bing_account_id"),
    connectedAccountEmail: text("connected_account_email"),
    // Always "oauth" today; "api_key" is reserved for the deferred
    // self-hosted lane (see specs/0009).
    authMode: text("auth_mode").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected site per project; switching replaces the row.
    uniqueIndex("bing_connections_project_idx").on(table.projectId),
    index("bing_connections_organization_idx").on(table.organizationId),
  ],
);

// Bing's "AI performance" report (citations in Copilot/AI answers) has no
// API, only CSV exports from Bing Webmaster Tools — same situation as
// rapidapi_snapshots. See specs/0015.

// Daily overview CSV: one row per day. Uploads upsert per (project, date),
// same semantics as rapidapi_snapshots — re-uploading an overlapping range
// just overwrites those days.
export const bingAiCitationDays = sqliteTable(
  "bing_ai_citation_days",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // "YYYY-MM-DD", normalized from Bing's export date format.
    date: text("date").notNull(),
    citations: integer("citations").notNull(),
    citedPages: integer("cited_pages").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("bing_ai_citation_days_project_date_idx").on(
      table.projectId,
      table.date,
    ),
    index("bing_ai_citation_days_organization_idx").on(table.organizationId),
  ],
);

// One row per upload of a Pages or Queries CSV. Neither report carries a
// per-row date — each export reflects whatever window was picked in Bing's
// UI — so the window is entered at upload time and the upload is kept as
// its own snapshot rather than upserted, preserving history across imports.
export const bingAiCitationSnapshots = sqliteTable(
  "bing_ai_citation_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reportType: text("report_type", { enum: ["pages", "queries"] }).notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    rowCount: integer("row_count").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("bing_ai_citation_snapshots_project_type_idx").on(
      table.projectId,
      table.reportType,
    ),
    index("bing_ai_citation_snapshots_organization_idx").on(
      table.organizationId,
    ),
  ],
);

// Pages CSV rows for one snapshot. projectId is denormalized from the
// snapshot header (same pattern as psi_snapshots alongside psi_urls) so
// project-scoped reads never need a join back to the header.
export const bingAiPageCitations = sqliteTable(
  "bing_ai_page_citations",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => bingAiCitationSnapshots.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    page: text("page").notNull(),
    citations: integer("citations").notNull(),
  },
  (table) => [
    index("bing_ai_page_citations_snapshot_idx").on(table.snapshotId),
  ],
);

// Queries CSV rows for one snapshot. Intent/Topic are Bing's own
// classification of the grounding query; citationSharePercent is the plain
// numeric percent as exported (e.g. 72.27 for "72.27%").
export const bingAiQueryCitations = sqliteTable(
  "bing_ai_query_citations",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => bingAiCitationSnapshots.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    intent: text("intent").notNull(),
    topic: text("topic").notNull(),
    citations: integer("citations").notNull(),
    citationSharePercent: real("citation_share_percent").notNull(),
  },
  (table) => [
    index("bing_ai_query_citations_snapshot_idx").on(table.snapshotId),
  ],
);
