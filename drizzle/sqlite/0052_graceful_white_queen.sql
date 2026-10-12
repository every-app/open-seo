CREATE TABLE `crawler_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`host` text NOT NULL,
	`provider` text NOT NULL,
	`signature_input` text NOT NULL,
	`signature` text NOT NULL,
	`expires_at` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crawler_credentials_project_host_idx` ON `crawler_credentials` (`project_id`,`host`);