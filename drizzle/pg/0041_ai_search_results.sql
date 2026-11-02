CREATE TABLE "ai_search_results" (
	"id" text PRIMARY KEY NOT NULL,
	"observation_id" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"snippet" text,
	"published_at" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_search_results" ADD CONSTRAINT "ai_search_results_observation_id_ai_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."ai_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_search_results_observation_idx" ON "ai_search_results" USING btree ("observation_id");