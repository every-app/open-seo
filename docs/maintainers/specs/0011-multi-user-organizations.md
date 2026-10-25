# 0011 — Multi-user organizations

Decisions behind PR #473 (multi-user organizations). Hosted mode only; self-host
never mounts the organization endpoints and delegated identities resolve as
implicit owners.

## Roles

Better Auth access control with three app statements on top of the built-ins
(`src/lib/org-permissions.ts`):

- `billing:manage` — **owner only** (subscribe, top-up, portal, cancel).
- `project:create/delete` and `integration:manage` (GSC/GA4 connect,
  disconnect) — owner + admin.
- **Every invitee is an admin** (deliberate v1 call, confirmed twice): full
  access to each project except billing. The `member` role is defined in code
  but not invitable — enforced server-side in `beforeCreateInvitation`, which
  also blocks owner-role invites (an owner minting a second owner and leaving
  would re-mint a fresh org + free grant at next sign-in).

Roles are resolved from the member row per request and never baked into
sessions or tokens.

## Membership invariants

- Every user has at least one org once they use the app; org resolution
  (`resolveActiveHostedOrganization`) creates a default organization on demand.
- **Invitations are the only path to multi-org membership**: users cannot
  create additional orgs (`allowUserToCreateOrganization: false`) and cannot
  delete orgs (`disableOrganizationDeletion: true` — deletion cascades all
  data and would re-mint free-plan grants; it stays a support action).
- **Invite sign-ups get no personal organization.** The session-create hook
  (`resolveSignInHostedOrganization`) defers default-organization creation for a
  membership-less user with a pending invitation, so they land in exactly the
  inviter's org. Abandoned/declined invites self-heal: the request path still
  creates a organization on the next app visit. Existing users keep their
  organization and simply gain the new org.
- Active org = `user.lastActiveOrganizationId` (validated against a live
  membership) → newest membership → create default. The column is
  load-bearing for the organization switcher and deliberately NOT a better-auth
  `userAdditionalFields` field (it must not be user-writable via
  `/update-user`).

## Authorization

- Every request re-validates the member row; removing a member revokes access
  on their next request, including MCP credentials (per-request membership
  check in the transport, role stamped per request).
- **MCP credentials are bound to one organization.** An OAuth grant is bound
  to the org active at consent and an API key to the org active when it was
  created; project-scoped tools authorize the project against that org and
  bill it. Losing that membership kills the credential; it is never rebound
  to another org the user belongs to. See
  [0017 — MCP credential scope](./0017-mcp-credential-scope.md).
- Chat (SAM) re-checks membership every turn and fails closed in hosted mode
  when the member row is gone — WebSockets authorize at connect time only,
  so the per-turn check is what revokes a removed member's open socket.

## Invitations

- 7-day expiry; re-invite of a pending address re-mails the same link with a
  refreshed expiry (the Team UI's Resend).
- The invite email is sent by the `sendTeamInvitation` server function, NOT
  better-auth's `sendInvitationEmail` callback — better-auth swallows throws
  from that callback, so a failed send would read as "sent". Send failures
  fail the call visibly; the pending row stays for retry. Consequence: the
  raw `/api/auth/organization/invite-member` endpoint creates pending rows
  but emails nobody.
- Abuse bounds: 20 pending invitations per org (better-auth
  `invitationLimit`) plus KV daily send counters — 5 sends/address, 50/org
  (`src/server/auth/invitation-send-limit.ts`). In-memory rate limiting is a
  per-isolate no-op on Workers; KV is the only counter that holds.
- Accepting works signed-out through sign-up + email verification and back;
  accept sets the active org and skips first-run onboarding (which would
  spend org credits and overwrite the shared project's domain).
- Free-plan audit quota is counted per organization, not per user.

## Accepted residuals

- Onboarding completion is stored per user, so an invitee's later personal
  organization starts empty with no onboarding.
- `resolveHostedContext` runs twice on owner-only Autumn mutations.
- KV send counters race under concurrency — they are abuse bounds, not exact
  quotas.

## Future (explicitly deferred)

- Per-project authorization inside an org (org membership without access to
  every project). The single choke points to extend: `withMcpProjectAuth`
  (MCP) and the canonical project-access path (web). Tracked as EVE-50's
  remaining scope.
- Roles tighter than admin (expose `member`, decide its rank-tracking rights).
- Intentional multi-org creation, org deletion flow, seats.
