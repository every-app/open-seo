CREATE TABLE "every_app_transfer_users" (
	"secret_hash" text NOT NULL,
	"previous_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "every_app_transfer_users_secret_hash_previous_user_id_pk" PRIMARY KEY("secret_hash","previous_user_id")
);
--> statement-breakpoint
CREATE TABLE "every_app_transfers" (
	"secret_hash" text PRIMARY KEY NOT NULL,
	"created_by_user_id" text NOT NULL,
	"expires_at" text NOT NULL,
	"active_at" text
);
--> statement-breakpoint
ALTER TABLE "every_app_transfer_users" ADD CONSTRAINT "every_app_transfer_users_secret_hash_every_app_transfers_secret_hash_fk" FOREIGN KEY ("secret_hash") REFERENCES "public"."every_app_transfers"("secret_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "every_app_transfer_users" ADD CONSTRAINT "every_app_transfer_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "every_app_transfers" ADD CONSTRAINT "every_app_transfers_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;