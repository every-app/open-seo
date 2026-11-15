CREATE TABLE "ps_cluster_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"cluster_id" text NOT NULL,
	"keyword" text NOT NULL,
	"intent" text NOT NULL,
	"funnel_stage" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"pull_id" text NOT NULL,
	"name" text NOT NULL,
	"dominant_intent" text NOT NULL,
	"funnel_stage" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_keyword_pulls" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"seed" text NOT NULL,
	"seed_meaning" text,
	"country" text NOT NULL,
	"language" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"source" text NOT NULL,
	"stage" text NOT NULL,
	"raw_count" integer NOT NULL,
	"kept_count" integer,
	"pulled_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_pulled_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"pull_id" text NOT NULL,
	"keyword" text NOT NULL,
	"group" text NOT NULL,
	"relevant" boolean,
	"relevance_reason" text
);
--> statement-breakpoint
CREATE TABLE "ps_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"cluster_id" text,
	"title" text NOT NULL,
	"angle" text,
	"status" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ps_cluster_keywords" ADD CONSTRAINT "ps_cluster_keywords_cluster_id_ps_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."ps_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_clusters" ADD CONSTRAINT "ps_clusters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_clusters" ADD CONSTRAINT "ps_clusters_pull_id_ps_keyword_pulls_id_fk" FOREIGN KEY ("pull_id") REFERENCES "public"."ps_keyword_pulls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_keyword_pulls" ADD CONSTRAINT "ps_keyword_pulls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_pulled_keywords" ADD CONSTRAINT "ps_pulled_keywords_pull_id_ps_keyword_pulls_id_fk" FOREIGN KEY ("pull_id") REFERENCES "public"."ps_keyword_pulls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_topics" ADD CONSTRAINT "ps_topics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_topics" ADD CONSTRAINT "ps_topics_cluster_id_ps_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."ps_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ps_cluster_keywords_cluster_keyword_idx" ON "ps_cluster_keywords" USING btree ("cluster_id","keyword");--> statement-breakpoint
CREATE INDEX "ps_clusters_pull_idx" ON "ps_clusters" USING btree ("pull_id");--> statement-breakpoint
CREATE INDEX "ps_keyword_pulls_project_pulled_idx" ON "ps_keyword_pulls" USING btree ("project_id","pulled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ps_pulled_keywords_pull_keyword_idx" ON "ps_pulled_keywords" USING btree ("pull_id","keyword");--> statement-breakpoint
CREATE INDEX "ps_topics_project_status_idx" ON "ps_topics" USING btree ("project_id","status");