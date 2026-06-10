DROP INDEX `projects_one_default_per_organization_idx`;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_one_default_per_organization_idx` ON `projects` (`organization_id`) WHERE "projects"."name" = 'Default' AND "projects"."domain" IS NULL AND "projects"."archived_at" IS NULL;