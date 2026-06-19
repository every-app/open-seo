ALTER TABLE `projects` ADD `location_code` integer DEFAULT 2840 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `language_code` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `onboarding_run_status` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `onboarding_run_at` text;