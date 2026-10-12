CREATE TABLE "audit_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"page_id" text,
	"page_url" text NOT NULL,
	"issue_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"details_json" text
);
--> statement-breakpoint
CREATE TABLE "audit_links" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"source_page_id" text NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"anchor" text,
	"is_internal" boolean DEFAULT true NOT NULL,
	"is_nofollow" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "x_robots_tag" text;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "header_canonical_url" text;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "crawl_depth" integer;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "in_sitemap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD COLUMN "fetch_class" text DEFAULT 'ok' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_page_id_audit_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."audit_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_links" ADD CONSTRAINT "audit_links_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_links" ADD CONSTRAINT "audit_links_source_page_id_audit_pages_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."audit_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_issues_audit_id_idx" ON "audit_issues" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_issues_audit_type_idx" ON "audit_issues" USING btree ("audit_id","issue_type");--> statement-breakpoint
CREATE INDEX "audit_links_audit_id_idx" ON "audit_links" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_links_audit_target_idx" ON "audit_links" USING btree ("audit_id","target_url");--> statement-breakpoint
CREATE INDEX "audit_pages_audit_url_idx" ON "audit_pages" USING btree ("audit_id","url");