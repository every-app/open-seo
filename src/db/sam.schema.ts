import { sqliteTable, text, index, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization, user } from "./better-auth-schema";
import { projects } from "./app.schema";

// One row per SAM chat session. The conversation history itself lives in the
// SamChatAgent Durable Object's SQLite (keyed by this id); this table is the
// listable registry the session side-panel reads from, and the project/user
// scoping the Worker authorizes a connection against before it reaches the DO.
// Normalized on purpose: org and user email are derived from the project and
// user rows at read time, never snapshotted here.
export const samSessions = sqliteTable(
  "sam_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    // Soft-delete marker: null = active. Archived sessions disappear from the
    // list but keep their registry row and DO transcript for a future unarchive.
    archivedAt: text("archived_at"),
  },
  (table) => [
    // The side-panel lists a project's sessions newest-first.
    index("sam_sessions_project_updated_idx").on(
      table.projectId,
      table.updatedAt,
    ),
  ],
);

// Per-scope AI provider/model selection for the in-app agent. Scope precedence:
// project row > organization row > environment (OPENROUTER_MODEL / built-in
// default). Provider is persisted for future providers but Phase O only supports
// OpenRouter; rows never store API credentials — the key remains a server-side
// deployment secret (see in-app-ai-agent.md).
export const aiAgentSettings = sqliteTable(
  "ai_agent_settings",
  {
    provider: text("provider").notNull().default("openrouter"),
    model: text("model").notNull().default(""),
    // Endpoint override for providers that take one (OpenAI-Compatible /
    // Ollama Cloud). Plaintext configuration data — never a secret; only
    // honored when the row's provider matches the effective provider.
    baseUrl: text("base_url"),
    // Encrypted JSON map { [providerId]: apiKey } (better-auth AES-GCM
    // envelope; see credentialCrypto.ts). A scope may hold credentials for
    // several providers; resolution is provider-aware. Never plaintext.
    credentials: text("credentials"),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    // One row per scope: at most one org row and one project row.
    uniqueIndex("ai_agent_settings_org_idx")
      .on(table.organizationId)
      .where(sql`${table.projectId} is null`),
    uniqueIndex("ai_agent_settings_project_idx")
      .on(table.projectId)
      .where(sql`${table.organizationId} is null`),
  ],
);

// SAM's persistent project memory: one row per (project, context-block label).
// The SamChatAgent DO surfaces these rows to the model as writable context
// blocks ("memory", "research_log"), so every chat session in a project reads
// and writes the same memory. Lives in the app DB rather than DO storage so it
// is shared across the per-session DOs and stays queryable by the Worker (for
// a future settings/inspection UI).
export const samProjectMemory = sqliteTable(
  "sam_project_memory",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    content: text("content").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.label] })],
);
