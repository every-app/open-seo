# 0017 — MCP credential scope

Every hosted MCP credential is bound to exactly one organization: the one the
user was working in when the credential was created. Self-host deployments and
the in-app agent already worked this way; this record makes the hosted OAuth
and API-key paths match.

## What a credential is bound to

A credential carries the user and one organization id. On every `/mcp` request
the server requires a live membership for that user in that organization and
stamps the member row's role into the request; roles are never stored on a
token or key. Tools that take a `projectId` authorize the project against the
bound organization, and billing goes to that organization.

## How credentials bind

- **OAuth grants.** Accepting the consent page binds the grant to the active
  organization. For people who belong to more than one, the page names it and
  offers a switcher; switching there is the same as switching in the app, so
  the app follows. Everyone else has only one and sees no label. The same id
  is kept in the grant metadata so Settings can show which workspace each
  connected agent reaches.
- **API keys.** Creating a key binds it, server-side, to the session's active
  organization after confirming the user is a member there. The key's
  organization is stored with the key; the client cannot choose it.

Keys that predate this binding were assigned the organization the runtime
would have resolved for them at the time (the user's last-active organization
if still a member, otherwise the one joined most recently). A key with no
organization is refused.

## Membership removal and revocation

- Removing a user from an organization kills every credential bound to it on
  the next request: OAuth grants answer 401 with a Bearer challenge so a
  compliant client re-authorizes, and the new grant binds to whichever
  organization is active at that consent; API keys answer 403.
- Settings lists the user's connected agents (one entry per OAuth grant) with
  a Disconnect action. Disconnecting deletes the grant and every access token
  issued under it, so the client's next call fails and it must authorize
  again. API keys are revoked from the same Settings page as before.

## Alternatives considered

- **User-scoped credentials** (the model this replaces): one credential worked
  across every organization the user belongs to, including ones joined later,
  with the organization derived per call from the project. Rejected because the
  consent page reads as access to one workspace, and a later invitation to
  another organization silently widened what an already-connected agent could
  reach.
- **A per-key organization picker.** Rejected: multi-organization membership
  is rare (invitations are the only way in), and the picker adds UI for a case
  the active organization already answers. Switching organizations and
  creating a key there covers it.
