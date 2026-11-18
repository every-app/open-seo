CREATE TABLE "user_signup_campaigns" (
	"user_id" text PRIMARY KEY NOT NULL,
	"utm_source" text,
	"utm_campaign" text,
	"utm_content" text
);
--> statement-breakpoint
ALTER TABLE "user_signup_campaigns" ADD CONSTRAINT "user_signup_campaigns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;