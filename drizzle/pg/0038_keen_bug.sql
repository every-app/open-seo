CREATE TABLE "local_rank_businesses" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"identity" text NOT NULL,
	"title" text NOT NULL,
	"cid" text,
	"place_id" text,
	"address" text,
	"rating" double precision,
	"reviews" integer
);
--> statement-breakpoint
CREATE TABLE "local_rank_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tracker_id" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "local_rank_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"tracker_id" text NOT NULL,
	"keyword" text NOT NULL,
	"archived_at" text
);
--> statement-breakpoint
CREATE TABLE "local_rank_points" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"row" integer NOT NULL,
	"col" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"status" text NOT NULL,
	"rank" integer,
	"results_count" integer,
	"error" text,
	"collected_at" text
);
--> statement-breakpoint
CREATE TABLE "local_rank_results" (
	"id" text PRIMARY KEY NOT NULL,
	"point_id" text NOT NULL,
	"business_id" text NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_rank_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"check_id" text NOT NULL,
	"project_id" text NOT NULL,
	"tracker_id" text NOT NULL,
	"keyword_id" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" text NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "local_rank_trackers" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"address" text,
	"cid" text,
	"place_id" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"grid_size" integer NOT NULL,
	"spacing_km" double precision NOT NULL,
	"language_code" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "local_rank_businesses" ADD CONSTRAINT "local_rank_businesses_scan_id_local_rank_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."local_rank_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_checks" ADD CONSTRAINT "local_rank_checks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_checks" ADD CONSTRAINT "local_rank_checks_tracker_id_local_rank_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."local_rank_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_keywords" ADD CONSTRAINT "local_rank_keywords_tracker_id_local_rank_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."local_rank_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_points" ADD CONSTRAINT "local_rank_points_scan_id_local_rank_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."local_rank_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_results" ADD CONSTRAINT "local_rank_results_point_id_local_rank_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "public"."local_rank_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_results" ADD CONSTRAINT "local_rank_results_business_id_local_rank_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."local_rank_businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_scans" ADD CONSTRAINT "local_rank_scans_check_id_local_rank_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."local_rank_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_scans" ADD CONSTRAINT "local_rank_scans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_scans" ADD CONSTRAINT "local_rank_scans_tracker_id_local_rank_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."local_rank_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_scans" ADD CONSTRAINT "local_rank_scans_keyword_id_local_rank_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."local_rank_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_rank_trackers" ADD CONSTRAINT "local_rank_trackers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "local_rank_businesses_scan_identity_idx" ON "local_rank_businesses" USING btree ("scan_id","identity");--> statement-breakpoint
CREATE INDEX "local_rank_checks_tracker_created_idx" ON "local_rank_checks" USING btree ("tracker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "local_rank_checks_one_active_idx" ON "local_rank_checks" USING btree ("tracker_id") WHERE "local_rank_checks"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "local_rank_keywords_tracker_keyword_idx" ON "local_rank_keywords" USING btree ("tracker_id","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "local_rank_points_scan_position_idx" ON "local_rank_points" USING btree ("scan_id","row","col");--> statement-breakpoint
CREATE UNIQUE INDEX "local_rank_results_point_business_idx" ON "local_rank_results" USING btree ("point_id","business_id");--> statement-breakpoint
CREATE INDEX "local_rank_results_business_idx" ON "local_rank_results" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "local_rank_scans_tracker_created_idx" ON "local_rank_scans" USING btree ("tracker_id","created_at");--> statement-breakpoint
CREATE INDEX "local_rank_scans_project_idx" ON "local_rank_scans" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "local_rank_scans_check_keyword_idx" ON "local_rank_scans" USING btree ("check_id","keyword_id");--> statement-breakpoint
CREATE INDEX "local_rank_trackers_project_idx" ON "local_rank_trackers" USING btree ("project_id");