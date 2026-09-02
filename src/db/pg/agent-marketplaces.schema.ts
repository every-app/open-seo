import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const agentMarketplaceListings = pgTable(
  "agent_marketplace_listings",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    platform: text("platform", {
      enum: [
        "openai",
        "claude",
        "claude_community",
        "grok",
        "cursor",
        "mcp_directory",
        "skills_sh",
      ],
    }).notNull(),
    status: text("status", {
      enum: [
        "not_started",
        "preparing",
        "submitted",
        "in_review",
        "published",
        "rejected",
        "paused",
      ],
    })
      .notNull()
      .default("not_started"),
    providerStatus: text("provider_status"),
    packageVersion: text("package_version"),
    listingUrl: text("listing_url"),
    submittedAt: text("submitted_at"),
    publishedAt: text("published_at"),
    lastVerifiedAt: text("last_verified_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    uniqueIndex("agent_marketplace_listings_project_platform_idx").on(
      table.projectId,
      table.platform,
    ),
    index("agent_marketplace_listings_project_status_idx").on(
      table.projectId,
      table.status,
    ),
  ],
);

export const agentMarketplaceEvidence = pgTable(
  "agent_marketplace_evidence",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => agentMarketplaceListings.id, { onDelete: "cascade" }),
    capturedAt: text("captured_at").notNull(),
    source: text("source", {
      enum: ["manual", "github", "platform", "product"],
    })
      .notNull()
      .default("manual"),
    views: integer("views").notNull().default(0),
    uniqueViewers: integer("unique_viewers").notNull().default(0),
    clones: integer("clones").notNull().default(0),
    uniqueCloners: integer("unique_cloners").notNull().default(0),
    installs: integer("installs").notNull().default(0),
    oauthStarts: integer("oauth_starts").notNull().default(0),
    oauthCompletions: integer("oauth_completions").notNull().default(0),
    activatedAccounts: integer("activated_accounts").notNull().default(0),
    qualifiedOutcomes: integer("qualified_outcomes").notNull().default(0),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(isoNow),
  },
  (table) => [
    index("agent_marketplace_evidence_listing_captured_idx").on(
      table.listingId,
      table.capturedAt,
    ),
  ],
);
