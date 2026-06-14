ALTER TABLE `billing_customer_status` ADD `paid_plan_status` text;--> statement-breakpoint
UPDATE `billing_customer_status`
SET `paid_plan_status` = (
  SELECT json_extract(subscription.value, '$.status')
  FROM json_each(`billing_customer_status`.`customer_json`, '$.subscriptions') AS subscription
  WHERE json_extract(subscription.value, '$.planId') = 'base-plan'
  ORDER BY CASE
    WHEN json_extract(subscription.value, '$.status') = 'active' THEN 0
    ELSE 1
  END
  LIMIT 1
)
WHERE `paid_plan_status` IS NULL
  AND json_valid(`customer_json`);
