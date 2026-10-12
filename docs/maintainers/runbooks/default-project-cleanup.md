# Default Project Cleanup

Most installs do not need this cleanup. Use it only if running the latest
migrations fails with a unique-constraint error for
`projects_one_default_per_organization_idx`.

The cleanup keeps one canonical auto-created `Default` project per organization,
remaps supported child rows onto it, preserves rank-tracking history and keyword
metadata where possible, then removes duplicate Default projects.

## Cloudflare D1 Database

1. Preview the cleanup:

   ```sh
   pnpm cleanup:default-projects:d1 --database open-seo
   ```

2. If the output looks right, apply it:

   ```sh
   pnpm cleanup:default-projects:d1 --database open-seo --apply --confirm-remote-apply
   ```

3. Validate or re-run validation:

   ```sh
   pnpm cleanup:default-projects:d1 --database open-seo --validate-only
   ```

4. Re-run the normal migration/deploy.

Before applying to production, make sure you have a recent D1 backup or
time-travel restore point. For hosted production, disable signups/writes for
roughly 60 seconds while the cleanup runs.

## Local Docker / Local SQLite-Backed D1 Database

1. Preview the cleanup:

   ```sh
   pnpm cleanup:default-projects:d1 --database open-seo --local
   ```

2. Apply it:

   ```sh
   pnpm cleanup:default-projects:d1 --database open-seo --local --apply
   ```

3. Validate or re-run validation:

   ```sh
   pnpm cleanup:default-projects:d1 --database open-seo --local --validate-only
   ```

4. Re-run the normal local migration.

## What Happened

Several simultaneous requests could initialize the same organization at once,
creating more than one auto-created `Default` project.

## More Detail

The runner in `scripts/d1-default-project-cleanup.ts` is the recommended entry
point because it includes dry-run output, active-run preflight checks, post-apply
validation, and an explicit confirmation flag for remote databases.

The SQL implementation lives in `scripts/cleanup-default-projects.sql`.
