CREATE TABLE "ps_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"canonical_title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"status" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ps_articles" ADD CONSTRAINT "ps_articles_topic_id_ps_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."ps_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ps_articles_topic_idx" ON "ps_articles" USING btree ("topic_id");