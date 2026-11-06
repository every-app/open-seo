DROP INDEX `guest_accounts_ip_hash_idx`;--> statement-breakpoint
ALTER TABLE `guest_accounts` ADD `slot` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Number each IP's existing guests 0, 1, ... in creation order, so the unique
-- index below can be built over IPs that already have two.
UPDATE `guest_accounts` SET `slot` = (
	SELECT COUNT(*) FROM `guest_accounts` AS `earlier`
	WHERE `earlier`.`ip_hash` = `guest_accounts`.`ip_hash`
		AND (`earlier`.`created_at` < `guest_accounts`.`created_at`
			OR (`earlier`.`created_at` = `guest_accounts`.`created_at` AND `earlier`.`user_id` < `guest_accounts`.`user_id`))
);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_accounts_ip_hash_slot_idx` ON `guest_accounts` (`ip_hash`,`slot`);
