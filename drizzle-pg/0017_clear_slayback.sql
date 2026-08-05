ALTER TABLE "psi_snapshots" ADD COLUMN "trigger" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "psi_urls" ADD COLUMN "next_run_at" text;--> statement-breakpoint
CREATE INDEX "psi_urls_next_run_at_idx" ON "psi_urls" USING btree ("next_run_at");