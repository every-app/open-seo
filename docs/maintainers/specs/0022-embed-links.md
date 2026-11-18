# Embed links

## Status

Accepted. Builds on public share links (`specs/0014-public-share-links.md`) and the MCP App widgets.

## What it does

- Owners and admins (the roles that manage integrations) turn on a project's embed link in Project settings → Integrations. One switch covers the project. A view picker (Overview, Rank Tracking, Search Console) builds the URL to copy: the overview has every widget, the others one widget each. A new embeddable view is one more option in the picker.
- The pages are live and read-only. Viewers can switch trackers and devices, sort, page, change Search Console views and refresh. Nothing they do changes the project or spends credits.
- Any site can frame the pages. Agencies frame them from their own white-label domains, so there is no allowlist to keep.
- Turning the switch off revokes every URL; turning it on again mints a new token. The link also stops answering when its creator leaves the organization or can no longer manage integrations, and erasing the creator deletes it.
- Like share links, embed links need a deployment with its own accounts, so they are refused under Cloudflare Access and no-auth self-hosting.

## How it works

**One widget layer, two hosts.** A widget is a tool's structured result drawn by the widget bundle that MCP clients already load as an MCP App: the same React components, the app's own UI kit and stylesheet, and the app's own table columns where a feature has them (the rank tracker reuses the app's rank columns in a read-only mode). Widgets talk to a small host interface: the current snapshot (tool, arguments, structured result), a way to call the tool again with new arguments, and a way to open links. An MCP client's conversation is one host. An embed link is the other: the page carries the token and the list of widgets, and each widget's calls go to the link's data endpoint. Conversation-only actions, such as saving keywords or sending a selection to the assistant, exist only on the conversation host, so the shared widgets hide them on embeds.

**Data.** One `project_embeds` row per project: the project (primary key, cascades), the token (unique), the creator (cascades from the user) and a timestamp. The token is minted like a share token. Revoking deletes the row.

**Public routes.** `/e/<token>` and `/e/<token>/<widget>` serve the widget bundle's document with the page config inlined and a policy that allows any frame ancestor, the bundle's one script by nonce, and connections to the app only. `/e/<token>/data` takes a tool call and runs the MCP tool itself, as the creator, in the link's project: the project id in the request is replaced, and only the tools the embed widgets use are accepted. Both are read-only tools that use no credits. Every dead end (bad token shape, unknown or revoked token, archived project, creator gone, embeds unavailable) answers the same 404, which a framing dashboard shows as a plain message. Data calls are rate limited per token, because Search Console calls spend the project's Google quota.

## Alternatives considered

- A server-rendered page per widget, like the share page: a second rendering of data the app and the MCP widgets already draw, and a third set of layouts to keep in step.
- Framing the signed-in app: every app page refuses framing to prevent clickjacking, session cookies are SameSite=Lax and blocked in third-party frames by Safari, and Google sign-in refuses to load in a frame.
- Letting share links be framed: a report is a snapshot an agent wrote, so it can't refresh, and the request was for live data.
- Native GoHighLevel widgets by writing data into GoHighLevel custom objects: a per-sub-account OAuth integration and sync job, and its dashboard charts only count, sum and average, which can't show a keyword's position over time.
- A GoHighLevel marketplace app with SSO: worth it only for one-click install or knowing who is viewing; its custom pages are iframes too, so it could serve these same pages later.
- Listing every embed URL on the settings page: the list grows with each view. A picker shows one URL at a time, as analytics tools' embed builders do.
- An Embed button on each page: most users never embed, so it would be noise in every header.
- A token per view, or several named links per project: more to manage and revoke, for no access difference while a project is one client.
- A per-dashboard frame-ancestors allowlist: each agency's white-label domain differs, and a read-only page has no action to protect.
- Running link calls under a synthetic identity instead of the creator: the creator's membership is what ties a public link to someone who can still see the project.

## Not in scope

Starting rank checks or any other paid call from an embed, more than one link per project, per-widget links that differ in access, branding controls, view counts, a GoHighLevel marketplace listing, and showing the rank tracker widget in MCP clients (it needs only a `show_` tool now that the widget exists).
