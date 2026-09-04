import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization } from "./better-auth-schema";

export const indexNowConfigs = sqliteTable(
  "indexnow_configs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(),
    keyLocation: text("key_location").notNull(),
    keyVerifiedAt: text("key_verified_at"),
    generatedByUserId: text("generated_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("indexnow_configs_project_idx").on(table.projectId),
    index("indexnow_configs_organization_idx").on(table.organizationId),
  ],
);

export const indexNowSubmissions = sqliteTable(
  "indexnow_submissions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    configId: text("config_id")
      .notNull()
      .references(() => indexNowConfigs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    requestedUrlCount: integer("requested_url_count").notNull(),
    uniqueUrlCount: integer("unique_url_count").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    receivedChunkCount: integer("received_chunk_count").notNull(),
    pendingChunkCount: integer("pending_chunk_count").notNull().default(0),
    rejectedChunkCount: integer("rejected_chunk_count").notNull(),
    failedChunkCount: integer("failed_chunk_count").notNull(),
    httpStatusesJson: text("http_statuses_json").notNull(),
    submittedByUserId: text("submitted_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("indexnow_submissions_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
