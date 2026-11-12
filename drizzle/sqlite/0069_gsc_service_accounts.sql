CREATE TABLE `google_service_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`client_email` text NOT NULL,
	`private_key_id` text,
	`encrypted_private_key` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_service_accounts_org_email_idx` ON `google_service_accounts` (`organization_id`,`client_email`);--> statement-breakpoint
ALTER TABLE `gsc_connections` ADD `service_account_id` text REFERENCES google_service_accounts(id) ON DELETE cascade;