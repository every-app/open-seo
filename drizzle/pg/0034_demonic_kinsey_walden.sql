CREATE TABLE "data_refresh_claims" (
	"key" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"token" text NOT NULL,
	"next_attempt_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_refresh_claims" ADD CONSTRAINT "data_refresh_claims_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;