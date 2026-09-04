import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { projects } from "./app.schema";
import { organization, user } from "./better-auth-schema";

const isoNow = sql`(current_timestamp)`;

export const firstPartySignalSources = sqliteTable(
  "first_party_signal_sources",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    secretHint: text("secret_hint").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("first_party_signal_sources_project_idx").on(table.projectId),
    index("first_party_signal_sources_org_idx").on(table.organizationId),
  ],
);

export const firstPartySignalSourcePaths = sqliteTable(
  "first_party_signal_source_paths",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => firstPartySignalSources.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("first_party_signal_source_paths_unique_idx").on(
      table.sourceId,
      table.path,
    ),
  ],
);

export const firstPartySignalBatches = sqliteTable(
  "first_party_signal_batches",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => firstPartySignalSources.id, { onDelete: "cascade" }),
    batchId: text("batch_id").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    status: text("status", { enum: ["pending", "complete", "failed"] })
      .notNull()
      .default("pending"),
    processingLeaseId: text("processing_lease_id"),
    processingLeaseExpiresAt: text("processing_lease_expires_at"),
    receivedAt: text("received_at").notNull().default(isoNow),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("first_party_signal_batches_source_batch_idx").on(
      table.sourceId,
      table.batchId,
    ),
    uniqueIndex("first_party_signal_batches_source_date_idx").on(
      table.sourceId,
      table.snapshotDate,
    ),
    index("first_party_signal_batches_retention_idx").on(
      table.snapshotDate,
      table.id,
    ),
    check(
      "first_party_signal_batches_status_check",
      sql`${table.status} IN ('pending', 'complete', 'failed')`,
    ),
  ],
);

export const firstPartySignalDailyAggregates = sqliteTable(
  "first_party_signal_daily_aggregates",
  {
    id: text("id").primaryKey(),
    batchReceiptId: text("batch_receipt_id")
      .notNull()
      .references(() => firstPartySignalBatches.id, { onDelete: "cascade" }),
    processingAttemptId: text("processing_attempt_id").notNull(),
    landingPath: text("landing_path").notNull(),
    searchStarted: integer("search_started").notNull().default(0),
    searchCompleted: integer("search_completed").notNull().default(0),
    searchNoResults: integer("search_no_results").notNull().default(0),
    registrationsCompleted: integer("registrations_completed")
      .notNull()
      .default(0),
    checkoutStarted: integer("checkout_started").notNull().default(0),
    paymentsCompleted: integer("payments_completed").notNull().default(0),
    receivedAt: text("received_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("first_party_signal_daily_batch_path_idx").on(
      table.batchReceiptId,
      table.processingAttemptId,
      table.landingPath,
    ),
    check(
      "first_party_signal_daily_nonnegative_check",
      sql`${table.searchStarted} >= 0 AND ${table.searchCompleted} >= 0 AND ${table.searchNoResults} >= 0 AND ${table.registrationsCompleted} >= 0 AND ${table.checkoutStarted} >= 0 AND ${table.paymentsCompleted} >= 0`,
    ),
  ],
);
