ALTER TABLE "backlink_snapshots" ALTER COLUMN "backlinks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ALTER COLUMN "referring_domains" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ALTER COLUMN "broken_backlinks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ALTER COLUMN "new_backlinks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ALTER COLUMN "lost_backlinks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ALTER COLUMN "new_referring_domains" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "backlink_snapshots" ALTER COLUMN "lost_referring_domains" SET DATA TYPE bigint;