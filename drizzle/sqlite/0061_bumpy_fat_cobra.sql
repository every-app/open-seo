CREATE TABLE `user_signup_campaigns` (
	`user_id` text PRIMARY KEY NOT NULL,
	`utm_source` text,
	`utm_campaign` text,
	`utm_content` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
