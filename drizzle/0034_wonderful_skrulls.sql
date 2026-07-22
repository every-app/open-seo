CREATE TABLE `telemetry_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`install_id` text NOT NULL,
	`last_heartbeat_at` integer,
	`last_version` text,
	`mcp_tool_call_count` integer DEFAULT 0 NOT NULL
);
