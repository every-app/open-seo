import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BacklinksErrorState } from "./BacklinksPageStates";

describe("BacklinksErrorState", () => {
  it("renders a visible retry state", () => {
    const markup = renderToStaticMarkup(
      createElement(BacklinksErrorState, {
        errorMessage: "Could not load backlinks data.",
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain("Could not load backlinks");
    expect(markup).toContain("Could not load backlinks data.");
    expect(markup).toContain("Retry");
  });
});
