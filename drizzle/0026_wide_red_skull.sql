CREATE INDEX `projects_organization_id_idx` ON `projects` (`organization_id`);--> statement-breakpoint
CREATE INDEX `account_accountId_providerId_idx` ON `account` (`account_id`,`provider_id`);--> statement-breakpoint
CREATE INDEX `verification_expiresAt_idx` ON `verification` (`expires_at`);