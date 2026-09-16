DROP INDEX "rank_tracking_configs_national_idx";--> statement-breakpoint
DROP INDEX "rank_tracking_configs_local_idx";--> statement-breakpoint
ALTER TABLE "rank_tracking_configs" ADD COLUMN "search_engine" text DEFAULT 'google' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tracking_configs_national_idx" ON "rank_tracking_configs" USING btree ("project_id","domain","search_engine","location_code") WHERE "rank_tracking_configs"."location_name" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tracking_configs_local_idx" ON "rank_tracking_configs" USING btree ("project_id","domain","search_engine","location_code","location_name") WHERE "rank_tracking_configs"."location_name" IS NOT NULL;