CREATE TABLE `billing_customer_status` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`is_paying` integer DEFAULT false NOT NULL,
	`paid_plan_id` text,
	`customer_json` text NOT NULL,
	`synced_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
