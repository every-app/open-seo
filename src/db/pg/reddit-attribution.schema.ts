import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./better-auth-schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const redditAttributions = pgTable(
  "reddit_attributions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clickId: text("click_id"),
    uuid: text("uuid"),
    landingPage: text("landing_page"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    signupSentAt: text("signup_sent_at"),
    purchaseSentAt: text("purchase_sent_at"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("reddit_attributions_user_idx").on(table.userId),
    index("reddit_attributions_organization_idx").on(table.organizationId),
  ],
);
