CREATE TABLE `user_onboarding_answers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`interested_features` text DEFAULT '[]' NOT NULL,
	`work_for` text,
	`client_website_count` text,
	`found_via` text,
	`mcp_setup_intent` text,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_onboarding_answers_organization_idx` ON `user_onboarding_answers` (`organization_id`);