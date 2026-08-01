CREATE TABLE `backlink_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`rank` integer,
	`backlinks` integer,
	`referring_domains` integer,
	`broken_backlinks` integer,
	`new_backlinks` integer,
	`lost_backlinks` integer,
	`new_referring_domains` integer,
	`lost_referring_domains` integer,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backlink_snapshots_project_captured_idx` ON `backlink_snapshots` (`project_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `organization_activation_state` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`first_mcp_authorized_at` text,
	`first_mcp_tool_call_at` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_activation_state` (
	`project_id` text PRIMARY KEY NOT NULL,
	`competitor_step_clicked_at` text,
	`mcp_card_dismissed_at` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
