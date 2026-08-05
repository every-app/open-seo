ALTER TABLE `psi_snapshots` ADD `trigger` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `psi_urls` ADD `next_run_at` text;--> statement-breakpoint
CREATE INDEX `psi_urls_next_run_at_idx` ON `psi_urls` (`next_run_at`);