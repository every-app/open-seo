# Better Auth Dashboard connection

DGTL SEO Tool uses Better Auth inside the application for email/password login,
sessions, organizations, and authorization. The optional Better Auth
Infrastructure plugin connects that existing auth instance to
`dash.better-auth.com` for centralized user, organization, session, analytics,
and audit-log management.

## Application wiring

The server mounts `dash()` only when both conditions are true:

- `AUTH_MODE=hosted`
- `BETTER_AUTH_API_KEY` is set

The browser client includes `dashClient()`, but it never receives the dashboard
API key. The key remains a server-side secret.

## Local hosted-auth environment

Use this in `.env.local` to test Better Auth sign-in on port 3001. Replace every
`<...>` placeholder with the value from the named provider.

```dotenv
PORT=3001
AUTH_MODE=hosted
VITE_DGTL_DEMO_AUTH=false
DATABASE_PROVIDER=d1

BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_SECRET=<random-secret-with-at-least-32-characters>
BETTER_AUTH_API_KEY=<key-from-dash.better-auth.com>

GOOGLE_CLIENT_ID=<oauth-client-id-from-google-cloud>
GOOGLE_CLIENT_SECRET=<oauth-client-secret-from-google-cloud>

BYPASS_EMAIL_VERIFICATION=true
SUPER_ADMIN_EMAILS=<your-dgtl-email-address>
```

Generate `BETTER_AUTH_SECRET` locally with `openssl rand -base64 32`. Keep the
generated value private. `BYPASS_EMAIL_VERIFICATION=true` is only for local
development.

The Better Auth cloud dashboard cannot connect back to localhost. This local
configuration tests DGTL SEO login and enables the dashboard plugin in the app,
but dashboard synchronization needs the production HTTPS configuration below or
a temporary HTTPS tunnel running the same hosted-auth configuration.

## Production hosted-auth environment

Use these values in the hosting provider's encrypted environment or secret
settings. Do not commit them to Git.

```dotenv
AUTH_MODE=hosted
VITE_DGTL_DEMO_AUTH=false
DATABASE_PROVIDER=postgres

BETTER_AUTH_URL=https://seo.dgtl.lk
BETTER_AUTH_SECRET=<same-private-random-secret-used-by-the-deployment>
BETTER_AUTH_API_KEY=<key-from-dash.better-auth.com>

GOOGLE_CLIENT_ID=<oauth-client-id-from-google-cloud>
GOOGLE_CLIENT_SECRET=<oauth-client-secret-from-google-cloud>

TURNSTILE_SITE_KEY=<site-key-from-cloudflare-turnstile>
TURNSTILE_SECRET_KEY=<secret-key-from-cloudflare-turnstile>

LOOPS_API_KEY=<api-key-from-loops>
LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID=<loops-verification-template-id>
LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID=<loops-password-reset-template-id>
LOOPS_TRANSACTIONAL_INVITATION_ID=<loops-client-invitation-template-id>

SUPER_ADMIN_EMAILS=<first-admin@dgtl.lk>,<second-admin@dgtl.lk>
```

`DATABASE_PROVIDER=postgres` also requires the deployment's `HYPERDRIVE`
binding. Cloudflare supplies that binding; it is not a text API key in `.env`.

## Where each value comes from

| Variable                   | Source                              | Required                          |
| -------------------------- | ----------------------------------- | --------------------------------- |
| `BETTER_AUTH_SECRET`       | Generate locally with OpenSSL       | Yes                               |
| `BETTER_AUTH_API_KEY`      | Better Auth Dashboard onboarding    | Dashboard connection              |
| `BETTER_AUTH_URL`          | The deployed DGTL SEO HTTPS address | Yes                               |
| `GOOGLE_CLIENT_ID`         | Google Cloud OAuth web client       | Yes in current hosted mode        |
| `GOOGLE_CLIENT_SECRET`     | The same Google OAuth web client    | Yes in current hosted mode        |
| `TURNSTILE_SITE_KEY`       | Cloudflare Turnstile widget         | Recommended in production         |
| `TURNSTILE_SECRET_KEY`     | The same Turnstile widget           | Required when the site key is set |
| `LOOPS_API_KEY`            | Loops Settings → API                | Production email verification     |
| `LOOPS_TRANSACTIONAL_*_ID` | Loops transactional email templates | Corresponding email workflow      |
| `SUPER_ADMIN_EMAILS`       | DGTL staff email allowlist          | Super-admin dashboard             |

## Dashboard onboarding

1. Open the Better Auth Dashboard onboarding page.
2. Use `DGTL SEO` as the project name.
3. Set Base URL to the public HTTPS URL that serves this application.
4. Keep Base Path as `/api/auth`.
5. Add the generated API key to the server environment as
   `BETTER_AUTH_API_KEY`.
6. Restart or redeploy the application.
7. Create or connect the dashboard project, then verify that users and
   organizations load.

The Better Auth cloud dashboard cannot call `127.0.0.1`. For temporary local
testing, expose port 3001 through an HTTPS tunnel and use the tunnel URL as both
`BETTER_AUTH_URL` and the dashboard Base URL. Treat the tunnel as public and use
hosted auth settings; do not expose the `local_noauth` demo configuration.

## Deployment

For Cloudflare/Alchemy deployments, `alchemy.run.ts` maps
`BETTER_AUTH_API_KEY` as a Cloudflare secret. Add it to the environment file
used by the deployment. For Docker, put it in the local `.env`; Compose forwards
it into the container.

Rotate the key in the Better Auth Dashboard if it is ever pasted into source
control, chat, logs, or a client-side variable.
