CREATE TABLE "ai_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"observation_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"own" boolean NOT NULL,
	"mentioned" boolean NOT NULL,
	"cited" boolean NOT NULL,
	"first_mention" integer
);
--> statement-breakpoint
CREATE TABLE "ai_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"engine" text NOT NULL,
	"branded" boolean NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"collected_at" text,
	"answer_markdown" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"tracker_id" text NOT NULL,
	"topic" text NOT NULL,
	"text" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tracker_id" text NOT NULL,
	"project_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "ai_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"observation_id" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_trackers" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"chatgpt" boolean DEFAULT true NOT NULL,
	"gemini" boolean DEFAULT false NOT NULL,
	"google_ai_overview" boolean DEFAULT false NOT NULL,
	"location_code" integer DEFAULT 2840 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"schedule_interval" text DEFAULT 'weekly' NOT NULL,
	"next_check_at" text,
	"last_skip_reason" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ai_research_keywords" text;--> statement-breakpoint
ALTER TABLE "ai_matches" ADD CONSTRAINT "ai_matches_observation_id_ai_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."ai_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_observations" ADD CONSTRAINT "ai_observations_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_observations" ADD CONSTRAINT "ai_observations_prompt_id_ai_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."ai_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_tracker_id_ai_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."ai_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tracker_id_ai_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."ai_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sources" ADD CONSTRAINT "ai_sources_observation_id_ai_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."ai_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_trackers" ADD CONSTRAINT "ai_trackers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_matches_observation_domain_idx" ON "ai_matches" USING btree ("observation_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_observations_run_prompt_engine_idx" ON "ai_observations" USING btree ("run_id","prompt_id","engine");--> statement-breakpoint
CREATE INDEX "ai_observations_prompt_idx" ON "ai_observations" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "ai_prompts_tracker_idx" ON "ai_prompts" USING btree ("tracker_id");--> statement-breakpoint
CREATE INDEX "ai_runs_project_created_idx" ON "ai_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_one_active_idx" ON "ai_runs" USING btree ("tracker_id") WHERE "ai_runs"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "ai_sources_observation_idx" ON "ai_sources" USING btree ("observation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_trackers_project_idx" ON "ai_trackers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_trackers_due_idx" ON "ai_trackers" USING btree ("enabled","next_check_at");