CREATE TABLE `rapidapi_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`rapidapi_api_id` text NOT NULL,
	`rapidapi_api_name` text,
	`connected_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rapidapi_connections_project_idx` ON `rapidapi_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `rapidapi_connections_organization_idx` ON `rapidapi_connections` (`organization_id`);--> statement-breakpoint
CREATE TABLE `stripe_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`subscription_product_id` text,
	`subscription_product_name` text,
	`one_off_product_id` text,
	`one_off_product_name` text,
	`connected_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_connections_project_idx` ON `stripe_connections` (`project_id`);--> statement-breakpoint
CREATE INDEX `stripe_connections_organization_idx` ON `stripe_connections` (`organization_id`);