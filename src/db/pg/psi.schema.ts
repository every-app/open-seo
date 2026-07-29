import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// URLs monitored by PageSpeed Insights, per OpenSEO project. The PSI API key
// is an instance-level env secret (PAGESPEED_API_KEY), never stored here —
// there is no external account to link, so there is no connections table.
// The project homepage is seeded lazily as an ordinary row. See specs/0011.
export const psiUrls = pgTable(
  "psi_urls",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Normalized absolute URL, e.g. "https://example.com/pricing".
    url: text("url").notNull(),
    // True for the row auto-seeded from projects.domain.
    isHomepage: boolean("is_homepage").notNull().default(false),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("psi_urls_project_url_idx").on(table.projectId, table.url),
    index("psi_urls_organization_idx").on(table.organizationId),
  ],
);

// One row per URL x strategy x run. Lab metrics come from lighthouseResult;
// field metrics from loadingExperience (CrUX), which is absent for
// low-traffic URLs — every field column is nullable by design.
// A non-null errorMessage marks a failed run, mirroring
// audit_lighthouse_results, so the UI can show "last run failed" per URL.
export const psiSnapshots = pgTable(
  "psi_snapshots",
  {
    id: text("id").primaryKey(),
    urlId: text("url_id")
      .notNull()
      .references(() => psiUrls.id, { onDelete: "cascade" }),
    // Denormalized so per-project reads never need the join.
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    strategy: text("strategy", { enum: ["mobile", "desktop"] }).notNull(),
    // Lighthouse category scores, 0-100 (API returns 0-1 floats).
    performanceScore: integer("performance_score"),
    accessibilityScore: integer("accessibility_score"),
    bestPracticesScore: integer("best_practices_score"),
    seoScore: integer("seo_score"),
    // Lab metrics from lighthouseResult.audits[*].numericValue.
    lcpMs: real("lcp_ms"),
    cls: real("cls"),
    tbtMs: real("tbt_ms"),
    fcpMs: real("fcp_ms"),
    speedIndexMs: real("speed_index_ms"),
    ttfbMs: real("ttfb_ms"),
    // CrUX field data. Null when Google has no real-user data for the URL.
    fieldLcpMs: real("field_lcp_ms"),
    fieldInpMs: real("field_inp_ms"),
    // Stored as a true CLS value; the API reports the percentile x100.
    fieldCls: real("field_cls"),
    fieldOverallCategory: text("field_overall_category", {
      enum: ["FAST", "AVERAGE", "SLOW"],
    }),
    // "origin" when origin_fallback substituted origin-wide data for the URL.
    fieldSource: text("field_source", { enum: ["url", "origin"] }),
    // lighthouseResult.fetchTime — when Google ran the audit.
    fetchTime: text("fetch_time"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("psi_snapshots_url_strategy_created_idx").on(
      table.urlId,
      table.strategy,
      table.createdAt,
    ),
    index("psi_snapshots_project_idx").on(table.projectId),
  ],
);
