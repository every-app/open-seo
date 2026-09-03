import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects, savedKeywords } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// One delivery record per page or article. Keyword variants attach through the
// normalized assignment table below so the UI never turns every query into a
// separate content task.
export const contentExecutionItems = pgTable(
  "content_execution_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    targetUrl: text("target_url"),
    status: text("status").notNull().default("ready_to_assign"),
    owner: text("owner"),
    dueDate: text("due_date"),
    jiraIssueKey: text("jira_issue_key"),
    jiraIssueUrl: text("jira_issue_url"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    index("content_execution_items_project_updated_idx").on(
      table.projectId,
      table.updatedAt,
    ),
  ],
);

export const contentExecutionKeywordAssignments = pgTable(
  "content_execution_keyword_assignments",
  {
    executionItemId: text("execution_item_id")
      .notNull()
      .references(() => contentExecutionItems.id, { onDelete: "cascade" }),
    savedKeywordId: text("saved_keyword_id")
      .notNull()
      .references(() => savedKeywords.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("content_execution_keyword_assignment_pair_idx").on(
      table.executionItemId,
      table.savedKeywordId,
    ),
    uniqueIndex("content_execution_keyword_one_page_idx").on(
      table.savedKeywordId,
    ),
    index("content_execution_keyword_item_idx").on(table.executionItemId),
  ],
);
