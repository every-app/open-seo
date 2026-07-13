ALTER TABLE "projects" ADD COLUMN "location_code" integer DEFAULT 2840 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "language_code" text DEFAULT 'en' NOT NULL;