CREATE TABLE "guest_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"claim_token" text NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "guest_accounts_claim_token_unique" UNIQUE("claim_token")
);
--> statement-breakpoint
CREATE INDEX "guest_accounts_ip_hash_idx" ON "guest_accounts" USING btree ("ip_hash");