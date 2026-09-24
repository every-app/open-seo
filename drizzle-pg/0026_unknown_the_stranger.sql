ALTER TABLE "keyword_metrics" ALTER COLUMN "search_volume" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "rank_tracking_keywords" ALTER COLUMN "search_volume" SET DATA TYPE bigint;--> statement-breakpoint
CREATE INDEX "rank_tracking_configs_due_idx" ON "rank_tracking_configs" USING btree ("is_active","schedule_interval","next_check_at");--> statement-breakpoint
CREATE INDEX "audits_status_started_at_idx" ON "audits" USING btree ("status","started_at");