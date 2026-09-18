import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// ============================================================================
// Report templates: named, reusable briefs for a kind of report. Instructions
// only — the agent still writes the document from the seo-report starter; a
// template replaces the calling skill's section list and tone, never the HTML
// constraints.
// ============================================================================

export const reportTemplates = sqliteTable(
  "report_templates",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // One line saying when to use it: what agents pick a template by in the
    // project-context digest.
    description: text("description").notNull(),
    // Markdown: audience, sections in order, tone, sign-off, accent color.
    instructions: text("instructions").notNull(),
    // Same two-column attribution as reports; see reports.schema.ts.
    createdBy: text("created_by").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  // Backstop for the service's case-insensitive duplicate-name check, and the
  // index the feature's one list query reads.
  (table) => [
    uniqueIndex("report_templates_project_name_idx").on(
      table.projectId,
      table.name,
    ),
  ],
);
