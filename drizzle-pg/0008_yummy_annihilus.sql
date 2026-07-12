ALTER TABLE "gsc_connections" ADD COLUMN "gsc_account_id" text;
--> statement-breakpoint
UPDATE gsc_connections SET gsc_account_id = (
  SELECT a.account_id FROM account a
  WHERE a.user_id = gsc_connections.connected_by_user_id
    AND a.provider_id = 'google-search-console'
)
WHERE gsc_account_id IS NULL
  AND (
    SELECT count(*) FROM account a2
    WHERE a2.user_id = gsc_connections.connected_by_user_id
      AND a2.provider_id = 'google-search-console'
  ) = 1;
