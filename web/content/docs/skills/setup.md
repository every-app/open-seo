---
title: "Set up OpenSEO Agent Skills"
description: "Add OpenSEO skill files to your AI agent after connecting OpenSEO MCP."
---

OpenSEO Agent Skills are separate files from OpenSEO MCP.

On Claude Code or Claude Cowork, skip the steps below and use the [OpenSEO plugin](/docs/claude-code-plugin) instead — it installs MCP and every skill in one step. On Codex CLI, use the [OpenSEO plugin](/docs/codex-plugin) the same way.

First, [set up OpenSEO MCP](/docs/mcp). MCP gives your agent access to OpenSEO data.

Then add the OpenSEO `SKILL.md` files you want your agent to use. Each skill gives your agent one SEO workflow.

## ChatGPT

Use the [ChatGPT setup guide](/docs/chatgpt). A directory plugin can include skills; a custom MCP connection provides tools only. You can ask for SEO research in plain language with those tools. The terminal commands below apply to agents with a local skills installer, such as Codex or Claude Code.

## Choose an installation option

Pick the option that matches how you want to install the files.

### Option 1: Install and choose interactively

Use this if you want the installer to show the available skills and agents.

```bash
npx skills add https://github.com/every-app/open-seo/tree/main/plugins/openseo/skills
```

### Option 2: Install all OpenSEO skills

Use this if you want every OpenSEO skill.

```bash
npx skills add https://github.com/every-app/open-seo/tree/main/plugins/openseo/skills --skill '*'
```

### Option 3: Install all skills for Claude Code only

Use this if the skills should be available in Claude Code only.

```bash
npx skills add https://github.com/every-app/open-seo/tree/main/plugins/openseo/skills --skill '*' --agent claude-code
```

### Option 4: Install all skills for OpenAI Codex only

Use this if the skills should be available in Codex only.

```bash
npx skills add https://github.com/every-app/open-seo/tree/main/plugins/openseo/skills --skill '*' --agent codex
```

### Option 5: Copy the skill files manually

Use this if you prefer to copy files into your agent's skills folder.

```bash
git clone https://github.com/every-app/open-seo.git

# Codex
mkdir -p ~/.codex/skills
cp -R open-seo/plugins/openseo/skills/* ~/.codex/skills/

# Claude Code
mkdir -p ~/.claude/skills
cp -R open-seo/plugins/openseo/skills/* ~/.claude/skills/
```

You can also review the source skills on GitHub:

- [OpenSEO Agent Skills on GitHub](https://github.com/every-app/open-seo/tree/main/plugins/openseo/skills)

Each skill page also links to its source `SKILL.md`.

## Update installed skills

Use the [update prompt or commands for your installation method](/docs/agent-setup#update-your-skills). Update the OpenSEO plugin if it supplies your skills; otherwise use the installer you originally chose or update your manual copies.

### Skills installed with the skills CLI

List your installations, then update the OpenSEO skills by name. For example:

```bash
npx skills list
npx skills update seo-coach seo-audit
```

Use the names you actually installed and choose the same project or global scope. Pass `-g` for global skills or `-p` for project skills. Back up personal edits before updating. Run the setup command to select any newly added workflows separately. See the [skills CLI documentation](https://github.com/vercel-labs/skills#skills-update).

### Manually copied skills

Compare your installed copies with the [public OpenSEO skill folders](https://github.com/every-app/open-seo/tree/main/plugins/openseo/skills). Preserve personal edits and replace the complete skill folder, including supporting files. Use your agent's skill manager for uploaded skills, such as Claude's **Customize → Skills**.

After updating, reload the skills or start a new session if needed.

## Run a skill

Use your agent's skill picker or ask for a workflow by name. In Codex, type `$`; Claude Code plugin skills use `/openseo:skill-name`. Other clients have their own invocation syntax. The available workflows include:

- `seo-project-setup`
- `seo-coach`
- `seo-audit`
- `ai-visibility-audit`
- `ai-prompt-research`
- `keyword-research`
- `keyword-clustering`
- `competitive-landscape`
- `competitor-analysis`
- `local-seo`
- `link-prospecting`
- `seo-report`

## Next step

Start with [SEO Project Setup](/docs/skills/seo-project-setup) if this is a new SEO project, or [SEO Coach](/docs/skills/seo-coach) if you are not sure which workflow to run first.
