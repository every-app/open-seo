import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Revenue integrations per OpenSEO project (Revenue page). The Stripe
// credential is an instance-level env secret (STRIPE_SECRET_KEY), never
// stored here — rows only map an OpenSEO project to identifiers.
// See specs/0014.

// Manually-logged RapidAPI subscriber counts, copied from Studio Analytics.
// RapidAPI has no platform API for public-marketplace subscriber data
// (confirmed by support 2026-08-04), so snapshots replace the live query.
export const rapidapiSnapshots = sqliteTable(
  "rapidapi_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // The day the numbers were read off the dashboard, "YYYY-MM-DD".
    capturedOn: text("captured_on").notNull(),
    activeSubscribers: integer("active_subscribers").notNull(),
    // Null when the paying split wasn't recorded.
    payingSubscribers: integer("paying_subscribers"),
    // Monthly plan price in USD cents (RapidAPI bills in USD only); null
    // when not recorded. With the paying count this yields est. MRR.
    planPriceUsdMinor: integer("plan_price_usd_minor"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One snapshot per project per day; re-logging a day replaces it.
    uniqueIndex("rapidapi_snapshots_project_day_idx").on(
      table.projectId,
      table.capturedOn,
    ),
    index("rapidapi_snapshots_organization_idx").on(table.organizationId),
  ],
);

// Which Stripe products count as this project's subscription and one-off
// offerings. Either may be null — a project can track just one of the two.
export const stripeConnections = sqliteTable(
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
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One Stripe mapping per OpenSEO project; switching replaces it.
    uniqueIndex("stripe_connections_project_idx").on(table.projectId),
    index("stripe_connections_organization_idx").on(table.organizationId),
  ],
);
