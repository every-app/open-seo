---
title: "Reports"
description: "Find the reports your agent saved, share them with a link, export them to PDF, and set up report templates."
---

A report is one HTML page that your agent writes when it finishes a workflow, such as an audit or a keyword study, and saves to your project. Everyone in your workspace can open it from the project.

## Find your reports

Open **Reports** in the project sidebar, under AI Tools. It lists the 100 most recent reports, with who made each one (for example "Ben · Claude Code"), the skill or template it followed, and when it was last updated.

There's no button to write a report in the app. Your agent creates reports with the `save_report` tool, usually at the end of a skill such as [SEO Audit](/docs/skills/seo-audit). To get one, ask for a workflow ("audit badseo.dev") or ask the agent to save its findings as a report. SAM, the in-app assistant, answers in chat and doesn't save reports.

Open a report to read it. The buttons above the report open it full screen (leave with **Exit** or Esc) or in its own tab.

## Share a report

Reports start private: only members of your workspace can open them.

1. Open the report and click **Share**.
2. Turn on **Public link**.
3. Click **Copy link** and send it.

Anyone with the link can read the report without an OpenSEO account. The link always shows the latest saved version, and search engines don't index it. The page has a header with the report's title, "Made with OpenSEO" and a **Try OpenSEO** button.

To stop sharing, turn **Public link** off. People who already have the page open can keep loading it for up to a minute. Turning it on again makes a new link, so the old one stays dead. Deleting a report also turns off its link.

Your agent can do the same: ask it to "make this report public and give me the link", or to make it private again.

## Export to PDF

Click the **⋯** menu on a report and choose **Export**. The report opens in a new tab with every section expanded, and your browser's print dialog opens. Choose **Save as PDF** to keep a copy. A Google Maps rank grid prints as a static drawing.

## Change or delete a report

Reports have no editor in the app. To correct one, ask your agent to update that report. It replaces the page in place, and a shared link shows the new version. There's no version history or undo, so the old version is gone.

To delete a report, choose **Delete** from its menu on the Reports page or on the report itself. Deleting can't be undone.

## Report templates

A template is a reusable brief for a kind of report: who it's for, which sections it has, and how it should sound. Use one when you send the same kind of report every month, such as a client summary.

1. On the Reports page, click **Templates**.
2. Click **New template**.
3. Give it a **Name**, a short **Description**, and the **Instructions** your agent should follow.

Each project holds up to 10 templates. Your agent follows a template when you name it, or when you ask for the kind of report it describes ("write the client-ready audit summary"). Brand voice for the whole project belongs in **Context**, under Writing preferences, rather than in each template.

Editing or deleting a template doesn't change reports already written from it. Templates belong to one project; to reuse one elsewhere, ask your agent to copy it to the other project.

## Credits

Saving, reading, sharing, and exporting reports use no credits. The research that goes into a report, such as keyword data or a rendered audit, uses credits as usual.

## Self-hosting

Public links work on self-hosted instances that use OpenSEO accounts (password sign-in, the default). Behind Cloudflare Access or with sign-in turned off, there's no **Share** button, and **Export** is the main action. The live map in a Local SEO rank grid needs `GOOGLE_MAPS_API_KEY`; without it, the grid shows as a static drawing.

## Related

- [SEO Report](/docs/skills/seo-report): how your agent writes and saves a report.
- [MCP tools](/docs/mcp-tools): the report and template tools your agent can call.
