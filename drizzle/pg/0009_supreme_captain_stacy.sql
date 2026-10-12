DROP INDEX "audit_issues_audit_id_idx";--> statement-breakpoint
DROP INDEX "audit_links_audit_id_idx";--> statement-breakpoint
DROP INDEX "audit_pages_audit_id_idx";--> statement-breakpoint
CREATE INDEX "rank_tracking_configs_project_active_created_idx" ON "rank_tracking_configs" USING btree ("project_id","is_active","created_at");