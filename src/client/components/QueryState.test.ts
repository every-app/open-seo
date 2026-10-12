import { renderToStaticMarkup } from "react-dom/server";
import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { QueryState } from "./QueryState";

function renderQueryState(query: Partial<UseQueryResult<string>>) {
  // QueryState has no hooks, so calling it directly renders the same tree.
  return renderToStaticMarkup(
    QueryState({
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the fields QueryState reads
      query: query as UseQueryResult<string>,
      errorFallback: "Failed to load",
      children: (data) => `content:${data}`,
    }),
  );
}

describe("QueryState", () => {
  it("replaces the content with a retryable error when the first load fails", () => {
    const markup = renderQueryState({
      isPending: false,
      isError: true,
      error: new Error("Server down"),
      data: undefined,
    });

    expect(markup).toContain("Server down");
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("content:");
  });

  it("keeps loaded content on screen when a refetch fails", () => {
    const markup = renderQueryState({
      isPending: false,
      isError: true,
      error: new Error("Server down"),
      data: "rows",
    });

    expect(markup).toContain("Server down");
    expect(markup).toContain("content:rows");
  });
});
