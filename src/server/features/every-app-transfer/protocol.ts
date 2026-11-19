import { z } from "zod";
import journal from "../../../../drizzle/sqlite/meta/_journal.json";
import { importRowsSchema } from "@/server/standalone/import-schema";
import { TransferProblem } from "@/shared/every-app-transfer";

// What a self-hosted install sends to OpenSEO on an Every App Gateway, and
// what that install answers. The secret travels as a Bearer token.

/**
 * The last database migration this build ships. Two installs move data only
 * when theirs match: the same app version can differ (a self-host deployed
 * from main), and different versions can share one schema.
 */
export const SCHEMA_VERSION = journal.entries[journal.entries.length - 1].tag;

/** The Gateway install's one public route (everyapp.config.ts `public`). */
export const EVERY_APP_TRANSFER_PATH = "/api/every-app-transfer";

/** A stored file goes as the request body, its key in this query param. */
export const FILE_KEY_PARAM = "file";
export const FILE_METADATA_HEADER = "x-file-metadata";

// Tables a move never carries.
export const EXCLUDED_TABLES = new Set([
  "d1_migrations",
  // Sent with `begin` instead, to match each person to a Gateway member.
  "user",
  // Sign-in, teams and API keys: the Gateway owns all of them.
  "session",
  "account",
  "verification",
  "apikey",
  "rate_limit",
  "organization",
  "member",
  "invitation",
  "guest_accounts",
  // Hosted-only billing, sign-up analytics and account erasure.
  "billing_customer_status",
  "user_signup_campaigns",
  "account_deletion_requests",
  "stripe_projects_grant",
  "stripe_projects_resource",
  // Made with this install's own Google client. Members connect Google again
  // on the Gateway.
  "gsc_connections",
  "ga4_connections",
  // Shopify crawler signatures, encrypted with this install's
  // CRAWLER_ACCESS_SECRET.
  "crawler_credentials",
  // Bookkeeping.
  "telemetry_state",
  "data_refresh_claims",
  "every_app_transfers",
  "every_app_transfer_users",
]);

const transferUserSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  name: z.string(),
});

export const transferCommandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("begin"),
    schema: z.string(),
    users: z.array(transferUserSchema).max(10_000),
  }),
  z.object({ command: z.literal("rows"), ...importRowsSchema.shape }),
  z.object({
    command: z.literal("chat"),
    sessionId: z.string().min(1),
    messages: z.array(z.unknown()).min(1).max(500),
  }),
  z.object({ command: z.literal("finish") }),
]);

export type TransferCommand = z.infer<typeof transferCommandSchema>;

export const fileMetadataSchema = z.object({
  httpMetadata: z.record(z.string(), z.string()).optional(),
  customMetadata: z.record(z.string(), z.string()).optional(),
});

/** The Gateway install's answer to a refused request. */
export const transferRefusalSchema = z.object({
  problem: z.enum(TransferProblem),
});
