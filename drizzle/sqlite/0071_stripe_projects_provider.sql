CREATE TABLE `stripe_projects_grant` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`access_token_hash` text NOT NULL,
	`access_token_expires_at` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_projects_grant_access_token_idx` ON `stripe_projects_grant` (`access_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `stripe_projects_grant_refresh_token_idx` ON `stripe_projects_grant` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `stripe_projects_grant_user_idx` ON `stripe_projects_grant` (`user_id`);--> statement-breakpoint
CREATE TABLE `stripe_projects_resource` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`api_key_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stripe_projects_resource_user_idx` ON `stripe_projects_resource` (`user_id`);