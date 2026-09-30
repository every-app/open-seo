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

## 2. Route ChatGPT users before installing

For ChatGPT on the web or a regular Chat / Work conversation in the desktop app, use the [ChatGPT setup guide](https://openseo.so/docs/chatgpt). Pasting this prompt does not itself install a connection. If this session has a native, supported plugin installer, use it; otherwise give the manual steps below. Do not run Codex CLI commands in a hosted ChatGPT sandbox or claim that editing local Codex files connects ChatGPT web.

- Establish whether I want ChatGPT web, a regular desktop conversation, or Codex, and which ChatGPT plan I use. Use reliable session information if available; otherwise ask before giving plan-dependent steps. Do not infer my subscription or installation permissions from the model name.
- If OpenSEO is available in the user's Plugins directory, have them install it, approve OpenSEO sign-in, and start a new chat.
- Otherwise, custom MCP setup is documented for Plus, Pro, Business, Enterprise, and Edu on chatgpt.com, subject to workspace permissions. Free and Go do not support that route. OpenAI can change availability; verify its current [developer-mode documentation](https://developers.openai.com/api/docs/guides/developer-mode) before claiming plan support.
- Manual web setup for hosted OpenSEO: if available, enable Developer mode in Settings → Security and login. Open Plugins → + → Create MCP App, name it OpenSEO, set the server URL to `https://app.openseo.so/mcp`, and choose OAuth. Complete creation and sign-in; install the personal plugin if prompted. Start a new chat and select OpenSEO from the + / tools menu. For self-hosted OpenSEO, verify that its endpoint is publicly reachable over HTTPS and uses authentication supported by ChatGPT before offering web setup. Follow the [self-hosting guide](https://openseo.so/docs/self-hosting) for authentication; offer a local Codex connection for localhost or private endpoints.
- On desktop, offer a Codex chat for agent-assisted setup, then continue with the Codex path below. Free / Go Codex desktop access is subject to OpenAI rollout; do not promise CLI or web access on those plans. A local Codex connection does not connect ChatGPT web.
- If no supported path is available, offer the OpenSEO app directly. Do not recommend buying Pro just to complete setup or ask for an API key in chat.
- After manual setup, ask the user to send: “Use OpenSEO to check my connection and list my projects.” Only claim verification when the actual free tool reads succeed. An empty project list is a valid connection result. A custom MCP connection supplies tools, not the bundled skill files; offer plain-language workflows.

When manual action is still required, finish with the next exact UI steps and the connection-check request. Do not add the generic reload/skill handoff below until those steps are done.

## 3. Install the plugin first

The official plugin bundles MCP + SEO skills, with OpenSEO namespacing and shared updates.

- **Codex:** follow the [plugin guide](https://openseo.so/docs/codex-plugin).
- **Claude Code:** follow the [plugin guide](https://openseo.so/docs/claude-code-plugin).
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
- Do not create projects or run paid research during installation.

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

- If installation failed, name the blocker and replace reload with the fix. If fully verified, say it is ready and omit reload. Do not claim sign-in failed or is required merely because tools need reloading.
- Recommend this agent’s idiomatic way to invoke each installed skill: its native command, mention, picker, or natural-language request. Use the discovered skill name and plugin namespace; do not assume `/skill-name` works everywhere or create aliases to force it. Check the agent’s help or official documentation when unsure. If skills are unsupported, give equivalent plain-language requests using the connected tools. Recommend workflows; do not run them during installation.
- Keep tool names such as whoami and list_projects in your checks, not the final reply. Omit versions, paths, connection details, skill counts, other integrations, and cleanup commands unless they explain the blocker or I ask. Do not add more sections or a verification checklist.
