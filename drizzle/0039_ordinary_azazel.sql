CREATE TABLE `ai_agent_settings` (
	`provider` text DEFAULT 'openrouter' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`organization_id` text,
	`project_id` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_agent_settings_org_idx` ON `ai_agent_settings` (`organization_id`) WHERE "ai_agent_settings"."project_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_agent_settings_project_idx` ON `ai_agent_settings` (`project_id`) WHERE "ai_agent_settings"."organization_id" is null;