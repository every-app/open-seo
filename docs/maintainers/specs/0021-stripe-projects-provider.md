# Stripe Projects provider

[Stripe Projects](https://projects.dev) lets a developer or coding agent run `stripe projects add <provider>/<service>` to create an account with a provider, provision a resource, and get its credentials written to `.env`. OpenSEO is a provider with one service, `openseo/api`: an OpenSEO account plus an MCP API key. It runs on OpenSEO Cloud only.

## How it works

Stripe calls OpenSEO over the Agentic Provisioning Protocol (version `0.1d`). The Stripe App manifest (`deploy/stripe-app/stripe-app.json`) points Stripe at `https://app.openseo.so/api/stripe-projects/`, and `src/server/stripe-projects/` serves:

- `provisioning/health` and `provisioning/services`, the catalog. It lists one free deployable service, `api`.
- `provisioning/account_requests`. Stripe sends the developer's email, what it has verified about them, and their Stripe account id. The rule is the one Google sign-in follows. Unless Stripe lists `email` in `kyc.verified_fields`, the request is refused with `requires_kyc`. An existing OpenSEO account that never confirmed its own email is refused too. Otherwise OpenSEO creates a verified user and default organization for a new email, or reuses the existing account and organization. It answers with a five-minute, single-use authorization code.
- `oauth/token`. Stripe exchanges the code (with PKCE when it sent a challenge, otherwise with its signature) for an access token and a rotating refresh token. The token response says `payment_credentials: "provider"`: OpenSEO bills its own plans, so Stripe sends no payment tokens.
- `provisioning/resources` create, read, `rotate_credentials` and `remove`. A resource is one MCP API key in the organization, returned as `access_configuration.key` with the MCP URL. Each provision gets its own resource and key. Rotate mints the replacement before deleting the old key. Remove deletes the resource and its key, and keeps the account, its data and its credits. A bearer only reaches resources created by its own user, in its organization, for its Stripe account.
- `provisioning/deep_links`. `stripe projects open openseo` gets a ten-minute, single-use link to `/stripe-projects/login`. That page names the account and asks before signing in; its button posts the token to a Better Auth endpoint that creates the session and lands the user in the provisioned organization.

Every request carries `Stripe-Signature` (HMAC-SHA256 over the timestamp and raw body, the scheme Stripe uses for webhooks) and `API-Version`. Resource and deep-link calls also need the bearer from the token exchange, and the user's membership in the organization is re-checked on each one. Bearers and refresh tokens are stored only as SHA-256 hashes in `stripe_projects_grant`; `stripe_projects_resource` maps each resource to its current API key. Codes and login links are short-lived rows in Better Auth's verification store, keyed by the token's hash and consumed atomically. The endpoints return 404 unless the signing secret is configured, and do not exist outside hosted mode.

Keys are ordinary organization-bound MCP API keys: they show up under Settings → API keys and can be revoked there. Each Stripe account linked to an organization also appears as a Stripe Projects row under Settings → Connected agents. Disconnecting it deletes Stripe's tokens, so it can't mint new keys, and removes every resource it provisioned, so its keys stop working. Accounts created through Stripe go through the same user-creation hooks as any sign-up, including the disposable-email check and the starter credit grant. Provisioning counts as accepting OpenSEO's terms under Stripe's developer terms.

## Alternatives

Charging paid plans through Stripe's shared payment tokens would let an agent upgrade with `stripe projects upgrade`. A token can only be charged through a PaymentIntent, never saved as a card for a subscription, and Autumn has no way to charge one. OpenSEO would have had to run renewals, failures and downgrades itself next to Autumn. Plans and top-ups stay on the billing page until Stripe's recurring-token billing can feed the existing subscription path.

An existing account could be linked only after the user confirms in a browser, as Supabase and Sentry do. Stripe verifies every Stripe Projects email, its provider guide recommends headless linking when the email is verified, and the browser-confirm half of the protocol isn't published. OpenSEO links silently when the email is verified. It refuses unverified emails outright, for new accounts too: an account created for an address the requester doesn't own would leave them holding a key and a grant into it after the real owner signs in. A request with no `kyc` block counts as unverified.

A separate organization for Stripe-provisioned access, as Firecrawl does, would keep Stripe and card billing apart. OpenSEO has one billing path, so the key goes into the account's existing organization and no second free-credit grant is created.

The dashboard link could have been a plain URL to the sign-in page. Accounts created through Stripe have no password, so the one-time link is the only way in that needs no Google account or password reset.

The link could have signed the visitor in as soon as it was opened. Then anyone with a Stripe Projects account could send someone a link into their own account, and a link preview would use the link up. The confirm page costs one click.

Codes and login links could have had their own table. Better Auth's verification store already holds short-lived single-use values, clears expired rows, and consumes them atomically.

Better Auth's `account` table could have held the Stripe link. It has no organization, and its token columns hold tokens a provider issued to OpenSEO, not ones OpenSEO issued.

Better Auth's magic-link and one-time-token plugins could have minted the login link. Magic link adds a public endpoint that emails and creates accounts; one-time tokens need a session to exist before the link is opened.
