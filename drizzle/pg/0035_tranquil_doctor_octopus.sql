ALTER TABLE "user" ADD COLUMN "product_updates_opt_in" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "product_updates_changed_at" timestamp with time zone;