CREATE TABLE `account_deletion_requests` (
	`user_id` text PRIMARY KEY NOT NULL,
	`requested_at` text NOT NULL,
	`delete_after` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_deletion_requests_delete_after_idx` ON `account_deletion_requests` (`delete_after`);