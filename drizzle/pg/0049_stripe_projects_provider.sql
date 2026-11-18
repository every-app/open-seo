CREATE TABLE "stripe_projects_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"access_token_expires_at" text NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_projects_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_projects_grant" ADD CONSTRAINT "stripe_projects_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_projects_grant" ADD CONSTRAINT "stripe_projects_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_projects_resource" ADD CONSTRAINT "stripe_projects_resource_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_projects_resource" ADD CONSTRAINT "stripe_projects_resource_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_projects_grant_access_token_idx" ON "stripe_projects_grant" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_projects_grant_refresh_token_idx" ON "stripe_projects_grant" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "stripe_projects_grant_user_idx" ON "stripe_projects_grant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stripe_projects_resource_user_idx" ON "stripe_projects_resource" USING btree ("user_id");