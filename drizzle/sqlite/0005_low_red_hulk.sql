ALTER TABLE `audit_psi_results` RENAME TO `audit_lighthouse_results`;--> statement-breakpoint
ALTER TABLE `audits` RENAME COLUMN "psi_total" TO "lighthouse_total";--> statement-breakpoint
ALTER TABLE `audits` RENAME COLUMN "psi_completed" TO "lighthouse_completed";--> statement-breakpoint
ALTER TABLE `audits` RENAME COLUMN "psi_failed" TO "lighthouse_failed";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_lighthouse_results` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`page_id` text NOT NULL,
	`strategy` text NOT NULL,
	`performance_score` integer,
	`accessibility_score` integer,
	`best_practices_score` integer,
	`seo_score` integer,
	`lcp_ms` real,
	`cls` real,
	`inp_ms` real,
	`ttfb_ms` real,
	`error_message` text,
	`r2_key` text,
	`payload_size_bytes` integer,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `audit_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_audit_lighthouse_results`("id", "audit_id", "page_id", "strategy", "performance_score", "accessibility_score", "best_practices_score", "seo_score", "lcp_ms", "cls", "inp_ms", "ttfb_ms", "error_message", "r2_key", "payload_size_bytes") SELECT "id", "audit_id", "page_id", "strategy", "performance_score", "accessibility_score", "best_practices_score", "seo_score", "lcp_ms", "cls", "inp_ms", "ttfb_ms", "error_message", "r2_key", "payload_size_bytes" FROM `audit_lighthouse_results`;--> statement-breakpoint
DROP TABLE `audit_lighthouse_results`;--> statement-breakpoint
ALTER TABLE `__new_audit_lighthouse_results` RENAME TO `audit_lighthouse_results`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_lighthouse_results_audit_id_idx` ON `audit_lighthouse_results` (`audit_id`);