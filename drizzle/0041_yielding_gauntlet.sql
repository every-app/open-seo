CREATE TABLE `seo_provider_settings` (
	`provider` text DEFAULT 'dataforseo' NOT NULL,
	`organization_id` text,
	`project_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`credentials` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seo_provider_settings_org_idx` ON `seo_provider_settings` (`provider`,`organization_id`) WHERE "seo_provider_settings"."project_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `seo_provider_settings_project_idx` ON `seo_provider_settings` (`provider`,`project_id`) WHERE "seo_provider_settings"."organization_id" is null;