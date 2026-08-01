import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { user } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// One row per SAM chat session. The conversation history itself lives in the
// SamChatAgent Durable Object's SQLite (keyed by this id); this table is the
// listable registry the session side-panel reads from, and the project/user
// scoping the Worker authorizes a connection against before it reaches the DO.
// Normalized on purpose: org and user email are derived from the project and
// user rows at read time, never snapshotted here.
export const samSessions = pgTable(
  "sam_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
    // Soft-delete marker: null = active. Archived sessions disappear from the
    // list but keep their registry row and DO transcript for a future unarchive.
    archivedAt: text("archived_at"),
  },
  (table) => [
    // The side-panel lists a project's sessions newest-first.
    index("sam_sessions_project_updated_idx").on(
      table.projectId,
      table.updatedAt,
    ),
  ],
);

// See src/db/sam.schema.ts for the role of this table (shared SAM context
// blocks per project).
export const samProjectMemory = pgTable(
  "sam_project_memory",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    content: text("content").notNull(),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.label] })],
);
