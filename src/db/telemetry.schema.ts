import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const telemetryState = sqliteTable("telemetry_state", {
  id: integer("id").primaryKey().default(1),
  installId: text("install_id").notNull(),
  installedAt: integer("installed_at", { mode: "timestamp_ms" }),
  lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp_ms" }),
  lastVersion: text("last_version"),
  mcpToolCallCount: integer("mcp_tool_call_count").notNull().default(0),
});
