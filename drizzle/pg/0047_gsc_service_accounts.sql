CREATE TABLE "google_service_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"client_email" text NOT NULL,
	"private_key_id" text,
	"encrypted_private_key" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD COLUMN "service_account_id" text;--> statement-breakpoint
ALTER TABLE "google_service_accounts" ADD CONSTRAINT "google_service_accounts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_service_accounts_org_email_idx" ON "google_service_accounts" USING btree ("organization_id","client_email");--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_service_account_id_google_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."google_service_accounts"("id") ON DELETE cascade ON UPDATE no action;