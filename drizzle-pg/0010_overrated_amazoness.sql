CREATE INDEX "audit_issues_page_id_idx" ON "audit_issues" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "audit_lighthouse_results_page_id_idx" ON "audit_lighthouse_results" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "audit_links_source_page_id_idx" ON "audit_links" USING btree ("source_page_id");