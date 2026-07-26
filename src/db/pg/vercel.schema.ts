import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// Connected Vercel project (Web Analytics) per OpenSEO project.
// The Vercel access token is an instance-level env secret (VERCEL_TOKEN),
// never stored here — this row only maps an OpenSEO project to a Vercel
// project/team, which are identifiers, not secrets. See specs/0010.
export const vercelConnections = pgTable(
  "vercel_connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Vercel project id, e.g. "prj_…".
    vercelProjectId: text("vercel_project_id").notNull(),
    // Vercel team id ("team_…"); null for personal-scope projects.
    vercelTeamId: text("vercel_team_id"),
    // Display name at connect time, e.g. "scholar-sidekick".
    vercelProjectName: text("vercel_project_name").notNull(),
    connectedByUserId: text("connected_by_user_id").notNull(),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
  },
  (table) => [
    // One selected Vercel project per OpenSEO project; switching replaces it.
    uniqueIndex("vercel_connections_project_idx").on(table.projectId),
    index("vercel_connections_organization_idx").on(table.organizationId),
  ],
);
