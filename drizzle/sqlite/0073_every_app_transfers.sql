CREATE TABLE `every_app_transfer_users` (
	`secret_hash` text NOT NULL,
	`previous_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`secret_hash`, `previous_user_id`),
	FOREIGN KEY (`secret_hash`) REFERENCES `every_app_transfers`(`secret_hash`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `every_app_transfers` (
	`secret_hash` text PRIMARY KEY NOT NULL,
	`created_by_user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`active_at` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
