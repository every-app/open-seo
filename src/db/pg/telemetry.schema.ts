import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const telemetryState = pgTable("telemetry_state", {
  id: integer("id").primaryKey().default(1),
  installId: text("install_id").notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", {
    mode: "date",
    withTimezone: true,
  }),
  lastVersion: text("last_version"),
  mcpToolCallCount: integer("mcp_tool_call_count").notNull().default(0),
});
