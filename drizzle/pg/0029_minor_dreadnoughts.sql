CREATE TABLE "crawler_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"host" text NOT NULL,
	"provider" text NOT NULL,
	"signature_input" text NOT NULL,
	"signature" text NOT NULL,
	"expires_at" text,
	"created_by_user_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crawler_credentials" ADD CONSTRAINT "crawler_credentials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crawler_credentials_project_host_idx" ON "crawler_credentials" USING btree ("project_id","host");