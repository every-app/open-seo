CREATE TABLE "domain_overview_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"domain" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"organic_traffic" real,
	"organic_keywords" integer,
	"fetched_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_overview_snapshots" ADD CONSTRAINT "domain_overview_snapshots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_overview_snapshots_lookup_idx" ON "domain_overview_snapshots" USING btree ("organization_id","domain","location_code","language_code","id");