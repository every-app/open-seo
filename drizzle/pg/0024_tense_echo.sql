CREATE TABLE "dashboard_step_dismissals" (
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"step" text NOT NULL,
	CONSTRAINT "dashboard_step_dismissals_user_id_project_id_step_pk" PRIMARY KEY("user_id","project_id","step")
);
--> statement-breakpoint
ALTER TABLE "dashboard_step_dismissals" ADD CONSTRAINT "dashboard_step_dismissals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_step_dismissals" ADD CONSTRAINT "dashboard_step_dismissals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_step_dismissals_project_idx" ON "dashboard_step_dismissals" USING btree ("project_id");