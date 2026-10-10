CREATE TABLE "bing_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"site_url" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"credential_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bing_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"api_key" text NOT NULL,
	"key_last4" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bing_connections" ADD CONSTRAINT "bing_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_connections" ADD CONSTRAINT "bing_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bing_connections" ADD CONSTRAINT "bing_connections_credential_id_bing_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."bing_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bing_connections_project_idx" ON "bing_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "bing_connections_organization_idx" ON "bing_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bing_connections_credential_idx" ON "bing_connections" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "bing_credentials_user_idx" ON "bing_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_bing_grant_owner_idx" ON "account" USING btree ("user_id","provider_id","account_id") WHERE "account"."provider_id" = 'bing-webmaster';