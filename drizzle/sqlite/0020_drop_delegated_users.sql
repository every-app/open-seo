INSERT OR IGNORE INTO `user` (`id`, `name`, `email`, `email_verified`, `created_at`, `updated_at`)
SELECT
	`id`,
	coalesce(nullif(substr(`email`, 1, instr(`email`, '@') - 1), ''), `email`),
	`email`,
	1,
	cast(unixepoch(`created_at`) * 1000 as integer),
	cast(unixepoch(`created_at`) * 1000 as integer)
FROM `delegated_users`;
--> statement-breakpoint
DROP TABLE `delegated_users`;
