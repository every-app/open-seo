CREATE TABLE `cloudflare_analytics_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`encrypted_api_token` text NOT NULL,
	`token_hint` text NOT NULL,
	`zone_id` text NOT NULL,
	`zone_label` text,
	`traffic_available` integer DEFAULT false NOT NULL,
	`traffic_reason` text,
	`security_events_available` integer DEFAULT false NOT NULL,
	`security_events_reason` text,
	`crawler_access_available` integer DEFAULT false NOT NULL,
	`crawler_access_reason` text,
	`connected_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloudflare_analytics_connections_project_idx` ON `cloudflare_analytics_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `cloudflare_analytics_connections_organization_idx` ON `cloudflare_analytics_connections` (`organization_id`);