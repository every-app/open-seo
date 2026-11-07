import { ONE_CLICK_INSTALLS } from "../../../src/client/features/ai-mcp/agentInstalls";

// The app's "Add to ChatGPT" and "Add to Claude" links, with its icons. Each
// page passes its own button classes so the links match the buttons around them.
export function AddToAgentLinks({ className }: { className: string }) {
  return ONE_CLICK_INSTALLS.map(({ agent, name, href, Icon }) => (
    <a
      key={agent}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      <Icon width={16} height={16} />
      Add to {name}
    </a>
  ));
}

// The same links as a row of buttons, for MDX pages.
export function AddToAgentButtons() {
  return (
    <div className="not-prose my-6 flex flex-wrap gap-3">
      <AddToAgentLinks className="inline-flex h-10 items-center gap-2 rounded-md border border-fd-border px-4 text-sm font-medium text-fd-foreground no-underline transition-colors hover:border-fd-foreground" />
    </div>
  );
}
