CREATE TABLE "ps_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text NOT NULL,
	"display_name" text NOT NULL,
	"publication_id" text,
	"account_url" text,
	"token_ciphertext" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_syndication_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"syndication_id" text NOT NULL,
	"tag" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_syndications" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"platform_title" text NOT NULL,
	"platform_summary" text,
	"platform_body" text NOT NULL,
	"ai_disclosure" text,
	"status" text NOT NULL,
	"remote_id" text,
	"live_url" text,
	"published_at" text,
	"error" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ps_articles" ADD COLUMN "canonical_url" text;--> statement-breakpoint
ALTER TABLE "ps_channels" ADD CONSTRAINT "ps_channels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_syndication_tags" ADD CONSTRAINT "ps_syndication_tags_syndication_id_ps_syndications_id_fk" FOREIGN KEY ("syndication_id") REFERENCES "public"."ps_syndications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_syndications" ADD CONSTRAINT "ps_syndications_article_id_ps_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."ps_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_syndications" ADD CONSTRAINT "ps_syndications_channel_id_ps_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."ps_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ps_channels_org_idx" ON "ps_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ps_syndication_tags_syndication_tag_idx" ON "ps_syndication_tags" USING btree ("syndication_id","tag");--> statement-breakpoint
CREATE UNIQUE INDEX "ps_syndications_article_channel_idx" ON "ps_syndications" USING btree ("article_id","channel_id");--> statement-breakpoint
CREATE INDEX "ps_syndications_channel_idx" ON "ps_syndications" USING btree ("channel_id");