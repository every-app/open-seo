# OpenSEO Stripe App (Stripe Projects provider)

`stripe-app.json` registers OpenSEO as a Stripe Projects provider. The endpoints it points at live in `src/server/stripe-projects/`; `docs/maintainers/specs/0021-stripe-projects-provider.md` explains them.

## Set up

1. Upload the app from this directory with the Stripe CLI, signed in to OpenSEO's Stripe account:

   ```bash
   stripe apps upload --non-interactive --accept-tos --wait
   ```

   Stripe refuses a version it already has: raise `version` in `stripe-app.json` first, or pass `--app-version`. The CLI rewrites `stripe-app.json` in its own format on every upload, so the file is committed that way and left out of Prettier. `pnpm-lock.yaml` is here only because the CLI will not package a directory without a lockfile.

2. In the Stripe Dashboard app settings, copy the app's signing secret and set it as `STRIPE_PROJECTS_SIGNING_SECRET` (GitHub production secret, then deploy). Until it is set, every `/api/stripe-projects/` path returns 404.
3. Store any random value under the Secret Store key `oauth_client_secret`. OpenSEO authenticates the token endpoint with Stripe's signature or PKCE and ignores the client secret.
4. Fill in the Marketplace listing: icon, subtitle, privacy policy (`https://openseo.so/privacy`), terms (`https://openseo.so/terms-and-conditions`), support channel with a response time, and test instructions.
5. Ask Stripe to put OpenSEO in the `dev` or `testing` catalog, then run `stripe projects add openseo/api`, `open`, `rotate` and `remove` against production before submitting for review.

`llm_context` in the manifest points at `https://openseo.so/stripe-projects/llm-context.md`. Publish that file (it ships with the public docs page) before uploading the app.

Stripe's provider spec is not public. The protocol here follows PostHog's open-source provider (`ee/partners/stripe/api/provisioning` in `PostHog/posthog`). Check these against Stripe's spec and test harness once you have repository access:

- The names Stripe writes to `.env` for `access_configuration.key` and `mcp_url`.
- Whether Stripe always sends `kyc.verified_fields`. A request without it is refused.
- `payment_credentials: "provider"` in the token response (PostHog answers `"orchestrator"` because Stripe bills for it).
- Whether Stripe retries `POST provisioning/resources` with the same `project_id` and expects the same resource back. Each call creates a new resource here.
- Whether Stripe sends the OAuth client id and secret to the token endpoint. They are ignored.
- What Stripe expects from a read or a second remove of a removed resource. Both answer 404.
