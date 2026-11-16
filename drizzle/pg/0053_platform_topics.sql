CREATE TABLE "ps_topic_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"keyword" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ps_topic_outline_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"position" integer NOT NULL,
	"heading" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ps_topic_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"question" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ps_topics" ADD COLUMN "pull_id" text;--> statement-breakpoint
ALTER TABLE "ps_topics" ADD COLUMN "location_code" integer;--> statement-breakpoint
ALTER TABLE "ps_topics" ADD COLUMN "language_code" text;--> statement-breakpoint
ALTER TABLE "ps_topics" ADD COLUMN "primary_keyword" text;--> statement-breakpoint
ALTER TABLE "ps_topics" ADD COLUMN "brief_generated_at" text;--> statement-breakpoint
ALTER TABLE "ps_topic_keywords" ADD CONSTRAINT "ps_topic_keywords_topic_id_ps_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."ps_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_topic_outline_sections" ADD CONSTRAINT "ps_topic_outline_sections_topic_id_ps_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."ps_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ps_topic_questions" ADD CONSTRAINT "ps_topic_questions_topic_id_ps_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."ps_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ps_topic_keywords_topic_keyword_idx" ON "ps_topic_keywords" USING btree ("topic_id","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "ps_topic_outline_sections_topic_position_idx" ON "ps_topic_outline_sections" USING btree ("topic_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "ps_topic_questions_topic_question_idx" ON "ps_topic_questions" USING btree ("topic_id","question");--> statement-breakpoint
ALTER TABLE "ps_topics" ADD CONSTRAINT "ps_topics_pull_id_ps_keyword_pulls_id_fk" FOREIGN KEY ("pull_id") REFERENCES "public"."ps_keyword_pulls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ps_topics_cluster_idx" ON "ps_topics" USING btree ("cluster_id");--> statement-breakpoint
UPDATE "ps_topics" SET
	"pull_id" = (SELECT "pull_id" FROM "ps_clusters" WHERE "ps_clusters"."id" = "ps_topics"."cluster_id"),
	"location_code" = coalesce(
		(SELECT p."location_code" FROM "ps_clusters" c JOIN "ps_keyword_pulls" p ON p."id" = c."pull_id" WHERE c."id" = "ps_topics"."cluster_id"),
		(SELECT "location_code" FROM "projects" WHERE "projects"."id" = "ps_topics"."project_id")
	),
	"language_code" = coalesce(
		(SELECT p."language_code" FROM "ps_clusters" c JOIN "ps_keyword_pulls" p ON p."id" = c."pull_id" WHERE c."id" = "ps_topics"."cluster_id"),
		(SELECT "language_code" FROM "projects" WHERE "projects"."id" = "ps_topics"."project_id")
	);--> statement-breakpoint
INSERT INTO "ps_topic_keywords" ("id", "topic_id", "keyword")
SELECT gen_random_uuid()::text, t."id", ck."keyword"
FROM "ps_topics" t JOIN "ps_cluster_keywords" ck ON ck."cluster_id" = t."cluster_id";