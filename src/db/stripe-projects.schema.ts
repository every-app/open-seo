import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, user } from "./better-auth-schema";

// Stripe Projects provisioning (src/server/stripe-projects). Hosted only.
// Tokens are stored as SHA-256 hashes; the raw value only leaves in the
// response that minted it. Timestamps are ISO-8601 text written by the app, so
// expiry checks are plain string comparisons on both dialects.

// One row per completed token exchange: the bearer Stripe sends on every
// resource call, bound to one user, one organization and one Stripe account.
export const stripeProjectsGrants = sqliteTable(
  "stripe_projects_grant",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    accessTokenExpiresAt: text("access_token_expires_at").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("stripe_projects_grant_access_token_idx").on(
      table.accessTokenHash,
    ),
    uniqueIndex("stripe_projects_grant_refresh_token_idx").on(
      table.refreshTokenHash,
    ),
    index("stripe_projects_grant_user_idx").on(table.userId),
  ],
);

// A provisioned `openseo/api` resource: one MCP API key in the organization.
// Removing the resource deletes the row.
export const stripeProjectsResources = sqliteTable(
  "stripe_projects_resource",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(),
    // Better Auth apikey.id of the current key. Not a foreign key: rotating
    // swaps it, and the user can revoke the key from Settings at any time
    // (a later rotate then hands out a fresh one).
    apiKeyId: text("api_key_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("stripe_projects_resource_user_idx").on(table.userId)],
);
