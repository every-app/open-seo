CREATE TABLE `google_ads_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`login_customer_id` text,
	`customer_descriptive_name` text,
	`currency_code` text,
	`connected_by_user_id` text NOT NULL,
	`google_ads_account_id` text NOT NULL,
	`connected_account_email` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_ads_connections_project_idx` ON `google_ads_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `google_ads_connections_organization_idx` ON `google_ads_connections` (`organization_id`);--> statement-breakpoint
CREATE INDEX `google_ads_connections_connector_idx` ON `google_ads_connections` (`connected_by_user_id`,`google_ads_account_id`);