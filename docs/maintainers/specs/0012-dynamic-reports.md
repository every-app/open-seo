# Reports (agent-written HTML reports per project)

## Status

Accepted. Shipped in PR #570. Report templates (`specs/0013-report-templates.md`) and public share links (`specs/0014-public-share-links.md`) build on it.

## What it does

- When an agent finishes a workflow such as `seo-audit`, it writes the result as one self-contained HTML page and saves it to the project with the free MCP tool `save_report`. `list_reports` and `get_report` read them back. SAM, the in-app agent, does not get them.
- The project's Reports page lists them. A report page renders the document in a locked-down viewer, with Export (the browser's print dialog), full screen, open in a new tab, and delete.
- Saving with an existing report id replaces the content in place. There is no version history.
- A report can be up to 500 KB. Storage stops at 10,000 reports per project and 5 GB per organization, runaway guards rather than product limits.

## How it works

**Data.** One `reports` table: `id`, `project_id` (cascades from the project), `title`, `summary` (markdown, up to 2,500 characters), `html`, `skill` (the slug that wrote it), `created_by` (a client label such as "Claude Code"), `created_by_user_id`, `size_bytes`, timestamps, plus `template_id`, `share_token` and `shared_at` for the follow-up specs. One index on `(project_id, updated_at, id)` serves the list, newest first.

**Invariants.**

- Every query is scoped by project id. The one lookup by report id alone returns the owning project id, which the caller authorizes before any content is read.
- List queries never select `html`; only the render path reads the document. Worker memory, not storage, is the constraint.
- Attribution is stamped at create time from the session and the request's client identity, never from the model, and never re-stamped on update. Nothing authorizes or bills on the client label.
- The service validates before any write: title and summary length, UTF-8 byte size, and a cheap document-shape check (the HTML contains `<html` and ends with `</html>`), because a model that stops mid-document would otherwise overwrite the previous good report.
- Titles are unique within a project. The count cap is a guardrail, not a strict invariant: parallel saves can briefly exceed it, and the next save refuses.
- Error messages read as instructions, because agents see them verbatim.

**Rendering.** The stored document is served byte for byte on the app's own origin behind sign-in and project membership. The response carries a Content Security Policy with a `sandbox` directive, so the document has an opaque origin whether framed or opened as a top-level tab: no cookies, no storage, no session cookie on anything it issues. `default-src 'none'` blocks scripts, fetches, forms and external resources; inline styles and `data:` images and fonts are allowed. The only sandbox tokens granted let links open a new tab, with the opener severed so the popup cannot navigate the reader's tab. The in-app viewer is an iframe whose `sandbox` attribute carries exactly the header's token list; `allow-same-origin` is never added, because with scripts it lets a frame remove its own sandbox and alone it hands the frame the app's cookies. Print mode is hash-authorized: the one script the app ever appends is an attribute-free tag allowed by its hash, so the report's own scripts stay blocked.

Not signed in bounces to sign-in and back. An unknown report and another organization's report get the same 404. A report in an archived project answers 404 naming the project, since the viewer is already a member.

**Skills.** A new public skill, `seo-report`, owns the save rules (list first, reuse the id when redoing the same job, reply with the link and a verdict rather than the report), the writing rules (no external resources, no scripts, no backticks or `${` because some clients pass HTML through a template literal), and the single starter template with inline CSS and one light look on screen and paper. The seven workflow skills deliver through it.

Both self-host modes get reports with no new binding or store. Erasing a user re-attributes their reports and revokes links on them; deleting a project cascades. Saves, deletes and opens are counted in telemetry.

## Alternatives considered

- HTML in object storage instead of a text column: a second store that can half-fail on every update and a second thing to erase, for documents of tens of kilobytes.
- Immutable snapshots instead of update in place: more rows, a "which one is current" rule and a UI to browse them, for a deliverable agents redo rather than revise. The shape check is the price of update in place.
- Credits per report instead of free with caps: reports only touch the app database. The caps bound the one free surface that stores large blobs.
- Per-skill templates instead of one starter: one template gives every skill one thing to keep good.
- Allowing scripts in v1: blocking is the one-way door in the safe direction. Reports saved without scripts keep working after a later flip; the reverse is not true.
- A nonce instead of a hash for the print script: the tag is spliced into a document the app did not parse, and a dangling tag in the report could absorb the nonce.
- An injected print banner: the document it warns about could hide or fake it with CSS.
- Server-side PDF: the report is a real document with its own print CSS, so the browser prints it.
- A separate report domain: covered in `specs/0014-public-share-links.md`.

## Not in scope

Server-side PDF, version history, scheduled reports and email, `updated_by` attribution, list search and filters, keyset paging, a chunked save path.

## Later

Interactive charts via `allow-scripts` without `allow-same-origin`: the frame stays origin-less, so a chart can run but has no cookies, storage or network.
