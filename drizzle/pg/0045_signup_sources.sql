ALTER TABLE "guest_accounts" ADD COLUMN "agent" text;--> statement-breakpoint
ALTER TABLE "user_signup_campaigns" ADD COLUMN "entry" text;--> statement-breakpoint
ALTER TABLE "user_signup_campaigns" ADD COLUMN "was_guest" boolean;--> statement-breakpoint
ALTER TABLE "user_signup_campaigns" ADD COLUMN "agent" text;--> statement-breakpoint
ALTER TABLE "user_signup_campaigns" ADD COLUMN "utm_medium" text;