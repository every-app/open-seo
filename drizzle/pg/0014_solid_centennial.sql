ALTER TABLE "audits" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "error_detail" text;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "failed_phase" text;