CREATE TABLE `project_ai_models` (
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_name` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	PRIMARY KEY(`project_id`, `provider`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
