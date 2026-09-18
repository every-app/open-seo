# Report templates (reusable report briefs per project)

## Status

Accepted. Shipped in PR #615, on top of reports (`specs/0012-dynamic-reports.md`).

## What it does

- A template is a reusable brief for a kind of report: who it is for, which sections it has and in what order, how it sounds, how it signs off, and an accent color. It is instructions, not a document; the agent still writes the HTML from the `seo-report` starter.
- Templates belong to a project, up to 10 each. The Templates page, reached from Reports, holds the table, the form and delete.
- Agents see a project's templates in project context and follow one when the user names it or asks for the kind of report it describes. A plain skill run keeps the skill's own format.
- Two free MCP tools, `list_report_templates` and `save_report_template` (create or update); SAM, the in-app agent, does not get them. `save_report` accepts an optional template id, and the reports list shows the template name as the report's type.

## How it works

**Data.** One `report_templates` table: `id`, `project_id` (cascades from the project), `name` (up to 80 characters, unique per project), `description` (one line, up to 200 characters), `instructions` (markdown, up to 3,000 characters), `created_by`, `created_by_user_id`, timestamps. The uniqueness check is case-insensitive in the service, with the unique index as the backstop, because "use the monthly check-in template" must never be ambiguous.

`reports.template_id` is nullable with no foreign key: deleting a template neither deletes nor blocks the reports written from it, and the name is resolved by a project-scoped read that shows nothing for a dangling id.

**Invariants.**

- Every template query is scoped by project id, including updates, deletes, the template check on `save_report` and the name resolution on the reports list. A template id from another project reads exactly like a deleted one.
- Reuse across projects is a copy, not a shared row: list the template in one project, save it in the other.
- A template replaces the section list, audience and tone. It never changes the HTML constraints, so the report still prints and still opens on a phone.

**Discovery.** The project-context digest that every skill reads first, and that SAM sees every turn, gains a "Report templates" section listing name and description, omitted when there are none. The `seo-report` skill carries the opt-in rule. The starter CSS gains an accent variable used by bar fills and finding labels; a template may set that, the byline and the footer, and nothing else in the CSS.

Template saves are counted in telemetry. Erasing a user re-attributes the templates they created.

## Alternatives considered

- A prose list of templates in project context instead of a table: custom sections are free text, so renames and caps would be policed by hand, and a caller could not address a template by id. What that option got right, discovery in the context agents already read, is kept.
- Organization-wide templates as a scope on the row: built, then removed. It needed a cross-scope name rule, an immutable scope, a who-can-edit rule and two caps, for a reuse case that copying already covers.
- Stored starter HTML per template instead of instructions only: a second thing to keep in sync with the skill's starter, for a benefit the accent, byline and footer hooks already deliver.
- A foreign key on `reports.template_id`: it would delete or block reports when their template goes.
- A delete tool: the app page owns deletion, and an agent has no reason to remove a brief the user wrote.
- A default template applied without asking: it would silently change every report a skill produces.

## Not in scope

Organization-wide templates, a template picker in the app, a default template, stored starter HTML, deleting templates from an agent.

## Later

Seeing every template across the organization and cloning one into a project. Stored starter HTML would arrive as an additive column.
