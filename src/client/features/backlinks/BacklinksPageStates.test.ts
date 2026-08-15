import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BacklinksErrorState } from "./BacklinksPageStates";

describe("BacklinksErrorState", () => {
  it("renders a visible retry state", () => {
    const markup = renderToStaticMarkup(
      createElement(BacklinksErrorState, {
        errorMessage: "无法加载反向链接数据。",
        onRetry: vi.fn(),
      }),
    );

    expect(markup).toContain("无法加载反向链接");
    expect(markup).toContain("无法加载反向链接数据。");
    expect(markup).toContain("重试");
  });
});
