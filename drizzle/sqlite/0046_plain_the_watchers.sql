CREATE TABLE `dashboard_step_dismissals` (
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`step` text NOT NULL,
	PRIMARY KEY(`user_id`, `project_id`, `step`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dashboard_step_dismissals_project_idx` ON `dashboard_step_dismissals` (`project_id`);