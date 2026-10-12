DELETE FROM `account` WHERE `id` IN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `user_id`, `provider_id`, `account_id`
      ORDER BY (`refresh_token` IS NOT NULL) DESC, `updated_at` DESC, `id` DESC
    ) AS `row_number`
    FROM `account`
    WHERE `provider_id` IN ('google-search-console', 'google-analytics')
  ) AS `duplicate_grants`
  WHERE `row_number` > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `account_google_grant_owner_idx` ON `account` (`user_id`,`provider_id`,`account_id`) WHERE "account"."provider_id" in ('google-search-console', 'google-analytics');
