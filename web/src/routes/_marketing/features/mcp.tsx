import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode, SVGProps } from "react";
import { useState } from "react";
import { buildPageSeo } from "@/lib/seo";

const mcpDescription =
  "Connect OpenSEO MCP so compatible AI clients can call keyword, SERP, domain, backlink, saved keyword, and rank-tracking tools.";

const toolCategories = [
  {
    label: "Keywords",
    tools: [
      {
        title: "Research keywords",
        description: "Get keyword ideas with volume, difficulty, and CPC.",
      },
      {
        title: "Get SERP results",
        description: "See SERP results for a keyword.",
      },
      {
        title: "Get rank tracking positions",
        description: "Read tracked keyword positions.",
      },
      {
        title: "Get saved keywords",
        description: "Pull saved keywords from OpenSEO.",
      },
      {
        title: "Save keywords",
        description: "Save keywords back to OpenSEO.",
      },
    ],
  },
  {
    label: "Domain",
    tools: [
      {
        title: "Get domain overview",
        description: "Summarize a domain's organic footprint.",
      },
      {
        title: "Get domain keywords",
        description: "Find keywords a domain already ranks for.",
      },
      {
        title: "Get backlinks overview",
        description: "Check backlink and referring-domain stats.",
      },
    ],
  },
] as const;

export const Route = createFileRoute("/_marketing/features/mcp")({
  head: () =>
    buildPageSeo({
      title: "OpenSEO MCP",
      description: mcpDescription,
      path: "/features/mcp",
      titleSuffix: "OpenSEO",
    }),
  component: McpPage,
});

function McpPage() {
  return (
    <>
      <p className="text-sm font-medium text-neutral-500">OpenSEO MCP</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight leading-tight">
        OpenSEO MCP for your AI agent
      </h1>
      <p className="mt-4 text-neutral-700 leading-relaxed">
        Connect OpenSEO to your AI agent so your MCP client can call OpenSEO
        tools for keyword research, SERP results, domain overview, domain
        keywords, backlink overview, saved keywords, and rank-tracking
        positions.
      </p>

      <a
        href="#setup"
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-600"
      >
        Skip to setup
        <span aria-hidden="true">↓</span>
      </a>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">What it does</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          MCP lets compatible AI clients call OpenSEO research tools directly.
          After connecting OpenSEO through a supported MCP client, you can ask
          your agent to research keywords, inspect search results, compare
          domains, and save useful ideas back to your workspace.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Available tools</h2>
        <div className="mt-5 grid gap-x-8 gap-y-8 md:grid-cols-2">
          {toolCategories.map((category) => (
            <div key={category.label}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {category.label}
              </h3>
              <ul className="mt-3 space-y-3">
                {category.tools.map((tool) => (
                  <li key={tool.title} className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-neutral-900">
                      {tool.title}
                    </span>
                    <p className="text-xs leading-relaxed text-neutral-600">
                      {tool.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="setup" className="mt-12">
        <h2 className="text-xl font-semibold">Set up OpenSEO MCP</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          The first connection sends you through OpenSEO login. After
          authorization, your MCP client can call OpenSEO tools using the
          authorized OpenSEO project context and scopes. The MCP server URL is{" "}
          <code>https://app.openseo.so/mcp</code>. For the most current setup UI
          and a copyable endpoint, open{" "}
          <a
            href="https://app.openseo.so/ai"
            className="font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-600"
          >
            AI & MCP in OpenSEO
          </a>
          .
        </p>

        <div className="mt-5 rounded-lg border border-neutral-200 bg-white px-4 py-3.5">
          <h3 className="text-sm font-semibold text-neutral-900">
            Don&apos;t see your agent or AI app?
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
            Copy the link to this page into your AI tool and ask it how to
            configure OpenSEO MCP for your tool of choice.
          </p>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-neutral-600">
          Follow the setup steps for Claude, Claude Code, Codex, or MCP clients
          that support remote HTTP MCP servers and the required authorization
          flow.
        </p>

        <div className="mt-5 divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          <SetupOption
            id="claude-code"
            title="Claude Code"
            subtitle="Add with the CLI"
            icon={<ClaudeIcon className="size-5" />}
          >
            <p className="text-sm leading-relaxed text-neutral-600">
              Use user scope if you want OpenSEO available across projects, or
              local scope for the current repository.
            </p>
            <CodeBlock
              code={`claude mcp add --transport http --scope user openseo https://app.openseo.so/mcp`}
            />
          </SetupOption>

          <SetupOption
            id="claude-desktop"
            title="Claude Desktop"
            subtitle="Add a custom connector"
            icon={<ClaudeIcon className="size-5" />}
          >
            <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-neutral-600">
              <li>Open Settings -&gt; Connectors.</li>
              <li>Click Add custom connector.</li>
              <li>
                Paste <code>https://app.openseo.so/mcp</code>.
              </li>
              <li>Approve the OpenSEO login when prompted.</li>
            </ol>
            <p className="text-xs leading-relaxed text-neutral-500">
              Requires a Claude plan that supports custom connectors.
            </p>
          </SetupOption>

          <SetupOption
            id="codex"
            title="Codex"
            subtitle="Add with the CLI"
            icon={<CodexIcon className="size-5" />}
          >
            <p className="text-sm leading-relaxed text-neutral-600">
              Add OpenSEO as a hosted MCP server, then run the OAuth login flow.
            </p>
            <CodeBlock
              code={`codex mcp add openseo --url https://app.openseo.so/mcp
codex mcp login openseo`}
            />
          </SetupOption>

          <SetupOption
            id="codex-desktop"
            title="Codex Desktop"
            subtitle="Settings -> Integrations & MCP"
            icon={<CodexIcon className="size-5" />}
          >
            <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-neutral-600">
              <li>Open Settings -&gt; Integrations &amp; MCP.</li>
              <li>Click Add your own.</li>
              <li>
                Paste <code>https://app.openseo.so/mcp</code>.
              </li>
              <li>Approve the OpenSEO login when prompted.</li>
            </ol>
          </SetupOption>
        </div>
      </section>
    </>
  );
}

function SetupOption({
  id,
  title,
  subtitle,
  icon,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = `setup-${id}`;

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-100"
      >
        <span className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span className="flex size-5 shrink-0 items-center justify-center text-neutral-900">
              {icon}
            </span>
          ) : (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-[10px] font-semibold text-neutral-500">
              AI
            </span>
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-sm font-medium text-neutral-900">{title}</h3>
            <span className="text-xs text-neutral-500">{subtitle}</span>
          </span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-4 shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </button>
      {open ? (
        <div id={contentId} className="space-y-3 px-4 pb-4 pt-1">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-white p-4 text-xs leading-relaxed text-neutral-800">
      <code>{code}</code>
    </pre>
  );
}

function ClaudeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 257"
      preserveAspectRatio="xMidYMid"
      aria-hidden="true"
      {...props}
    >
      <path
        fill="#D97757"
        d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
      />
    </svg>
  );
}

function CodexIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z" />
    </svg>
  );
}
