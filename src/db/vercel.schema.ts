import { sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { organization } from "./better-auth-schema";
import { projects } from "./app.schema";

// Connected Vercel project (Web Analytics) per OpenSEO project.
// The Vercel access token is an instance-level env secret (VERCEL_TOKEN),
// never stored here — this row only maps an OpenSEO project to a Vercel
// project/team, which are identifiers, not secrets. See specs/0010.
export const vercelConnections = sqliteTable(
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
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One selected Vercel project per OpenSEO project; switching replaces it.
    uniqueIndex("vercel_connections_project_idx").on(table.projectId),
    index("vercel_connections_organization_idx").on(table.organizationId),
  ],
);
