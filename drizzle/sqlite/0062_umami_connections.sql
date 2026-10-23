CREATE TABLE `umami_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`website_id` text NOT NULL,
	`website_name` text NOT NULL,
	`website_domain` text,
	`time_zone` text NOT NULL,
	`connected_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instance_id`) REFERENCES `umami_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `umami_connections_project_idx` ON `umami_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `umami_connections_organization_idx` ON `umami_connections` (`organization_id`);--> statement-breakpoint
CREATE INDEX `umami_connections_instance_idx` ON `umami_connections` (`instance_id`);--> statement-breakpoint
CREATE TABLE `umami_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`base_url` text NOT NULL,
	`auth_type` text NOT NULL,
	`username` text,
	`encrypted_secret` text NOT NULL,
	`encrypted_headers` text,
	`saved_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `umami_instances_organization_idx` ON `umami_instances` (`organization_id`);