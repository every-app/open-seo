import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Bing Webmaster Tools API keys per OpenSEO user. A user may store several —
// Bing issues one key per Bing account, so multiple accounts means multiple
// keys. Each key is encrypted at rest with BETTER_AUTH_SECRET and never leaves
// the server.
export const bingCredentials = pgTable(
  "bing_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    // Ciphertext (symmetricEncrypt). Never selected into a client response.
    apiKey: text("api_key").notNull(),
    // Last four characters, for the "which key is this" hint in the UI.
    keyLast4: text("key_last4").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [index("bing_credentials_user_idx").on(table.userId)],
);

// Connected Bing Webmaster site per project. Mirrors gsc_connections: the
// project/workspace owns the mapping, while the credential belongs to the
// member who connected it — an API key row (bing_credentials), or the member's
// delegated OAuth grant when credentialId is null.
export const bingConnections = pgTable(
  "bing_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Stored verbatim from GetUserSites; Bing matches it byte-for-byte.
    siteUrl: text("site_url").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    credentialId: text("credential_id").references(() => bingCredentials.id, {
      onDelete: "cascade",
    }),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // One selected site per project in v1; switching replaces the row.
    uniqueIndex("bing_connections_project_idx").on(table.projectId),
    index("bing_connections_organization_idx").on(table.organizationId),
    index("bing_connections_credential_idx").on(table.credentialId),
  ],
);
