CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "account_accountId_providerId_idx" ON "account" USING btree ("account_id","provider_id");--> statement-breakpoint
CREATE INDEX "verification_expiresAt_idx" ON "verification" USING btree ("expires_at");