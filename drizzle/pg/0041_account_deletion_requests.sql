CREATE TABLE "account_deletion_requests" (
	"user_id" text PRIMARY KEY NOT NULL,
	"requested_at" text NOT NULL,
	"delete_after" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_requests_delete_after_idx" ON "account_deletion_requests" USING btree ("delete_after");