ALTER TABLE "rank_tracking_configs" ADD COLUMN "location_name" text;--> statement-breakpoint
DROP INDEX "rank_tracking_configs_project_domain_location_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tracking_configs_national_idx" ON "rank_tracking_configs" ("project_id","domain","location_code") WHERE "location_name" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tracking_configs_local_idx" ON "rank_tracking_configs" ("project_id","domain","location_code","location_name") WHERE "location_name" IS NOT NULL;
