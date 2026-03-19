ALTER TABLE `users` RENAME TO `delegated_users`;--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_organizationId_idx` ON `invitation` (`organization_id`);--> statement-breakpoint
CREATE INDEX `invitation_email_idx` ON `invitation` (`email`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_organizationId_idx` ON `member` (`organization_id`);--> statement-breakpoint
CREATE INDEX `member_userId_idx` ON `member` (`user_id`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`created_at` integer NOT NULL,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_uidx` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`active_organization_id` text,
	`active_project_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
DROP TABLE `psi_audit_results`;--> statement-breakpoint
DROP INDEX `users_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `delegated_users_email_unique` ON `delegated_users` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`started_by_user_id` text NOT NULL,
	`start_url` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`workflow_instance_id` text,
	`config` text DEFAULT '{}' NOT NULL,
	`pages_crawled` integer DEFAULT 0 NOT NULL,
	`pages_total` integer DEFAULT 0 NOT NULL,
	`psi_total` integer DEFAULT 0 NOT NULL,
	`psi_completed` integer DEFAULT 0 NOT NULL,
	`psi_failed` integer DEFAULT 0 NOT NULL,
	`current_phase` text DEFAULT 'discovery',
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_audits`("id", "project_id", "started_by_user_id", "start_url", "status", "workflow_instance_id", "config", "pages_crawled", "pages_total", "psi_total", "psi_completed", "psi_failed", "current_phase", "started_at", "completed_at") SELECT "id", "project_id", "user_id", "start_url", "status", "workflow_instance_id", "config", "pages_crawled", "pages_total", "psi_total", "psi_completed", "psi_failed", "current_phase", "started_at", "completed_at" FROM `audits`;--> statement-breakpoint
INSERT OR IGNORE INTO `organization` (`id`, `name`, `slug`, `logo`, `created_at`, `metadata`)
SELECT
	'delegated-' || `id`,
	CASE
		WHEN instr(`email`, '@') > 1 THEN substr(`email`, 1, instr(`email`, '@') - 1) || ' workspace'
		ELSE `id` || ' workspace'
	END,
	'delegated-' || lower(replace(replace(replace(replace(
		CASE
			WHEN instr(`email`, '@') > 1 THEN substr(`email`, 1, instr(`email`, '@') - 1)
			ELSE `id`
		END,
		' ', '-'), '@', '-'), '.', '-'), '_', '-')) || '-' || lower(hex(`id`)),
	NULL,
	cast(unixepoch('subsecond') * 1000 as integer),
	NULL
FROM `delegated_users`;--> statement-breakpoint
DROP TABLE `audits`;--> statement-breakpoint
ALTER TABLE `__new_audits` RENAME TO `audits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audits_project_id_idx` ON `audits` (`project_id`);--> statement-breakpoint
CREATE INDEX `audits_started_by_user_id_idx` ON `audits` (`started_by_user_id`);--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`pagespeed_api_key` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_projects`("id", "organization_id", "name", "domain", "pagespeed_api_key", "created_at") SELECT "id", 'delegated-' || "user_id", "name", "domain", "pagespeed_api_key", "created_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;
