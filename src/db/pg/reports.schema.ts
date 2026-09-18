import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// Timestamps are stored as *text* (same column shape as the SQLite schema); see
// the note in pg/app.schema.ts. `isoNow` matches `new Date().toISOString()` so
// DB-defaulted and app-written values sort together lexicographically.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Postgres mirror of the reports table. Column notes: see ../reports.schema.ts.
export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    html: text("html").notNull(),
    skill: text("skill"),
    templateId: text("template_id"),
    createdBy: text("created_by").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    shareToken: text("share_token"),
    sharedAt: text("shared_at"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("reports_project_updated_idx").on(
      table.projectId,
      table.updatedAt,
      table.id,
      table.sizeBytes,
    ),
    uniqueIndex("reports_share_token_idx").on(table.shareToken),
  ],
);
