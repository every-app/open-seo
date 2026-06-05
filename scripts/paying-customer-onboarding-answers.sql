SELECT
  b.organization_id,
  o.name AS organization_name,
  b.is_paying,
  b.paid_plan_id,
  u.email,
  u.name AS user_name,
  a.work_for,
  a.client_website_count,
  a.found_via,
  a.mcp_setup_intent,
  a.interested_features,
  a.completed_at AS onboarding_completed_at,
  b.synced_at AS billing_synced_at
FROM billing_customer_status b
JOIN organization o
  ON o.id = b.organization_id
LEFT JOIN user_onboarding_answers a
  ON a.organization_id = b.organization_id
LEFT JOIN "user" u
  ON u.id = a.user_id
WHERE b.is_paying = 1
ORDER BY b.synced_at DESC, a.completed_at DESC;
