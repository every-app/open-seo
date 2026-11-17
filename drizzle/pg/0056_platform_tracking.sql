CREATE TABLE "ps_tracking_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"syndication_id" text NOT NULL,
	"status" text NOT NULL,
	"keyword" text,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"rank_task_id" text,
	"index_task_id" text,
	"indexed" boolean,
	"ranked" boolean,
	"google_position" integer,
	"ai_cited" boolean,
	"requested_at" text NOT NULL,
	"checked_at" text
);
--> statement-breakpoint
ALTER TABLE "ps_tracking_snapshots" ADD CONSTRAINT "ps_tracking_snapshots_syndication_id_ps_syndications_id_fk" FOREIGN KEY ("syndication_id") REFERENCES "public"."ps_syndications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ps_tracking_snapshots_syndication_idx" ON "ps_tracking_snapshots" USING btree ("syndication_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ps_tracking_snapshots_one_pending_idx" ON "ps_tracking_snapshots" USING btree ("syndication_id") WHERE status = 'pending';