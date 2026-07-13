CREATE TABLE "audit_lighthouse_results" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"page_id" text NOT NULL,
	"strategy" text NOT NULL,
	"performance_score" integer,
	"accessibility_score" integer,
	"best_practices_score" integer,
	"seo_score" integer,
	"lcp_ms" real,
	"cls" real,
	"inp_ms" real,
	"ttfb_ms" real,
	"error_message" text,
	"r2_key" text,
	"payload_size_bytes" integer
);
--> statement-breakpoint
CREATE TABLE "audit_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"redirect_url" text,
	"title" text,
	"meta_description" text,
	"canonical_url" text,
	"robots_meta" text,
	"og_title" text,
	"og_description" text,
	"og_image" text,
	"h1_count" integer DEFAULT 0 NOT NULL,
	"h2_count" integer DEFAULT 0 NOT NULL,
	"h3_count" integer DEFAULT 0 NOT NULL,
	"h4_count" integer DEFAULT 0 NOT NULL,
	"h5_count" integer DEFAULT 0 NOT NULL,
	"h6_count" integer DEFAULT 0 NOT NULL,
	"heading_order_json" text,
	"word_count" integer DEFAULT 0 NOT NULL,
	"images_total" integer DEFAULT 0 NOT NULL,
	"images_missing_alt" integer DEFAULT 0 NOT NULL,
	"images_json" text,
	"internal_link_count" integer DEFAULT 0 NOT NULL,
	"external_link_count" integer DEFAULT 0 NOT NULL,
	"has_structured_data" boolean DEFAULT false NOT NULL,
	"hreflang_tags_json" text,
	"is_indexable" boolean DEFAULT true NOT NULL,
	"response_time_ms" integer
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"started_by_user_id" text NOT NULL,
	"start_url" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"workflow_instance_id" text,
	"config" text DEFAULT '{}' NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"pages_total" integer DEFAULT 0 NOT NULL,
	"lighthouse_total" integer DEFAULT 0 NOT NULL,
	"lighthouse_completed" integer DEFAULT 0 NOT NULL,
	"lighthouse_failed" integer DEFAULT 0 NOT NULL,
	"current_phase" text DEFAULT 'discovery',
	"started_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "keyword_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"search_volume" integer,
	"cpc" real,
	"competition" real,
	"keyword_difficulty" integer,
	"intent" text,
	"monthly_searches" text,
	"fetched_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_check_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"project_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"keywords_total" integer DEFAULT 0 NOT NULL,
	"keywords_checked" integer DEFAULT 0 NOT NULL,
	"is_subset_run" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"started_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"completed_at" text
);
--> statement-breakpoint
CREATE TABLE "rank_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"tracking_keyword_id" text NOT NULL,
	"keyword" text NOT NULL,
	"device" text NOT NULL,
	"position" integer,
	"url" text,
	"serp_features" text,
	"checked_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_tracking_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"domain" text NOT NULL,
	"location_code" integer DEFAULT 2840 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"devices" text DEFAULT 'both' NOT NULL,
	"serp_depth" integer NOT NULL,
	"schedule_interval" text DEFAULT 'weekly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" text,
	"next_check_at" text,
	"last_skip_reason" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_tracking_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"keyword" text NOT NULL,
	"search_volume" integer,
	"keyword_difficulty" integer,
	"cpc" real,
	"metrics_fetched_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_keyword_tag_assignments" (
	"saved_keyword_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_keyword_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"color" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer DEFAULT 2840 NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_onboarding_answers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"interested_features" text DEFAULT '[]' NOT NULL,
	"work_for" text,
	"client_website_count" text,
	"found_via" text,
	"mcp_setup_intent" text,
	"completed_at" text,
	"gsc_nudge_dismissed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"analytics_opted_out" boolean,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"site_url" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"connected_account_email" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reddit_attributions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"click_id" text,
	"uuid" text,
	"landing_page" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"signup_sent_at" text,
	"purchase_sent_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_lighthouse_results" ADD CONSTRAINT "audit_lighthouse_results_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_lighthouse_results" ADD CONSTRAINT "audit_lighthouse_results_page_id_audit_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."audit_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_metrics" ADD CONSTRAINT "keyword_metrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_config_id_rank_tracking_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."rank_tracking_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_check_runs" ADD CONSTRAINT "rank_check_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_run_id_rank_check_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."rank_check_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tracking_configs" ADD CONSTRAINT "rank_tracking_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tracking_keywords" ADD CONSTRAINT "rank_tracking_keywords_config_id_rank_tracking_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."rank_tracking_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_keyword_tag_assignments" ADD CONSTRAINT "saved_keyword_tag_assignments_saved_keyword_id_saved_keywords_id_fk" FOREIGN KEY ("saved_keyword_id") REFERENCES "public"."saved_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_keyword_tag_assignments" ADD CONSTRAINT "saved_keyword_tag_assignments_tag_id_saved_keyword_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."saved_keyword_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_keyword_tags" ADD CONSTRAINT "saved_keyword_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_keywords" ADD CONSTRAINT "saved_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_answers" ADD CONSTRAINT "user_onboarding_answers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding_answers" ADD CONSTRAINT "user_onboarding_answers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_connections" ADD CONSTRAINT "gsc_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_attributions" ADD CONSTRAINT "reddit_attributions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reddit_attributions" ADD CONSTRAINT "reddit_attributions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_lighthouse_results_audit_id_idx" ON "audit_lighthouse_results" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_pages_audit_id_idx" ON "audit_pages" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audits_project_id_idx" ON "audits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "audits_started_by_user_id_idx" ON "audits" USING btree ("started_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_metrics_unique_project_keyword_location_language" ON "keyword_metrics" USING btree ("project_id","keyword","location_code","language_code");--> statement-breakpoint
CREATE INDEX "keyword_metrics_lookup_idx" ON "keyword_metrics" USING btree ("project_id","keyword","location_code","language_code","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_one_default_per_organization_idx" ON "projects" USING btree ("organization_id") WHERE "projects"."name" = 'Default' AND "projects"."domain" IS NULL;--> statement-breakpoint
CREATE INDEX "rank_check_runs_config_idx" ON "rank_check_runs" USING btree ("config_id","started_at");--> statement-breakpoint
CREATE INDEX "rank_check_runs_project_idx" ON "rank_check_runs" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_check_runs_one_active_per_config_idx" ON "rank_check_runs" USING btree ("config_id") WHERE "rank_check_runs"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "rank_snapshots_run_idx" ON "rank_snapshots" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "rank_snapshots_keyword_device_idx" ON "rank_snapshots" USING btree ("tracking_keyword_id","device","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_snapshots_run_keyword_device_idx" ON "rank_snapshots" USING btree ("run_id","tracking_keyword_id","device");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tracking_configs_project_domain_location_idx" ON "rank_tracking_configs" USING btree ("project_id","domain","location_code");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tracking_keywords_config_keyword_idx" ON "rank_tracking_keywords" USING btree ("config_id","keyword");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_keyword_tag_assignments_unique_idx" ON "saved_keyword_tag_assignments" USING btree ("saved_keyword_id","tag_id");--> statement-breakpoint
CREATE INDEX "saved_keyword_tag_assignments_keyword_idx" ON "saved_keyword_tag_assignments" USING btree ("saved_keyword_id");--> statement-breakpoint
CREATE INDEX "saved_keyword_tag_assignments_tag_idx" ON "saved_keyword_tag_assignments" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_keyword_tags_project_normalized_name_idx" ON "saved_keyword_tags" USING btree ("project_id","normalized_name");--> statement-breakpoint
CREATE INDEX "saved_keyword_tags_project_name_idx" ON "saved_keyword_tags" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_keywords_unique_project_keyword_location_language" ON "saved_keywords" USING btree ("project_id","keyword","location_code","language_code");--> statement-breakpoint
CREATE INDEX "saved_keywords_project_created_idx" ON "saved_keywords" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "user_onboarding_answers_organization_idx" ON "user_onboarding_answers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_connections_project_idx" ON "gsc_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "gsc_connections_organization_idx" ON "gsc_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reddit_attributions_user_idx" ON "reddit_attributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reddit_attributions_organization_idx" ON "reddit_attributions" USING btree ("organization_id");