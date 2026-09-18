import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// ============================================================================
// Reports: the HTML documents agents write for a project. One row is one whole
// self-contained document, replaced in place — there is no version history.
// ============================================================================

// `html` is a text column rather than an R2 object: the service caps it at
// REPORT_MAX_HTML_BYTES, well under D1's 2 MB per-row limit, and a single store
// keeps deletion to the projects cascade. Never `SELECT *` here — list reads
// take metadata columns only, and only getReportHtml touches `html`.
export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Markdown, capped at REPORT_MAX_SUMMARY_CHARS: what list reads return
    // instead of the document.
    summary: text("summary").notNull(),
    html: text("html").notNull(),
    // Agent-supplied slug of the skill that produced the report ("seo-audit").
    skill: text("skill"),
    // The report template the agent followed, when it followed one. No FK: a
    // deleted template must not delete or block the reports written from it,
    // and every read of the name is project-scoped anyway.
    templateId: text("template_id"),
    // The client half of attribution: free text ("Claude Code", "Codex", "SAM",
    // "API key", a sanitized UA token). Self-reported, so nothing authorizes,
    // filters or bills on it. Stamped at create and never re-stamped.
    createdBy: text("created_by").notNull(),
    // The identity half, from the authenticated session. No FK, mirroring
    // audits.started_by_user_id, so GDPR can re-attribute an erased user
    // without cascading a surviving organization's reports away.
    createdByUserId: text("created_by_user_id").notNull(),
    // UTF-8 byte length of `html`, so readers can detect a truncated read
    // without loading the document.
    sizeBytes: integer("size_bytes").notNull(),
    // Public share link. Null means not shared: the capability IS the token, so
    // nulling it is what revokes the link. 192 bits of base64url, stored in
    // plaintext — it is an unguessable URL, not a credential to compare against
    // a user, and the raw endpoint has to look a row up by it.
    shareToken: text("share_token"),
    // When the current token was minted. Re-sharing mints a new token and a new
    // stamp; content saves never touch either column.
    sharedAt: text("shared_at"),
    // Timestamps are text on both dialects and stamped by the repository. The
    // default emits ISO (unlike current_timestamp's space format) because the
    // list order is lexicographic against app-written ISO stamps.
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  // Serves the feature's one list query: a project's reports, newest update
  // first. `id` is in the key because same-second saves tie on updated_at.
  // Trailing `size_bytes` is what makes the org storage-ceiling SUM (run on
  // every save) an index-only read; without it the scan fetches every row and,
  // because `size_bytes` follows `html` in the record, walks each row's
  // overflow pages.
  (table) => [
    index("reports_project_updated_idx").on(
      table.projectId,
      table.updatedAt,
      table.id,
      table.sizeBytes,
    ),
    // The public read path: one lookup by token, with no project id to scope
    // it. Unique so a mint collision fails loudly instead of pointing one link
    // at two reports; nulls do not collide on either dialect.
    uniqueIndex("reports_share_token_idx").on(table.shareToken),
  ],
);
