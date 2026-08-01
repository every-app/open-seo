ALTER TABLE "rank_tracking_keywords" ADD COLUMN "schedule_interval_override" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "rank_tracking_keywords" ADD COLUMN "next_check_at" text;--> statement-breakpoint
CREATE INDEX "rank_tracking_keywords_config_next_check_idx" ON "rank_tracking_keywords" USING btree ("config_id","next_check_at");