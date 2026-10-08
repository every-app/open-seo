# Report template branding (a brand kit on report templates)

## Status

Proposed. Builds on report templates (`specs/0013-report-templates.md`).

## What it does

- A report template can carry a brand kit: a brand color, an optional second color for gradients, an accent color for text, a page background, and a logo. All five are optional.
- When `save_report` names a template, the server writes that template's brand kit into the report. The agent never copies colors or a logo into the HTML.
- The `seo-report` starter reads the brand kit through CSS custom properties. Without a template, or with an unbranded one, a report keeps the starter's neutral look.
- The Templates form has a Branding section with color pickers, a logo upload, and a live contrast check on the accent. `save_report_template` takes the same fields, and `list_report_templates` reports them.

## How it works

**Data.** Five nullable text columns on `report_templates`: `brand_color`, `brand_color_2`, `accent_color`, `canvas_color` (six-digit hex), and `logo_data_uri` (a base64 `data:image/...` URI of up to 40,000 characters, because the report sandbox loads no image by URL). Template lists return the logo's length instead of its bytes, since the list feeds the project-context digest every agent reads.

**Applying it.** On `save_report` with a `templateId`, the service writes a single `<style id="openseo-brand">` block setting `:root` tokens (`--brand`, `--brand-2`, `--accent`, `--canvas`, `--brand-logo`, `--brand-logo-display`) as the last style in the document head, so it overrides the starter's defaults. Any earlier block is removed first, so saving a revised report never stacks two. The block is added before the size check, so a logo counts against the report and organization caps. A save that names no template leaves the HTML as sent, which is how a revision keeps the block it already carries.

**Invariants.**

- The block is built only from service-validated values: hex colors and a data URI limited to base64 characters. Nothing a caller sends reaches the CSS unchecked.
- Accent text must reach 4.5:1 contrast against both the page background and the white cards. The page background must keep the starter's muted text at 4.5:1. Colors are checked as they will render together, so an edit that changes only the background is still held to the stored accent. Refusals name the measured ratio and how to fix it.
- On an update, an omitted brand field keeps its stored value and `null` clears it, so an edit never has to send the logo back.
- A report is a snapshot. Changing a template's brand kit later leaves reports already saved from it as they were.

## Alternatives considered

- **The agent copies the brand values into each report.** This was the previous approach, with an `accent: #hex` line in the instructions. A logo costs thousands of output tokens per report, and hand-copied values drift between reports.
- **Applying the brand at render time.** Every view would read the template, a deleted template would silently unbrand old reports, and the shared document route would gain a dependency. Snapshotting at save time keeps a report self-contained.
- **A brand kit per project instead of per template.** An agency's reports for different audiences can need different looks within one project, and templates are already the unit an agent opts into.
- **Embedded web fonts.** A single font weight roughly doubles a typical report. A family name alone would not load, because the sandbox blocks network fonts.
- **Storing starter HTML per template.** This was rejected in the templates spec for the same reason it is rejected here: tokens deliver the look without a second copy of the starter to keep in sync.

## Not in scope

Embedded fonts, branding on the share page's social image, organization-wide brand kits, and copying a logo between projects through MCP, which would need the logo bytes.
