import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/client/features/opportunities/KeywordOpportunitiesPage", () => ({
  KeywordOpportunitiesPage: ({ projectId }: { projectId: string }) => (
    <div data-project-id={projectId}>keyword opportunities page</div>
  ),
}));

describe("keyword opportunities route", () => {
  it("passes the project id into the page view", async () => {
    const { KeywordOpportunitiesRouteView } = await import("./opportunities");
    const html = renderToStaticMarkup(
      <KeywordOpportunitiesRouteView projectId="project_1" />,
    );

    expect(html).toContain("keyword opportunities page");
    expect(html).toContain("data-project-id=\"project_1\"");
  });
});
