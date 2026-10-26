---
name: setup-openseo
description: Set up OpenSEO in the current AI agent. Use when a user pastes the OpenSEO installation prompt or asks to connect its plugin, MCP, and skills.
metadata:
  internal: true
---

Set up OpenSEO in this agent. Do what you can; guide me through anything that needs my input.

## 1. Check this agent

- Identify this agent and its version. Ask only if you cannot tell.
- Check for an existing OpenSEO connection. Preserve other integrations and avoid duplicates.
- Check for OpenSEO skills separately. A connection without skills is incomplete.

## 2. If this is ChatGPT

If I pasted this into a regular ChatGPT conversation (web or desktop app, not Codex), you cannot install OpenSEO from here. Don't run commands or edit files. Instead, give me these steps and stop:

1. Open the [OpenSEO plugin for ChatGPT](https://chatgpt.com/plugins/plugin_asdk_app_6abddd2c7e4c819191f1398c4bd8e9b3) and select **Install plugin**.
2. Sign in to OpenSEO and approve the connection.
3. Start a new chat, select OpenSEO from the **+** menu, and send: "Use OpenSEO to check my connection and list my projects."

The plugin connects only to hosted OpenSEO. If `https://app.openseo.so/mcp` is not on openseo.so (self-hosted), or the plugin isn't available for my account, point me to the custom connection steps in the [ChatGPT setup guide](https://openseo.so/docs/chatgpt#custom-connection) with that server URL. ChatGPT needs a publicly reachable HTTPS URL. If I'm in Codex, continue below.

## 3. Install the plugin first

The official plugin bundles MCP + SEO skills, with OpenSEO namespacing and shared updates.

- **Codex:** follow the [plugin guide](https://openseo.so/docs/codex-plugin).
- **Claude Code:** follow the [plugin guide](https://openseo.so/docs/claude-code-plugin).
- **Claude Cowork or the Claude desktop app:** you cannot install plugins from this chat, so don't run commands. Tell me to open **Customize** (in Cowork, the **Cowork** tab first) → **Plugins** → **+** or **Add** → **Add marketplace** → **Add from a repository**, enter `https://github.com/every-app/open-seo`, and install **OpenSEO**. Then I start a new task and type `/` to check that OpenSEO skills appear. If I already have a custom OpenSEO connector, have me remove it once the plugin signs in. Plugins need a paid plan. The plugin connects only to hosted OpenSEO, so skip it if `https://app.openseo.so/mcp` is not on openseo.so (self-hosted) or I'm on Free. Instead, have me add that endpoint under **Customize → Connectors** → **Add custom connector** and upload the [public skills](https://openseo.so/docs/skills/setup) in **Customize → Skills**. Then continue at step 5.
- **Other agents:** verify plugin compatibility in their current documentation.
- Check the installed client's help before running commands.

## 4. Fall back to MCP + skills

If the plugin is unsupported:

- Add `https://app.openseo.so/mcp` using the [MCP guide](https://openseo.so/docs/mcp).
- Install the [public SEO skills](https://openseo.so/docs/skills/setup) for this agent only.
- Do not copy internal repository skills or duplicate bundled skills.
- If skills are unsupported, use MCP alone and link to the workflow guides.

For self-hosted OpenSEO, use its endpoint directly; the official plugin targets the hosted service.

## 5. Sign in

- **Hosted OpenSEO:** Prefer OAuth and let me approve login in my browser. If this client cannot use OAuth, send me to `https://app.openseo.so/settings` → API keys. Have me enter the key in the client's secret settings or environment, never chat or a repository.
- **Self-hosted OpenSEO:** Follow the deployment's authentication instructions. A local server configured without authentication needs no OAuth or OpenSEO API key. For Cloudflare Access deployments, follow the self-hosting guide to configure Managed OAuth for the MCP client.
- **Manual setup needed?** Use this agent’s current documentation and give only the steps I need to do myself.

## 6. Reload and verify

- Use the current agent’s native reload flow, checking its installed version, help, or official documentation. Prefer automatic discovery or an in-place reload; restart only if required to load the new tools and skills.
- Once tools load in this session, run whoami and list_projects (free reads). Check skill discovery too. If a reload needs my action, give the instructions rather than repeatedly retrying unavailable tools.
- Track installation, sign-in, and verification separately. A connected server is not proof that this session can use its tools. Never claim verification before the free reads succeed.
- If list_projects returns no projects, ask for my website and create a project for it with create_project. Creating a project uses no credits.
- Do not run paid research during installation.

## 7. Finish with a short handoff

Keep progress updates brief. The final reply must be **140 words or fewer** and follow this template:

**Status**
[Briefly say what succeeded or what blocked setup.]

**Next**

1. `[Give the native reload command or UI action for this agent, only if needed.]` Then say “Check that OpenSEO is connected.” Approve sign-in if prompted.
2. Try one of these:
   - `[SEO Audit invocation]` **(recommended)** — find your website's biggest SEO issues.
   - `[SEO Project Setup invocation]` — interview you about your website and set up its project context.
   - `[Keyword Research invocation]` — find keywords worth targeting.
   - `[Local SEO invocation]` — review your Google Business Profile and local competitors.

Want to know what was set up? Just ask.

Adapt the template to the actual result:

- If I must install the plugin by hand, as in Claude Cowork, replace step 1 with those clicks.
- If installation failed, name the blocker and replace reload with the fix. If fully verified, say it is ready and omit reload. Do not claim sign-in failed or is required merely because tools need reloading.
- Recommend this agent’s idiomatic way to invoke each installed skill: its native command, mention, picker, or natural-language request. Use the discovered skill name and plugin namespace; do not assume `/skill-name` works everywhere or create aliases to force it. Check the agent’s help or official documentation when unsure. If skills are unsupported, give equivalent plain-language requests using the connected tools. Recommend workflows; do not run them during installation.
- Keep tool names such as whoami and list_projects in your checks, not the final reply. Omit versions, paths, connection details, skill counts, other integrations, and cleanup commands unless they explain the blocker or I ask. Do not add more sections or a verification checklist.
