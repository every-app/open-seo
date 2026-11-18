-- Bind existing MCP API keys to one organization. Keys created from now on
-- get {"organizationId": ...} stamped into metadata at creation; older keys
-- resolved the org per request. Backfill with the same rule that runtime
-- used: the user's last-active organization if still a member, else the
-- organization they joined most recently. Keys whose user belongs to no
-- organization stay unbound and are rejected by /mcp. The plugin writes
-- metadata through JSON.stringify, so an unset value is the text 'null', not
-- SQL NULL.
UPDATE "apikey"
SET "metadata" = (
	SELECT json_build_object('organizationId', "member"."organization_id")::text
	FROM "member"
	JOIN "user" ON "user"."id" = "member"."user_id"
	WHERE "member"."user_id" = "apikey"."reference_id"
	ORDER BY
		CASE WHEN "member"."organization_id" = "user"."last_active_organization_id" THEN 0 ELSE 1 END,
		"member"."created_at" DESC
	LIMIT 1
)
WHERE ("metadata" IS NULL OR "metadata" = 'null')
	AND EXISTS (
		SELECT 1 FROM "member" WHERE "member"."user_id" = "apikey"."reference_id"
	);
