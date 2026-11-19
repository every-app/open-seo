import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { DashboardSetupAction } from "./DashboardSetupAction";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to?: string }) =>
    createElement("a", { href: to ?? "#" }, children),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/serverFunctions/mcp-connections", () => ({
  listMcpConnections: vi.fn(),
}));

vi.mock("@/client/features/team/organizationQueries", () => ({
  organizationContextQueryOptions: () => ({
    queryKey: ["organizationContext"],
    queryFn: () => Promise.resolve(null),
  }),
}));

vi.mock("@/client/features/projects/CreateProjectModal", () => ({
  CreateProjectModal: () => null,
}));

vi.mock("@/client/features/team/InviteTeammateModal", () => ({
  InviteTeammateModal: () => null,
}));

function renderSkillsStep({
  webChats,
  domain = "example.com",
}: {
  webChats: ("chatgpt" | "claude" | null)[];
  domain?: string | null;
}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    ["mcpConnections"],
    webChats.map((webChat, index) => ({
      kind: "oauth" as const,
      id: `grant-${index}`,
      clientName: webChat ?? "CLI",
      webChat,
      createdAt: 1_700_000_000_000,
      organizationId: null,
    })),
  );
  return load(
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(DashboardSetupAction, {
          step: "skills",
          projectId: "project-a",
          domain,
          onComplete: vi.fn(),
        }),
      ),
    ),
  );
}

describe("DashboardSetupAction skills step", () => {
  it.each([
    {
      webChat: "chatgpt" as const,
      label: "Open in ChatGPT",
      urlPrefix: "https://chatgpt.com/?q=",
      otherLabel: "Open in Claude",
    },
    {
      webChat: "claude" as const,
      label: "Open in Claude",
      urlPrefix: "https://claude.ai/new?q=",
      otherLabel: "Open in ChatGPT",
    },
  ])(
    "links directly to $webChat in a new tab with a prefilled skills prompt",
    ({ webChat, label, urlPrefix, otherLabel }) => {
      const $ = renderSkillsStep({
        webChats: [webChat],
        domain: "example.com",
      });
      const openLink = $("a[target='_blank']");
      expect(openLink).toHaveLength(1);
      expect(openLink.text()).toContain(label);
      expect(openLink.attr("rel")).toBe("noreferrer");

      const href = openLink.attr("href") ?? "";
      expect(href.startsWith(urlPrefix)).toBe(true);
      const prompt = decodeURIComponent(href.slice(urlPrefix.length));
      expect(prompt).toContain("https://openseo.so/docs/skills/setup");
      expect(prompt).toContain("example.com");

      expect($.text()).not.toContain(otherLabel);
      expect($.text()).toContain("Copy prompt");
    },
  );

  it.each([
    { caseName: "a non-web-chat client", webChats: [null] },
    { caseName: "no direct user grants", webChats: [] },
  ])(
    "falls back to copying the prompt when the agent is unknown ($caseName)",
    ({ webChats }) => {
      const $ = renderSkillsStep({ webChats, domain: null });
      expect($("a[target='_blank']")).toHaveLength(0);
      expect($.text()).toContain("Copy prompt");
      expect($("pre").text()).toContain("https://openseo.so/docs/skills/setup");
    },
  );
});
