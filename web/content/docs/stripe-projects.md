---
title: "Add OpenSEO with Stripe Projects"
description: "Create an OpenSEO account and API key from the terminal with Stripe Projects."
---

[Stripe Projects](https://projects.dev) sets up developer services from the Stripe CLI and writes their credentials to your `.env`. OpenSEO is available as `openseo/api`.

```bash
stripe projects add openseo/api
```

The command:

- creates an OpenSEO account for your Stripe account's email, or links your existing OpenSEO account with that email. Stripe must have verified the email first.
- creates an API key in that account
- writes `OPENSEO_API_KEY` and `OPENSEO_API_MCP_URL` to your `.env`

Run `stripe projects env` to see the exact variable names in your project. Adding OpenSEO accepts OpenSEO's [Terms](/terms-and-conditions) and [Privacy Policy](/privacy).

## Connect your agent

Use the key with the hosted MCP server, `https://app.openseo.so/mcp`. For Claude Code:

```bash
claude mcp add --transport http openseo https://app.openseo.so/mcp --header "Authorization: Bearer $OPENSEO_API_KEY"
```

For Codex CLI:

```bash
codex mcp add openseo --url https://app.openseo.so/mcp --bearer-token-env-var OPENSEO_API_KEY
```

Other clients are covered in [Connect with an API key](/docs/mcp#connect-with-an-api-key).

## Sign in to the dashboard

```bash
stripe projects open openseo
```

This opens a page that shows which account you are signing in to. Click **Continue** to sign in. The link works once and expires after ten minutes. Accounts created through Stripe Projects have no password; you can also sign in with Google using the same email, or set a password with **Forgot password**.

## Credits and plans

New accounts start with the same free credits as any OpenSEO sign-up. Plans and credit top-ups are billed by OpenSEO on the [billing page](https://app.openseo.so/billing), not through Stripe Projects. See [pricing](/pricing).

## Rotate or remove the key

```bash
stripe projects rotate openseo-api
stripe projects remove openseo-api
```

Rotating replaces the key, and the old one stops working straight away. Removing revokes the key but keeps your OpenSEO account, projects and credits. The key is also listed under **Settings → API keys** in OpenSEO. To cut Stripe off entirely, disconnect **Stripe Projects** under **Settings → Connected agents**: Stripe can no longer create keys, and the keys it created stop working.
