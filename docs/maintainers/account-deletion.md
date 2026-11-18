# Account deletion

Hosted users delete their own accounts from **Settings → Personal → Delete
account**. There is no operator script: the production Worker already holds
the keys every step needs, so no production secret has to leave Cloudflare.
Self-hosted and Every App deployments don't offer it; their operators own the
accounts.

## Requesting

The request is refused unless:

- the user signed in within the last 15 minutes and types their email;
- they own no workspace that has other members (remove them first, or ask
  support to hand the workspace to one of them).

On the workspaces that go with the account, the request cancels a renewing
paid plan at the end of its period (the credits last until then) and turns
auto-reload off, before the request row is written. The page warns about both
before the button.

A request writes an `account_deletion_requests` row with a date 14 days out,
and in the same batch deletes the user's sessions, API keys, and pending
invitations into their solo workspaces. MCP OAuth grants are removed from KV.
The user gets a Loops confirmation email (`LOOPS_TRANSACTIONAL_ACCOUNT_DELETION_ID`,
data variable `deletionDate`) and every later sign-in, password or Google,
fails with a message naming the date.

To cancel a request, delete the user's row from `account_deletion_requests`.
Sessions and API keys are already gone; the user signs in again and recreates
keys.

## Erasing

The daily cron (`17 3 * * *`, hosted only) erases accounts whose date has
passed, oldest first, for up to five minutes a day. For each one, in order:

1. Delete the Autumn customer of each solo workspace and its Stripe customer.
2. Erase Cloudflare state: stop running Workflows, revoke Google grants, and
   delete chat and audit Durable Objects, R2 audit payloads and cached data,
   KV progress and referral keys, and MCP OAuth grants.
3. Delete the PostHog person and queue deletion of their events and session
   recordings.
4. Delete the Loops contact, by user id and by email, and the review
   invitation data Trustpilot holds for the email (skipped where Trustpilot
   isn't configured).
5. In one database batch: delete the user and their solo workspaces (project
   data cascades), delete their Google connections and API keys, and
   re-attribute audits, reports, and report templates they created in shared
   workspaces to `gdpr-deleted-user`, revoking share links on those reports.

Every step is safe to repeat, and the database goes last, so a failed run is
finished by a later one. A failed account's date moves one day later, which
puts it behind the rest of the queue. A Google account another OpenSEO user
has also connected isn't revoked, since revoking it would end their grant
too. A failure is reported to PostHog error tracking
(`source: account_deletion`); a request still waiting three days after its
original date reports `ACCOUNT_DELETION_OVERDUE`.

## Monitoring

PostHog gets `account_deletion:requested` and `account_deletion:completed`
under the fixed distinct id `account-deletion`: the person's own record is
deleted with their account, and would take the counts with it. A weekly trend
of the two events shows how many people asked and whether the queue keeps up.

## Configuration

| Name                                      | Kind   | Purpose                                     |
| ----------------------------------------- | ------ | ------------------------------------------- |
| `LOOPS_TRANSACTIONAL_ACCOUNT_DELETION_ID` | var    | Confirmation email template                 |
| `POSTHOG_PROJECT_ID`                      | var    | Project the person is deleted from          |
| `POSTHOG_HOST`                            | var    | Existing ingestion host; now required       |
| `POSTHOG_ACCOUNT_DELETION_API_KEY`        | secret | Personal API key with person read and write |

The PostHog API host is derived from `POSTHOG_HOST` (`us.i.posthog.com` becomes
`us.posthog.com`). `LOOPS_API_KEY` and `AUTUMN_SECRET_KEY` are the existing
production keys.

Deleting a person takes a personal API key: PostHog's project secret API keys
don't offer the person scopes. Limit the key to `person:read` and
`person:write` on the production project only. It belongs to whoever created
it and stops working if they leave the PostHog organization, so create it
from an account that stays.

### Setting it up in GitHub

The production deploy workflow refuses to run while any of these is missing,
so set them before merging the change that requires them. Everything lives on
the `production` environment of the repository.

1. In Loops, create a transactional email for the confirmation. It receives
   one data variable, `deletionDate` (already formatted, e.g. "November 16,
   2026"), and should say the account is deleted on that date and to email
   support@openseo.so to keep it. Publish it and copy its ID.
2. In PostHog, open **Settings → Personal API keys → Create key**. Choose
   **Projects: production project**, scopes `person:read` and `person:write`,
   and copy the key. The project ID is the number in the project's URL.
3. Set them:

   ```sh
   gh variable set LOOPS_TRANSACTIONAL_ACCOUNT_DELETION_ID --env production --body '<loops id>'
   gh variable set POSTHOG_PROJECT_ID --env production --body '<project id>'
   gh secret set POSTHOG_ACCOUNT_DELETION_API_KEY --env production   # paste when prompted
   gh variable list --env production | grep POSTHOG_HOST     # must already be set
   ```

4. Make sure the production bucket expires Prompt Explorer's cached answers.
   Erasure doesn't delete them; it relies on this rule clearing them before
   the 14-day wait ends. Run with a wrangler login on the production account:

   ```sh
   wrangler r2 bucket lifecycle list open-seo
   wrangler r2 bucket lifecycle add open-seo prompt-cache-expiry \
     "dataforseo-cache/ai-search:prompt-response:" --expire-days 7
   ```

   Production already has `dataforseo-cache-expiry` (7 days on all of
   `dataforseo-cache/`), which covers it; the `add` is only for a bucket
   without that rule. Keep any such rule at 14 days or less.

5. Remove the secret the old erasure script used:

   ```sh
   gh secret delete GDPR_ERASURE_SECRET --env production
   ```

6. Merge and run the deploy. Its first step lists any name still missing.
   Afterwards, `account_deletion:*` events in PostHog confirm requests work;
   the first erasure runs on the cron 14 days after the first request.

## What is kept

- Reports, templates, and audits the user created in a workspace that
  outlives them, with the attribution wiped.
- The Dub referral customer record, which holds only a pseudonymous id.
- PostHog event deletion runs asynchronously after the request.
- Completed Workflow state and Workers logs expire under the Cloudflare
  account's retention. Prompt Explorer's cached answers expire under the
  bucket's lifecycle rule (step 4 above), which must stay configured.
- Database backups and billing records kept for tax, fraud, or legal reasons
  expire under their own retention.
