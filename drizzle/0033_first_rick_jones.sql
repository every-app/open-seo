CREATE INDEX `audit_issues_page_id_idx` ON `audit_issues` (`page_id`);--> statement-breakpoint
CREATE INDEX `audit_lighthouse_results_page_id_idx` ON `audit_lighthouse_results` (`page_id`);--> statement-breakpoint
CREATE INDEX `audit_links_source_page_id_idx` ON `audit_links` (`source_page_id`);