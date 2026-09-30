---
title: "Use OpenSEO with ChatGPT"
description: "Connect OpenSEO on chatgpt.com or in the ChatGPT desktop app, check plan requirements, and verify the connection."
---

Connect OpenSEO before asking ChatGPT to do SEO research. Pasting the agent setup prompt into a regular conversation does not install a connection.

## Choose your setup path

| Where you want to work                         | How to connect                                               | Plan requirements                                                              |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| ChatGPT on the web                             | Add OpenSEO as a custom MCP connection using the steps below | Plus, Pro, Business, Enterprise, or Edu; workspace permission also applies     |
| Codex in the ChatGPT desktop app               | Open Codex and paste the agent setup prompt                  | Free / Go desktop access is subject to rollout; paid plans have broader access |
| A ChatGPT Plugins directory that lists OpenSEO | Install from the listing and sign in                         | Availability depends on your account, workspace, and the listing               |
| OpenSEO in your browser                        | Use keyword research, audits, and other app pages directly   | Your OpenSEO account and plan apply; no ChatGPT subscription needed            |

**Free or Go on chatgpt.com:** the custom MCP route below is not supported. You can try Codex in the desktop app where available, or use [OpenSEO directly](https://app.openseo.so). Buying ChatGPT Pro is not required for every setup path. OpenSEO billing is separate from your ChatGPT subscription.

These requirements follow [OpenAI's developer-mode documentation](https://developers.openai.com/api/docs/guides/developer-mode) and [Codex plan support](https://learn.chatgpt.com/docs/pricing). OpenAI can change availability and menu labels. Check those pages if your account differs from this guide.

## ChatGPT on the web

1. Sign in to [chatgpt.com](https://chatgpt.com) with a supported plan.
2. If your version shows it, open **Settings → Security and login** and enable **Developer mode**. Some versions expose the custom connection flow directly in Plugins.
3. Open **Plugins**, select **+**, then **Create MCP App**. In versions with the older interface, look for **Settings → Apps → Advanced settings → Developer mode**, then **Create** or **Add custom app**.
4. Enter these details:

   | Field          | Value                        |
   | -------------- | ---------------------------- |
   | Name           | `OpenSEO`                    |
   | Server URL     | `https://app.openseo.so/mcp` |
   | Authentication | `OAuth`                      |

   These settings apply to hosted OpenSEO. For a self-hosted instance, use a publicly reachable HTTPS endpoint with authentication supported by ChatGPT; localhost URLs cannot work from ChatGPT web. Follow the [self-hosting guide](/docs/self-hosting) or use a local Codex connection instead. The official directory plugin targets hosted OpenSEO.

5. Review the custom connection notice and create the connection. Sign in to OpenSEO in the window that opens and approve the connection. Return to ChatGPT. If the new plugin needs installation, open it under **Personal** and select **Install** or **+**.
6. Start a **new chat**. Open the **+ / tools** menu and select OpenSEO. In versions that show **Developer mode** in that menu, choose it and enable OpenSEO there. If the composer offers plugin mentions, you can also type `@` and select OpenSEO.
7. Send the connection-check request below.

Use OAuth for this flow. You do not need to create an OpenSEO API key or paste one into ChatGPT. A custom MCP connection gives ChatGPT OpenSEO tools; it does not install the SEO skill files from the repository. You can still ask for keyword research, audits, or competitor research in plain language.

See [OpenAI's connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt) for its current interface.

## ChatGPT desktop

The desktop app offers ChatGPT and Codex. For agent-assisted setup, open **Codex** and start a new chat, then copy the [agent setup prompt](/docs/agent-setup#set-up-your-agent) into that chat. Codex can configure its own connection and guide you through sign-in. Approve the OpenSEO login when prompted.

If you prefer manual setup, follow the [Codex plugin guide](/docs/codex-plugin#desktop-app), or add the [MCP connection alone](/docs/mcp#codex-in-the-chatgpt-desktop-app). Start a new Codex chat after installation if needed, then run the connection check below.

For a regular ChatGPT chat in the desktop app, check **Plugins**. If OpenSEO is listed for your account, install it, sign in, start a new chat, and select OpenSEO. If it isn't available, use the web custom-connection flow on an eligible plan or open Codex in the desktop app.

Codex and ChatGPT web use separate connections. Run the connection check in the chat where you want to use OpenSEO.

For the current mode controls, see [OpenAI's desktop guide](https://learn.chatgpt.com/docs/app).

## Check that OpenSEO is connected

Send this in a new chat with OpenSEO selected:

```text
Use OpenSEO to check my connection and list my projects. Do not run SEO research or create anything.
```

ChatGPT should call OpenSEO and return your connection status and project list. An empty project list is a successful connection check too. These reads use no OpenSEO credits.

If it says it cannot access OpenSEO, or only describes how to connect, setup is still incomplete. Check that OpenSEO is installed, signed in, and selected in this chat. Start a new chat after changing the connection.

Once the check succeeds, try:

```text
Use OpenSEO to help me choose one SEO task for my website. Ask about my goal before starting paid research.
```

Directory plugins may also include SEO Coach and other skills. Use the available skill picker or ask for a workflow by name. A custom MCP connection can use the tools without those skills.

## Troubleshooting

| What you see                                            | What to do                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No Developer mode or Create MCP App option              | Free / Go do not support the custom web route. On an eligible paid plan, check workspace permissions and the current Plugins interface. Use desktop Codex where available or OpenSEO directly.               |
| No OpenSEO listing                                      | A GitHub marketplace plugin is not automatically a public ChatGPT listing. Use the custom web connection or the Codex repository plugin steps.                                                               |
| ChatGPT asks for a client ID or secret                  | Keep OAuth selected and wait for discovery. Open Advanced OAuth settings and use Dynamic Client Registration (DCR) if offered. You should not need to supply your own client credentials for hosted OpenSEO. |
| The login window never appears                          | Allow the sign-in window to open, then retry authentication from the OpenSEO connection's details.                                                                                                           |
| Login succeeds but tools are unavailable                | Finish installing the personal plugin if prompted, start a new chat, and select OpenSEO from the tools menu.                                                                                                 |
| ChatGPT gives general advice instead of calling OpenSEO | Select OpenSEO and resend the connection-check request. Check that ChatGPT calls an OpenSEO tool.                                                                                                            |
| Codex works, but chatgpt.com cannot find OpenSEO        | Connect ChatGPT web separately. It does not read your desktop Codex configuration.                                                                                                                           |
| You have no projects                                    | An empty project list still confirms the connection. Create a project in OpenSEO when you are ready to start research.                                                                                       |

If setup still fails, contact [support@openseo.so](mailto:support@openseo.so) with your ChatGPT plan, web or desktop version, the step that failed, and the error message. Do not include passwords, API keys, or sign-in codes.

## Update OpenSEO

For a public directory plugin, start a new chat to load the tools and skills available in ChatGPT. Reconnect if ChatGPT reports that sign-in needs attention. Local Codex update commands do not update ChatGPT web.

For a custom MCP connection, open its details under **Plugins**, select **Refresh** to reload the tools, and start a new chat. Refresh updates tool definitions; it does not add repository skills. If sign-in has expired, authenticate again.

For Codex, use the [agent update prompt or plugin commands](/docs/agent-setup#update-your-skills) in your Codex environment.
