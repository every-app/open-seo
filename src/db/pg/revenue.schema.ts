import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Revenue integrations per OpenSEO project (Revenue page). Like the Vercel
// connection, the credentials are instance-level env secrets (RAPIDAPI_KEY +
// RAPIDAPI_GRAPHQL_URL, STRIPE_SECRET_KEY), never stored here — these rows
// only map an OpenSEO project to identifiers. See specs/0014.

// Which RapidAPI listing's subscriptions belong to this project.
export const rapidapiConnections = pgTable(
  "rapidapi_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // RapidAPI API id, e.g. "api_0123abcd-…".
    rapidapiApiId: text("rapidapi_api_id").notNull(),
    // Display name resolved at connect time; null when the API didn't report one.
    rapidapiApiName: text("rapidapi_api_name"),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // One RapidAPI listing per OpenSEO project; switching replaces it.
    uniqueIndex("rapidapi_connections_project_idx").on(table.projectId),
    index("rapidapi_connections_organization_idx").on(table.organizationId),
  ],
);

// Which Stripe products count as this project's subscription and one-off
// offerings. Either may be null — a project can track just one of the two.
export const stripeConnections = pgTable(
  "stripe_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Target Stripe account ("acct_…"), sent as Stripe-Context. Needed when
    // STRIPE_SECRET_KEY is an organization-level key so different projects
    // can point at different accounts; null for account-level keys.
    stripeAccountId: text("stripe_account_id"),
    // Stripe product id ("prod_…") for the recurring subscription offering.
    subscriptionProductId: text("subscription_product_id"),
    subscriptionProductName: text("subscription_product_name"),
    // Stripe product id ("prod_…") for the one-off purchase offering.
    oneOffProductId: text("one_off_product_id"),
    oneOffProductName: text("one_off_product_name"),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // One Stripe mapping per OpenSEO project; switching replaces it.
    uniqueIndex("stripe_connections_project_idx").on(table.projectId),
    index("stripe_connections_organization_idx").on(table.organizationId),
  ],
);
