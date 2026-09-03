# Self-hosted Microsoft Clarity

Connecting Microsoft Clarity gives OpenSEO and its MCP clients read-only access
to recent aggregate behavior metrics. There is no Clarity-specific deployment
variable: each OpenSEO project stores its own Clarity token, encrypted with the
deployment's stable `BETTER_AUTH_SECRET`.

## What you'll need

- A Microsoft Clarity project already collecting data for the site.
- Project-admin access in Clarity.
- A stable `BETTER_AUTH_SECRET` on the OpenSEO deployment. OpenSEO uses the
  existing Better Auth secret configuration to encrypt the token at rest. It
  must contain at least 32 characters.

## 1) Generate a Data Export token

In the Clarity project, open **Settings → Data Export**, select **Generate new
API token**, give it a recognizable name, and copy it. Only Clarity project
admins can create or replace these tokens.

Microsoft's instructions are in the
[Clarity Data Export API guide](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api#obtaining-access-tokens).

## 2) Connect OpenSEO

Open the corresponding OpenSEO project, then go to **Settings → Integrations →
Microsoft Clarity**. Paste the token and select **Connect Clarity**.

OpenSEO first verifies that server-side encryption is configured, then makes a
fixed read-only request to validate the token. On success it stores encrypted
token material and a masked last-four-character hint. The token is never
returned to the browser or exposed through MCP.

## 3) Use it from an AI client

The existing OpenSEO MCP connection automatically gains two read-only tools:

- `get_microsoft_clarity_overview`
- `get_microsoft_clarity_url_insights`

Ask the agent to review recent Clarity behavior, identify pages with friction,
or combine those findings with Search Console, GA4, and site-audit data. Clarity
tools use no OpenSEO credits.

## Limits and freshness

Microsoft limits Data Export to ten calls per Clarity project per day and only
the previous one, two, or three days. OpenSEO caches each fixed report for 24
hours to conserve that allowance. Stale data is never served after seven days,
and a daily maintenance job removes report-cache rows older than seven days.
A response explicitly says when cached or stale data was served.

The ten-call allowance belongs to the Clarity project, including all of its API
tokens. Connect a Clarity project to only one OpenSEO project; separate OpenSEO
projects cannot safely coordinate the same upstream allowance.

Before OpenSEO stores or returns a report, it strips query strings and fragments
from URL-shaped values. Paths and aggregate page/referrer metrics remain visible
to authorized project members and to an AI client only when that client invokes
the Clarity MCP tools.

## Rotation and removal

Use **Replace token** in OpenSEO after generating a new token in Clarity. To
fully revoke access, disconnect Clarity in OpenSEO and remove or replace the
token from Clarity's Data Export settings.

If `BETTER_AUTH_SECRET` is replaced without retaining the previous secret in a
supported versioned secret configuration, existing ciphertext cannot be read;
reconnect Clarity with a new token.
